// fleets.ts
// 用户自定义舰队(自定义拓扑 + 自定义模型名)的存储、AI 美化、路由。
// 仿 endpoints.ts 结构:SQLite (node:sqlite) + 按 user_id 隔离 + session 鉴权。
//
// 一个舰队 = 一套 CustomSwarmTopology(节点+边) + AI 美化人设 + 一个自定义模型名("user:<name>")。
// 用户注册端点后,用 sk-swarmpay-xxx key + model="user:<name>" 调 /v1/chat/completions,
// 后端按该舰队拓扑真实执行(runCustomTopology)。

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Request, Router } from "express";
import { DB_PATH, getSessionToken, type AuthStore } from "./auth.js";
import { config } from "./config.js";
import { callAgent } from "./model.js";
import { AgentRegistry } from "./agents/registry.js";
import type { Archetype, CustomSwarmTopology, FleetNodePersona, FleetNodePersonas } from "./agents/types.js";

export const USER_MODEL_PREFIX = "user:";
const NAME_MAX = 40;
const LABEL_MAX = 120;

export interface UserFleet {
  id: number;
  user_id: number;
  name: string;          // 用户起的名,如 "my-fleet-1"
  model_id: string;      // 完整模型名 "user:my-fleet-1"
  label?: string;        // 描述
  node_count: number;
  edge_count: number;
  is_public: boolean;    // 是否已发布到社区
  created_at: number;
  updated_at: number;
}

interface FleetRow extends Omit<UserFleet, "is_public"> {
  topology_json: string;
  node_personas_json: string | null;
  is_public: number; // DB 存 0/1
}

export interface FleetDetail extends UserFleet {
  topology: CustomSwarmTopology;
  node_personas: FleetNodePersonas;
}

function now(): number {
  return Date.now();
}

/** 把用户输入的 name 规整成 model_id 用的 slug */
export function toModelId(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, NAME_MAX);
  return `${USER_MODEL_PREFIX}${slug}`;
}

/** 从 model_id 还原 slug(去掉 user: 前缀) */
export function slugFromModelId(modelId: string): string {
  return modelId.startsWith(USER_MODEL_PREFIX) ? modelId.slice(USER_MODEL_PREFIX.length) : modelId;
}

function publicFleet(row: FleetRow): UserFleet {
  let topology: CustomSwarmTopology | null = null;
  try {
    topology = JSON.parse(row.topology_json) as CustomSwarmTopology;
  } catch {
    topology = null;
  }
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    model_id: row.model_id,
    label: row.label || undefined,
    node_count: topology?.nodes?.length ?? 0,
    edge_count: topology?.edges?.length ?? 0,
    is_public: row.is_public === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function detailFromRow(row: FleetRow): FleetDetail {
  let topology: CustomSwarmTopology = { mode: "custom", nodes: [], edges: [] };
  try {
    const parsed = JSON.parse(row.topology_json) as CustomSwarmTopology;
    if (parsed && parsed.mode === "custom") topology = parsed;
  } catch {
    /* 损坏数据回落空拓扑 */
  }
  let personas: FleetNodePersonas = {};
  try {
    if (row.node_personas_json) personas = JSON.parse(row.node_personas_json) as FleetNodePersonas;
  } catch {
    personas = {};
  }
  return { ...publicFleet(row), topology, node_personas: personas };
}

/** 校验并规整用户提交的拓扑(与 orchestrator.normalizeCustomTopology 对齐,但保留美化人设字段) */
function normalizeInputTopology(input: unknown): CustomSwarmTopology {
  const topo = (input || {}) as Partial<CustomSwarmTopology>;
  if (!topo || topo.mode !== "custom" || !Array.isArray(topo.nodes) || topo.nodes.length === 0) {
    throw new Error("拓扑无效:至少需要一个节点(mode=custom)。");
  }
  const validRoles: Archetype[] = ["orchestrator", "planner", "coder", "reviewer", "explorer"];
  const nodes = topo.nodes
    .filter((n) => n && n.id && validRoles.includes(n.role))
    .slice(0, 16)
    .map((n, i) => ({
      id: String(n.id),
      role: n.role,
      label: (n.label || `${n.role} ${i + 1}`).slice(0, 80),
      petId: n.petId,
      persona: typeof n.persona === "string" ? n.persona.slice(0, 2000) : undefined,
      focus: typeof n.focus === "string" ? n.focus.slice(0, 400) : undefined,
      temperature: typeof n.temperature === "number" && n.temperature >= 0 && n.temperature <= 2 ? n.temperature : undefined,
      // 节点定制(用户在 Playground 填,美化时参考)
      customTaskType: typeof n.customTaskType === "string" && n.customTaskType.trim() ? n.customTaskType.trim().slice(0, 40) : undefined,
      customSkill: typeof n.customSkill === "string" && n.customSkill.trim() ? n.customSkill.trim().slice(0, 400) : undefined,
    }));
  if (!nodes.length) throw new Error("拓扑无效:没有合法节点(archetype 必须是 orchestrator/planner/coder/reviewer/explorer 之一)。");
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (topo.edges || [])
    .filter((e) => e && e.id && ids.has(e.source) && ids.has(e.target) && e.source !== e.target)
    .slice(0, 32)
    .map((e) => ({
      id: String(e.id),
      source: String(e.source),
      target: String(e.target),
      kind: e.kind,
      label: e.label ? String(e.label).slice(0, 60) : undefined,
    }));
  return { mode: "custom", nodes, edges };
}

// ── AI 美化:为每个节点生成自定义 persona/focus/温度 ──
// 把整套拓扑喂给 LLM,让它基于角色 + 用户 label + 节点定制(任务类型/擅长描述)产出更贴合的人设;失败回落 registry 默认。
const TASK_TYPE_DESCS: Record<string, string> = {
  analysis: "需求分析(理解目标、拆解约束、明确验收标准)",
  design: "方案设计(架构/数据流/接口/技术选型)",
  coding: "编码实现(写出可运行代码、处理边界情况)",
  review: "代码审查(找缺陷、给返工意见、质量把关)",
  ideation: "创意发散(跳出常规、非显然方案)",
  testing: "测试验证(构造用例、验证正确性、压测)",
  docs: "文档撰写(把产出整理成清晰文档/说明)",
  research: "调研总结(搜集信息、比较、总结结论)",
};

export async function beautifyTopology(topology: CustomSwarmTopology): Promise<FleetNodePersonas> {
  const result: FleetNodePersonas = {};
  const nodesDesc = topology.nodes
    .map((n, i) => {
      const def = AgentRegistry.getDef(n.role);
      const parts = [`[${i + 1}] id=${n.id} role=${n.role} label="${n.label || ""}"`];
      if (n.customTaskType && TASK_TYPE_DESCS[n.customTaskType]) {
        parts.push(`用户指定任务类型:${TASK_TYPE_DESCS[n.customTaskType]}`);
      }
      if (n.customSkill && n.customSkill.trim()) {
        parts.push(`用户擅长描述:${n.customSkill.trim()}`);
      }
      parts.push(`默认persona: ${def.persona}`);
      parts.push(`默认focus: ${def.focus}`);
      parts.push(`默认temperature: ${def.temperature}`);
      return parts.join("\n");
    })
    .join("\n\n");
  const edgesDesc = topology.edges.length
    ? topology.edges.map((e) => `${e.source} --${e.kind || "handoff"}--> ${e.target}`).join("\n")
    : "(无显式边,按节点顺序串行)";

  const system = [
    "你是蜂群编队设计师。用户在 Playground 拖出了一个多 Agent 协作拓扑,并对部分节点做了定制。",
    "请为每个节点定制一套更贴合该节点在拓扑中职责的 persona(系统人设)、focus(角色定位一句话)和 temperature。",
    "规则:",
    "- persona 要具体、可执行,明确这个节点该产出什么、格式如何,可继承默认 persona 的精华并强化。",
    "- 若用户给了「任务类型」和「擅长描述」,必须让 persona 聚焦该任务、发挥其擅长点,让该节点成为这方面的专家。",
    "- focus 是一句话角色定位,若用户指定了任务类型,focus 要体现该任务。",
    `- temperature 在 0.0-1.5 之间;orchestrator/planner 偏低(0.2-0.5),coder 中等(0.4-0.7),reviewer 偏严谨(0.5-0.7),explorer 偏高(0.7-1.2)。参考默认值微调。`,
    "- 严格输出 JSON 对象,key 是节点 id,value 是 {persona, focus, temperature}。不要输出任何额外文字。",
  ].join("\n");

  const user = `拓扑结构:\n节点:\n${nodesDesc}\n\n边(交接关系):\n${edgesDesc}\n\n请输出每个节点的美化人设 JSON。`;

  try {
    const res = await callAgent(
      config.aggregatorModel,
      system,
      user,
      0.4,
      "orchestrator",
      Math.min(config.beeTimeoutMs, 45000),
    );
    if (res.status === "ran" && res.content.trim()) {
      const match = res.content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as Record<string, Partial<FleetNodePersona>>;
        for (const node of topology.nodes) {
          const p = parsed[node.id];
          if (p && typeof p.persona === "string" && p.persona.trim()) {
            result[node.id] = {
              persona: p.persona.trim().slice(0, 2000),
              focus: typeof p.focus === "string" && p.focus.trim() ? p.focus.trim().slice(0, 400) : AgentRegistry.getDef(node.role).focus,
              temperature: typeof p.temperature === "number" && p.temperature >= 0 && p.temperature <= 2 ? p.temperature : AgentRegistry.getDef(node.role).temperature,
            };
          }
        }
      }
    }
  } catch (e) {
    console.warn("[fleets] beautifyTopology LLM 调用失败,回落默认人设:", e instanceof Error ? e.message : String(e));
  }

  // 兜底:未被 LLM 覆盖的节点用 registry 默认值填充(保证每个节点都有人设)
  for (const node of topology.nodes) {
    if (!result[node.id]) {
      const def = AgentRegistry.getDef(node.role);
      result[node.id] = { persona: def.persona, focus: def.focus, temperature: def.temperature };
    }
  }
  return result;
}

/** 把美化后的人设合并进拓扑(执行时直接从节点读) */
export function mergePersonasIntoTopology(topology: CustomSwarmTopology, personas: FleetNodePersonas): CustomSwarmTopology {
  return {
    mode: "custom",
    nodes: topology.nodes.map((n) => {
      const p = personas[n.id];
      return p ? { ...n, persona: p.persona, focus: p.focus, temperature: p.temperature } : n;
    }),
    edges: topology.edges,
  };
}

export class FleetStore {
  private db: DatabaseSync;

  constructor(dbPath = DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS user_fleets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        model_id TEXT NOT NULL,
        label TEXT,
        topology_json TEXT NOT NULL,
        node_personas_json TEXT,
        is_public INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(user_id, model_id)
      );

      CREATE INDEX IF NOT EXISTS idx_user_fleets_user_id ON user_fleets(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_fleets_model_id ON user_fleets(model_id);
    `);
    // 向后兼容:旧库(user_fleets 表已存在但无 is_public 列)补列。
    // 必须在 CREATE INDEX(is_public) 之前做,否则 index 建在不存在列上报错。
    let hasPublicCol = false;
    try {
      this.db.prepare("SELECT is_public FROM user_fleets LIMIT 1").get();
      hasPublicCol = true;
    } catch {
      hasPublicCol = false;
    }
    if (!hasPublicCol) {
      this.db.exec("ALTER TABLE user_fleets ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0");
    }
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_user_fleets_public ON user_fleets(is_public)");
  }

  async create(input: {
    userId: number;
    name: string;
    label?: string;
    topology: CustomSwarmTopology;
  }): Promise<{ detail: FleetDetail; personas: FleetNodePersonas }> {
    const modelId = toModelId(input.name);
    if (modelId === USER_MODEL_PREFIX) throw new Error("舰队名无效:请用字母/数字组合(如 my-fleet-1)。");
    // 检查重名(同 user 下 model_id 唯一)
    const existing = this.findByModelId(input.userId, modelId);
    if (existing) throw new Error(`已存在同名舰队:${input.name}(model_id=${modelId})。请改名或更新已有舰队。`);

    const personas = await beautifyTopology(input.topology);
    const topologyWithPersonas = mergePersonasIntoTopology(input.topology, personas);
    const ts = now();
    const label = (input.label || "").trim().slice(0, LABEL_MAX) || undefined;
    const result = this.db.prepare(`
      INSERT INTO user_fleets (user_id, name, model_id, label, topology_json, node_personas_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.userId,
      input.name.trim().slice(0, NAME_MAX),
      modelId,
      label ?? null,
      JSON.stringify(topologyWithPersonas),
      JSON.stringify(personas),
      ts,
      ts,
    );
    const row = this.findById(Number(result.lastInsertRowid));
    if (!row) throw new Error("舰队写入失败。");
    return { detail: detailFromRow(row), personas };
  }

  async update(input: {
    id: number;
    userId: number;
    name?: string;
    label?: string;
    topology?: CustomSwarmTopology;
    rebeautify?: boolean;
  }): Promise<{ detail: FleetDetail; personas: FleetNodePersonas }> {
    const row = this.findById(input.id);
    if (!row || row.user_id !== input.userId) throw new Error("舰队不存在。");
    let topology: CustomSwarmTopology = detailFromRow(row).topology;
    let personas: FleetNodePersonas = detailFromRow(row).node_personas;

    if (input.topology) {
      topology = input.topology;
      // 拓扑变了就重新美化(或显式要求)
      if (input.rebeautify !== false) {
        personas = await beautifyTopology(topology);
      }
      topology = mergePersonasIntoTopology(topology, personas);
    }

    let modelId = row.model_id;
    let name = row.name;
    if (input.name && input.name.trim() && input.name.trim() !== row.name) {
      name = input.name.trim().slice(0, NAME_MAX);
      modelId = toModelId(name);
      const clash = this.findByModelId(input.userId, modelId);
      if (clash && clash.id !== input.id) throw new Error(`已存在同名舰队:${input.name}。`);
    }
    const label = input.label !== undefined ? (input.label.trim().slice(0, LABEL_MAX) || undefined) : row.label;

    this.db.prepare(`
      UPDATE user_fleets
      SET name = ?, model_id = ?, label = ?, topology_json = ?, node_personas_json = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(name, modelId, label ?? null, JSON.stringify(topology), JSON.stringify(personas), now(), input.id, input.userId);

    const updated = this.findById(input.id);
    if (!updated) throw new Error("舰队更新失败。");
    return { detail: detailFromRow(updated), personas };
  }

  findById(id: number): FleetRow | null {
    return this.db.prepare("SELECT * FROM user_fleets WHERE id = ?").get(id) as FleetRow | undefined || null;
  }

  findByModelId(userId: number, modelId: string): FleetRow | null {
    return this.db.prepare("SELECT * FROM user_fleets WHERE user_id = ? AND model_id = ?").get(userId, modelId) as FleetRow | undefined || null;
  }

  listForUser(userId: number): UserFleet[] {
    const rows = this.db.prepare("SELECT * FROM user_fleets WHERE user_id = ? ORDER BY created_at DESC").all(userId) as unknown as FleetRow[];
    return rows.map(publicFleet);
  }

  /** 按 model_id 跨用户查(用于 /v1 路由:只有校验过 endpoint 归属后才调用) */
  findByModelIdAnyUser(modelId: string): FleetRow | null {
    if (!modelId.startsWith(USER_MODEL_PREFIX)) return null;
    return this.db.prepare("SELECT * FROM user_fleets WHERE model_id = ?").get(modelId) as FleetRow | undefined || null;
  }

  delete(id: number, userId: number): boolean {
    const result = this.db.prepare("DELETE FROM user_fleets WHERE id = ? AND user_id = ?").run(id, userId);
    return Number(result.changes) > 0;
  }

  /** 复制一个舰队为某用户的私有副本(fork)。不重新美化,原样复制 topology+personas。
   *  model_id 冲突时自动加 -2/-3 后缀。返回新舰队详情。 */
  fork(sourceFleetId: number, toUserId: number, newName?: string): FleetDetail {
    const src = this.findById(sourceFleetId);
    if (!src) throw new Error("源舰队不存在。");
    // 生成不冲突的 name + model_id
    let name = (newName || `${src.name}`).trim().slice(0, NAME_MAX);
    let modelId = toModelId(name);
    let suffix = 2;
    while (this.findByModelId(toUserId, modelId)) {
      const tail = `-${suffix}`;
      name = `${(newName || src.name).slice(0, NAME_MAX - tail.length)}${tail}`;
      modelId = toModelId(name);
      suffix += 1;
    }
    const ts = now();
    const result = this.db.prepare(`
      INSERT INTO user_fleets (user_id, name, model_id, label, topology_json, node_personas_json, created_at, updated_at, is_public)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      toUserId, name, modelId, src.label || null,
      src.topology_json, src.node_personas_json,
      ts, ts,
    );
    const row = this.findById(Number(result.lastInsertRowid));
    if (!row) throw new Error("复制舰队失败。");
    return detailFromRow(row);
  }

  /** 发布/取消发布(仅作者) */
  setPublic(fleetId: number, userId: number, isPublic: boolean): boolean {
    const r = this.db.prepare("UPDATE user_fleets SET is_public = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(isPublic ? 1 : 0, now(), fleetId, userId);
    return Number(r.changes) > 0;
  }

  /** 判断某舰队是否公开 */
  isPublic(fleetId: number): boolean {
    const r = this.db.prepare("SELECT is_public AS p FROM user_fleets WHERE id = ?").get(fleetId) as { p: number } | undefined;
    return r?.p === 1;
  }

  /** 列出某用户所有自定义模型名(给端点注册时拼"可用模型列表"用) */
  modelIdsForUser(userId: number): string[] {
    const rows = this.db.prepare("SELECT model_id FROM user_fleets WHERE user_id = ? ORDER BY created_at DESC").all(userId) as { model_id: string }[];
    return rows.map((r) => r.model_id);
  }
}

export function registerFleetRoutes(router: Router, auth: AuthStore, fleets = new FleetStore()): FleetStore {
  // 列出我的舰队
  router.get("/api/fleets", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    res.json({ fleets: fleets.listForUser(user.id) });
  });

  // 保存新舰队(AI 美化在此时发生)
  router.post("/api/fleets", async (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "请先登录后再保存舰队。" } });
    try {
      const b = (req.body || {}) as { name?: unknown; label?: unknown; topology?: unknown };
      const name = typeof b.name === "string" ? b.name.trim() : "";
      if (!name) throw new Error("舰队名不能为空。");
      const topology = normalizeInputTopology(b.topology);
      const { detail, personas } = await fleets.create({ userId: user.id, name, label: typeof b.label === "string" ? b.label : undefined, topology });
      res.status(201).json({ fleet: detail, node_personas: personas });
    } catch (e) {
      res.status(400).json({ error: { message: e instanceof Error ? e.message : "舰队保存失败。" } });
    }
  });

  // 舰队详情(含完整拓扑 + 美化人设)
  router.get("/api/fleets/:id", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    const row = fleets.findById(Number(req.params.id));
    if (!row || row.user_id !== user.id) return res.status(404).json({ error: { message: "fleet not found" } });
    res.json({ fleet: detailFromRow(row) });
  });

  // 更新(改名/改拓扑/重新美化)
  router.put("/api/fleets/:id", async (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    const id = Number(req.params.id);
    const row = fleets.findById(id);
    if (!row || row.user_id !== user.id) return res.status(404).json({ error: { message: "fleet not found" } });
    try {
      const b = (req.body || {}) as { name?: unknown; label?: unknown; topology?: unknown; rebeautify?: unknown };
      const name = typeof b.name === "string" ? b.name.trim() : undefined;
      const label = typeof b.label === "string" ? b.label : undefined;
      const topology = b.topology != null ? normalizeInputTopology(b.topology) : undefined;
      const { detail, personas } = await fleets.update({ id, userId: user.id, name, label, topology, rebeautify: b.rebeautify === true });
      res.json({ fleet: detail, node_personas: personas });
    } catch (e) {
      res.status(400).json({ error: { message: e instanceof Error ? e.message : "舰队更新失败。" } });
    }
  });

  // 删除
  router.delete("/api/fleets/:id", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    const id = Number(req.params.id);
    const row = fleets.findById(id);
    if (!row || row.user_id !== user.id) return res.status(404).json({ error: { message: "fleet not found" } });
    fleets.delete(id, user.id);
    res.json({ ok: true });
  });

  return fleets;
}
