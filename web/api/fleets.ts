// 用户自定义舰队 API:保存/加载/删除 Playground 拓扑,对应后端 /api/fleets。
// 一个舰队 = 一套 PlaygroundTopology + AI 美化人设 + 自定义模型名 "user:<name>"。

import type { PlaygroundTopology } from "./swarm";

export interface FleetNodePersona {
  persona: string;
  focus: string;
  temperature: number;
}

/** nodeId → 美化人设 */
export type FleetNodePersonas = Record<string, FleetNodePersona>;

export interface UserFleet {
  id: number;
  user_id: number;
  name: string;
  model_id: string; // "user:my-fleet-1"
  label?: string;
  node_count: number;
  edge_count: number;
  is_public: boolean; // 是否已发布到社区
  created_at: number;
  updated_at: number;
}

export interface UserFleetDetail extends UserFleet {
  topology: PlaygroundTopology;
  node_personas: FleetNodePersonas;
}

export interface CreateFleetInput {
  name: string;
  label?: string;
  topology: PlaygroundTopology;
}

export interface CreateFleetResult {
  fleet: UserFleetDetail;
  node_personas: FleetNodePersonas;
}

async function parseApiError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body.error?.message || fallback;
  } catch {
    return fallback;
  }
}

export async function listFleets(): Promise<UserFleet[]> {
  const res = await fetch("/api/fleets", { credentials: "include" });
  if (!res.ok) throw new Error(await parseApiError(res, `舰队列表返回 ${res.status}`));
  const body = await res.json();
  return Array.isArray(body.fleets) ? body.fleets : [];
}

export async function createFleet(input: CreateFleetInput): Promise<CreateFleetResult> {
  const res = await fetch("/api/fleets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      name: input.name,
      label: input.label || undefined,
      topology: input.topology,
    }),
  });
  if (!res.ok) throw new Error(await parseApiError(res, `保存舰队返回 ${res.status}`));
  return await res.json();
}

export async function getFleet(id: number): Promise<UserFleetDetail> {
  const res = await fetch(`/api/fleets/${id}`, { credentials: "include" });
  if (!res.ok) throw new Error(await parseApiError(res, `舰队详情返回 ${res.status}`));
  const body = await res.json();
  return body.fleet;
}

export async function deleteFleet(id: number): Promise<void> {
  const res = await fetch(`/api/fleets/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw new Error(await parseApiError(res, `删除舰队返回 ${res.status}`));
}
