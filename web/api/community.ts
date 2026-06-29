// 社区功能 API 客户端:公开舰队浏览 + 赞/评/关注 + fork。
// 浏览类(GET)无需登录;互动类(POST)需登录(credentials:include)。
import type { PlaygroundTopology } from "./swarm";

export interface CommunityAuthor {
  id: number;
  name: string;
}

export interface CommunityFleetSummary {
  id: number;
  name: string;
  model_id: string;
  label?: string;
  node_count: number;
  edge_count: number;
  created_at: number;
  author: CommunityAuthor;
  like_count: number;
  comment_count: number;
  fork_count: number;
}

export interface CommunityFleetDetail extends CommunityFleetSummary {
  topology: PlaygroundTopology;
  liked_by_me: boolean;
}

export interface FleetComment {
  id: number;
  fleet_id: number;
  author: CommunityAuthor;
  content: string;
  created_at: number;
}

export interface PublicUserProfile {
  id: number;
  name: string;
  fleet_count: number;
  follower_count: number;
  following_count: number;
  fleets: CommunityFleetSummary[];
  followed_by_me: boolean;
}

async function parseErr(res: Response, fallback: string): Promise<string> {
  try {
    const b = await res.json();
    return b.error?.message || fallback;
  } catch {
    return fallback;
  }
}

export async function listPublicFleets(opts: { sort?: "new" | "hot"; page?: number; q?: string } = {}): Promise<{ items: CommunityFleetSummary[]; total: number }> {
  const params = new URLSearchParams();
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.q) params.set("q", opts.q);
  const res = await fetch(`/api/community/fleets?${params}`);
  if (!res.ok) throw new Error(await parseErr(res, `社区列表返回 ${res.status}`));
  return await res.json();
}

export async function getPublicFleet(id: number): Promise<CommunityFleetDetail> {
  const res = await fetch(`/api/community/fleets/${id}`);
  if (!res.ok) throw new Error(await parseErr(res, `舰队详情返回 ${res.status}`));
  const d = await res.json();
  return d.fleet;
}

export async function publishFleet(fleetId: number, publish: boolean): Promise<{ id: number; is_public: boolean }> {
  const res = await fetch(`/api/fleets/${fleetId}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ publish }),
  });
  if (!res.ok) throw new Error(await parseErr(res, `发布失败 ${res.status}`));
  return await res.json();
}

export async function toggleLike(fleetId: number, like: boolean): Promise<{ liked: boolean; like_count: number }> {
  const res = await fetch(`/api/community/fleets/${fleetId}/like`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ like }),
  });
  if (!res.ok) throw new Error(await parseErr(res, `点赞失败 ${res.status}`));
  return await res.json();
}

export async function listComments(fleetId: number): Promise<FleetComment[]> {
  const res = await fetch(`/api/community/fleets/${fleetId}/comments`);
  if (!res.ok) throw new Error(await parseErr(res, `评论列表返回 ${res.status}`));
  const d = await res.json();
  return d.comments || [];
}

export async function addComment(fleetId: number, content: string): Promise<FleetComment> {
  const res = await fetch(`/api/community/fleets/${fleetId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(await parseErr(res, `评论失败 ${res.status}`));
  const d = await res.json();
  return d.comment;
}

export async function forkFleet(fleetId: number, newName?: string): Promise<{ id: number; model_id: string }> {
  const res = await fetch(`/api/community/fleets/${fleetId}/fork`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ name: newName }),
  });
  if (!res.ok) throw new Error(await parseErr(res, `复制失败 ${res.status}`));
  const d = await res.json();
  return { id: d.fleet.id, model_id: d.fleet.model_id };
}

export async function toggleFollow(userId: number, follow: boolean): Promise<{ following: boolean }> {
  const res = await fetch(`/api/community/users/${userId}/follow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ follow }),
  });
  if (!res.ok) throw new Error(await parseErr(res, `关注失败 ${res.status}`));
  return await res.json();
}

export async function getPublicProfile(userId: number): Promise<PublicUserProfile> {
  const res = await fetch(`/api/community/users/${userId}`);
  if (!res.ok) throw new Error(await parseErr(res, `用户主页返回 ${res.status}`));
  const d = await res.json();
  return d.profile;
}
