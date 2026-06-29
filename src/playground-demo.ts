import type {
  ExecutionPolicyTrace,
  SwarmGraph,
  SwarmGraphEdge,
  SwarmGraphEvent,
  SwarmGraphNode,
  SwarmLane,
  SwarmTrace,
} from "./openai-types.js";
import type { SwarmOutput } from "./swarm.js";

const DEMO_GOAL = "做一个带邮箱和密码校验、含错误提示和加载态的完整登录页应用";
const DEMO_MODEL = "preset:evo-demo-v1";
const BASE_TS = Date.parse("2026-06-21T13:00:00.000+08:00");

const policy: ExecutionPolicyTrace = {
  tier: "swarm-evo",
  difficulty: "HARD",
  createSession: true,
  useInheritance: true,
  publishBackflow: true,
  mediumSolverCount: 3,
  hardMaxSubtasks: 4,
  hardConcurrency: 3,
  maxRevisionRounds: 1,
};

const subtasks = [
  {
    id: "sub-1",
    title: "需求拆解与验收口径",
    weight: 0.22,
    status: "completed",
    goal: "明确登录页必须覆盖的用户旅程、表单字段、错误态、加载态和验收清单。",
  },
  {
    id: "sub-2",
    title: "表单交互与状态流",
    weight: 0.3,
    status: "completed",
    goal: "设计 email/password 输入、提交按钮、loading 锁定、成功回调和可访问性焦点流。",
  },
  {
    id: "sub-3",
    title: "校验规则与错误处理",
    weight: 0.28,
    status: "completed",
    goal: "实现邮箱格式、密码长度、提交失败、逐项错误提示和一次返工自净化。",
  },
  {
    id: "sub-4",
    title: "交付验收与经验回流",
    weight: 0.2,
    status: "completed",
    goal: "收敛可交付方案,沉淀可复用的登录表单经验包并回流 EvoMap。",
  },
] as const;

function ts(seq: number): string {
  return new Date(BASE_TS + seq * 900).toISOString();
}

function node(
  id: string,
  archetype: SwarmGraphNode["archetype"],
  label: string,
  order: number,
  taskId?: string,
): SwarmGraphNode {
  return {
    id,
    instanceId: id,
    archetype,
    label,
    taskId,
    laneId: taskId ? `lane-${taskId}` : undefined,
    status: archetype === "reviewer" ? "approved" : "ran",
    role: archetype,
    order,
    createdAtSeq: order,
  };
}

const nodes: SwarmGraphNode[] = [
  node("evomap", "evomap", "EvoMap", 1),
  node("demo-orchestrator-01", "orchestrator", "Orchestrator #1", 2),
  node("demo-planner-01", "planner", "Planner #1", 3, "sub-1"),
  node("demo-coder-01", "coder", "Coder #1", 4, "sub-1"),
  node("demo-reviewer-01", "reviewer", "Reviewer #1", 5, "sub-1"),
  node("demo-planner-02", "planner", "Planner #2", 6, "sub-2"),
  node("demo-coder-02", "coder", "Coder #2", 7, "sub-2"),
  node("demo-reviewer-02", "reviewer", "Reviewer #2", 8, "sub-2"),
  node("demo-planner-03", "planner", "Planner #3", 9, "sub-3"),
  node("demo-coder-03", "coder", "Coder #3", 10, "sub-3"),
  node("demo-reviewer-03", "reviewer", "Reviewer #3", 11, "sub-3"),
  node("demo-planner-04", "planner", "Planner #4", 12, "sub-4"),
  node("demo-coder-04", "coder", "Coder #4", 13, "sub-4"),
  node("demo-reviewer-04", "reviewer", "Reviewer #4", 14, "sub-4"),
  node("demo-orchestrator-02", "orchestrator", "Orchestrator #2", 15),
];

function edge(
  id: string,
  source: string,
  target: string,
  kind: SwarmGraphEdge["kind"],
  seq: number,
  snippet: string,
  taskId?: string,
  revisionRound?: number,
): SwarmGraphEdge {
  return {
    id,
    source,
    target,
    kind,
    taskId,
    laneId: taskId ? `lane-${taskId}` : undefined,
    revisionRound,
    status: "sent",
    label: kind,
    snippet,
    seq,
  };
}

const edges: SwarmGraphEdge[] = [
  edge("edge-inherit", "evomap", "demo-orchestrator-01", "inherit", 1, "继承登录页表单、错误态、loading 态与回流模板经验"),
  edge("edge-dispatch-1", "demo-orchestrator-01", "demo-planner-01", "dispatch", 2, subtasks[0].goal, "sub-1"),
  edge("edge-dispatch-2", "demo-orchestrator-01", "demo-planner-02", "dispatch", 3, subtasks[1].goal, "sub-2"),
  edge("edge-dispatch-3", "demo-orchestrator-01", "demo-planner-03", "dispatch", 4, subtasks[2].goal, "sub-3"),
  edge("edge-dispatch-4", "demo-orchestrator-01", "demo-planner-04", "dispatch", 5, subtasks[3].goal, "sub-4"),
  edge("edge-broadcast-1", "demo-orchestrator-01", "demo-planner-01", "broadcast", 6, "统一验收契约:字段、错误、loading、无障碍、回流证据"),
  edge("edge-broadcast-2", "demo-orchestrator-01", "demo-planner-02", "broadcast", 7, "统一验收契约:字段、错误、loading、无障碍、回流证据"),
  edge("edge-broadcast-3", "demo-orchestrator-01", "demo-planner-03", "broadcast", 8, "统一验收契约:字段、错误、loading、无障碍、回流证据"),
  edge("edge-broadcast-4", "demo-orchestrator-01", "demo-planner-04", "broadcast", 9, "统一验收契约:字段、错误、loading、无障碍、回流证据"),
  edge("edge-handoff-p1-c1", "demo-planner-01", "demo-coder-01", "handoff", 10, "把需求边界和验收清单交给实现侧", "sub-1"),
  edge("edge-handoff-c1-r1", "demo-coder-01", "demo-reviewer-01", "handoff", 11, "提交需求矩阵和 UI 状态清单供审查", "sub-1"),
  edge("edge-report-r1-o2", "demo-reviewer-01", "demo-orchestrator-02", "aggregate", 12, "需求拆解通过,进入聚合上下文", "sub-1"),
  edge("edge-handoff-p2-c2", "demo-planner-02", "demo-coder-02", "handoff", 13, "把状态机和交互流交给实现侧", "sub-2"),
  edge("edge-handoff-c2-r2", "demo-coder-02", "demo-reviewer-02", "handoff", 14, "提交状态流和按钮锁定策略供审查", "sub-2"),
  edge("edge-report-r2-o2", "demo-reviewer-02", "demo-orchestrator-02", "aggregate", 15, "交互状态通过,进入聚合上下文", "sub-2"),
  edge("edge-handoff-p3-c3", "demo-planner-03", "demo-coder-03", "handoff", 16, "把校验规则和错误提示要求交给实现侧", "sub-3"),
  edge("edge-handoff-c3-r3", "demo-coder-03", "demo-reviewer-03", "handoff", 17, "提交初版校验逻辑供审查", "sub-3"),
  edge("edge-feedback-r3-c3", "demo-reviewer-03", "demo-coder-03", "feedback", 18, "密码错误文案缺少提交失败复位,退回修订", "sub-3", 1),
  edge("edge-handoff-c3-r3-r1", "demo-coder-03", "demo-reviewer-03", "handoff", 19, "提交修订版校验逻辑:错误复位与焦点定位补齐", "sub-3", 1),
  edge("edge-report-r3-o2", "demo-reviewer-03", "demo-orchestrator-02", "aggregate", 20, "校验规则通过,包含一次自净化证据", "sub-3"),
  edge("edge-handoff-p4-c4", "demo-planner-04", "demo-coder-04", "handoff", 21, "把验收脚本和回流字段交给实现侧", "sub-4"),
  edge("edge-handoff-c4-r4", "demo-coder-04", "demo-reviewer-04", "handoff", 22, "提交交付清单和经验包草案供审查", "sub-4"),
  edge("edge-report-r4-o2", "demo-reviewer-04", "demo-orchestrator-02", "aggregate", 23, "交付与回流草案通过,进入最终聚合", "sub-4"),
  edge("edge-backflow", "demo-orchestrator-02", "evomap", "backflow", 24, "回流 Gene+Capsule: login-form-validation-flow@G4"),
];

function event(
  id: string,
  seq: number,
  kind: SwarmGraphEvent["kind"],
  input: Omit<SwarmGraphEvent, "id" | "seq" | "ts" | "kind">,
): SwarmGraphEvent {
  return { id, seq, ts: ts(seq), kind, ...input };
}

const planner1 = [
  "【Planner #1 计划】",
  "任务:需求拆解与验收口径。",
  "1. 字段:email、password。",
  "2. 状态:idle、dirty、validating、submitting、success、failed。",
  "3. 错误:邮箱格式、密码长度、服务端失败。",
  "4. 验收:键盘可达、错误可读、loading 禁止重复提交。",
].join("\n");
const coder1 = [
  "【Coder #1 产出】",
  "需求矩阵:",
  "- email 必填且符合 basic email pattern。",
  "- password 至少 8 位,提交时隐藏明文。",
  "- submit loading 时禁用输入与按钮。",
  "- error region 使用 aria-live=polite。",
].join("\n");
const reviewer1 = "【Reviewer #1】APPROVE。需求矩阵完整,验收口径覆盖字段、错误态、加载态和无障碍。";

const planner2 = [
  "【Planner #2 计划】",
  "状态流:idle -> editing -> client-invalid 或 ready -> submitting -> success/failed。",
  "关键交互:输入时清除对应字段错误;提交中按钮显示 loading;失败后恢复按钮并保留用户输入。",
].join("\n");
const coder2 = [
  "【Coder #2 产出】",
  "实现状态机:",
  "const state = { email, password, errors, submitting }",
  "submit(): 先 clientValidate,再设置 submitting=true,等待登录接口结果,最后归位。",
].join("\n");
const reviewer2 = "【Reviewer #2】APPROVE。状态流清晰,重复提交被锁定,失败路径可恢复。";

const planner3 = [
  "【Planner #3 计划】",
  "校验规则:",
  "- email:包含 @ 与域名段。",
  "- password:>=8 位。",
  "- submit failure:展示统一错误,并把焦点送回错误摘要。",
].join("\n");
const coder3Draft = [
  "【Coder #3 初版】",
  "validateEmail(email) 与 validatePassword(password) 已实现。",
  "问题:服务端失败时只显示 toast,没有复位 submitting,也没有错误摘要焦点。",
].join("\n");
const reviewer3Reject = [
  "【Reviewer #3】REJECT。",
  "返工原因:",
  "1. submitting 在服务端失败后可能保持 true。",
  "2. toast 不是可靠错误容器。",
  "3. 需要把焦点移动到 form error summary。",
].join("\n");
const coder3Fix = [
  "【Coder #3 修订版 R1】",
  "已补齐:",
  "- finally { submitting=false } 保证按钮复位。",
  "- formError 写入 role=alert 的错误摘要。",
  "- nextTick 后 focus(errorSummaryRef)。",
].join("\n");
const reviewer3Approve = "【Reviewer #3】APPROVE。返工项已闭环:失败复位、错误摘要、焦点定位均可验收。";

const planner4 = [
  "【Planner #4 计划】",
  "交付内容:组件结构、交互验收、错误态截图点、回流经验字段。",
  "回流字段:problem、constraints、handoff recipe、acceptance checklist、failure fix。",
].join("\n");
const coder4 = [
  "【Coder #4 产出】",
  "交付清单:",
  "1. LoginForm 组件。",
  "2. useLoginForm 状态与校验。",
  "3. 验收脚本:空值、坏邮箱、短密码、接口失败、成功跳转。",
  "4. 经验包草案:login-form-validation-flow。",
].join("\n");
const reviewer4 = "【Reviewer #4】APPROVE。交付清单可复跑,经验包字段足够下一次继承复用。";

const decomposePayload = JSON.stringify(
  subtasks.map(({ id, title, weight, goal }) => ({ id, title, weight, goal })),
  null,
  2,
);

const loginPageCode = [
  "<template>",
  "  <main class=\"login-shell\">",
  "    <section class=\"login-card\" aria-labelledby=\"login-title\">",
  "      <p class=\"eyebrow\">Evo Account</p>",
  "      <h1 id=\"login-title\">登录到工作台</h1>",
  "      <p class=\"intro\">使用邮箱和密码继续。提交中会锁定表单,失败后自动恢复。</p>",
  "",
  "      <div",
  "        v-if=\"formError\"",
  "        ref=\"errorSummaryRef\"",
  "        class=\"form-error\"",
  "        role=\"alert\"",
  "        tabindex=\"-1\"",
  "      >",
  "        {{ formError }}",
  "      </div>",
  "",
  "      <form novalidate @submit.prevent=\"submit\">",
  "        <label class=\"field\">",
  "          <span>邮箱</span>",
  "          <input",
  "            v-model.trim=\"form.email\"",
  "            type=\"email\"",
  "            autocomplete=\"email\"",
  "            placeholder=\"name@example.com\"",
  "            :aria-invalid=\"Boolean(errors.email)\"",
  "            aria-describedby=\"email-error\"",
  "            :disabled=\"submitting\"",
  "            @input=\"clearFieldError('email')\"",
  "          />",
  "          <small id=\"email-error\" class=\"field-error\" aria-live=\"polite\">{{ errors.email }}</small>",
  "        </label>",
  "",
  "        <label class=\"field\">",
  "          <span>密码</span>",
  "          <input",
  "            v-model=\"form.password\"",
  "            type=\"password\"",
  "            autocomplete=\"current-password\"",
  "            placeholder=\"至少 8 位\"",
  "            :aria-invalid=\"Boolean(errors.password)\"",
  "            aria-describedby=\"password-error\"",
  "            :disabled=\"submitting\"",
  "            @input=\"clearFieldError('password')\"",
  "          />",
  "          <small id=\"password-error\" class=\"field-error\" aria-live=\"polite\">{{ errors.password }}</small>",
  "        </label>",
  "",
  "        <button class=\"submit-btn\" type=\"submit\" :disabled=\"submitting\">",
  "          <span v-if=\"submitting\" class=\"spinner\" aria-hidden=\"true\"></span>",
  "          {{ submitting ? \"登录中...\" : \"登录\" }}",
  "        </button>",
  "      </form>",
  "    </section>",
  "  </main>",
  "</template>",
  "",
  "<script setup lang=\"ts\">",
  "import { nextTick, reactive, ref } from \"vue\";",
  "",
  "const emit = defineEmits<{ success: [email: string] }>();",
  "",
  "const form = reactive({ email: \"\", password: \"\" });",
  "const errors = reactive<{ email?: string; password?: string }>({});",
  "const formError = ref(\"\");",
  "const submitting = ref(false);",
  "const errorSummaryRef = ref<HTMLElement | null>(null);",
  "",
  "function validate() {",
  "  errors.email = \"\";",
  "  errors.password = \"\";",
  "  formError.value = \"\";",
  "",
  "  if (!/^\\S+@\\S+\\.\\S+$/.test(form.email)) errors.email = \"请输入有效邮箱地址。\";",
  "  if (form.password.length < 8) errors.password = \"密码至少需要 8 位。\";",
  "  return !errors.email && !errors.password;",
  "}",
  "",
  "function clearFieldError(field: \"email\" | \"password\") {",
  "  errors[field] = \"\";",
  "  formError.value = \"\";",
  "}",
  "",
  "async function submit() {",
  "  if (submitting.value || !validate()) return;",
  "  submitting.value = true;",
  "  try {",
  "    await new Promise((resolve) => setTimeout(resolve, 900));",
  "    if (form.email !== \"demo@evomap.ai\" || form.password !== \"password123\") {",
  "      throw new Error(\"邮箱或密码不正确,请检查后重试。\");",
  "    }",
  "    emit(\"success\", form.email);",
  "  } catch (error) {",
  "    formError.value = error instanceof Error ? error.message : \"登录失败,请稍后重试。\";",
  "    await nextTick();",
  "    errorSummaryRef.value?.focus();",
  "  } finally {",
  "    submitting.value = false;",
  "  }",
  "}",
  "</script>",
  "",
  "<style scoped>",
  ".login-shell { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: #111827; color: #f8fafc; }",
  ".login-card { width: min(100%, 420px); padding: 28px; border: 1px solid rgba(148, 163, 184, .32); border-radius: 8px; background: #0f172a; }",
  ".eyebrow { margin: 0 0 8px; color: #5eead4; font-size: 12px; font-weight: 700; text-transform: uppercase; }",
  "h1 { margin: 0; font-size: 28px; letter-spacing: 0; }",
  ".intro { margin: 10px 0 22px; color: #cbd5e1; line-height: 1.6; }",
  ".field { display: grid; gap: 8px; margin-bottom: 16px; font-weight: 700; }",
  "input { min-height: 44px; border: 1px solid #334155; border-radius: 8px; padding: 0 12px; background: #020617; color: #f8fafc; }",
  "input:focus { outline: 2px solid #5eead4; outline-offset: 2px; }",
  "input[aria-invalid=\"true\"] { border-color: #fb7185; }",
  ".field-error { min-height: 18px; color: #fda4af; font-weight: 600; }",
  ".form-error { margin-bottom: 16px; border: 1px solid #fb7185; border-radius: 8px; padding: 10px 12px; background: rgba(251, 113, 133, .12); color: #fecdd3; }",
  ".submit-btn { width: 100%; min-height: 46px; display: inline-flex; align-items: center; justify-content: center; gap: 10px; border: 0; border-radius: 8px; background: #5eead4; color: #042f2e; font-weight: 800; cursor: pointer; }",
  ".submit-btn:disabled { cursor: wait; opacity: .78; }",
  ".spinner { width: 16px; height: 16px; border: 2px solid rgba(4, 47, 46, .35); border-top-color: #042f2e; border-radius: 50%; animation: spin .8s linear infinite; }",
  "@keyframes spin { to { transform: rotate(360deg); } }",
  "</style>",
].join("\n");

const finalContent = [
  "【预制 Demo:默认 Evo 蜂群最终输出】",
  "",
  "已完成一个可直接落地的 Vue 3 登录页应用:",
  "1. 表单包含 email/password,客户端校验和服务端失败提示。",
  "2. 提交时进入 loading,禁用重复提交,失败后通过 finally 自动复位。",
  "3. 字段错误使用 aria-live,表单级错误使用 role=alert,失败后焦点回到错误摘要。",
  "4. Reviewer 发现的提交失败复位问题已在 R1 修订中闭环。",
  "5. 成功路径沉淀为 login-form-validation-flow@G4,可被下一次类似任务继承。",
  "",
  "核心实现:",
  "```vue",
  loginPageCode,
  "```",
  "",
  "这段演示为预制 trace,不调用上游模型,不扣积分,不写远端回流。",
].join("\n");

const rawEvents: SwarmGraphEvent[] = [
  event("event-classify", 1, "classify", {
    status: "HARD",
    text: "判定为 HARD:需要多角色分工、校验规则、交互状态、审查返工与经验回流。",
    fullContent: `用户目标:${DEMO_GOAL}\n判定:HARD\n理由:表单、状态、错误、验收和经验回流需要异构协作。`,
  }),
  event("event-policy", 2, "policy", {
    status: "preset-demo",
    text: "使用预制 swarm-evo 演示策略:inherit -> diverge -> handoff -> review -> aggregate -> backflow。",
    fullContent: JSON.stringify(policy, null, 2),
  }),
  event("event-inherit", 3, "inherit", {
    edgeId: "edge-inherit",
    fromNodeId: "evomap",
    toNodeId: "demo-orchestrator-01",
    status: "sent",
    text: "继承 4 条登录页相关经验。",
    fullContent: "EvoMap 向 Orchestrator 注入:表单状态机、错误摘要、提交失败复位、Gene+Capsule 回流模板。",
  }),
  event("event-decompose", 4, "decompose", {
    nodeId: "demo-orchestrator-01",
    agent: "orchestrator",
    instanceId: "demo-orchestrator-01",
    phase: "decompose",
    status: "ran",
    text: "拆解为 4 个可并行子任务。",
    fullContent: decomposePayload,
    latencyMs: 420,
  }),
  ...subtasks.map((task, index) => event(`event-dispatch-${index + 1}`, 5 + index, "handoff", {
    edgeId: `edge-dispatch-${index + 1}`,
    fromNodeId: "demo-orchestrator-01",
    toNodeId: `demo-planner-0${index + 1}`,
    taskId: task.id,
    laneId: `lane-${task.id}`,
    phase: "dispatch",
    status: "sent",
    text: `派发:${task.title}`,
    fullContent: `Orchestrator -> Planner #${index + 1}\n任务:${task.title}\n目标:${task.goal}\n交付:可执行计划 + 验收口径。`,
  })),
  event("event-broadcast-contract", 9, "broadcast", {
    edgeId: "edge-broadcast-1",
    fromNodeId: "demo-orchestrator-01",
    toNodeId: "demo-planner-01",
    status: "sent",
    text: "广播统一验收契约。",
    fullContent: "突破信号:所有 lane 必须围绕字段、错误、loading、无障碍和回流证据对齐,避免各自输出割裂。",
  }),
  event("event-broadcast-contract-2", 10, "broadcast", {
    edgeId: "edge-broadcast-2",
    fromNodeId: "demo-orchestrator-01",
    toNodeId: "demo-planner-02",
    status: "sent",
    text: "Planner #2 收到统一验收契约。",
    fullContent: "广播载荷:状态流 lane 必须与需求 lane 的错误、loading、无障碍验收口径保持一致。",
  }),
  event("event-broadcast-contract-3", 11, "broadcast", {
    edgeId: "edge-broadcast-3",
    fromNodeId: "demo-orchestrator-01",
    toNodeId: "demo-planner-03",
    status: "sent",
    text: "Planner #3 收到统一验收契约。",
    fullContent: "广播载荷:校验 lane 必须产出可审查的失败复位、错误摘要与焦点定位证据。",
  }),
  event("event-broadcast-contract-4", 12, "broadcast", {
    edgeId: "edge-broadcast-4",
    fromNodeId: "demo-orchestrator-01",
    toNodeId: "demo-planner-04",
    status: "sent",
    text: "Planner #4 收到统一验收契约。",
    fullContent: "广播载荷:交付 lane 必须把成功路径整理成可回流的 Gene+Capsule 字段。",
  }),
  event("event-p1-start", 10, "agent_start", {
    nodeId: "demo-planner-01",
    agent: "planner",
    instanceId: "demo-planner-01",
    taskId: "sub-1",
    laneId: "lane-sub-1",
    phase: "plan",
    text: "Planner #1 接收需求拆解任务。",
    fullContent: `system:你是 Planner,负责把需求变成验收清单。\nuser:${subtasks[0].goal}`,
  }),
  event("event-p1-result", 11, "agent_result", { nodeId: "demo-planner-01", agent: "planner", instanceId: "demo-planner-01", taskId: "sub-1", laneId: "lane-sub-1", phase: "plan", status: "ran", text: "输出需求矩阵和验收口径。", fullContent: planner1, latencyMs: 610 }),
  event("event-p1-c1", 12, "handoff", { edgeId: "edge-handoff-p1-c1", fromNodeId: "demo-planner-01", toNodeId: "demo-coder-01", taskId: "sub-1", laneId: "lane-sub-1", status: "sent", text: "Planner -> Coder:交接需求矩阵。", fullContent: `handoff_context:\n${planner1}\n下游要求:转成可实现的数据结构和 UI 状态清单。` }),
  event("event-c1-result", 13, "agent_result", { nodeId: "demo-coder-01", agent: "coder", instanceId: "demo-coder-01", taskId: "sub-1", laneId: "lane-sub-1", phase: "implement", status: "ran", text: "产出字段与状态清单。", fullContent: coder1, latencyMs: 780 }),
  event("event-c1-r1", 14, "handoff", { edgeId: "edge-handoff-c1-r1", fromNodeId: "demo-coder-01", toNodeId: "demo-reviewer-01", taskId: "sub-1", laneId: "lane-sub-1", status: "sent", text: "Coder -> Reviewer:提交需求矩阵。", fullContent: `review_packet:\n${coder1}\n请检查是否覆盖字段、错误、loading 和可访问性。` }),
  event("event-r1", 15, "review_verdict", { nodeId: "demo-reviewer-01", agent: "reviewer", instanceId: "demo-reviewer-01", taskId: "sub-1", laneId: "lane-sub-1", phase: "review", status: "approved", verdict: "APPROVE", text: "需求拆解通过。", fullContent: reviewer1, latencyMs: 520 }),
  event("event-r1-report", 16, "report", { edgeId: "edge-report-r1-o2", fromNodeId: "demo-reviewer-01", toNodeId: "demo-orchestrator-02", taskId: "sub-1", laneId: "lane-sub-1", status: "approved", text: "需求 lane 汇报给聚合器。", fullContent: reviewer1 }),
  event("event-p2-result", 17, "agent_result", { nodeId: "demo-planner-02", agent: "planner", instanceId: "demo-planner-02", taskId: "sub-2", laneId: "lane-sub-2", phase: "plan", status: "ran", text: "输出交互状态流。", fullContent: planner2, latencyMs: 590 }),
  event("event-p2-c2", 18, "handoff", { edgeId: "edge-handoff-p2-c2", fromNodeId: "demo-planner-02", toNodeId: "demo-coder-02", taskId: "sub-2", laneId: "lane-sub-2", status: "sent", text: "Planner -> Coder:交接状态机。", fullContent: `handoff_context:\n${planner2}` }),
  event("event-c2-result", 19, "agent_result", { nodeId: "demo-coder-02", agent: "coder", instanceId: "demo-coder-02", taskId: "sub-2", laneId: "lane-sub-2", phase: "implement", status: "ran", text: "实现 submitting 状态机。", fullContent: coder2, latencyMs: 820 }),
  event("event-c2-r2", 20, "handoff", { edgeId: "edge-handoff-c2-r2", fromNodeId: "demo-coder-02", toNodeId: "demo-reviewer-02", taskId: "sub-2", laneId: "lane-sub-2", status: "sent", text: "Coder -> Reviewer:交互流审查。", fullContent: `review_packet:\n${coder2}` }),
  event("event-r2", 21, "review_verdict", { nodeId: "demo-reviewer-02", agent: "reviewer", instanceId: "demo-reviewer-02", taskId: "sub-2", laneId: "lane-sub-2", phase: "review", status: "approved", verdict: "APPROVE", text: "交互状态通过。", fullContent: reviewer2, latencyMs: 560 }),
  event("event-r2-report", 22, "report", { edgeId: "edge-report-r2-o2", fromNodeId: "demo-reviewer-02", toNodeId: "demo-orchestrator-02", taskId: "sub-2", laneId: "lane-sub-2", status: "approved", text: "状态流 lane 汇报给聚合器。", fullContent: reviewer2 }),
  event("event-p3-result", 23, "agent_result", { nodeId: "demo-planner-03", agent: "planner", instanceId: "demo-planner-03", taskId: "sub-3", laneId: "lane-sub-3", phase: "plan", status: "ran", text: "输出校验规则。", fullContent: planner3, latencyMs: 600 }),
  event("event-p3-c3", 24, "handoff", { edgeId: "edge-handoff-p3-c3", fromNodeId: "demo-planner-03", toNodeId: "demo-coder-03", taskId: "sub-3", laneId: "lane-sub-3", status: "sent", text: "Planner -> Coder:交接校验规则。", fullContent: `handoff_context:\n${planner3}` }),
  event("event-c3-draft", 25, "agent_result", { nodeId: "demo-coder-03", agent: "coder", instanceId: "demo-coder-03", taskId: "sub-3", laneId: "lane-sub-3", phase: "implement", status: "ran", text: "提交初版校验逻辑。", fullContent: coder3Draft, latencyMs: 760 }),
  event("event-c3-r3", 26, "handoff", { edgeId: "edge-handoff-c3-r3", fromNodeId: "demo-coder-03", toNodeId: "demo-reviewer-03", taskId: "sub-3", laneId: "lane-sub-3", status: "sent", text: "Coder -> Reviewer:初版待审查。", fullContent: `review_packet:\n${coder3Draft}` }),
  event("event-r3-reject", 27, "review_verdict", { nodeId: "demo-reviewer-03", agent: "reviewer", instanceId: "demo-reviewer-03", taskId: "sub-3", laneId: "lane-sub-3", phase: "review", status: "rejected", verdict: "REJECT", text: "发现失败态复位缺口,退回返工。", fullContent: reviewer3Reject, latencyMs: 640, revisionRound: 1 }),
  event("event-r3-feedback", 28, "revision", { edgeId: "edge-feedback-r3-c3", fromNodeId: "demo-reviewer-03", toNodeId: "demo-coder-03", taskId: "sub-3", laneId: "lane-sub-3", status: "sent", text: "反馈 R1:补齐失败复位和错误摘要焦点。", fullContent: reviewer3Reject, revisionRound: 1 }),
  event("event-c3-fix", 29, "agent_result", { nodeId: "demo-coder-03", agent: "coder", instanceId: "demo-coder-03", taskId: "sub-3", laneId: "lane-sub-3", phase: "implement", status: "ran", text: "R1 修订完成。", fullContent: coder3Fix, latencyMs: 720, revisionRound: 1 }),
  event("event-c3-r3-r1", 30, "handoff", { edgeId: "edge-handoff-c3-r3-r1", fromNodeId: "demo-coder-03", toNodeId: "demo-reviewer-03", taskId: "sub-3", laneId: "lane-sub-3", status: "sent", text: "Coder -> Reviewer:R1 复审。", fullContent: `revision_packet R1:\n${coder3Fix}`, revisionRound: 1 }),
  event("event-r3-approve", 31, "review_verdict", { nodeId: "demo-reviewer-03", agent: "reviewer", instanceId: "demo-reviewer-03", taskId: "sub-3", laneId: "lane-sub-3", phase: "review", status: "approved", verdict: "APPROVE", text: "校验规则通过。", fullContent: reviewer3Approve, latencyMs: 540, revisionRound: 1 }),
  event("event-r3-report", 32, "report", { edgeId: "edge-report-r3-o2", fromNodeId: "demo-reviewer-03", toNodeId: "demo-orchestrator-02", taskId: "sub-3", laneId: "lane-sub-3", status: "approved", text: "校验 lane 汇报给聚合器。", fullContent: `${reviewer3Approve}\n自净化证据:R1 修订关闭失败态缺口。` }),
  event("event-p4-result", 33, "agent_result", { nodeId: "demo-planner-04", agent: "planner", instanceId: "demo-planner-04", taskId: "sub-4", laneId: "lane-sub-4", phase: "plan", status: "ran", text: "输出交付和回流计划。", fullContent: planner4, latencyMs: 580 }),
  event("event-p4-c4", 34, "handoff", { edgeId: "edge-handoff-p4-c4", fromNodeId: "demo-planner-04", toNodeId: "demo-coder-04", taskId: "sub-4", laneId: "lane-sub-4", status: "sent", text: "Planner -> Coder:交接回流字段。", fullContent: `handoff_context:\n${planner4}` }),
  event("event-c4-result", 35, "agent_result", { nodeId: "demo-coder-04", agent: "coder", instanceId: "demo-coder-04", taskId: "sub-4", laneId: "lane-sub-4", phase: "implement", status: "ran", text: "产出交付清单和经验包草案。", fullContent: coder4, latencyMs: 760 }),
  event("event-c4-r4", 36, "handoff", { edgeId: "edge-handoff-c4-r4", fromNodeId: "demo-coder-04", toNodeId: "demo-reviewer-04", taskId: "sub-4", laneId: "lane-sub-4", status: "sent", text: "Coder -> Reviewer:回流草案审查。", fullContent: `review_packet:\n${coder4}` }),
  event("event-r4", 37, "review_verdict", { nodeId: "demo-reviewer-04", agent: "reviewer", instanceId: "demo-reviewer-04", taskId: "sub-4", laneId: "lane-sub-4", phase: "review", status: "approved", verdict: "APPROVE", text: "交付与回流通过。", fullContent: reviewer4, latencyMs: 510 }),
  event("event-r4-report", 38, "report", { edgeId: "edge-report-r4-o2", fromNodeId: "demo-reviewer-04", toNodeId: "demo-orchestrator-02", taskId: "sub-4", laneId: "lane-sub-4", status: "approved", text: "交付 lane 汇报给聚合器。", fullContent: reviewer4 }),
  event("event-aggregate", 39, "aggregate", { nodeId: "demo-orchestrator-02", agent: "orchestrator", instanceId: "demo-orchestrator-02", phase: "aggregate", status: "ran", text: "聚合 4 条通过结果和 1 次返工证据。", fullContent: finalContent, latencyMs: 900 }),
  event("event-backflow", 40, "backflow", { edgeId: "edge-backflow", fromNodeId: "demo-orchestrator-02", toNodeId: "evomap", status: "published", text: "回流 login-form-validation-flow@G4。", fullContent: "Gene+Capsule bundle\nslug: login-form-validation-flow\nquality: 0.948\ngeneration: 4\ncontains: 状态机、错误摘要、失败复位、handoff 配方、验收清单。" }),
];

const receiverContentByEventId: Record<string, string> = {
  "event-classify": [
    "【策略路由回应】",
    "我会把这道题按 HARD 处理,因为它不是单点 UI,而是表单字段、状态机、错误反馈、loading 锁定和验收回流的组合。",
    "后续需要进入默认 Evo 蜂群,让不同角色分别负责拆解、实现、审查和沉淀。",
  ].join("\n"),
  "event-policy": [
    "【执行器回应】",
    "我将按预制策略执行完整链路:inherit 继承经验,diverge 拆 4 条 lane,handoff 交接上下文,review 触发一次返工,aggregate 汇总,backflow 模拟经验回流。",
  ].join("\n"),
  "event-inherit": [
    "【Orchestrator #1 看法】",
    "这不是一个单纯表单问题,我会把它拆成需求口径、状态流、校验错误和回流交付四条 lane。",
    "继承到的关键经验是:失败态必须复位,错误摘要必须可聚焦,loading 要阻断重复提交。",
  ].join("\n"),
  "event-p1-start": [
    "【Planner #1 模型入口理解】",
    "我收到的不是“写个登录框”,而是要给后续实现侧一份可验收契约。",
    "我会先定义字段、状态、错误和无障碍口径,再交给 Coder。",
  ].join("\n"),
  "event-p1-result": [
    "【Trace 记录】",
    "Planner #1 已输出需求矩阵:email/password、idle/editing/submitting/success/failed、字段错误、服务端失败和 loading 禁用都已纳入验收。",
  ].join("\n"),
  "event-dispatch-1": [
    "【Planner #1 看法】",
    "我负责先把「完整登录页」变成可验收清单。",
    "我会明确字段、状态、错误类型和可访问性要求,否则后面的 coder 会只写一个能看的表单。",
  ].join("\n"),
  "event-dispatch-2": [
    "【Planner #2 看法】",
    "我聚焦交互状态:用户输入、提交中、成功、失败都要有明确状态迁移。",
    "这个问题的关键不是按钮好不好看,而是 loading 期间不能重复提交,失败后还要能继续编辑。",
  ].join("\n"),
  "event-dispatch-3": [
    "【Planner #3 看法】",
    "我负责校验和错误处理。",
    "邮箱格式、密码长度只是第一层;真正容易漏的是接口失败后的错误摘要、按钮复位和焦点回收。",
  ].join("\n"),
  "event-dispatch-4": [
    "【Planner #4 看法】",
    "我负责把这个演示收束成可交付、可复跑、可回流的经验。",
    "最后需要留下验收脚本和 Gene+Capsule 字段,下一次类似登录表单可以直接继承。",
  ].join("\n"),
  "event-broadcast-contract": [
    "【Planner #1 对广播的响应】",
    "我会把验收清单写成后续 lane 都能引用的契约:字段、错误、loading、无障碍、回流证据。",
  ].join("\n"),
  "event-broadcast-contract-2": [
    "【Planner #2 对广播的响应】",
    "我会让状态机对齐验收契约:client-invalid 不提交,submitting 锁按钮,failed 还原可编辑状态。",
  ].join("\n"),
  "event-broadcast-contract-3": [
    "【Planner #3 对广播的响应】",
    "我会把错误处理做成可审查证据:字段级错误、表单级错误、role=alert、focus(errorSummary)。",
  ].join("\n"),
  "event-broadcast-contract-4": [
    "【Planner #4 对广播的响应】",
    "我会把成功路径整理成回流包:problem、constraints、handoff recipe、acceptance checklist、failure fix。",
  ].join("\n"),
  "event-p1-c1": [
    "【Coder #1 看法】",
    "我会把 Planner 的验收口径转成实现骨架:",
    "LoginForm(email,password,errors,submitting) + 错误摘要区域 + 禁用态按钮。",
    "先确保后续每个功能都有落点。",
  ].join("\n"),
  "event-c1-result": [
    "【Trace 记录】",
    "Coder #1 已把需求矩阵转成组件结构:LoginForm、errors、submitting、formError 和 aria-live 错误区。",
    "这个结果会进入 Reviewer #1 的覆盖性审查。",
  ].join("\n"),
  "event-c1-r1": [
    "【Reviewer #1 看法】",
    "我会检查这个需求矩阵是否能覆盖完整登录页,尤其是错误态和 loading 态有没有明确验收标准。",
  ].join("\n"),
  "event-r1-report": [
    "【Orchestrator #2 聚合看法】",
    "需求 lane 已经给出清晰边界。我会把它作为全局验收基线,约束后续状态、校验和交付 lane。",
  ].join("\n"),
  "event-p2-result": [
    "【Trace 记录】",
    "Planner #2 已输出状态流:idle -> editing -> client-invalid/ready -> submitting -> success/failed。",
    "关键约束是提交中锁定输入和按钮,失败后保留用户输入并恢复可编辑。",
  ].join("\n"),
  "event-p2-c2": [
    "【Coder #2 看法】",
    "我会把状态流落成代码结构:errors、submitting、formError 三块状态分离。",
    "submit 中用 try/finally 保证 loading 一定结束。",
  ].join("\n"),
  "event-c2-result": [
    "【Trace 记录】",
    "Coder #2 已提交状态机实现:clientValidate 通过后才进入 submitting,接口返回后统一归位。",
    "它解决的是 loading 态和重复提交问题。",
  ].join("\n"),
  "event-c2-r2": [
    "【Reviewer #2 看法】",
    "我会重点看重复点击、失败恢复、输入时清错这三条路径,它们决定这个登录页是不是像真实产品。",
  ].join("\n"),
  "event-r2-report": [
    "【Orchestrator #2 聚合看法】",
    "状态 lane 已经补齐了交互骨架。我会把 submitting 锁定和失败恢复并入最终方案。",
  ].join("\n"),
  "event-p3-result": [
    "【Trace 记录】",
    "Planner #3 已输出校验规则:邮箱必须符合基本格式,密码至少 8 位,接口失败要显示表单级错误并聚焦摘要。",
  ].join("\n"),
  "event-p3-c3": [
    "【Coder #3 看法】",
    "我会实现 validateEmail 和 validatePassword,再处理提交失败。",
    "这里最容易漏的是服务端失败后 UI 状态是否回到可操作。",
  ].join("\n"),
  "event-c3-draft": [
    "【Trace 记录】",
    "Coder #3 初版已记录:字段级校验存在,但服务端失败只走 toast,还没有稳定的错误摘要和焦点回收。",
    "这会被 Reviewer #3 用失败路径压测。",
  ].join("\n"),
  "event-c3-r3": [
    "【Reviewer #3 看法】",
    "我不会只看正向校验。我要故意模拟接口失败,检查 submitting 是否复位、错误是否能被读屏感知。",
  ].join("\n"),
  "event-r3-feedback": [
    "【Coder #3 返工看法】",
    "这个反馈成立。我的初版只处理字段校验,漏了服务端失败后的表单级错误。",
    "我会加 finally 复位、role=alert 错误摘要和 focus(errorSummaryRef)。",
  ].join("\n"),
  "event-c3-fix": [
    "【Trace 记录】",
    "Coder #3 R1 已完成:finally 复位 submitting,formError 写入 role=alert,失败后 nextTick 聚焦错误摘要。",
    "这是本轮自净化的核心修复。",
  ].join("\n"),
  "event-c3-r3-r1": [
    "【Reviewer #3 复审看法】",
    "我会复跑失败路径:点击提交 -> loading -> 接口失败 -> 按钮恢复 -> 焦点到错误摘要。",
    "如果这条链路闭环,校验 lane 才算通过。",
  ].join("\n"),
  "event-r3-report": [
    "【Orchestrator #2 聚合看法】",
    "校验 lane 提供了最重要的自净化证据:R1 修复失败复位和错误摘要。",
    "最终答案必须显式写入这个修订点。",
  ].join("\n"),
  "event-p4-result": [
    "【Trace 记录】",
    "Planner #4 已给出交付结构:组件实现、状态 hook、验收脚本、经验包字段。",
    "这保证最终输出不是一句建议,而是一份可演示、可复跑、可回流的交付。",
  ].join("\n"),
  "event-p4-c4": [
    "【Coder #4 看法】",
    "我会把交付拆成组件、状态 hook、验收脚本和经验包草案。",
    "这样演示不是只给一个答案,而是能复跑、能交接、能回流。",
  ].join("\n"),
  "event-c4-result": [
    "【Trace 记录】",
    "Coder #4 已输出交付清单:LoginPage.vue、校验/加载态实现、五条验收脚本和 login-form-validation-flow 经验包草案。",
  ].join("\n"),
  "event-c4-r4": [
    "【Reviewer #4 看法】",
    "我会检查交付清单是否覆盖空值、坏邮箱、短密码、接口失败和成功跳转。",
    "同时确认经验包字段足够下一轮继承。",
  ].join("\n"),
  "event-r4-report": [
    "【Orchestrator #2 聚合看法】",
    "交付 lane 已经提供验收脚本和回流字段。我会把它和前三条 lane 合成最终 Demo 输出。",
  ].join("\n"),
  "event-backflow": [
    "【EvoMap 回流记录】",
    "已接收 login-form-validation-flow@G4。",
    "经验内容包含:登录表单状态机、错误摘要焦点、失败态复位、handoff 配方和验收清单。",
  ].join("\n"),
};

const events: SwarmGraphEvent[] = rawEvents.map((item, index) => ({
  ...item,
  receiverContent: receiverContentByEventId[item.id],
  seq: index + 1,
  ts: ts(index + 1),
}));

const laneEdgeIds = (taskId: string) => edges.filter((item) => item.taskId === taskId).map((item) => item.id);
const laneNodeIds = (taskId: string) => nodes.filter((item) => item.taskId === taskId).map((item) => item.id);

const lanes: SwarmLane[] = subtasks.map((task) => ({
  id: `lane-${task.id}`,
  taskId: task.id,
  title: task.title,
  status: "completed",
  nodeIds: laneNodeIds(task.id),
  edgeIds: laneEdgeIds(task.id),
}));

const graph: SwarmGraph = {
  runId: "demo-default-evo-v1",
  difficulty: "HARD",
  tier: "swarm-evo",
  policy,
  nodes,
  edges,
  events,
  lanes,
  metrics: {
    totalLatencyMs: 18000,
    agentRuns: 14,
    handoffs: 10,
    broadcasts: 4,
    revisions: 1,
    subtasks: 4,
  },
};

function legacyEvent(event: SwarmGraphEvent): NonNullable<SwarmTrace["events"]>[number] {
  return {
    id: event.id,
    kind: event.kind === "agent_result" ? "agent_run" : event.kind,
    phase: event.phase || event.kind,
    agent: event.agent,
    instanceId: event.instanceId,
    fromNodeId: event.fromNodeId,
    toNodeId: event.toNodeId,
    taskId: event.taskId,
    status: event.status,
    verdict: event.verdict,
    text: event.text,
    fullContent: event.fullContent,
    receiverContent: event.receiverContent,
    latencyMs: event.latencyMs,
    revisionRound: event.revisionRound,
  };
}

const handoffs: NonNullable<SwarmTrace["handoffs"]> = edges
  .filter((item) => ["handoff", "feedback"].includes(item.kind))
  .map((item) => ({
    from: nodes.find((nodeItem) => nodeItem.id === item.source)?.archetype || item.source,
    to: nodes.find((nodeItem) => nodeItem.id === item.target)?.archetype || item.target,
    fromInstanceId: item.source,
    toInstanceId: item.target,
    taskId: item.taskId || "",
    taskGoal: subtasks.find((task) => task.id === item.taskId)?.goal || "",
    feedback: item.kind === "feedback" ? item.snippet : undefined,
    revisionRound: item.revisionRound,
    snippet: item.snippet || "",
  }));

export function createPlaygroundDemoOutput(): SwarmOutput {
  return {
    content: finalContent,
    trace: {
      tier: "swarm-evo",
      model: DEMO_MODEL,
      difficulty: "HARD",
      policy,
      swarm_size: 14,
      inherited_recipes: [
        {
          title: "登录表单状态机 G3",
          description: "idle/editing/submitting/success/failed 的状态拆分与按钮锁定策略。",
          source: "local",
          qualityScore: 0.931,
          reuseCount: 12,
          generation: 3,
          matchScore: 0.92,
          memoryId: 301,
        },
        {
          title: "表单错误摘要与焦点回收 Capsule",
          description: "提交失败时使用 role=alert 错误摘要,并把焦点送回摘要区域。",
          source: "capsule",
          qualityScore: 0.914,
          reuseCount: 7,
          generation: 2,
          matchScore: 0.88,
          memoryId: 302,
        },
        {
          title: "密码校验返工案例 G2",
          description: "Reviewer 发现失败态未复位后,通过 feedback handoff 触发 coder R1 修订。",
          source: "local",
          qualityScore: 0.902,
          reuseCount: 5,
          generation: 2,
          matchScore: 0.84,
          memoryId: 303,
        },
        {
          title: "Gene+Capsule 回流模板",
          description: "把成功路径拆成 problem、constraints、handoff recipe、acceptance checklist。",
          source: "recipe",
          qualityScore: 0.889,
          reuseCount: 9,
          generation: 3,
          matchScore: 0.8,
          memoryId: 304,
        },
      ],
      graph,
      subtasks: subtasks.map(({ id, title, weight, status }) => ({ id, title, weight, status })),
      handoffs,
      reward_split: [
        { archetype: "orchestrator", weight: 0.15, contribution: "任务拆解、统一验收契约、最终聚合与回流打包" },
        { archetype: "planner", weight: 0.2, contribution: "四条 lane 的计划与交接上下文" },
        { archetype: "coder", weight: 0.35, contribution: "状态机、校验逻辑、修订闭环与交付清单" },
        { archetype: "reviewer", weight: 0.2, contribution: "审查通过、发现失败复位缺口并触发 R1 自净化" },
        { archetype: "evomap", weight: 0.1, contribution: "经验继承与 Gene+Capsule 回流" },
      ],
      events: events.map(legacyEvent),
      bees: [
        { id: "demo-orchestrator-01", variant: "orchestrator", agent: "orchestrator", phase: "decompose", status: "breakthrough", latency_ms: 420, snippet: "继承经验并拆解 4 个可并行子任务。" },
        { id: "demo-planner-01", variant: "planner", agent: "planner", phase: "plan", status: "ran", latency_ms: 610, snippet: "输出需求矩阵和验收口径。" },
        { id: "demo-coder-01", variant: "coder", agent: "coder", phase: "implement", status: "ran", latency_ms: 780, snippet: "把需求矩阵转成字段与 UI 状态清单。" },
        { id: "demo-reviewer-01", variant: "reviewer", agent: "reviewer", phase: "review", status: "ran", latency_ms: 520, snippet: "需求拆解通过。" },
        { id: "demo-planner-02", variant: "planner", agent: "planner", phase: "plan", status: "ran", latency_ms: 590, snippet: "输出 loading 与提交状态流。" },
        { id: "demo-coder-02", variant: "coder", agent: "coder", phase: "implement", status: "ran", latency_ms: 820, snippet: "实现 submitting 状态机。" },
        { id: "demo-reviewer-02", variant: "reviewer", agent: "reviewer", phase: "review", status: "ran", latency_ms: 560, snippet: "交互状态通过。" },
        { id: "demo-planner-03", variant: "planner", agent: "planner", phase: "plan", status: "ran", latency_ms: 600, snippet: "输出校验规则与错误处理要求。" },
        { id: "demo-coder-03", variant: "coder", agent: "coder", phase: "implement", status: "breakthrough", latency_ms: 1480, snippet: "初版被退回后 R1 修订失败复位与错误摘要焦点。" },
        { id: "demo-reviewer-03", variant: "reviewer", agent: "reviewer", phase: "review", status: "breakthrough", latency_ms: 1180, snippet: "发现失败态复位缺口并批准 R1 修订。" },
        { id: "demo-planner-04", variant: "planner", agent: "planner", phase: "plan", status: "ran", latency_ms: 580, snippet: "规划交付验收和经验回流字段。" },
        { id: "demo-coder-04", variant: "coder", agent: "coder", phase: "implement", status: "ran", latency_ms: 760, snippet: "产出交付清单和经验包草案。" },
        { id: "demo-reviewer-04", variant: "reviewer", agent: "reviewer", phase: "review", status: "ran", latency_ms: 510, snippet: "交付与回流草案通过。" },
        { id: "demo-orchestrator-02", variant: "orchestrator", agent: "orchestrator", phase: "aggregate", status: "breakthrough", latency_ms: 900, snippet: "聚合 4 条 lane 并回流 login-form-validation-flow@G4。" },
      ],
      breakthroughs_broadcast: 4,
      aggregator: "llm",
      evomap_backflow: {
        status: "published",
        title: "login-form-validation-flow@G4",
        localMemoryId: 404,
        qualityScore: 0.948,
        generation: 4,
      },
      evolution: {
        inheritedLocal: 2,
        inheritedRemote: 2,
        deposited: {
          id: 404,
          title: "SwarmPay 进化记忆 G4: 登录表单校验与失败复位",
          qualityScore: 0.948,
          generation: 4,
          successStreak: 6,
        },
      },
      total_latency_ms: 18000,
    },
  };
}
