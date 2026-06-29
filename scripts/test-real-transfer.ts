// scripts/test-real-transfer.ts
// 真链转账验证:从后端代签钱包(DEMO_KEY)给 planner 地址转 0.1 INJ。
// 验证 InjectiveChain.sendTransfer 真实上链。需先在水龙头领过测试 INJ。
import { config } from "../src/config.js";
import { InjectiveChain } from "../src/injective/chain.js";

async function main() {
  console.log("💸 真链转账验证 → Injective testnet\n");
  const chain = new InjectiveChain(config.injective);

  const sender = config.injective.archetypeAddrs["orchestrator"]; // = DEMO_KEY 地址
  const recipient = config.injective.archetypeAddrs["planner"];
  const amount = "100000000000000000"; // 0.1 INJ (18 decimals)
  const denom = "inj";

  console.log("付款方(代签):", sender);
  console.log("收款方:", recipient);
  console.log("金额: 0.1 INJ\n");

  // 转账前余额
  const before = await chain.getBalance(recipient, denom);
  console.log("转账前收款方余额:", before.amount, `(${Number(before.amount) / 1e18} INJ)`);

  console.log("\n发送链上交易...");
  const t0 = Date.now();
  const receipt = await chain.sendTransfer("backend", recipient, amount, denom);
  console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("回执:", JSON.stringify(receipt, null, 2));

  if (receipt.success) {
    console.log(`\n✅ 真链转账成功! txHash=${receipt.txHash}`);
    console.log(`   浏览器: https://testnet.explorer.injective.network/transaction/${receipt.txHash}`);
    // 等几秒确认上链后查余额
    console.log("\n等 4s 确认上链后查收款方余额...");
    await new Promise((r) => setTimeout(r, 4000));
    const after = await chain.getBalance(recipient, denom);
    console.log("转账后收款方余额:", after.amount, `(${Number(after.amount) / 1e18} INJ)`);
    const diff = BigInt(after.amount) - BigInt(before.amount);
    console.log("差额:", diff.toString(), `(+${Number(diff) / 1e18} INJ)`);
    if (diff > 0n) {
      console.log("\n🎉 完全验证:链上交易真实上链,收款方余额增加!");
    }
  } else {
    console.log("\n❌ 转账失败:", receipt.rawLog || "unknown");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("💥 异常:", e instanceof Error ? e.message : e);
  process.exit(1);
});