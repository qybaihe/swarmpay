// src/injective/split-executor.ts
// ISplitExecutor 实现:消费真实 SwarmTrace.reward_split,通过 IInjectiveChain 发起链上分润。
// 纯逻辑,只依赖 IInjectiveChain 接口 → mock 与真链均可。
// 注意:真实 trace 用 snake_case(reward_split),archetype 是 string。

import { config } from "../config.js";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
import type {
  DistributeResult,
  IInjectiveChain,
  ISplitExecutor,
  SplitShare,
  TraceSplitView,
} from "./types.js";

/** 18 decimals(INJ)。最小单位换算常量。 */
const DECIMALS = 18;
const ONE_INJ = 10n ** BigInt(DECIMALS); // 10^18

/** 把 INJ 浮点数转成最小单位字符串(用于前端/脚本便捷输入)。 */
export function injToSmallest(inj: string | number): string {
  const s = typeof inj === "number" ? inj.toString() : inj;
  const [intPart, fracPart = ""] = s.split(".");
  const frac = (fracPart + "0".repeat(DECIMALS)).slice(0, DECIMALS);
  return BigInt(intPart) * ONE_INJ + BigInt(frac || "0") > 0n
    ? (BigInt(intPart) * ONE_INJ + BigInt(frac || "0")).toString()
    : (BigInt(intPart) * ONE_INJ).toString();
}

/** 把最小单位字符串转成 INJ 浮点字符串(展示用)。 */
export function smallestToInj(smallest: string): string {
  const n = BigInt(smallest || "0");
  const intPart = n / ONE_INJ;
  const fracPart = n % ONE_INJ;
  const fracStr = fracPart.toString().padStart(DECIMALS, "0").replace(/0+$/, "");
  return fracStr ? `${intPart}.${fracStr}` : intPart.toString();
}

/** 取某 archetype 的链上地址(从 config.injective.archetypeAddrs)。 */
function addrOf(archetype: string): string {
  return config.injective.archetypeAddrs[archetype] || "";
}

export class SplitExecutor implements ISplitExecutor {
  constructor(private chain: IInjectiveChain) {}

  async distribute(
    trace: TraceSplitView,
    totalAmount: string,
    denom: string,
    senderAddr: string,
  ): Promise<DistributeResult> {
    const total = BigInt(totalAmount || "0");
    if (total <= 0n) {
      return this.empty(totalAmount, denom);
    }

    const feeBps = config.injective.protocolFeeBps;
    const fee = (total * BigInt(feeBps)) / 10000n;
    const remainder = total - fee;
    const treasurerAddr = addrOf("treasurer");

    // 1. 取有效分润方(weight>0 且有地址)
    const rawSplits = (trace.reward_split || []).filter(
      (r) => r.weight > 0 && addrOf(r.archetype),
    );

    if (rawSplits.length === 0) {
      // 没有有效分润方:全部(扣服务费后)退给 treasurer 兜底
      const fallback: SplitShare = {
        archetype: "treasurer",
        addr: treasurerAddr,
        weight: 1,
        amount: remainder.toString(),
      };
      const receipt = treasurerAddr
        ? await this.chain.sendTransfer(senderAddr, treasurerAddr, remainder.toString(), denom)
        : { txHash: `noop_${Date.now()}`, height: 0, success: true, gasUsed: "0" };
      return {
        txHash: receipt.txHash,
        mode: "direct",
        splits: [fallback],
        totalDistributed: remainder.toString(),
        feeDeducted: fee.toString(),
        success: receipt.success,
        error: receipt.success ? undefined : receipt.rawLog,
      };
    }

    // 2. 权重归一化(原始 weight 和可能 <1,按比例归一到 1)
    const weightSum = rawSplits.reduce((a, r) => a + r.weight, 0) || 1;

    // 3. 按权重切分 remainder,整数运算,最后一方吸收舍入误差
    const splits: SplitShare[] = [];
    let allocated = 0n;
    rawSplits.forEach((r, i) => {
      const addr = addrOf(r.archetype);
      let amount: bigint;
      if (i === rawSplits.length - 1) {
        // 最后一方吸收舍入误差
        amount = remainder - allocated;
      } else {
        amount = (remainder * BigInt(Math.round(r.weight * 1_000_000))) / BigInt(Math.round(weightSum * 1_000_000));
        allocated += amount;
      }
      splits.push({ archetype: r.archetype, addr, weight: r.weight, amount: amount.toString() });
    });

    // 4. payer 决策 mode:参与者 >3 或有合约地址 → contract;否则 direct
    const useContract = !!config.injective.splitContractAddr && splits.length > 3;

    let receipt;
    let mode: "contract" | "direct" = "direct";
    try {
      // 先转服务费给 treasurer(若有地址)。testnet 模式连续多笔需间隔等 sequence 更新。
      if (fee > 0n && treasurerAddr) {
        console.log(`[split] 转服务费 ${fee.toString()} → treasurer`);
        await this.chain.sendTransfer(senderAddr, treasurerAddr, fee.toString(), denom);
        await sleep(3000);
      }

      if (useContract) {
        mode = "contract";
        receipt = await this.chain.executeContract(
          senderAddr,
          config.injective.splitContractAddr,
          {
            recipients: splits.map((s) => ({ addr: s.addr, weight: s.weight / weightSum })),
            total: remainder.toString(),
            denom,
          },
        );
      } else {
        // direct:逐笔转账。testnet 连续多笔需间隔等 account sequence 更新,否则签名 sequence 冲突。
        const txHashes: string[] = [];
        for (let i = 0; i < splits.length; i++) {
          const s = splits[i];
          console.log(`[split] 转账 ${i + 1}/${splits.length}: ${s.amount} → ${s.archetype} (${s.addr.slice(0, 12)}…)`);
          const r = await this.chain.sendTransfer(senderAddr, s.addr, s.amount, denom);
          if (!r.success) {
            throw new Error(`transfer to ${s.archetype} failed: ${r.rawLog || r.txHash}`);
          }
          txHashes.push(r.txHash);
          if (i < splits.length - 1) await sleep(3000); // 最后一笔不等
        }
        receipt = {
          txHash: txHashes[0] || `direct_${Date.now().toString(36)}`,
          height: 0,
          success: true,
          gasUsed: "0",
          rawLog: `${txHashes.length} transfers: ${txHashes.join(", ")}`,
        };
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[split] distribute failed:", msg);
      return {
        txHash: "",
        mode: useContract ? "contract" : "direct",
        splits,
        totalDistributed: splits.reduce((a, s) => a + BigInt(s.amount), 0n).toString(),
        feeDeducted: fee.toString(),
        success: false,
        error: msg,
      };
    }

    return {
      txHash: receipt.txHash,
      mode,
      splits,
      totalDistributed: splits.reduce((a, s) => a + BigInt(s.amount), 0n).toString(),
      feeDeducted: fee.toString(),
      success: receipt.success,
      error: receipt.success ? undefined : receipt.rawLog,
    };
  }

  private empty(_totalAmount: string, _denom: string): DistributeResult {
    return {
      txHash: "",
      mode: "direct",
      splits: [],
      totalDistributed: "0",
      feeDeducted: "0",
      success: true,
      error: "zero budget, no distribution",
    };
  }
}
