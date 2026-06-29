// scripts/gen-injective-wallets.ts
// 生成 SwarmPay 各角色的 Injective 测试网钱包(私钥 + ethereum 地址 + inj 地址 + mnemonic)。
// 产出:打印 INJECTIVE_ARCHETYPE_ADDRS(供 .env) + 写 wallets.json(供 INJECTIVE_DEMO_KEY 等,勿提交)。
import { PrivateKey, getInjectiveAddress } from "@injectivelabs/sdk-ts";
import { writeFileSync } from "node:fs";

const ROLES = ["orchestrator", "planner", "coder", "reviewer", "explorer", "treasurer"] as const;

interface WalletInfo {
  inj: string;
  eth: string;
  privateKeyHex: string; // 真私钥 0x+64hex(66 chars),用于 fromPrivateKey 重建
  mnemonic: string;
}

const wallets: Record<string, WalletInfo> = {};
const addrsMap: Record<string, string> = {};

for (const role of ROLES) {
  const g = PrivateKey.generate(); // { privateKey, mnemonic }
  const inner = g.privateKey;
  // @ts-expect-error wallet 是 PrivateKey 的私有字段,运行时可访问(SDK v1.20 内部用 ethers Wallet)
  const eth = inner.wallet.address as string;
  const inj = getInjectiveAddress(eth);
  // 真私钥:ethers Wallet 的 privateKey(注意不是 toHex(),toHex 返回的是地址)
  // @ts-expect-error 同上
  const privateKeyHex = inner.wallet.privateKey as string;
  wallets[role] = { inj, eth, privateKeyHex, mnemonic: g.mnemonic };
  addrsMap[role] = inj;
  console.log(`${role.padEnd(14)} inj=${inj}  eth=${eth}`);
}

// 写完整钱包文件(含私钥,仅本地,gitignore)
writeFileSync("scripts/.swarmpay-wallets.json", JSON.stringify(wallets, null, 2));

// 打印 .env 片段
console.log("\n# ── 加到 .env ──");
console.log(`INJECTIVE_ARCHETYPE_ADDRS='${JSON.stringify(addrsMap)}'`);
console.log(`INJECTIVE_DEMO_KEY=${wallets.orchestrator.privateKeyHex}  # 用 orchestrator 钱包做后端代签`);
console.log("\n(完整钱包含 mnemonic 已写 scripts/.swarmpay-wallets.json — 已 gitignore,勿提交)");