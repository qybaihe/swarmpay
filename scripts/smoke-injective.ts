// scripts/smoke-injective.ts
// 端到端冒烟测试:验证 Injective 链上通道(/api/injective/*)在 mock 模式下完整跑通。
// 用法:先 INJECTIVE_NETWORK=mock npm run dev,另开终端 npx tsx scripts/smoke-injective.ts
// 或直接 npx tsx scripts/smoke-injective.ts(脚本自带提示)。

const SMOKE_BASE = process.env.BASE_URL || "http://localhost:4000";

async function main() {
  console.log(`\n🧪 SwarmPay Injective 通道冒烟测试 → ${SMOKE_BASE}\n`);

  // 1. status
  console.log("① GET /api/injective/status");
  const status = (await fetch(`${SMOKE_BASE}/api/injective/status`).then((r) => r.json())) as Record<string, unknown>;
  console.log("   ", JSON.stringify(status));
  if (!status.enabled && status.network !== "mock") {
    console.log("   ⚠️  network =", status.network, "(mock/testnet 均可继续)");
  }

  // 2. balance
  const testAddr = "inj1smokeaddr000000000000000000000000000";
  console.log("\n② GET /api/injective/balance?addr=", testAddr);
  const bal = (await fetch(`${SMOKE_BASE}/api/injective/balance?addr=${testAddr}&denom=inj`).then((r) => r.json())) as Record<string, unknown>;
  console.log("   ", JSON.stringify(bal));

  // 3. run(链上蜂群)
  const budget = "5000000000000000000"; // 5 INJ
  console.log("\n③ POST /api/injective/run  (goal + 预算 5 INJ)");
  const t0 = Date.now();
  const res = await fetch(`${SMOKE_BASE}/api/injective/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal: "用一句话解释 Injective 链上分润的价值。",
      tier: "swarm-evo",
      budgetAmount: budget,
      budgetDenom: "inj",
      senderAddr: testAddr,
    }),
  });
  const run = (await res.json()) as Record<string, any>;
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`   HTTP ${res.status}  耗时 ${dt}s`);

  if (run.error) {
    console.log("   ❌ error:", JSON.stringify(run.error));
    console.log("\n   提示:若 backend=MOCK 且未配 OPENAI_BASE_URL,蜂群会用 mock 文本但仍返回 trace。");
    console.log("   若是 402 余额不足,说明 mock 模式下余额校验生效(符合预期)。");
    process.exit(1);
  }

  const trace = (run.trace || {}) as Record<string, any>;
  console.log("\n   ▸ 蜂群答案 content:");
  console.log("     ", (run.content || "").slice(0, 160).replace(/\n/g, " "), "…");
  console.log("   ▸ trace.tier:", trace.tier, "| breakthroughs:", trace.breakthroughs_broadcast);
  console.log("   ▸ trace.reward_split:", JSON.stringify(trace.reward_split));
  console.log("   ▸ payment:");
  console.log("     ", JSON.stringify(run.payment, null, 2));

  if (run.payment?.success) {
    console.log(`\n✅ 冒烟通过:蜂群答案 + 链上分润回执(txHash=${run.payment.txHash.slice(0, 24)}…)`);
  } else {
    console.log("\n⚠️  payment.success=false,见上 error");
  }
}

main().catch((e) => {
  console.error("\n💥 冒烟测试异常:", e instanceof Error ? e.message : e);
  console.error("   请确认后端已启动:INJECTIVE_NETWORK=mock npm run dev");
  process.exit(1);
});