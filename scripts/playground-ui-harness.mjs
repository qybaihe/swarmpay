import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      assert(addr && typeof addr === "object");
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((done, reject) => server.close((err) => err ? reject(err) : done())),
      });
    });
  });
}

function traceForRun(runNumber) {
  const inheritedLocal = Math.max(0, runNumber - 1);
  const generation = runNumber;
  const quality = Number((0.79 + generation * 0.01).toFixed(3));
  const localRecipes = Array.from({ length: inheritedLocal }, (_, index) => {
    const gen = generation - index - 1;
    return {
      title: `EvoShip 进化记忆 G${gen}: 登录注册端点链路`,
      description: `local memory G${gen}`,
      source: "local",
      generation: gen,
      qualityScore: 0.79,
      reuseCount: runNumber,
      matchScore: 0.91,
      memoryId: gen,
    };
  });
  const remoteRecipes = [
    {
      title: "EvoMap Capsule: endpoint healthcheck handoff",
      description: "远程经验:注册端点后优先做真实健康检查,再进入蜂群协作。",
      source: "capsule",
      qualityScore: 0.74,
      reuseCount: 3,
      matchScore: 0.66,
    },
  ];

  return {
    tier: "swarm-evo",
    model: "fake-ui-upstream-model",
    difficulty: "HARD",
    policy: {
      tier: "swarm-evo",
      difficulty: "HARD",
      createSession: true,
      useInheritance: true,
      publishBackflow: true,
      mediumSolverCount: 3,
      hardMaxSubtasks: 4,
      hardConcurrency: 3,
      maxRevisionRounds: 2,
    },
    swarm_size: 14,
    inherited_recipes: [...localRecipes, ...remoteRecipes].slice(0, 4),
    graph: {
      runId: `ui-harness-${runNumber}`,
      difficulty: "HARD",
      tier: "swarm-evo",
      policy: {
        tier: "swarm-evo",
        difficulty: "HARD",
        createSession: true,
        useInheritance: true,
        publishBackflow: true,
        mediumSolverCount: 3,
        hardMaxSubtasks: 4,
        hardConcurrency: 3,
        maxRevisionRounds: 2,
      },
      nodes: [
        { id: "evomap", instanceId: "evomap", archetype: "evomap", label: "EvoMap", status: "ran", order: 1, createdAtSeq: 1 },
        { id: "orch", instanceId: "orch", archetype: "orchestrator", label: "Dispatch/Aggregate", status: "ran", order: 2, createdAtSeq: 2 },
        { id: "planner-1", instanceId: "planner-1", archetype: "planner", label: "Plan 1", taskId: "task-1", laneId: "lane-task-1", status: "ran", order: 3, createdAtSeq: 3 },
        { id: "coder-1", instanceId: "coder-1", archetype: "coder", label: "Code 1", taskId: "task-1", laneId: "lane-task-1", status: "ran", order: 4, createdAtSeq: 4 },
        { id: "reviewer-1", instanceId: "reviewer-1", archetype: "reviewer", label: "Review 1", taskId: "task-1", laneId: "lane-task-1", status: "approved", order: 5, createdAtSeq: 5 },
        { id: "planner-2", instanceId: "planner-2", archetype: "planner", label: "Plan 2", taskId: "task-2", laneId: "lane-task-2", status: "ran", order: 6, createdAtSeq: 6 },
        { id: "coder-2", instanceId: "coder-2", archetype: "coder", label: "Code 2", taskId: "task-2", laneId: "lane-task-2", status: "ran", order: 7, createdAtSeq: 7 },
        { id: "reviewer-2", instanceId: "reviewer-2", archetype: "reviewer", label: "Review 2", taskId: "task-2", laneId: "lane-task-2", status: "approved", order: 8, createdAtSeq: 8 },
        { id: "planner-3", instanceId: "planner-3", archetype: "planner", label: "Plan 3", taskId: "task-3", laneId: "lane-task-3", status: "ran", order: 9, createdAtSeq: 9 },
        { id: "coder-3", instanceId: "coder-3", archetype: "coder", label: "Code 3", taskId: "task-3", laneId: "lane-task-3", status: "ran", order: 10, createdAtSeq: 10 },
        { id: "reviewer-3", instanceId: "reviewer-3", archetype: "reviewer", label: "Review 3", taskId: "task-3", laneId: "lane-task-3", status: "approved", order: 11, createdAtSeq: 11 },
        { id: "planner-4", instanceId: "planner-4", archetype: "planner", label: "Plan 4", taskId: "task-4", laneId: "lane-task-4", status: "ran", order: 12, createdAtSeq: 12 },
        { id: "coder-4", instanceId: "coder-4", archetype: "coder", label: "Code 4", taskId: "task-4", laneId: "lane-task-4", status: "ran", order: 13, createdAtSeq: 13 },
        { id: "reviewer-4", instanceId: "reviewer-4", archetype: "reviewer", label: "Review 4", taskId: "task-4", laneId: "lane-task-4", status: "approved", order: 14, createdAtSeq: 14 },
      ],
      edges: [
        { id: "inherit-1", source: "evomap", target: "orch", kind: "inherit", status: "sent", label: "inherit", seq: 1 },
        { id: "dispatch-1", source: "orch", target: "planner-1", kind: "dispatch", taskId: "task-1", laneId: "lane-task-1", status: "sent", label: "dispatch", seq: 2 },
        { id: "handoff-1", source: "planner-1", target: "coder-1", kind: "handoff", taskId: "task-1", laneId: "lane-task-1", status: "sent", label: "handoff", seq: 3 },
        { id: "handoff-2", source: "coder-1", target: "reviewer-1", kind: "handoff", taskId: "task-1", laneId: "lane-task-1", status: "sent", label: "handoff", seq: 4 },
        { id: "feedback-1", source: "reviewer-1", target: "coder-1", kind: "feedback", taskId: "task-1", laneId: "lane-task-1", revisionRound: 1, status: "sent", label: "feedback", snippet: "缺少端点健康检查失败态,请补齐后再审。", seq: 5 },
        { id: "report-1", source: "reviewer-1", target: "orch", kind: "report", taskId: "task-1", laneId: "lane-task-1", status: "sent", label: "report", seq: 6 },
        { id: "dispatch-2", source: "orch", target: "planner-2", kind: "dispatch", taskId: "task-2", laneId: "lane-task-2", status: "sent", label: "dispatch", seq: 7 },
        { id: "handoff-3", source: "planner-2", target: "coder-2", kind: "handoff", taskId: "task-2", laneId: "lane-task-2", status: "sent", label: "handoff", seq: 8 },
        { id: "handoff-4", source: "coder-2", target: "reviewer-2", kind: "handoff", taskId: "task-2", laneId: "lane-task-2", status: "sent", label: "handoff", seq: 9 },
        { id: "report-2", source: "reviewer-2", target: "orch", kind: "report", taskId: "task-2", laneId: "lane-task-2", status: "sent", label: "report", seq: 10 },
        { id: "dispatch-3", source: "orch", target: "planner-3", kind: "dispatch", taskId: "task-3", laneId: "lane-task-3", status: "sent", label: "dispatch", seq: 11 },
        { id: "handoff-5", source: "planner-3", target: "coder-3", kind: "handoff", taskId: "task-3", laneId: "lane-task-3", status: "sent", label: "handoff", seq: 12 },
        { id: "handoff-6", source: "coder-3", target: "reviewer-3", kind: "handoff", taskId: "task-3", laneId: "lane-task-3", status: "sent", label: "handoff", seq: 13 },
        { id: "report-3", source: "reviewer-3", target: "orch", kind: "report", taskId: "task-3", laneId: "lane-task-3", status: "sent", label: "report", seq: 14 },
        { id: "dispatch-4", source: "orch", target: "planner-4", kind: "dispatch", taskId: "task-4", laneId: "lane-task-4", status: "sent", label: "dispatch", seq: 15 },
        { id: "handoff-7", source: "planner-4", target: "coder-4", kind: "handoff", taskId: "task-4", laneId: "lane-task-4", status: "sent", label: "handoff", seq: 16 },
        { id: "handoff-8", source: "coder-4", target: "reviewer-4", kind: "handoff", taskId: "task-4", laneId: "lane-task-4", status: "sent", label: "handoff", seq: 17 },
        { id: "report-4", source: "reviewer-4", target: "orch", kind: "report", taskId: "task-4", laneId: "lane-task-4", status: "sent", label: "report", seq: 18 },
        { id: "backflow-1", source: "orch", target: "evomap", kind: "backflow", status: "sent", label: "backflow", seq: 19 },
      ],
      events: [
        { id: "classify-1", seq: 1, ts: new Date().toISOString(), kind: "classify", status: "HARD", text: "difficulty=HARD" },
        { id: "inherit-1", seq: 2, ts: new Date().toISOString(), kind: "inherit", edgeId: "inherit-1", fromNodeId: "evomap", toNodeId: "orch", status: inheritedLocal ? "hit" : "remote-hit", text: `继承 local ${inheritedLocal} / EvoMap 1` },
        { id: "agent-start-1", seq: 3, ts: new Date().toISOString(), kind: "agent_start", nodeId: "planner-1", agent: "planner", instanceId: "planner-1", taskId: "task-1", laneId: "lane-task-1", phase: "plan", text: "planner start" },
        { id: "agent-result-1", seq: 4, ts: new Date().toISOString(), kind: "agent_result", nodeId: "planner-1", agent: "planner", instanceId: "planner-1", taskId: "task-1", laneId: "lane-task-1", phase: "plan", status: "ran", text: "根据继承经验规划端点注册链路" },
        { id: "review-reject-1", seq: 5, ts: new Date().toISOString(), kind: "review_verdict", nodeId: "reviewer-1", agent: "reviewer", instanceId: "reviewer-1", taskId: "task-1", laneId: "lane-task-1", phase: "review", status: "rejected", verdict: "REJECT", text: "缺少端点健康检查失败态,退回 coder 自净化。" },
        { id: "revision-1", seq: 6, ts: new Date().toISOString(), kind: "revision", edgeId: "feedback-1", fromNodeId: "reviewer-1", toNodeId: "coder-1", taskId: "task-1", laneId: "lane-task-1", revisionRound: 1, status: "sent", text: "feedback: 补齐健康检查失败态与错误提示。" },
        { id: "review-approve-1", seq: 7, ts: new Date().toISOString(), kind: "review_verdict", nodeId: "reviewer-1", agent: "reviewer", instanceId: "reviewer-1", taskId: "task-1", laneId: "lane-task-1", phase: "review", status: "approved", verdict: "APPROVE", text: "修订后端点链路闭环,审查通过。" },
        { id: "backflow-1", seq: 8, ts: new Date().toISOString(), kind: "backflow", edgeId: "backflow-1", fromNodeId: "orch", toNodeId: "evomap", status: "queued", text: `本地进化记忆已沉淀 G${generation}` },
      ],
      lanes: [
        { id: "lane-task-1", taskId: "task-1", title: "端点注册与自净化", status: "completed", nodeIds: ["planner-1", "coder-1", "reviewer-1"], edgeIds: ["dispatch-1", "handoff-1", "handoff-2", "report-1"] },
        { id: "lane-task-2", taskId: "task-2", title: "OpenAI 兼容转发", status: "completed", nodeIds: ["planner-2", "coder-2", "reviewer-2"], edgeIds: ["dispatch-2", "handoff-3", "handoff-4", "report-2"] },
        { id: "lane-task-3", taskId: "task-3", title: "EvoMap 经验继承", status: "completed", nodeIds: ["planner-3", "coder-3", "reviewer-3"], edgeIds: ["dispatch-3", "handoff-5", "handoff-6", "report-3"] },
        { id: "lane-task-4", taskId: "task-4", title: "Playground 回放验证", status: "completed", nodeIds: ["planner-4", "coder-4", "reviewer-4"], edgeIds: ["dispatch-4", "handoff-7", "handoff-8", "report-4"] },
      ],
      metrics: { totalLatencyMs: 1200, agentRuns: 14, handoffs: 6, broadcasts: 1, revisions: 1, subtasks: 4 },
    },
    subtasks: [{ id: "task-1", title: "端点注册与自净化", weight: 0.8, status: "completed" }],
    handoffs: [],
    reward_split: [],
    events: [],
    bees: [],
    breakthroughs_broadcast: 1,
    aggregator: "llm",
    evomap_backflow: {
      status: "queued",
      title: `EvoShip 进化记忆 G${generation}: 登录注册端点链路`,
      localMemoryId: generation,
      qualityScore: quality,
      generation,
    },
    evolution: {
      inheritedLocal,
      inheritedRemote: 1,
      deposited: {
        id: generation,
        title: `EvoShip 进化记忆 G${generation}: 登录注册端点链路`,
        qualityScore: quality,
        generation,
        successStreak: generation,
      },
    },
    total_latency_ms: 1200,
  };
}

async function main() {
  let authed = false;
  let runCount = 0;
  let playgroundRunCount = 0;
  let directCompletionCount = 0;
  let endpointRegistrations = 0;
  let endpointChecks = 0;
  let endpointRotations = 0;
  const registeredEndpoints = [];
  const originalIssuedApiKey = "sk-evoship-ui-harness-real-key";
  const rotatedIssuedApiKey = "sk-evoship-ui-harness-rotated-key";
  let issuedApiKey = originalIssuedApiKey;
  const app = express();
  app.use(express.json());

  app.get("/api/auth/me", (_req, res) => {
    if (!authed) return res.status(401).json({ error: { message: "unauthorized" } });
    res.json({ user: { id: 1, email: "ui-harness@example.com", name: "UI Harness", created_at: Date.now() } });
  });
  app.post("/api/auth/register", (_req, res) => {
    authed = true;
    res.setHeader("Set-Cookie", "ui_harness=1; Path=/; HttpOnly");
    res.status(201).json({ user: { id: 1, email: "ui-harness@example.com", name: "UI Harness", created_at: Date.now() } });
  });
  app.post("/api/auth/login", (_req, res) => {
    authed = true;
    res.setHeader("Set-Cookie", "ui_harness=1; Path=/; HttpOnly");
    res.json({ user: { id: 1, email: "ui-harness@example.com", name: "UI Harness", created_at: Date.now() } });
  });
  app.post("/api/auth/logout", (_req, res) => {
    authed = false;
    res.json({ ok: true });
  });
  app.get("/api/endpoints", (_req, res) => {
    if (!authed) return res.status(401).json({ error: { message: "unauthorized" } });
    res.json({ endpoints: registeredEndpoints });
  });
  app.post("/api/endpoints/register", (req, res) => {
    if (!authed) return res.status(401).json({ error: { message: "unauthorized" } });
    endpointRegistrations += 1;
    assert.equal(req.body.user_base_url, "http://127.0.0.1:19001/v1");
    assert.equal(req.body.user_api_key, "sk-upstream-ui-harness");
    assert.equal(req.body.user_model, "fake-ui-upstream-model");
    const endpoint = {
      id: 1,
      label: req.body.label || "UI Harness upstream",
      upstream_base_url: req.body.user_base_url,
      upstream_model: req.body.user_model,
      api_key_preview: "sk-up...ness",
      status: "active",
      created_at: Date.now(),
      updated_at: Date.now(),
      last_checked_at: Date.now(),
      success_count: 0,
      failure_count: 0,
    };
    registeredEndpoints.splice(0, registeredEndpoints.length, endpoint);
    res.status(201).json({
      base_url: `${serverUrlForResponse}/v1`,
      api_key: issuedApiKey,
      model: "swarm-evo",
      created_at: Date.now(),
      endpoint,
    });
  });
  app.post("/api/endpoints/:id/check", (req, res) => {
    if (!authed) return res.status(401).json({ error: { message: "unauthorized" } });
    const endpoint = registeredEndpoints.find((item) => item.id === Number(req.params.id));
    if (!endpoint) return res.status(404).json({ error: { message: "endpoint not found" } });
    endpointChecks += 1;
    endpoint.status = "active";
    endpoint.success_count += 1;
    endpoint.updated_at = Date.now();
    endpoint.last_checked_at = Date.now();
    res.json({
      ok: true,
      result: { ok: true, sample: "ok", latencyMs: 12 },
      endpoint,
    });
  });
  app.post("/api/endpoints/:id/key", (req, res) => {
    if (!authed) return res.status(401).json({ error: { message: "unauthorized" } });
    const endpoint = registeredEndpoints.find((item) => item.id === Number(req.params.id));
    if (!endpoint) return res.status(404).json({ error: { message: "endpoint not found" } });
    endpointRotations += 1;
    issuedApiKey = rotatedIssuedApiKey;
    endpoint.api_key_preview = "sk-ev...d-key";
    endpoint.status = "active";
    endpoint.success_count += 1;
    endpoint.updated_at = Date.now();
    endpoint.last_checked_at = Date.now();
    res.json({
      base_url: `${serverUrlForResponse}/v1`,
      api_key: issuedApiKey,
      model: "swarm-evo",
      created_at: Date.now(),
      result: { ok: true, sample: "ok", latencyMs: 11 },
      endpoint,
    });
  });
  app.post("/api/playground/swarm/run", (_req, res) => {
    runCount += 1;
    playgroundRunCount += 1;
    res.json({
      content: `UI harness playground run ${playgroundRunCount}: endpoint self-evolution completed.`,
      trace: traceForRun(playgroundRunCount),
    });
  });
  app.post("/v1/chat/completions", (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${issuedApiKey}`);
    runCount += 1;
    directCompletionCount += 1;
    const trace = traceForRun(directCompletionCount);
    res.json({
      id: `ui-chat-${directCompletionCount}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: trace.tier,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: `UI harness direct run ${directCompletionCount}: endpoint self-evolution completed.` },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      x_swarm_trace: trace,
    });
  });

  app.use(express.static(publicDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/v1") || req.path.includes(".")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });

  let serverUrlForResponse = "";
  const server = await listen(app);
  serverUrlForResponse = server.url;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });

  try {
    await page.goto(`${server.url}/login?redirect=/%23transform`, { waitUntil: "networkidle" });
    await expectUrl(page, /\/login\?redirect=/);
    await page.getByRole("button", { name: "注册" }).click();
    await page.getByPlaceholder("you@example.com").fill("ui-harness@example.com");
    await page.getByPlaceholder("至少 6 位").fill("password123");
    await page.locator("#agree").check();
    await page.getByRole("button", { name: "创建账号" }).click();
    await page.waitForURL(/\/#transform$/, { timeout: 8000 });

    await page.getByPlaceholder("https://api.openai.com/v1").fill("http://127.0.0.1:19001/v1");
    await page.getByPlaceholder("sk-...").fill("sk-upstream-ui-harness");
    await page.getByPlaceholder("gpt-4o-mini").fill("fake-ui-upstream-model");
    await page.getByPlaceholder("如:我的生产端点").fill("UI Harness upstream");
    await page.getByRole("button", { name: "生成舰队端点" }).click();
    await page.getByText("舰队端点已生成").waitFor({ timeout: 8000 });
    await page.locator(".out-item .v").filter({ hasText: issuedApiKey }).waitFor({ timeout: 8000 });
    const storedTransform = await page.evaluate(() => localStorage.getItem("evoship:last-transform-result") || "");
    assert.match(storedTransform, new RegExp(issuedApiKey));
    assert.doesNotMatch(storedTransform, /sk-upstream-ui-harness|upstream_api_key|api_key_hash/);
    await page.getByText("已注册端点").waitFor({ timeout: 8000 });
    const endpointRow = page.locator(".endpoint-row").filter({ hasText: "UI Harness upstream" });
    await endpointRow.waitFor({ timeout: 8000 });
    await endpointRow.filter({ hasText: "fake-ui-upstream-model" }).waitFor({ timeout: 8000 });
    await page.getByRole("button", { name: "复检" }).click();
    await page.getByText(/ok 1 \/ fail 0/).waitFor({ timeout: 8000 });
    await endpointRow.getByRole("button", { name: "重新生成 key" }).click();
    await page.locator(".out-item .v").filter({ hasText: rotatedIssuedApiKey }).waitFor({ timeout: 8000 });
    await endpointRow.filter({ hasText: "sk-ev...d-key" }).waitFor({ timeout: 8000 });
    const storedAfterRotate = await page.evaluate(() => localStorage.getItem("evoship:last-transform-result") || "");
    assert.match(storedAfterRotate, new RegExp(rotatedIssuedApiKey));
    assert.doesNotMatch(storedAfterRotate, new RegExp(originalIssuedApiKey));
    assert.doesNotMatch(storedAfterRotate, /sk-upstream-ui-harness|upstream_api_key|api_key_hash/);
    await page.getByRole("button", { name: "立即试一下" }).click();
    await page.locator("#demo").getByPlaceholder("sk-evoship-...").waitFor({ timeout: 8000 });
    const demoKey = await page.locator("#demo").getByPlaceholder("sk-evoship-...").inputValue();
    assert.equal(demoKey, rotatedIssuedApiKey);
    await page.locator("#demo").getByRole("button", { name: "派出舰队" }).click();
    await page.getByText(/UI harness direct run 1/).waitFor({ timeout: 8000 });
    await page.getByRole("button", { name: "去 Playground 看自进化" }).click();
    await page.waitForURL(/\/playground$/, { timeout: 8000 });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForURL(/\/playground$/, { timeout: 8000 });

    await expectPresetNodeCount(page, 14);
    await page.locator("select").nth(1).selectOption("swarm-baseline");
    await expectPresetNodeCount(page, 1);
    await page.locator("select").nth(1).selectOption("swarm-lite");
    await expectPresetNodeCount(page, 5);
    await page.locator("select").nth(1).selectOption("swarm-evo");
    await expectPresetNodeCount(page, 14);

    const playgroundKey = await page.getByPlaceholder("sk-evoship-...").inputValue();
    assert.equal(playgroundKey, rotatedIssuedApiKey);
    await page.getByRole("button", { name: "派出真实蜂群" }).click();
    const timeline = page.getByTestId("evolution-timeline");
    await timeline.waitFor({ timeout: 8000 });
    await timeline.getByText(/G[1-9]/).first().waitFor({ timeout: 8000 });
    await expectPresetNodeCount(page, 14);
    const purification = page.getByTestId("purification-chain");
    await purification.waitFor({ timeout: 8000 });
    await purification.getByText("REJECT").waitFor({ timeout: 8000 });
    await purification.getByText(/feedback R1/).waitFor({ timeout: 8000 });
    await purification.getByText("APPROVE").waitFor({ timeout: 8000 });
    const experience = page.getByTestId("experience-board");
    await experience.waitFor({ timeout: 8000 });
    await experience.getByText("自进化经验库").waitFor({ timeout: 8000 });
    await experience.getByText(/local 1 \/ EvoMap 1/).waitFor({ timeout: 8000 });
    await experience.getByText(/EvoMap Capsule/).waitFor({ timeout: 8000 });

    await page.getByRole("button", { name: "派出真实蜂群" }).click();
    await timeline.getByText("Run 2").waitFor({ timeout: 8000 });
    await timeline.getByText(/\+0\.010/).waitFor({ timeout: 8000 });
    await page.waitForFunction(() => {
      return [...document.querySelectorAll('[data-testid="evolution-timeline"] span')]
        .some((node) => /继承 local [1-9] \/ EvoMap 1/.test(node.textContent || ""));
    }, undefined, { timeout: 8000 });
    await expectPresetNodeCount(page, 14);

    const result = await page.evaluate(() => {
      const timeline = document.querySelector('[data-testid="evolution-timeline"]');
      const purification = document.querySelector('[data-testid="purification-chain"]');
      const experience = document.querySelector('[data-testid="experience-board"]');
      const steps = [...document.querySelectorAll(".evolution-step")].map((node) => node.textContent?.replace(/\s+/g, " ").trim());
      return {
        timelineText: timeline?.textContent?.replace(/\s+/g, " ").trim() || "",
        purificationText: purification?.textContent?.replace(/\s+/g, " ").trim() || "",
        experienceText: experience?.textContent?.replace(/\s+/g, " ").trim() || "",
        petNodeCount: document.querySelectorAll('[data-testid="pet-node"]').length,
        steps,
        runNumbers: [...document.querySelectorAll(".evolution-step")].map((node) => node.getAttribute("data-evo-run")),
      };
    });

    assert.equal(result.steps.length, 2);
    assert.deepEqual(result.runNumbers, ["1", "2"]);
    assert.match(result.timelineText, /latest G[2-9]/);
    assert.match(result.timelineText, /q=0\.8[1-9]/);
    assert.match(result.timelineText, /\+0\.010/);
    assert.match(result.timelineText, /1 revisions/);
    assert.match(result.timelineText, /EvoMap 1/);
    assert.match(result.timelineText, /queued/);
    assert.match(result.purificationText, /REJECT/);
    assert.match(result.purificationText, /feedback R1/);
    assert.match(result.purificationText, /APPROVE/);
    assert.match(result.purificationText, /G[2-9]/);
    assert.match(result.experienceText, /自进化经验库/);
    assert.match(result.experienceText, /local 2 \/ EvoMap 1/);
    assert.match(result.experienceText, /G3/);
    assert.match(result.experienceText, /q=0\.82/);
    assert.match(result.experienceText, /streak 3/);
    assert.match(result.experienceText, /EvoMap Capsule: endpoint healthcheck handoff/);
    assert.match(result.experienceText, /local.*EvoShip 进化记忆 G2/);
    assert.equal(result.petNodeCount, 14);
    assert.equal(endpointRegistrations, 1);
    assert.equal(endpointChecks, 1);
    assert.equal(endpointRotations, 1);
    assert.equal(directCompletionCount, 3);
    assert.equal(playgroundRunCount, 0);
    assert.doesNotMatch(JSON.stringify(registeredEndpoints), /sk-upstream-ui-harness|api_key_hash|upstream_api_key/);

    await page.goto(`${server.url}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "退出" }).click();
    await page.waitForFunction((key) => {
      return !(localStorage.getItem("evoship:last-transform-result") || "").includes(key);
    }, rotatedIssuedApiKey, { timeout: 8000 });
    const storageAfterLogout = await page.evaluate(() => localStorage.getItem("evoship:last-transform-result") || "");
    assert.doesNotMatch(storageAfterLogout, new RegExp(rotatedIssuedApiKey));

    console.log(JSON.stringify({
      ok: true,
      endpointRegistrations,
      endpointChecks,
      endpointRotations,
      runs: runCount,
      directCompletions: directCompletionCount,
      playgroundRuns: playgroundRunCount,
      playgroundKey,
      storageClearedOnLogout: true,
      ...result,
    }, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
}

async function expectUrl(page, pattern) {
  await page.waitForURL(pattern, { timeout: 8000 });
}

async function expectPresetNodeCount(page, expected) {
  await page.waitForFunction((count) => {
    return document.querySelectorAll('[data-testid="pet-node"]').length === count;
  }, expected, { timeout: 8000 });
  const count = await page.locator('[data-testid="pet-node"]').count();
  assert.equal(count, expected);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
