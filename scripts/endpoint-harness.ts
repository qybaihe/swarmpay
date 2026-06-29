import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import { AuthStore, registerAuthRoutes } from "../src/auth.js";
import { bearerToken, EndpointStore, isEvoShipApiKey, registerEndpointRoutes, resolveEndpointProvider } from "../src/endpoints.js";
import { runSwarm } from "../src/swarm.js";
import { withModelProvider } from "../src/model.js";
import { EvolutionMemoryStore, withEvolutionMemoryStore } from "../src/evolution-memory.js";

type ChatBody = {
  model?: string;
  messages?: { role: string; content: string }[];
};

type HarnessTrace = Awaited<ReturnType<typeof runSwarm>>["trace"];

let reviewRejectBudget = 1;

async function listen(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      assert(addr && typeof addr === "object");
      resolve({
        url: `http://127.0.0.1:${addr.port}/v1`,
        close: () => new Promise((done, reject) => server.close((err) => err ? reject(err) : done())),
      });
    });
  });
}

async function postJson<T>(url: string, body: unknown, cookie?: string): Promise<{ status: number; json: T; cookie?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    json: await res.json() as T,
    cookie: res.headers.get("set-cookie") || undefined,
  };
}

async function getJson<T>(url: string, cookie?: string): Promise<{ status: number; json: T }> {
  const res = await fetch(url, {
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  return {
    status: res.status,
    json: await res.json() as T,
  };
}

function fakeContent(body: ChatBody): string {
  const joined = (body.messages || []).map((m) => m.content).join("\n");
  const systemText = (body.messages || []).filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const isReviewerCall = /Reviewer 蜂|审阅批判|verdict:\s*APPROVE\s*\|\s*REJECT/i.test(systemText);
  if (/healthcheck/i.test(joined)) return "ok";
  if (/拆解为/.test(joined) || /输出 JSON 数组/.test(joined)) {
    return JSON.stringify([
      { title: "经验继承", body: "识别可复用经验并规划注入点", signals: "inherit", weight: 0.2 },
      { title: "端点调用", body: "验证上游模型端点可用并执行任务", signals: "endpoint", weight: 0.25 },
      { title: "自净化回流", body: "审查结果并沉淀经验", signals: "backflow", weight: 0.2 },
    ]);
  }
  if (isReviewerCall) {
    if (reviewRejectBudget > 0) {
      reviewRejectBudget -= 1;
      return "VERDICT: REJECT\n问题: 缺少端点健康检查、自净化回流和可复用经验证据,请补充后再提交。";
    }
    return "VERDICT: APPROVE\n端点输出可用,链路满足要求。";
  }
  if (/Queen|聚合器|方案/.test(joined)) {
    return "最终方案: 上游端点已参与蜂群协作,并完成经验继承、任务拆解、planner/coder/reviewer 审查、聚合输出和回流沉淀。该输出足够长,用于稳定触发 EvoShip 的自进化 backflow 阈值。";
  }
  return "上游端点响应: 已完成当前 agent 任务。";
}

async function main() {
  const calls: ChatBody[] = [];
  const app = express();
  app.use(express.json());
  app.post("/v1/chat/completions", (req, res) => {
    calls.push(req.body as ChatBody);
    res.json({
      id: `fake-${calls.length}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: req.body.model || "fake-model",
      choices: [{ index: 0, message: { role: "assistant", content: fakeContent(req.body) }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  });

  const upstream = await listen(app);
  const failingApp = express();
  failingApp.use(express.json());
  failingApp.post("/v1/chat/completions", (_req, res) => {
    res.status(401).json({ error: { message: "bad upstream key", type: "invalid_api_key" } });
  });
  const failingUpstream = await listen(failingApp);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "evoship-endpoint-harness-"));
  const dbPath = path.join(tmpDir, "evoship.sqlite");
  const auth = new AuthStore(dbPath);
  const store = new EndpointStore(dbPath);
  const memory = new EvolutionMemoryStore(dbPath);
  const api = express();
  api.use(express.json());
  registerAuthRoutes(api, auth);
  registerEndpointRoutes(api, auth, store);
  api.post("/v1/chat/completions", async (req, res) => {
    const token = bearerToken(req);
    const endpoint = resolveEndpointProvider(req, store);
    if (!endpoint && isEvoShipApiKey(token)) {
      return res.status(401).json({ error: { message: "invalid EvoShip API key", type: "invalid_api_key" } });
    }
    const body = req.body as ChatBody;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (!messages.length) return res.status(400).json({ error: { message: "messages[] required", type: "invalid_request" } });
    const tier = body.model === "swarm-baseline" || body.model === "swarm-lite" || body.model === "swarm-heavy" || body.model === "swarm-evo"
      ? body.model
      : "swarm-evo";
    try {
      const out = await withEvolutionMemoryStore(memory, () => withModelProvider(endpoint?.provider, () => runSwarm({
        tier,
        messages,
      })));
      if (endpoint) store.markUse(endpoint.row.id, true);
      res.json({
        id: `chatcmpl-harness-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: body.model || "swarm-evo",
        choices: [{ index: 0, message: { role: "assistant", content: out.content }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        x_swarm_trace: out.trace,
      });
    } catch (e) {
      if (endpoint) store.markUse(endpoint.row.id, false, e instanceof Error ? e.message : String(e));
      res.status(500).json({ error: { message: e instanceof Error ? e.message : String(e), type: "internal_error" } });
    }
  });
  api.post("/api/playground/swarm/run", async (req, res) => {
    const token = bearerToken(req);
    const endpoint = resolveEndpointProvider(req, store);
    if (!endpoint && isEvoShipApiKey(token)) {
      return res.status(401).json({ error: { message: "invalid EvoShip API key" } });
    }
    try {
      const out = await withEvolutionMemoryStore(memory, () => withModelProvider(endpoint?.provider, () => runSwarm({
        tier: req.body.tier || "swarm-evo",
        messages: [{ role: "user", content: req.body.goal || "" }],
        customTopology: req.body.topology,
      })));
      if (endpoint) store.markUse(endpoint.row.id, true);
      res.json({ content: out.content, trace: out.trace });
    } catch (e) {
      if (endpoint) store.markUse(endpoint.row.id, false, e instanceof Error ? e.message : String(e));
      res.status(500).json({ error: { message: e instanceof Error ? e.message : String(e) } });
    }
  });
  const localApi = await listen(api);

  try {
    const signup = await postJson<{ user: { id: number } }>(`${localApi.url.replace(/\/v1$/, "")}/api/auth/register`, {
      email: `harness-${Date.now()}@example.com`,
      password: "password123",
      name: "Harness",
    });
    assert.equal(signup.status, 201);
    assert(signup.cookie);

    const badRegistration = await postJson<{ error: { message: string } }>(`${localApi.url.replace(/\/v1$/, "")}/api/endpoints/register`, {
      user_base_url: failingUpstream.url,
      user_api_key: "bad-upstream-key",
      user_model: "fake-upstream-model",
      label: "Broken upstream",
    }, signup.cookie);
    assert.equal(badRegistration.status, 400);
    assert.match(badRegistration.json.error.message, /端点健康检查失败/);
    assert.equal(store.countActive(), 0);
    assert.doesNotMatch(JSON.stringify(badRegistration.json), /bad-upstream-key|api_key_hash|upstream_api_key/);

    const registration = await postJson<{
      api_key: string;
      endpoint: { id: number; upstream_model: string };
    }>(`${localApi.url.replace(/\/v1$/, "")}/api/endpoints/register`, {
      user_base_url: upstream.url,
      user_api_key: "fake-upstream-key",
      user_model: "fake-upstream-model",
      label: "Harness upstream",
    }, signup.cookie);
    assert.equal(registration.status, 201);
    let registered = {
      id: registration.json.endpoint.id,
      api_key: registration.json.api_key,
      upstream_model: registration.json.endpoint.upstream_model,
    };
    assert.match(registered.api_key, /^sk-evoship-/);
    assert.equal(registration.json.endpoint.upstream_model, "fake-upstream-model");

    const endpointList = await getJson<{
      endpoints: {
        id: number;
        label: string;
        upstream_base_url: string;
        upstream_model: string;
        api_key_preview: string;
        status: string;
        last_checked_at?: number;
        last_used_at?: number;
      }[];
    }>(`${localApi.url.replace(/\/v1$/, "")}/api/endpoints`, signup.cookie);
    assert.equal(endpointList.status, 200);
    assert.equal(endpointList.json.endpoints.length, 1);
    assert.equal(endpointList.json.endpoints[0].id, registered.id);
    assert.equal(endpointList.json.endpoints[0].status, "active");
    assert.equal(endpointList.json.endpoints[0].upstream_model, "fake-upstream-model");
    const registeredCheckedAt = endpointList.json.endpoints[0].last_checked_at || 0;
    assert.ok(registeredCheckedAt > 0);
    assert.equal(endpointList.json.endpoints[0].last_used_at == null, true);
    assert.doesNotMatch(JSON.stringify(endpointList.json), /fake-upstream-key|api_key_hash|upstream_api_key/);

    const check = await postJson<{
      ok: boolean;
      result: { ok: boolean; sample?: string; latencyMs: number };
      endpoint: {
        id: number;
        status: string;
        last_checked_at?: number;
        last_used_at?: number;
        success_count: number;
        failure_count: number;
      };
    }>(`${localApi.url.replace(/\/v1$/, "")}/api/endpoints/${registered.id}/check`, {}, signup.cookie);
    assert.equal(check.status, 200);
    assert.equal(check.json.ok, true);
    assert.equal(check.json.result.ok, true);
    assert.equal(check.json.endpoint.id, registered.id);
    assert.equal(check.json.endpoint.status, "active");
    assert.ok((check.json.endpoint.last_checked_at || 0) >= registeredCheckedAt);
    assert.equal(check.json.endpoint.last_used_at == null, true);
    assert.ok(check.json.endpoint.success_count >= 1);
    assert.doesNotMatch(JSON.stringify(check.json), /fake-upstream-key|api_key_hash|upstream_api_key/);

    const originalApiKey = registered.api_key;
    const rotated = await postJson<{
      api_key: string;
      endpoint: {
        id: number;
        upstream_model: string;
        api_key_preview: string;
        status: string;
        last_checked_at?: number;
        success_count: number;
      };
      result: { ok: boolean; sample?: string; latencyMs: number };
    }>(`${localApi.url.replace(/\/v1$/, "")}/api/endpoints/${registered.id}/key`, {}, signup.cookie);
    assert.equal(rotated.status, 200);
    assert.match(rotated.json.api_key, /^sk-evoship-/);
    assert.notEqual(rotated.json.api_key, originalApiKey);
    assert.equal(rotated.json.endpoint.id, registered.id);
    assert.equal(rotated.json.endpoint.status, "active");
    assert.equal(rotated.json.endpoint.upstream_model, "fake-upstream-model");
    assert.equal(rotated.json.result.ok, true);
    assert.doesNotMatch(JSON.stringify(rotated.json), /fake-upstream-key|api_key_hash|upstream_api_key/);
    registered = {
      ...registered,
      api_key: rotated.json.api_key,
    };

    const listAfterRotate = await getJson<{
      endpoints: {
        id: number;
        api_key_preview: string;
        status: string;
        success_count: number;
      }[];
    }>(`${localApi.url.replace(/\/v1$/, "")}/api/endpoints`, signup.cookie);
    assert.equal(listAfterRotate.status, 200);
    assert.equal(listAfterRotate.json.endpoints[0].id, registered.id);
    assert.equal(listAfterRotate.json.endpoints[0].api_key_preview, rotated.json.endpoint.api_key_preview);
    assert.equal(listAfterRotate.json.endpoints[0].status, "active");
    assert.doesNotMatch(JSON.stringify(listAfterRotate.json), /fake-upstream-key|api_key_hash|upstream_api_key/);

    const rejected = await postJson<{ error: { message: string } }>(`${localApi.url.replace(/\/v1$/, "")}/api/endpoints/register`, {
      user_base_url: upstream.url,
      user_api_key: "fake-upstream-key",
      user_model: "fake-upstream-model",
    });
    assert.equal(rejected.status, 401);

    assert.equal(store.countActive(), 1);

    const row = store.findByApiKey(registered.api_key);
    assert(row);
    assert.equal(row.upstream_model, "fake-upstream-model");
    assert.equal(store.findByApiKey(originalApiKey), null);

    const goal = "实现一个完整登录注册系统,并把经验沉淀为可复用流程";
    const directOldKey = await fetch(`${localApi.url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${originalApiKey}`,
      },
      body: JSON.stringify({ model: "swarm-evo", messages: [{ role: "user", content: goal }] }),
    });
    assert.equal(directOldKey.status, 401);

    const baselineAuthed = await fetch(`${localApi.url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${registered.api_key}`,
      },
      body: JSON.stringify({ model: "swarm-baseline", messages: [{ role: "user", content: "你好" }] }),
    });
    assert.equal(baselineAuthed.status, 200);
    const baselineBody = await baselineAuthed.json() as { x_swarm_trace: HarnessTrace };
    assert.equal(baselineBody.x_swarm_trace.tier, "swarm-baseline");
    assert.equal(baselineBody.x_swarm_trace.swarm_size, 1);
    assert.equal(baselineBody.x_swarm_trace.graph, undefined);
    assert.equal(baselineBody.x_swarm_trace.evolution?.deposited, undefined);

    const liteAuthed = await fetch(`${localApi.url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${registered.api_key}`,
      },
      body: JSON.stringify({ model: "swarm-lite", messages: [{ role: "user", content: "解释一下蜂群是什么" }] }),
    });
    assert.equal(liteAuthed.status, 200);
    const liteBody = await liteAuthed.json() as { x_swarm_trace: HarnessTrace };
    assert.equal(liteBody.x_swarm_trace.tier, "swarm-lite");
    assert.equal(liteBody.x_swarm_trace.difficulty, "MEDIUM");
    assert.equal(liteBody.x_swarm_trace.policy?.createSession, false);
    assert.equal(liteBody.x_swarm_trace.policy?.useInheritance, false);
    assert.equal(liteBody.x_swarm_trace.policy?.publishBackflow, false);
    assert.ok((liteBody.x_swarm_trace.graph?.nodes.length || 0) >= 1);
    assert.equal(liteBody.x_swarm_trace.evolution?.deposited, undefined);

    reviewRejectBudget = 1;

    const directInvalid = await fetch(`${localApi.url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-evoship-invalid",
      },
      body: JSON.stringify({ model: "swarm-evo", messages: [{ role: "user", content: goal }] }),
    });
    assert.equal(directInvalid.status, 401);

    const directAuthed = await fetch(`${localApi.url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${registered.api_key}`,
      },
      body: JSON.stringify({ model: "swarm-evo", messages: [{ role: "user", content: goal }] }),
    });
    assert.equal(directAuthed.status, 200);
    const directBody = await directAuthed.json() as {
      model: string;
      choices: { message: { content: string } }[];
      x_swarm_trace: HarnessTrace;
    };
    const out = { content: directBody.choices[0]?.message.content || "", trace: directBody.x_swarm_trace };

    assert.equal(out.trace.model, "fake-upstream-model");
    assert.equal(out.trace.difficulty, "HARD");
    assert.ok((out.trace.graph?.nodes.length || 0) >= 8);
    assert.ok(out.trace.graph?.events.some((event) => event.kind === "inherit"));
    assert.ok(out.trace.graph?.events.some((event) => event.kind === "backflow"));
    assert.ok((out.trace.graph?.metrics?.revisions || 0) >= 1);
    assert.ok(out.trace.graph?.edges.some((edge) => edge.kind === "feedback"));
    assert.ok(out.trace.graph?.events.some((event) => event.kind === "revision"));
    assert.ok(out.trace.handoffs?.some((handoff) => handoff.feedback && (handoff.revisionRound || 0) >= 1));
    assert.equal(out.trace.evolution?.deposited?.generation, 1);
    assert.ok((out.trace.evolution?.deposited?.qualityScore || 0) > 0.8);
    assert.equal(out.trace.evolution?.inheritedLocal, 0);
    const firstQuality = out.trace.evolution?.deposited?.qualityScore || 0;

    const secondAuthed = await fetch(`${localApi.url}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${registered.api_key}`,
      },
      body: JSON.stringify({ model: "swarm-evo", messages: [{ role: "user", content: goal }] }),
    });
    assert.equal(secondAuthed.status, 200);
    const secondBody = await secondAuthed.json() as { x_swarm_trace: HarnessTrace };
    const second = { trace: secondBody.x_swarm_trace };
    assert.equal(second.trace.model, "fake-upstream-model");
    assert.equal(second.trace.difficulty, "HARD");
    assert.ok((second.trace.evolution?.inheritedLocal || 0) >= 1);
    assert.equal(second.trace.evolution?.deposited?.generation, 2);
    const secondQuality = second.trace.evolution?.deposited?.qualityScore || 0;
    assert.ok(secondQuality > firstQuality, `expected G2 quality ${secondQuality} > G1 ${firstQuality}`);
    assert.ok(second.trace.inherited_recipes?.some((recipe) => recipe.source === "local" && recipe.generation === 1));
    assert.equal(memory.count(), 2);
    const playgroundInvalid = await fetch(`${localApi.url.replace(/\/v1$/, "")}/api/playground/swarm/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer sk-evoship-invalid",
      },
      body: JSON.stringify({ goal, tier: "swarm-evo" }),
    });
    assert.equal(playgroundInvalid.status, 401);

    const playgroundAuthed = await fetch(`${localApi.url.replace(/\/v1$/, "")}/api/playground/swarm/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${registered.api_key}`,
      },
      body: JSON.stringify({ goal, tier: "swarm-evo" }),
    });
    assert.equal(playgroundAuthed.status, 200);
    const playgroundBody = await playgroundAuthed.json() as {
      trace: {
        model: string;
        difficulty: string;
        inherited_recipes?: { source?: string; generation?: number; qualityScore?: number; reuseCount?: number; title: string }[];
        graph?: {
          events?: { kind: string }[];
          metrics?: { agentRuns: number; handoffs: number; subtasks: number };
        };
        evomap_backflow?: { status: string; generation?: number; qualityScore?: number; title?: string };
        evolution?: {
          inheritedLocal: number;
          inheritedRemote: number;
          deposited?: { generation: number; qualityScore: number; successStreak: number; title: string };
        };
      };
    };
    assert.equal(playgroundBody.trace.model, "fake-upstream-model");
    assert.equal(playgroundBody.trace.difficulty, "HARD");
    assert.ok((playgroundBody.trace.evolution?.inheritedLocal || 0) >= 1);
    assert.equal(playgroundBody.trace.evolution?.deposited?.generation, 3);
    assert.ok((playgroundBody.trace.evolution?.deposited?.qualityScore || 0) > 0.5);
    const thirdQuality = playgroundBody.trace.evolution?.deposited?.qualityScore || 0;
    assert.ok(thirdQuality > secondQuality, `expected G3 quality ${thirdQuality} > G2 ${secondQuality}`);
    assert.ok((playgroundBody.trace.evolution?.deposited?.successStreak || 0) >= 3);
    assert.ok(playgroundBody.trace.inherited_recipes?.some((recipe) => (
      recipe.source === "local" && (recipe.generation || 0) >= 1 && (recipe.qualityScore || 0) > 0.5
    )));
    assert.ok(playgroundBody.trace.graph?.events?.some((event) => event.kind === "inherit"));
    assert.ok(playgroundBody.trace.graph?.events?.some((event) => event.kind === "backflow"));
    assert.ok((playgroundBody.trace.graph?.metrics?.agentRuns || 0) >= 8);
    assert.ok((playgroundBody.trace.graph?.metrics?.handoffs || 0) >= 3);
    assert.equal(memory.count(), 3);
    assert.ok(calls.length >= 4, `expected swarm to call upstream multiple times, got ${calls.length}`);

    console.log(JSON.stringify({
      ok: true,
      registeredEndpointId: registered.id,
      failedRegistrationStatus: badRegistration.status,
      registrationStatus: registration.status,
      unauthorizedRegistrationStatus: rejected.status,
      directCompletion: {
        oldKeyStatus: directOldKey.status,
        baselineStatus: baselineAuthed.status,
        liteStatus: liteAuthed.status,
        invalidKeyStatus: directInvalid.status,
        authedStatus: directAuthed.status,
        responseModel: directBody.model,
      },
      upstreamCalls: calls.length,
      memoryCount: memory.count(),
      trace: {
        model: out.trace.model,
        difficulty: out.trace.difficulty,
        nodes: out.trace.graph?.nodes.length,
        events: out.trace.graph?.events.length,
        revisions: out.trace.graph?.metrics?.revisions,
        feedbackEdges: out.trace.graph?.edges.filter((edge) => edge.kind === "feedback").length,
        inherited: out.trace.inherited_recipes?.length || 0,
        backflow: out.trace.evomap_backflow?.status,
      },
      secondRun: {
        inheritedLocal: second.trace.evolution?.inheritedLocal,
        depositedGeneration: second.trace.evolution?.deposited?.generation,
        depositedQuality: secondQuality,
        inheritedTitles: second.trace.inherited_recipes?.map((recipe) => `${recipe.source}:G${recipe.generation || "-"}:${recipe.title}`).slice(0, 3),
      },
      playgroundRun: {
        model: playgroundBody.trace.model,
        inheritedLocal: playgroundBody.trace.evolution?.inheritedLocal,
        inheritedRemote: playgroundBody.trace.evolution?.inheritedRemote,
        topRecipe: playgroundBody.trace.inherited_recipes?.[0]
          ? `${playgroundBody.trace.inherited_recipes[0].source}:G${playgroundBody.trace.inherited_recipes[0].generation || "-"}:q=${playgroundBody.trace.inherited_recipes[0].qualityScore || "-"}`
          : null,
        depositedGeneration: playgroundBody.trace.evolution?.deposited?.generation,
        depositedQuality: thirdQuality,
        qualityProgression: [firstQuality, secondQuality, thirdQuality],
        graphEvents: {
          inherit: playgroundBody.trace.graph?.events?.filter((event) => event.kind === "inherit").length || 0,
          backflow: playgroundBody.trace.graph?.events?.filter((event) => event.kind === "backflow").length || 0,
        },
      },
    }, null, 2));
  } finally {
    await localApi.close();
    await upstream.close();
    await failingUpstream.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
