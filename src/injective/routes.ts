// src/injective/routes.ts
// Injective 链上通道路由(加法,不碰原 /v1/chat/completions)。
// 挂载点:server.ts 追加 app.use("/api/injective", injectiveRouter)。

import { Router } from "express";
import { config } from "../config.js";
import type { Tier } from "../config.js";
import { runSwarm } from "../swarm.js";
import { createChain } from "./index.js";
import { SplitExecutor } from "./split-executor.js";
import { payerDecide } from "./payer-agent.js";
import type { OnchainRunRequest, OnchainRunResponse } from "./types.js";

// ── 链上流水 ring-buffer(hackathon:进程内内存,重启丢失)──
// 每次 /run 成功后 push 分润 + 悬赏回执,/transactions 按 addr 过滤返回。
interface TxRecord {
  txHash: string;
  type: "reward_split" | "bounty" | "protocol_fee";
  direction: "in" | "out";
  amount: string; // 最小单位
  denom: string;
  counterpartyAddr: string;
  counterpartyArchetype?: string;
  memo: string;
  timestamp: number;
}
const TX_BUFFER: TxRecord[] = [];
const TX_CAP = 200;
function pushTx(rec: TxRecord) {
  TX_BUFFER.unshift(rec);
  if (TX_BUFFER.length > TX_CAP) TX_BUFFER.length = TX_CAP;
}

export function createInjectiveRouter(): Router {
  const router = Router();

  // ── GET /api/injective/status ── 健康检查 + 当前链层模式
  router.get("/status", (_req, res) => {
    res.json({
      enabled: config.injective.enabled,
      network: config.injective.network,
      contractAddr: config.injective.splitContractAddr || null,
      chainId: config.injective.chainId,
      denom: config.injective.denom,
      protocolFeeBps: config.injective.protocolFeeBps,
      archetypeAddrsConfigured: Object.keys(config.injective.archetypeAddrs).length,
      archetypeAddrs: config.injective.archetypeAddrs,  // 暴露各角色地址(前端 Playground 显示链上身份用)
    });
  });

  // ── GET /api/injective/transactions?addr= ── 该地址相关的链上流水(内存 ring-buffer)
  router.get("/transactions", (req, res) => {
    const addr = String(req.query.addr || "").trim();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const list = addr
      ? TX_BUFFER.filter((t) => t.counterpartyAddr === addr)
      : TX_BUFFER.slice(0, limit);
    res.json({ transactions: list.slice(0, limit), total: TX_BUFFER.length });
  });

  // ── GET /api/injective/smoke ── 链上自检:验证 6 个 archetype 钱包地址 + 余额 + 代签地址真实可达。
  // 评委可用此端点确认链上层真实可用(非 mock)。
  router.get("/smoke", async (_req, res) => {
    const result: {
      network: string;
      chainId: string;
      signerAddr: string | null;
      contractAddr: string | null;
      protocolFeeBps: number;
      wallets: Array<{ archetype: string; addr: string; balanceInj: string; ok: boolean }>;
      ready: boolean;
    } = {
      network: config.injective.network,
      chainId: config.injective.chainId,
      signerAddr: null,
      contractAddr: config.injective.splitContractAddr || null,
      protocolFeeBps: config.injective.protocolFeeBps,
      wallets: [],
      ready: false,
    };
    try {
      const chain = createChain();
      result.signerAddr = chain.getSignerAddress?.() || null;
      const entries = Object.entries(config.injective.archetypeAddrs);
      const checked = await Promise.all(
        entries.map(async ([arch, addr]) => {
          try {
            const bal = await chain.getBalance(addr, config.injective.denom);
            return { archetype: arch, addr, balanceInj: bal.amount, ok: true };
          } catch (e) {
            return { archetype: arch, addr, balanceInj: "0", ok: false, error: e instanceof Error ? e.message : String(e) };
          }
        }),
      );
      result.wallets = checked as never;
      result.ready = config.injective.network !== "mock" && checked.every((w) => w.ok);
      res.json(result);
    } catch (e) {
      result.ready = false;
      res.status(500).json({ ...result, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // ── GET /api/injective/balance?addr=&denom= ──
  router.get("/balance", async (req, res) => {
    const addr = String(req.query.addr || "").trim();
    const denom = String(req.query.denom || config.injective.denom).trim();
    if (!addr) return res.status(400).json({ error: { type: "invalid_request", message: "addr required" } });
    try {
      const chain = createChain();
      const bal = await chain.getBalance(addr, denom);
      res.json(bal);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      res.status(500).json({ error: { type: "balance_error", message: msg } });
    }
  });

  // ── POST /api/injective/run ── 链上版蜂群入口
  router.post("/run", async (req, res) => {
    const body = req.body as OnchainRunRequest;
    if (!body?.goal || !body.goal.trim()) {
      return res.status(400).json({ error: { type: "invalid_request", message: "goal required" } });
    }
    if (!body.senderAddr) {
      return res.status(401).json({ error: { type: "unauthorized", message: "senderAddr (Injective 地址) required" } });
    }

    const tier = (body.tier || "swarm-evo") as Tier;
    const denom = body.budgetDenom || config.injective.denom;
    const total = BigInt(body.budgetAmount || "0");

    try {
      const chain = createChain();
      // 代签模式(testnet):实际付款方 = 后端 DEMO_KEY 钱包;mock 模式沿用用户地址
      const payerAddr = chain.getSignerAddress?.() || body.senderAddr;

      // 1. 余额校验(同构于原 credits 检查),0 预算时跳过
      if (total > 0n) {
        const bal = await chain.getBalance(payerAddr, denom);
        if (BigInt(bal.amount) < total) {
          return res.status(402).json({
            error: {
              type: "insufficient_balance",
              have: bal.amount,
              need: total.toString(),
              denom,
              payerAddr,
            },
          });
        }
      }

      // 2. 跑蜂群(原内核,零改动)
      const out = await runSwarm({
        tier,
        messages: [{ role: "user", content: body.goal }],
        customTopology: body.topology as never,
      });

      // 3. 分润:payer 决策权重 → split-executor 链上执行(付款方=代签地址)
      let payment: OnchainRunResponse["payment"] = null;
      if (total > 0n) {
        const decidedSplits = payerDecide(out.trace as never);
        const executor = new SplitExecutor(chain);
        payment = await executor.distribute({ reward_split: decidedSplits, breakthroughs_broadcast: 0 }, total.toString(), denom, payerAddr);
      }

      // 4. 深度3:执行 agent 自主悬赏(若有)——用发起方 agent 自己钱包签名
      const traceBounties = (out.trace as { bounties?: import("../agents/types.js").BountyRequest[] }).bounties;
      let bountyResults: Awaited<ReturnType<import("./bounty-executor.js").BountyExecutor["executeAll"]>> | null = null;
      if (traceBounties && traceBounties.length > 0 && config.injective.network !== "mock") {
        try {
          const { BountyExecutor } = await import("./bounty-executor.js");
          bountyResults = await new BountyExecutor().executeAll(traceBounties);
          console.log(`[injective/run] 执行 ${bountyResults.length} 个悬赏,成功 ${bountyResults.filter((r) => r.success).length} 个`);
        } catch (e) {
          console.warn("[injective/run] bounty execution failed:", e instanceof Error ? e.message : e);
        }
      }

      // 5. 把本次分润 + 悬赏回执写入流水 ring-buffer(供 /transactions 查询)
      const ts = Date.now();
      if (payment?.success && payment.splits?.length) {
        for (const s of payment.splits) {
          // 付款方(out)→ agent(in)
          pushTx({ txHash: payment.txHash, type: "reward_split", direction: "out", amount: s.amount, denom, counterpartyAddr: s.addr, counterpartyArchetype: s.archetype, memo: `swarmpay:split:${s.archetype}`, timestamp: ts });
          pushTx({ txHash: payment.txHash, type: "reward_split", direction: "in", amount: s.amount, denom, counterpartyAddr: payerAddr, counterpartyArchetype: s.archetype, memo: `swarmpay:split:${s.archetype}`, timestamp: ts });
        }
        if (payment.feeDeducted && payment.feeDeducted !== "0") {
          pushTx({ txHash: payment.txHash, type: "protocol_fee", direction: "out", amount: payment.feeDeducted, denom, counterpartyAddr: payerAddr, memo: "swarmpay:protocol_fee", timestamp: ts });
        }
      }
      if (bountyResults) {
        for (const b of bountyResults) {
          if (!b.success) continue;
          const fromAddr = config.injective.archetypeAddrs[b.bounty.fromArchetype];
          const toAddr = config.injective.archetypeAddrs[b.bounty.toArchetype];
          if (fromAddr && toAddr && b.txHash) {
            pushTx({ txHash: b.txHash, type: "bounty", direction: "out", amount: b.bounty.amountSmallest, denom, counterpartyAddr: toAddr, counterpartyArchetype: b.bounty.toArchetype, memo: `swarmpay:bounty:${b.bounty.fromArchetype}->${b.bounty.toArchetype}`, timestamp: ts });
            pushTx({ txHash: b.txHash, type: "bounty", direction: "in", amount: b.bounty.amountSmallest, denom, counterpartyAddr: fromAddr, counterpartyArchetype: b.bounty.fromArchetype, memo: `swarmpay:bounty:${b.bounty.fromArchetype}->${b.bounty.toArchetype}`, timestamp: ts });
          }
        }
      }

      const response: OnchainRunResponse & { bounties?: unknown } = {
        content: out.content,
        trace: out.trace,
        payment,
        bounties: bountyResults,
      };
      res.json(response);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[injective/run] error:", msg);
      res.status(500).json({ error: { type: "internal_error", message: msg } });
    }
  });

  return router;
}