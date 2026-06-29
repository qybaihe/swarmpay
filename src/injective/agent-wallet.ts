// src/injective/agent-wallet.ts
// Per-archetype 钱包:每个 agent 角色用自己的私钥签名(用于深度3 的 agent 自主悬赏)。
// 与 InjectiveChain(后端单一代签)的区别:
//   - InjectiveChain: 分润时用 DEMO_KEY 统一代签(用户预算→各 agent)
//   - AgentWallet: 悬赏时用发起方 agent 自己的钱包签名(agent→agent,真自主花钱)

import { config } from "../config.js";
import { MsgSend } from "@injectivelabs/sdk-ts";
import { getNetworkInfo } from "@injectivelabs/networks";
import { buildSigner, signAndBroadcastWithKey } from "./chain.js";
import type { TxReceipt } from "./types.js";

/** archetype → {addr, keyHex}。从 config.injective.archetypeWallets 读(env 注入)。 */
function getArchetypeWallet(archetype: string): { addr: string; keyHex: string } | null {
  const wallets = (config.injective as typeof config.injective & { archetypeWallets?: Record<string, { addr: string; keyHex: string }> }).archetypeWallets;
  if (wallets && wallets[archetype]) return wallets[archetype];
  // 兜底:archetypeAddrs 只有地址无私钥,无法自签
  return null;
}

export class AgentWallet {
  private networkInfo;
  constructor() {
    this.networkInfo = getNetworkInfo("testnet");
  }

  /** agent 用自己的钱包转账给另一个地址(悬赏核心)。 */
  async sendTransferAs(fromArchetype: string, toAddr: string, amount: string, denom: string, memo: string): Promise<TxReceipt> {
    const wallet = getArchetypeWallet(fromArchetype);
    if (!wallet) {
      return { txHash: "", height: 0, success: false, gasUsed: "0", rawLog: `no wallet for archetype ${fromArchetype}` };
    }
    const signer = buildSigner(wallet.keyHex);
    const msg = new MsgSend({
      srcInjectiveAddress: signer.address,
      dstInjectiveAddress: toAddr,
      amount: { amount, denom },
    });
    return signAndBroadcastWithKey(signer, this.networkInfo, msg, memo);
  }

  /** 查某 archetype 钱包的余额。 */
  async getBalance(archetype: string, denom: string): Promise<{ amount: string; denom: string }> {
    const wallet = getArchetypeWallet(archetype);
    if (!wallet) return { amount: "0", denom };
    // 复用 InjectiveChain 的 getBalance 逻辑(走 grpc)
    const { ChainGrpcBankApi } = await import("@injectivelabs/sdk-ts");
    const api = new ChainGrpcBankApi(this.networkInfo.grpc);
    const res = await api.fetchBalance({ accountAddress: wallet.addr, denom });
    return { amount: res.amount || "0", denom };
  }

  /** 某 archetype 是否配置了可自签的钱包。 */
  hasWallet(archetype: string): boolean {
    return !!getArchetypeWallet(archetype);
  }
}