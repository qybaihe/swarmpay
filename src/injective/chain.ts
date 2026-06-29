// src/injective/chain.ts
// Injective 真链实现(用 @injectivelabs/sdk-ts v1.20)。
// 连接 Injective 测试网(injective-888),用后端代签私钥(INJECTIVE_DEMO_KEY)签名广播。
// 仅测试网;主网由 index.ts 工厂降级 mock。

import { config } from "../config.js";
import {
  PrivateKey,
  MsgSend,
  MsgExecuteContract,
  TxGrpcApi,
  ChainGrpcBankApi,
  createTransactionForAddressAndMsg,
  getInjectiveAddress,
} from "@injectivelabs/sdk-ts";
import { getNetworkInfo } from "@injectivelabs/networks";
import type { Balance, IInjectiveChain, SplitMsg, TxReceipt } from "./types.js";

/** 从 env INJECTIVE_DEMO_KEY(真私钥 0x+64hex)构造 signer。 */
function loadSigner(): { pk: PrivateKey; address: string; pubKeyBase64: string; privKeyHex: string } {
  const hex = config.injective.demoKey;
  if (!hex) throw new Error("INJECTIVE_DEMO_KEY 未配置(测试网代签私钥 0x+64hex)");
  return buildSigner(hex);
}

/** 从任意私钥 hex 构造 signer(per-archetype 钱包复用)。 */
export function buildSigner(privKeyHex: string): { pk: PrivateKey; address: string; pubKeyBase64: string; privKeyHex: string } {
  const pk = PrivateKey.fromPrivateKey(privKeyHex);
  const eth = pk.toHex(); // toHex 返回 ethereum 地址
  const address = getInjectiveAddress(eth);
  const pubKeyBase64 = pk.toPublicKey().toBase64();
  return { pk, address, pubKeyBase64, privKeyHex };
}

/** 用指定 signer 组装签名并广播一笔交易(per-archetype 钱包复用)。 */
export async function signAndBroadcastWithKey(
  signer: { pk: PrivateKey; address: string; pubKeyBase64: string; privKeyHex: string },
  networkInfo: ReturnType<typeof getNetworkInfo>,
  message: MsgSend | MsgExecuteContract,
  memo: string,
): Promise<TxReceipt> {
  const params = {
    message,
    address: signer.address,
    endpoint: networkInfo.rest,
    pubKey: signer.pubKeyBase64,
    privateKey: signer.privKeyHex,
    chainId: networkInfo.chainId,
    fee: {
      amount: [{ amount: "2000000000000000", denom: "inj" }], // 0.002 INJ
      gas: "400000",
    },
    memo,
  } as never;
  const result = (await createTransactionForAddressAndMsg(params)) as {
    txRaw: { bodyBytes: Uint8Array; authInfoBytes: Uint8Array; signatures: Uint8Array[] };
    signHashedBytes: Uint8Array;
  };
  const signature = signer.pk.signHashed(result.signHashedBytes);
  result.txRaw.signatures = [signature];
  const txApi = new TxGrpcApi(networkInfo.grpc);
  const broadcastRes = (await txApi.broadcast(result.txRaw as never)) as {
    txHash?: string;
    height?: number | string;
    code?: number;
    gasUsed?: number | string;
    rawLog?: string;
  };
  return {
    txHash: broadcastRes.txHash || "",
    height: Number(broadcastRes.height || 0),
    success: broadcastRes.code === 0 || broadcastRes.code === undefined,
    gasUsed: String(broadcastRes.gasUsed || 0),
    rawLog: broadcastRes.rawLog,
  };
}

export class InjectiveChain implements IInjectiveChain {
  private networkInfo;
  private signer;

  constructor(cfg: typeof config.injective) {
    void cfg;
    this.networkInfo = getNetworkInfo("testnet");
    this.signer = loadSigner();
  }

  async getBalance(addr: string, denom: string): Promise<Balance> {
    const api = new ChainGrpcBankApi(this.networkInfo.grpc);
    const res = await api.fetchBalance({ accountAddress: addr, denom });
    return { amount: res.amount || "0", denom };
  }

  /** 代签模式下实际付款方 = 后端 DEMO_KEY 钱包地址。 */
  getSignerAddress(): string {
    return this.signer.address;
  }

  /** 组装签名并广播一笔交易。signer 为后端代签钱包(测试网 demo)。 */
  private async signAndBroadcast(message: MsgSend | MsgExecuteContract, memo: string): Promise<TxReceipt> {
    return signAndBroadcastWithKey(this.signer, this.networkInfo, message, memo);
  }

  async sendTransfer(from: string, to: string, amount: string, denom: string): Promise<TxReceipt> {
    // demo:后端 signer 代签。from 理论上应=signer.address(代签模式只能花 signer 的钱)。
    const src = from === "backend" ? this.signer.address : from;
    const msg = new MsgSend({
      srcInjectiveAddress: src,
      dstInjectiveAddress: to,
      amount: { amount, denom },
    });
    return this.signAndBroadcast(msg, `swarmpay:send ${denom}`);
  }

  async executeContract(sender: string, contractAddr: string, msg: SplitMsg): Promise<TxReceipt> {
    const execute = new MsgExecuteContract({
      sender: sender === "backend" ? this.signer.address : sender,
      contractAddress: contractAddr,
      msg: {
        distribute: {
          recipients: msg.recipients.map((r) => ({ addr: r.addr, weight_bps: Math.round(r.weight * 10000) })),
          denom: msg.denom,
        },
      },
      funds: [{ amount: msg.total, denom: msg.denom }],
    });
    return this.signAndBroadcast(execute, `swarmpay:distribute ${msg.denom}`);
  }
}