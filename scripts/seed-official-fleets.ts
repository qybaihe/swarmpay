// seed-official-fleets.ts
// 一次性种子脚本:创建官方账号,灌入 5 个高质量官方舰队并发布到社区。
// 用法: node --import tsx scripts/seed-official-fleets.ts
//
// 设计原则:每个舰队解决一类真实问题,拓扑结构差异化、有明确设计意图,
// 确保能被 runCustomTopology 真实执行(Kahn 拓扑排序 + handoff 注入)。

const BASE = process.env.SEED_BASE || "http://localhost:4000";

interface SeedNode { id: string; role: string; label: string; customTaskType?: string; customSkill?: string; petId?: string; }
interface SeedEdge { id: string; source: string; target: string; kind?: string; label?: string; }
interface SeedFleet {
  name: string;
  label: string;
  designIntent: string;
  nodes: SeedNode[];
  edges: SeedEdge[];
}

// ── 5 个官方舰队设计 ──
const FLEETS: SeedFleet[] = [
  {
    name: "official-think-tank",
    label: "🏛️ 深研智库 · 多视角并行调研(官方出品)",
    designIntent: "两个 explorer 从不同视角发散探索,reviewer 交叉对比后收敛成结论。适合开放式、需要广度的问题(行业分析、技术选型、趋势研判)。",
    nodes: [
      { id: "e1", role: "explorer", label: "瞭望星", customTaskType: "research", customSkill: "从宏观视角穷尽问题的相关维度,覆盖面优先,不遗漏任何重要角度", petId: "einstein" },
      { id: "e2", role: "explorer", label: "掘进者", customTaskType: "research", customSkill: "针对核心问题深挖细节、数据、反例,深度优先,追求透彻", petId: "conan" },
      { id: "r1", role: "reviewer", label: "枢密使", customTaskType: "review", customSkill: "交叉对比两路探索结果,识别共识与分歧,融合成结构化、有取舍建议的结论", petId: "sam-altman" },
    ],
    edges: [
      { id: "ed1", source: "e1", target: "r1", kind: "aggregate", label: "广度结论汇入" },
      { id: "ed2", source: "e2", target: "r1", kind: "aggregate", label: "深度结论汇入" },
    ],
  },
  {
    name: "official-code-workshop",
    label: "🛠️ 代码工坊 · 经典实现流水线(官方出品)",
    designIntent: "标准软件工程流水线:planner 拆解任务→coder 实现→reviewer 审查,审查不过带反馈返工。适合明确的编码任务、bug 修复、功能实现。",
    nodes: [
      { id: "p1", role: "planner", label: "构架师", customTaskType: "design", customSkill: "把模糊需求拆成清晰的实现步骤、数据结构、接口边界,产出 coder 可直接消费的计划", petId: "doubao" },
      { id: "c1", role: "coder", label: "匠人", customTaskType: "coding", customSkill: "按计划直奔可运行代码,处理边界条件、异常、资源清理,代码要简洁可读", petId: "musk" },
      { id: "r1", role: "reviewer", label: "守夜人", customTaskType: "review", customSkill: "严格审查正确性、安全性、性能,找出 bug 和隐患,给可操作的返工意见", petId: "conan" },
    ],
    edges: [
      { id: "ed1", source: "p1", target: "c1", kind: "handoff", label: "实现计划" },
      { id: "ed2", source: "c1", target: "r1", kind: "handoff", label: "待审代码" },
      { id: "ed3", source: "r1", target: "c1", kind: "feedback", label: "返工反馈(如需)" },
    ],
  },
  {
    name: "official-debate-arena",
    label: "⚔️ 决策竞技场 · 对抗式辩论(官方出品)",
    designIntent: "正方 planner 论证可行性,反方 explorer 找反例和风险,orchestrator 作为裁判权衡裁决。适合需要审慎决策的问题(方案选型、是否上线、风险评估)。",
    nodes: [
      { id: "pro", role: "planner", label: "执言者", customTaskType: "analysis", customSkill: "系统论证该方案的可行性、优势、预期收益,给出支持采纳的依据", petId: "doubao" },
      { id: "con", role: "explorer", label: "破壁人", customTaskType: "review", customSkill: "站在对立面,穷尽方案的潜在风险、反例、失败场景,挑战正方论点", petId: "conan" },
      { id: "judge", role: "orchestrator", label: "司秤", customTaskType: "design", customSkill: "权衡正反双方论据,综合风险与收益,给出有条件、有取舍的最终决策建议", petId: "sam-altman" },
    ],
    edges: [
      { id: "ed1", source: "pro", target: "judge", kind: "report", label: "正方论证" },
      { id: "ed2", source: "con", target: "judge", kind: "report", label: "反方挑战" },
    ],
  },
  {
    name: "official-quality-shield",
    label: "🛡️ 质量铁壁 · 双重审查(官方出品)",
    designIntent: "coder 实现后,经过两道独立审查:reviewer1 查正确性,reviewer2 查健壮性与边界。双重保险,适合对正确性要求极高的任务(算法、安全、金融逻辑)。",
    nodes: [
      { id: "c1", role: "coder", label: "锻骨", customTaskType: "coding", customSkill: "实现核心逻辑,注重算法正确性和清晰性", petId: "musk" },
      { id: "r1", role: "reviewer", label: "明镜", customTaskType: "review", customSkill: "专注逻辑正确性,构造测试用例验证,找出逻辑错误和边界 bug", petId: "conan" },
      { id: "r2", role: "reviewer", label: "千锤", customTaskType: "testing", customSkill: "专注健壮性:异常处理、资源泄漏、并发安全、极端输入,做破坏性审视", petId: "einstein" },
    ],
    edges: [
      { id: "ed1", source: "c1", target: "r1", kind: "handoff", label: "待审" },
      { id: "ed2", source: "r1", target: "r2", kind: "handoff", label: "正确性通过后" },
      { id: "ed3", source: "r2", target: "c1", kind: "feedback", label: "返工(任一审查不过)" },
    ],
  },
  {
    name: "official-fullstack-dag",
    label: "🌟 全栈协作 · 完整 DAG(官方出品)",
    designIntent: "最完整的协作图:planner 规划后,coder 和 explorer 并行(实现+创意),reviewer 汇总审查,orchestrator 最终融合。适合复杂、综合性问题,展示蜂群协作的完整形态。",
    nodes: [
      { id: "p1", role: "planner", label: "司南", customTaskType: "design", customSkill: "理清复杂问题的整体结构,拆解出可并行和需串行的部分,定协调基调", petId: "doubao" },
      { id: "c1", role: "coder", label: "径行者", customTaskType: "coding", customSkill: "沿着规划主线实现核心方案,保证可落地", petId: "musk" },
      { id: "x1", role: "explorer", label: "破晓者", customTaskType: "ideation", customSkill: "并行探索非常规但有价值的创新点,为方案增加惊喜维度", petId: "einstein" },
      { id: "r1", role: "reviewer", label: "裁衡", customTaskType: "review", customSkill: "汇总主线实现和支线创新,审查整体质量,决定创新点是否纳入", petId: "conan" },
      { id: "o1", role: "orchestrator", label: "归一", customTaskType: "docs", customSkill: "把审查通过的各部分融合成连贯、超越单点贡献的最终交付", petId: "sam-altman" },
    ],
    edges: [
      { id: "ed1", source: "p1", target: "c1", kind: "handoff", label: "主线计划" },
      { id: "ed2", source: "p1", target: "x1", kind: "handoff", label: "创新方向" },
      { id: "ed3", source: "c1", target: "r1", kind: "report", label: "主线产出" },
      { id: "ed4", source: "x1", target: "r1", kind: "report", label: "创新产出" },
      { id: "ed5", source: "r1", target: "o1", kind: "aggregate", label: "审查结论" },
    ],
  },
];

async function seed() {
  console.log(`🌱 开始灌入官方舰队 → ${BASE}`);

  // 1. 创建/登录官方账号
  const OFFICIAL_EMAIL = "official@evoship.ai";
  const OFFICIAL_PASSWORD = "Ev0Ship!Official2026";
  const OFFICIAL_NAME = "EvoShip 官方";

  let cookie = "";
  // 尝试注册,已存在则登录
  let regRes = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: OFFICIAL_EMAIL, password: OFFICIAL_PASSWORD, name: OFFICIAL_NAME }),
  });
  if (regRes.status === 201) {
    cookie = extractCookie(regRes);
    console.log(`✅ 注册官方账号: ${OFFICIAL_NAME}`);
  } else {
    // 已存在,登录
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: OFFICIAL_EMAIL, password: OFFICIAL_PASSWORD }),
    });
    if (!loginRes.ok) {
      const e = await loginRes.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`官方账号登录失败: ${e.error?.message || loginRes.status}`);
    }
    cookie = extractCookie(loginRes);
    console.log(`✅ 登录官方账号: ${OFFICIAL_NAME}`);
  }

  // 2. 幂等:若已存在官方舰队,先全部删除再重建(确保节点名/拓扑更新生效)
  const listRes = await fetch(`${BASE}/api/fleets`, { headers: { Cookie: cookie } });
  const listBody = await listRes.json() as { fleets: Array<{ name: string; id: number }> };
  for (const f of listBody.fleets) {
    if (FLEETS.some((fl) => fl.name === f.name)) {
      const delRes = await fetch(`${BASE}/api/fleets/${f.id}`, { method: "DELETE", headers: { Cookie: cookie } });
      console.log(`🗑️  删除旧版: ${f.name} (${delRes.ok ? "ok" : delRes.status})`);
    }
  }

  // 3. 逐个创建舰队(触发 AI 美化)+ 发布到社区
  for (const fleet of FLEETS) {
    console.log(`🔨 创建舰队: ${fleet.name} (AI 美化中,稍等)…`);
    const createRes = await fetch(`${BASE}/api/fleets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        name: fleet.name,
        label: fleet.label,
        topology: { mode: "custom", nodes: fleet.nodes, edges: fleet.edges },
      }),
    });
    if (!createRes.ok) {
      const e = await createRes.json().catch(() => ({})) as { error?: { message?: string } };
      console.error(`❌ 创建失败 ${fleet.name}: ${e.error?.message || createRes.status}`);
      continue;
    }
    const created = await createRes.json() as { fleet: { id: number; model_id: string } };
    console.log(`   ✅ 已创建: ${created.fleet.model_id}`);

    // 发布到社区
    const pubRes = await fetch(`${BASE}/api/fleets/${created.fleet.id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ publish: true }),
    });
    if (pubRes.ok) {
      console.log(`   🌐 已发布到社区`);
    }
  }

  // 3. 确认社区列表
  const communityRes = await fetch(`${BASE}/api/community/fleets?pageSize=48`);
  const community = await communityRes.json() as { items: Array<{ name: string; author: { name: string } }> };
  const official = community.items.filter((f) => f.author.name === OFFICIAL_NAME);
  console.log(`\n🎉 完成! 社区现有 ${community.items.length} 个公开舰队,其中官方 ${official.length} 个:`);
  for (const f of official) console.log(`   - ${f.name}`);
}

function extractCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return "";
  const match = setCookie.match(/(evoship[^=]*=[^;]+)/);
  return match ? match[1] : "";
}

seed().catch((e) => { console.error("种子失败:", e); process.exit(1); });
