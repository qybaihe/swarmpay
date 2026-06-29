import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "./auth.js";
import type { CollaborationTrace } from "./agents/types.js";
import type { InheritedRecipe } from "./evomap.js";

export interface EvolutionDepositInput {
  goal: string;
  tier: string;
  finalContent: string;
  trace: CollaborationTrace;
}

export interface EvolutionMemoryRecord {
  id: number;
  title: string;
  description: string;
  content: string;
  signals: string[];
  qualityScore: number;
  useCount: number;
  successStreak: number;
  generation: number;
  createdAt: number;
  updatedAt: number;
}

interface MemoryRow {
  id: number;
  goal_key: string;
  title: string;
  description: string;
  content: string;
  signals_json: string;
  quality_score: number;
  use_count: number;
  success_streak: number;
  generation: number;
  created_at: number;
  updated_at: number;
  last_used_at?: number;
}

const storeContext = new AsyncLocalStorage<EvolutionMemoryStore>();

function now(): number {
  return Date.now();
}

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

function extractSignals(input: string): string[] {
  const text = normalizeText(input);
  const latin = text.match(/[a-z0-9][a-z0-9_-]{2,}/g) || [];
  const domain = [
    "登录", "注册", "端点", "模型", "蜂群", "自净化", "自进化", "回流", "继承",
    "sqlite", "playground", "harness", "前端", "后端", "健康检查", "经验",
  ].filter((word) => text.includes(word));
  const chinesePairs = unique((text.match(/[\u4e00-\u9fff]{2,4}/g) || []).slice(0, 24));
  return unique([...domain, ...latin, ...chinesePairs]).slice(0, 32);
}

function goalKey(goal: string): string {
  return extractSignals(goal).slice(0, 8).join("|") || normalizeText(goal).slice(0, 80);
}

function rowToRecord(row: MemoryRow): EvolutionMemoryRecord {
  let signals: string[] = [];
  try {
    signals = JSON.parse(row.signals_json) as string[];
  } catch {
    signals = [];
  }
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    content: row.content,
    signals,
    qualityScore: row.quality_score,
    useCount: row.use_count,
    successStreak: row.success_streak,
    generation: row.generation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function scoreMatch(querySignals: string[], row: MemoryRow): number {
  let rowSignals: string[] = [];
  try {
    rowSignals = JSON.parse(row.signals_json) as string[];
  } catch {
    rowSignals = [];
  }
  const overlap = querySignals.filter((signal) => rowSignals.includes(signal)).length;
  const signalScore = querySignals.length ? overlap / Math.max(querySignals.length, rowSignals.length, 1) : 0;
  return signalScore * 0.65 + row.quality_score * 0.25 + Math.min(row.success_streak, 5) * 0.02;
}

function computeQuality(input: EvolutionDepositInput): number {
  const stages = input.trace.stages.length;
  const handoffs = input.trace.handoffs.length;
  const subtasks = input.trace.subtasks.length;
  const revisions = input.trace.revisionRounds;
  const breakthroughs = input.trace.breakthroughsBroadcast;
  const contentScore = Math.min(input.finalContent.length / 1800, 0.18);
  const collaborationScore = Math.min((stages + handoffs + subtasks) / 36, 0.22);
  const correctionScore = Math.min(revisions, 3) * 0.035;
  const breakthroughScore = Math.min(breakthroughs, 3) * 0.03;
  return Number(Math.min(0.96, 0.52 + contentScore + collaborationScore + correctionScore + breakthroughScore).toFixed(3));
}

function evolveQuality(baseQuality: number, previous: MemoryRow | undefined): number {
  if (!previous) return baseQuality;
  const continuityBoost = Math.min(0.03, 0.012 + Math.min(previous.success_streak, 5) * 0.002);
  return Number(Math.min(0.99, Math.max(baseQuality, previous.quality_score + continuityBoost)).toFixed(3));
}

export class EvolutionMemoryStore {
  private db: DatabaseSync;

  constructor(dbPath = DB_PATH) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS evolution_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_key TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        content TEXT NOT NULL,
        signals_json TEXT NOT NULL,
        quality_score REAL NOT NULL,
        use_count INTEGER NOT NULL DEFAULT 0,
        success_streak INTEGER NOT NULL DEFAULT 1,
        generation INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        last_used_at INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_evolution_memories_goal_key ON evolution_memories(goal_key);
      CREATE INDEX IF NOT EXISTS idx_evolution_memories_quality ON evolution_memories(quality_score);
      CREATE INDEX IF NOT EXISTS idx_evolution_memories_updated_at ON evolution_memories(updated_at);
    `);
  }

  searchRecipes(query: string, limit = 4): InheritedRecipe[] {
    const querySignals = extractSignals(query);
    if (!querySignals.length) return [];
    const rows = this.db.prepare(`
      SELECT * FROM evolution_memories
      ORDER BY quality_score DESC, updated_at DESC
      LIMIT 80
    `).all() as unknown as MemoryRow[];
    const ranked = rows
      .map((row) => ({ row, score: scoreMatch(querySignals, row) }))
      .filter((item) => item.score >= 0.08)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    if (!ranked.length) return [];
    const ts = now();
    for (const { row } of ranked) {
      this.db.prepare(`
        UPDATE evolution_memories
        SET use_count = use_count + 1, last_used_at = ?, updated_at = ?
        WHERE id = ?
      `).run(ts, ts, row.id);
    }
    return ranked.map(({ row, score }) => ({
      title: row.title,
      description: row.description,
      source: "local",
      qualityScore: row.quality_score,
      reuseCount: row.use_count + 1,
      generation: row.generation,
      matchScore: Number(score.toFixed(3)),
      memoryId: row.id,
    }));
  }

  deposit(input: EvolutionDepositInput): EvolutionMemoryRecord {
    const signals = extractSignals(`${input.goal}\n${input.finalContent}\n${input.trace.subtasks.map((s) => s.title).join(" ")}`);
    const key = goalKey(input.goal);
    const baseQuality = computeQuality(input);
    const previous = this.db.prepare(`
      SELECT * FROM evolution_memories
      WHERE goal_key = ?
      ORDER BY generation DESC, quality_score DESC
      LIMIT 1
    `).get(key) as MemoryRow | undefined;
    const generation = (previous?.generation || 0) + 1;
    const successStreak = (previous?.success_streak || 0) + 1;
    const quality = evolveQuality(baseQuality, previous);
    const title = `EvoShip 进化记忆 G${generation}: ${input.goal.slice(0, 42)}`;
    const description = [
      `质量分 ${quality}`,
      `${input.trace.subtasks.length} 个子任务`,
      `${input.trace.handoffs.length} 次 handoff`,
      `${input.trace.revisionRounds} 轮自净化`,
      `${input.trace.breakthroughsBroadcast} 次突破广播`,
    ].join(" · ");
    const ts = now();
    const result = this.db.prepare(`
      INSERT INTO evolution_memories (
        goal_key, title, description, content, signals_json, quality_score,
        use_count, success_streak, generation, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).run(
      key,
      title,
      description,
      input.finalContent.slice(0, 2400),
      JSON.stringify(signals),
      quality,
      successStreak,
      generation,
      ts,
      ts,
    );
    const row = this.db.prepare("SELECT * FROM evolution_memories WHERE id = ?").get(Number(result.lastInsertRowid)) as unknown as MemoryRow;
    return rowToRecord(row);
  }

  /**
   * 写入外部来源经验(EvoMap webhook 推送的 recipe)。
   * 与 deposit() 的区别:不需要内部 CollaborationTrace(那是 EvoShip 自产经验),
   * 直接以外部提供的内容 + 质量分写入,source 不影响继承层命中逻辑(都进同一张表)。
   * webhook 收到的 recipe.published/created 调用此方法,蜂群下次继承会优先命中。
   */
  depositExternal(input: {
    title: string;
    description: string;
    content: string;
    signals: string[];
    quality: number;
    origin: string;
  }): EvolutionMemoryRecord {
    const signals = unique(input.signals.length ? input.signals : extractSignals(`${input.title}\n${input.description}`)).slice(0, 32);
    const key = goalKey(input.title);
    // 外部经验不自动升 generation(避免与自产经验混淆),固定 generation=1
    const ts = now();
    const result = this.db.prepare(`
      INSERT INTO evolution_memories (
        goal_key, title, description, content, signals_json, quality_score,
        use_count, success_streak, generation, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 1, 1, ?, ?)
    `).run(
      key,
      input.title.slice(0, 120),
      input.description.slice(0, 300),
      input.content.slice(0, 2400),
      JSON.stringify(signals),
      input.quality,
      ts,
      ts,
    );
    const row = this.db.prepare("SELECT * FROM evolution_memories WHERE id = ?").get(Number(result.lastInsertRowid)) as unknown as MemoryRow;
    return rowToRecord(row);
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM evolution_memories").get() as { count: number };
    return Number(row.count || 0);
  }

  /** 最近 N 条(宝箱库存展示用,只读摘要) */
  recent(limit = 5): Array<{ id: number; title: string; generation: number; qualityScore: number; successStreak: number }> {
    const rows = this.db.prepare(
      "SELECT id, title, generation, quality_score, success_streak FROM evolution_memories ORDER BY created_at DESC LIMIT ?",
    ).all(limit) as Array<{ id: number; title: string; generation: number; quality_score: number; success_streak: number }>;
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      generation: r.generation,
      qualityScore: r.quality_score,
      successStreak: r.success_streak,
    }));
  }
}

export const defaultEvolutionMemory = new EvolutionMemoryStore();

export function activeEvolutionMemory(): EvolutionMemoryStore {
  return storeContext.getStore() || defaultEvolutionMemory;
}

export async function withEvolutionMemoryStore<T>(store: EvolutionMemoryStore, fn: () => Promise<T>): Promise<T> {
  return storeContext.run(store, fn);
}
