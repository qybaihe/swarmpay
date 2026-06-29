// scripts/test-real-chain.ts
// 真链验证:连 Injective 测试网(injective-888),测 getBalance。
// 用法:INJECTIVE_NETWORK=testnet npx tsx scripts/test-real-chain.ts
// 不需要后端,直接实例化 InjectiveChain 测。
import { config } from "../src/config.js";
import { InjectiveChain } from "../src/injective/chain.js";

async function main() {
  console.log("🧪 真链验证 → Injective testnet (injective-888)\n");
  console.log("network:", config.injective.network, "| chainId:", config.injective.chainId);
  console.log("demoKey 配置:", config.injective.demoKey ? "✅ 已配" : "❌ 未配");

  const chain = new InjectiveChain(config.injective);

  // 查 treasurer 地址的 INJ 余额(应为 0,因为还没领水龙头)
  const addr = config.injective.archetypeAddrs["treasurer"] || "inj1vh7fdm584yh7m7lvu68lsxtt7vsv7z76vqqp9u";
  console.log("\n查余额:", addr);
  try {
    const bal = await chain.getBalance(addr, "inj");
    console.log("✅ getBalance 成功:", JSON.stringify(bal));
    console.log("   = ", bal.amount === "0" ? "0 INJ(未领水龙头,符合预期)" : `${bal.amount} 最小单位`);
    console.log("\n🎉 真链连通!SDK 能查询 Injective 测试网账户。");
    console.log("   下一步:用 injectived 钱包或水龙头给 DEMO_KEY 地址领测试 INJ,即可测 sendTransfer。");
  } catch (e) {
    console.log("❌ getBalance 失败:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();