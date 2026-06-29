// community.ts
// 社区功能:公开舰队浏览 + 点赞/评论/关注 + fork(复制舰队)。
// 依赖 FleetStore(共享同一个 SQLite)+ AuthStore(拿作者昵称)。
// 浏览类接口(GET)无需登录;互动类(POST)需 session。

import { DatabaseSync } from "node:sqlite";
import type { Router } from "express";
import { DB_PATH, getSessionToken, type AuthStore } from "./auth.js";
import { FleetStore, toModelId, type FleetDetail } from "./fleets.js";
import type { CustomSwarmTopology, FleetNodePersonas } from "./agents/types.js";

export interface CommunityFleetSummary {
  id: number;
  name: string;
  model_id: string;
  label?: string;
  node_count: number;
  edge_count: number;
  created_at: number;
  author: { id: number; name: string };
  like_count: number;
  comment_count: number;
  fork_count: number;
}

export interface CommunityFleetDetail extends CommunityFleetSummary {
  topology: CustomSwarmTopology;
  node_personas: FleetNodePersonas;
  liked_by_me: boolean;
}

export interface FleetComment {
  id: number;
  fleet_id: number;
  author: { id: number; name: string };
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

function now(): number {
  return Date.now();
}

export class CommunityStore {
  private db: DatabaseSync;
  private fleets: FleetStore;

  constructor(fleets: FleetStore, dbPath = DB_PATH) {
    this.fleets = fleets;
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS fleet_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fleet_id INTEGER NOT NULL,
        liker_user_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(fleet_id, liker_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_fleet_likes_fleet ON fleet_likes(fleet_id);
      CREATE INDEX IF NOT EXISTS idx_fleet_likes_liker ON fleet_likes(liker_user_id);

      CREATE TABLE IF NOT EXISTS fleet_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fleet_id INTEGER NOT NULL,
        author_user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_fleet_comments_fleet ON fleet_comments(fleet_id);

      CREATE TABLE IF NOT EXISTS user_follows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        follower_user_id INTEGER NOT NULL,
        followee_user_id INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(follower_user_id, followee_user_id)
      );
      CREATE INDEX IF NOT EXISTS idx_follows_followee ON user_follows(followee_user_id);
      CREATE INDEX IF NOT EXISTS idx_follows_follower ON user_follows(follower_user_id);
    `);
  }

  /** 公开舰队列表(按最新/最热排序),分页 + 可选搜索 */
  listPublic(opts: { sort?: "new" | "hot"; page?: number; pageSize?: number; q?: string; viewerUserId?: number } = {}): { items: CommunityFleetSummary[]; total: number } {
    const sort = opts.sort === "hot" ? "hot" : "new";
    const page = Math.max(1, opts.page || 1);
    const pageSize = Math.min(48, Math.max(1, opts.pageSize || 12));
    const offset = (page - 1) * pageSize;
    const q = (opts.q || "").trim();

    const where = q ? `WHERE f.is_public = 1 AND (f.name LIKE ? OR f.label LIKE ? OR u.name LIKE ?)` : `WHERE f.is_public = 1`;
    const params: (string | number)[] = q ? [`%${q}%`, `%${q}%`, `%${q}%`] : [];
    const order = sort === "hot" ? "like_count DESC, f.created_at DESC" : "f.created_at DESC";

    const countRow = this.db.prepare(
      `SELECT COUNT(*) AS c FROM user_fleets f JOIN users u ON u.id = f.user_id ${where}`,
    ).get(...params) as { c: number };
    const total = Number(countRow?.c || 0);

    const rows = this.db.prepare(`
      SELECT f.id, f.name, f.model_id, f.label, f.topology_json, f.created_at,
             f.user_id AS author_id, u.name AS author_name,
             (SELECT COUNT(*) FROM fleet_likes l WHERE l.fleet_id = f.id) AS like_count,
             (SELECT COUNT(*) FROM fleet_comments c WHERE c.fleet_id = f.id) AS comment_count,
             (SELECT COUNT(*) FROM user_fleets f2 WHERE f2.label LIKE '%fork%' AND f2.name LIKE '%' || f.name || '%' ) AS fork_count
      FROM user_fleets f JOIN users u ON u.id = f.user_id
      ${where}
      ORDER BY ${order}
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as Array<{
      id: number; name: string; model_id: string; label: string | null;
      topology_json: string; created_at: number;
      author_id: number; author_name: string;
      like_count: number; comment_count: number; fork_count: number;
    }>;

    const items: CommunityFleetSummary[] = rows.map((r) => {
      let nodeCount = 0, edgeCount = 0;
      try {
        const t = JSON.parse(r.topology_json) as CustomSwarmTopology;
        nodeCount = t.nodes?.length ?? 0;
        edgeCount = t.edges?.length ?? 0;
      } catch { /* ignore */ }
      return {
        id: r.id, name: r.name, model_id: r.model_id, label: r.label || undefined,
        node_count: nodeCount, edge_count: edgeCount, created_at: r.created_at,
        author: { id: r.author_id, name: r.author_name },
        like_count: Number(r.like_count || 0), comment_count: Number(r.comment_count || 0),
        fork_count: Number(r.fork_count || 0),
      };
    });
    return { items, total };
  }

  /** 公开舰队详情(含 topology) */
  getPublicFleet(fleetId: number, viewerUserId?: number): CommunityFleetDetail | null {
    const row = this.fleets.findById(fleetId);
    if (!row || row.is_public !== 1) return null;
    const author = this.authorOf(row.user_id);
    if (!author) return null;
    let topology: CustomSwarmTopology = { mode: "custom", nodes: [], edges: [] };
    let personas: FleetNodePersonas = {};
    try { topology = JSON.parse(row.topology_json); } catch { /* ignore */ }
    try { if (row.node_personas_json) personas = JSON.parse(row.node_personas_json); } catch { /* ignore */ }
    const likeCount = this.likeCount(fleetId);
    const commentCount = this.commentCount(fleetId);
    return {
      id: row.id, name: row.name, model_id: row.model_id, label: row.label || undefined,
      node_count: topology.nodes.length, edge_count: topology.edges.length,
      created_at: row.created_at, author,
      like_count: likeCount, comment_count: commentCount, fork_count: 0,
      topology, node_personas: personas,
      liked_by_me: viewerUserId ? this.isLiked(fleetId, viewerUserId) : false,
    };
  }

  /** fork:复制公开舰队为某用户的私有副本 */
  fork(fleetId: number, toUserId: number, newName?: string): FleetDetail {
    const src = this.fleets.findById(fleetId);
    if (!src || src.is_public !== 1) throw new Error("该舰队不存在或未公开。");
    return this.fleets.fork(fleetId, toUserId, newName);
  }

  // ── 点赞 ──
  toggleLike(fleetId: number, userId: number, like: boolean): { liked: boolean; like_count: number } {
    if (like) {
      try {
        this.db.prepare("INSERT INTO fleet_likes (fleet_id, liker_user_id, created_at) VALUES (?, ?, ?)").run(fleetId, userId, now());
      } catch { /* 已赞过,UNIQUE 冲突,忽略 */ }
    } else {
      this.db.prepare("DELETE FROM fleet_likes WHERE fleet_id = ? AND liker_user_id = ?").run(fleetId, userId);
    }
    return { liked: like, like_count: this.likeCount(fleetId) };
  }
  isLiked(fleetId: number, userId: number): boolean {
    const r = this.db.prepare("SELECT 1 FROM fleet_likes WHERE fleet_id = ? AND liker_user_id = ?").get(fleetId, userId);
    return !!r;
  }
  likeCount(fleetId: number): number {
    const r = this.db.prepare("SELECT COUNT(*) AS c FROM fleet_likes WHERE fleet_id = ?").get(fleetId) as { c: number };
    return Number(r?.c || 0);
  }

  // ── 评论 ──
  addComment(fleetId: number, userId: number, content: string): FleetComment {
    const c = content.trim().slice(0, 500);
    if (!c) throw new Error("评论内容不能为空。");
    const r = this.db.prepare("INSERT INTO fleet_comments (fleet_id, author_user_id, content, created_at) VALUES (?, ?, ?, ?)")
      .run(fleetId, userId, c, now());
    const author = this.authorOf(userId);
    if (!author) throw new Error("评论作者不存在。");
    return { id: Number(r.lastInsertRowid), fleet_id: fleetId, author, content: c, created_at: now() };
  }
  listComments(fleetId: number, limit = 50): FleetComment[] {
    const rows = this.db.prepare(`
      SELECT c.id, c.fleet_id, c.author_user_id, c.content, c.created_at, u.name AS author_name
      FROM fleet_comments c JOIN users u ON u.id = c.author_user_id
      WHERE c.fleet_id = ? ORDER BY c.created_at ASC LIMIT ?
    `).all(fleetId, limit) as Array<{ id: number; fleet_id: number; author_user_id: number; content: string; created_at: number; author_name: string }>;
    return rows.map((r) => ({ id: r.id, fleet_id: r.fleet_id, author: { id: r.author_user_id, name: r.author_name }, content: r.content, created_at: r.created_at }));
  }
  commentCount(fleetId: number): number {
    const r = this.db.prepare("SELECT COUNT(*) AS c FROM fleet_comments WHERE fleet_id = ?").get(fleetId) as { c: number };
    return Number(r?.c || 0);
  }

  // ── 关注 ──
  toggleFollow(followerId: number, followeeId: number, follow: boolean): { following: boolean } {
    if (followerId === followeeId) throw new Error("不能关注自己。");
    if (follow) {
      try { this.db.prepare("INSERT INTO user_follows (follower_user_id, followee_user_id, created_at) VALUES (?, ?, ?)").run(followerId, followeeId, now()); } catch { /* ignore */ }
    } else {
      this.db.prepare("DELETE FROM user_follows WHERE follower_user_id = ? AND followee_user_id = ?").run(followerId, followeeId);
    }
    return { following: follow };
  }
  isFollowing(followerId: number, followeeId: number): boolean {
    return !!this.db.prepare("SELECT 1 FROM user_follows WHERE follower_user_id = ? AND followee_user_id = ?").get(followerId, followeeId);
  }
  followerCount(userId: number): number {
    const r = this.db.prepare("SELECT COUNT(*) AS c FROM user_follows WHERE followee_user_id = ?").get(userId) as { c: number };
    return Number(r?.c || 0);
  }
  followingCount(userId: number): number {
    const r = this.db.prepare("SELECT COUNT(*) AS c FROM user_follows WHERE follower_user_id = ?").get(userId) as { c: number };
    return Number(r?.c || 0);
  }

  // ── 用户公开主页 ──
  publicProfile(userId: number, viewerUserId?: number): PublicUserProfile | null {
    const author = this.authorOf(userId);
    if (!author) return null;
    const { items } = this.listPublic({ pageSize: 48 });
    const myFleets = items.filter((f) => f.author.id === userId);
    return {
      id: author.id, name: author.name,
      fleet_count: myFleets.length,
      follower_count: this.followerCount(userId),
      following_count: this.followingCount(userId),
      fleets: myFleets,
      followed_by_me: viewerUserId ? this.isFollowing(viewerUserId, userId) : false,
    };
  }

  private authorOf(userId: number): { id: number; name: string } | null {
    const r = this.db.prepare("SELECT id, name FROM users WHERE id = ?").get(userId) as { id: number; name: string } | undefined;
    return r ? { id: r.id, name: r.name } : null;
  }
}

export function registerCommunityRoutes(router: Router, auth: AuthStore, fleets: FleetStore, community = new CommunityStore(fleets)): CommunityStore {
  // 浏览:公开舰队列表(无需登录)
  router.get("/api/community/fleets", (req, res) => {
    const viewer = auth.findUserBySession(getSessionToken(req));
    const sort = (req.query.sort === "hot" ? "hot" : "new") as "new" | "hot";
    const page = Number(req.query.page) || 1;
    const q = typeof req.query.q === "string" ? req.query.q : "";
    const result = community.listPublic({ sort, page, q, viewerUserId: viewer?.id });
    res.json(result);
  });

  // 浏览:公开舰队详情(无需登录)
  router.get("/api/community/fleets/:id", (req, res) => {
    const viewer = auth.findUserBySession(getSessionToken(req));
    const detail = community.getPublicFleet(Number(req.params.id), viewer?.id);
    if (!detail) return res.status(404).json({ error: { message: "fleet not found or not public" } });
    res.json({ fleet: detail });
  });

  // 发布/取消发布(仅作者)
  router.post("/api/fleets/:id/publish", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    const id = Number(req.params.id);
    const row = fleets.findById(id);
    if (!row || row.user_id !== user.id) return res.status(404).json({ error: { message: "fleet not found" } });
    const publish = (req.body || {}).publish === true;
    fleets.setPublic(id, user.id, publish);
    res.json({ id, is_public: publish });
  });

  // 点赞/取消(需登录)
  router.post("/api/community/fleets/:id/like", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    const like = (req.body || {}).like !== false;
    const r = community.toggleLike(Number(req.params.id), user.id, like);
    res.json(r);
  });

  // 评论列表(无需登录)
  router.get("/api/community/fleets/:id/comments", (req, res) => {
    res.json({ comments: community.listComments(Number(req.params.id)) });
  });

  // 发评论(需登录)
  router.post("/api/community/fleets/:id/comments", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    try {
      const content = typeof (req.body || {}).content === "string" ? (req.body as { content: string }).content : "";
      const c = community.addComment(Number(req.params.id), user.id, content);
      res.status(201).json({ comment: c });
    } catch (e) {
      res.status(400).json({ error: { message: e instanceof Error ? e.message : "评论失败。" } });
    }
  });

  // fork:复制公开舰队为自己的私有副本(需登录)
  router.post("/api/community/fleets/:id/fork", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    try {
      const newName = typeof (req.body || {}).name === "string" ? (req.body as { name: string }).name : undefined;
      const detail = community.fork(Number(req.params.id), user.id, newName);
      res.status(201).json({ fleet: detail });
    } catch (e) {
      res.status(400).json({ error: { message: e instanceof Error ? e.message : "复制失败。" } });
    }
  });

  // 关注/取消(需登录)
  router.post("/api/community/users/:userId/follow", (req, res) => {
    const user = auth.findUserBySession(getSessionToken(req));
    if (!user) return res.status(401).json({ error: { message: "not authenticated" } });
    try {
      const follow = (req.body || {}).follow !== false;
      const r = community.toggleFollow(user.id, Number(req.params.userId), follow);
      res.json(r);
    } catch (e) {
      res.status(400).json({ error: { message: e instanceof Error ? e.message : "关注失败。" } });
    }
  });

  // 用户公开主页(无需登录)
  router.get("/api/community/users/:userId", (req, res) => {
    const viewer = auth.findUserBySession(getSessionToken(req));
    const profile = community.publicProfile(Number(req.params.userId), viewer?.id);
    if (!profile) return res.status(404).json({ error: { message: "user not found" } });
    res.json({ profile });
  });

  return community;
}
