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
  const pk = PrivateKey.fromPrivateKey(hex);
  const eth = pk.toHex(); // toHex 返回 ethereum 地址
  const address = getInjectiveAddress(eth);
  const pubKeyBase64 = pk.toPublicKey().toBase64();
  return { pk, address, pubKeyBase64, privKeyHex: hex };
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
    const { pk, address, pubKeyBase64, privKeyHex } = this.signer;

    // createTransactionForAddressAndMsg 查 account number/sequence 并组装 signDoc,
    // 但不签名 —— 需用私钥签 signHashedBytes 后填回 txRaw.signatures。
    // privateKey 运行时透传(SDK v1.20 类型签名未列,用 as 强转)。
    const params = {
      message,
      address,
      endpoint: this.networkInfo.rest,
      pubKey: pubKeyBase64,
      privateKey: privKeyHex,
      chainId: this.networkInfo.chainId,
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

    // 用私钥对 signHashedBytes(= keccak256(signDoc)) 做 ethereum 签名。
    // 注意用 signHashed(直接签给定 hash),不能用 sign()(会再 hash 一次导致验证失败)。
    const signature = pk.signHashed(result.signHashedBytes);
    result.txRaw.signatures = [signature];

    const txApi = new TxGrpcApi(this.networkInfo.grpc);
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