// src/injective/official-fleets.ts
// 官方示例编队:启动时 seed 到社区,让评委一进 /community 就能看到带链上分润配方的编队(不依赖用户发布)。
// 每个编队的 label 里带「·链上配方:...」描述,CommunityView 会解析展示。
// 同时这些编队是真实可跑的 topology(节点 role 对应 archetype,调用时按链上计费分润)。

import type { CustomSwarmTopology } from "../agents/types.js";
import { FleetStore } from "../fleets.js";
import { AuthStore } from "../auth.js";

const SYSTEM_EMAIL = "system@swarmpay.me";

/** 三个官方示例编队,分别对应三种链上分润模式。 */
const OFFICIAL_FLEETS: Array<{ name: string; label: string; topology: CustomSwarmTopology }> = [
  {
    name: "swarm-evo-official",
    label: "进化旗舰编队 · 链上配方:LLM 动态分润 + reviewer 自签悬赏 · 5 角色 14 节点全链路",
    topology: {
      mode: "custom",
      nodes: [
        { id: "n1", role: "orchestrator", label: "旗舰" },
        { id: "n2", role: "planner", label: "导航" },
        { id: "n3", role: "coder", label: "工程 A" },
        { id: "n4", role: "coder", label: "工程 B" },
        { id: "n5", role: "reviewer", label: "监察" },
        { id: "n6", role: "explorer", label: "斥候" },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2", kind: "dispatch" },
        { id: "e2", source: "n2", target: "n3", kind: "handoff" },
        { id: "e3", source: "n2", target: "n4", kind: "handoff" },
        { id: "e4", source: "n3", target: "n5", kind: "report" },
        { id: "e5", source: "n4", target: "n5", kind: "report" },
        { id: "e6", source: "n5", target: "n3", kind: "feedback" },
        { id: "e7", source: "n6", target: "n2", kind: "handoff" },
        { id: "e8", source: "n5", target: "n1", kind: "aggregate" },
      ],
    },
  },
  {
    name: "swarm-heavy-official",
    label: "异构分工编队 · 链上配方:LLM 按贡献分润(无悬赏)· 旗舰聚合 + 突破广播",
    topology: {
      mode: "custom",
      nodes: [
        { id: "n1", role: "orchestrator", label: "旗舰" },
        { id: "n2", role: "planner", label: "导航" },
        { id: "n3", role: "coder", label: "工程" },
        { id: "n4", role: "reviewer", label: "监察" },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2", kind: "dispatch" },
        { id: "e2", source: "n2", target: "n3", kind: "handoff" },
        { id: "e3", source: "n3", target: "n4", kind: "report" },
        { id: "e4", source: "n4", target: "n3", kind: "feedback" },
        { id: "e5", source: "n4", target: "n1", kind: "aggregate" },
      ],
    },
  },
  {
    name: "swarm-lite-official",
    label: "轻量并行编队 · 链上配方:完成后一次链上分润 · 3 工程蜂并行投票",
    topology: {
      mode: "custom",
      nodes: [
        { id: "n1", role: "orchestrator", label: "旗舰" },
        { id: "n2", role: "coder", label: "工程 A" },
        { id: "n3", role: "coder", label: "工程 B" },
        { id: "n4", role: "coder", label: "工程 C" },
      ],
      edges: [
        { id: "e1", source: "n1", target: "n2", kind: "broadcast" },
        { id: "e2", source: "n1", target: "n3", kind: "broadcast" },
        { id: "e3", source: "n1", target: "n4", kind: "broadcast" },
        { id: "e4", source: "n2", target: "n1", kind: "aggregate" },
        { id: "e5", source: "n3", target: "n1", kind: "aggregate" },
        { id: "e6", source: "n4", target: "n1", kind: "aggregate" },
      ],
    },
  },
];

/** 启动时 seed 官方编队(幂等:已存在则跳过)。返回 seed 数量。 */
export async function seedOfficialFleets(auth: AuthStore, fleets: FleetStore): Promise<number> {
  // 取或建系统用户
  let systemUser = auth.findUserByEmail(SYSTEM_EMAIL);
  if (!systemUser) {
    try {
      systemUser = auth.createUser({
        email: SYSTEM_EMAIL,
        password: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
        name: "SwarmPay 官方",
      });
    } catch {
      systemUser = auth.findUserByEmail(SYSTEM_EMAIL);
    }
  }
  if (!systemUser) return 0;
  const systemUserId = systemUser.id;

  let seeded = 0;
  for (const f of OFFICIAL_FLEETS) {
    const modelId = `user:${f.name}`;
    const existing = fleets.findByModelId(systemUserId, modelId);
    if (existing) {
      // 已存在但可能未公开 → 确保公开
      if (!existing.is_public) fleets.setPublic(existing.id, systemUserId, true);
      continue;
    }
    try {
      const { detail } = await fleets.create({
        userId: systemUserId,
        name: f.name,
        label: f.label,
        topology: f.topology,
      });
      fleets.setPublic(detail.id, systemUserId, true);
      seeded++;
    } catch (e) {
      console.warn(`[seed] 官方编队 ${f.name} seed 失败:`, e instanceof Error ? e.message : e);
    }
  }
  if (seeded > 0) console.log(`[seed] 已发布 ${seeded} 个官方示例编队到社区`);
  return seeded;
}
