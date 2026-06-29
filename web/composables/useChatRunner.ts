// 对话页日志回放:把蜂群 trace.graph.events 转成逐条日志(无画布版)。
// 从 useFlowRunner 的 replayGraphOnCanvas 抽出纯日志逻辑,去掉粒子/气泡/边动画。
import type { SwarmGraph, SwarmGraphEvent, SwarmGraphNode } from "../api/swarm";
import type { ChatLog, ChatMessage } from "../stores/chat";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const EVENT_KIND_LABEL: Record<SwarmGraphEvent["kind"], string> = {
  classify: "难度判定",
  policy: "策略生成",
  inherit: "经验继承",
  decompose: "任务拆解",
  agent_start: "开始执行",
  agent_result: "执行结果",
  handoff: "上下文交接",
  broadcast: "突破广播",
  review_verdict: "审查结论",
  revision: "返工修订",
  report: "结果汇报",
  aggregate: "聚合",
  backflow: "经验回流",
};

function nodeLabel(graphNodes: Map<string, SwarmGraphNode>, id?: string): string {
  if (!id) return "蜂群";
  const n = graphNodes.get(id);
  return n?.label || n?.archetype || "节点";
}

function shortText(s: string | undefined, max = 120): string {
  if (!s) return "";
  const c = s.replace(/\s+/g, " ").trim();
  return c.length > max ? c.slice(0, max) + "…" : c;
}

export function useChatRunner() {
  // 全局 token,支持中断(切对话/清空时停止旧回放)
  let runToken = 0;

  function stop() {
    runToken += 1;
  }

  /** 回放 graph.events 到 msg.logs(逐条,带时序)。token 变化即中断。 */
  async function replay(msg: ChatMessage): Promise<void> {
    const trace = msg.trace;
    const graph: SwarmGraph | undefined = trace?.graph;
    if (!graph || !graph.events?.length) {
      // direct 或无 graph:显示"无协作过程"
      if (trace && !graph) {
        msg.logs.push({ from: "直通", text: "单次模型调用,无蜂群协作过程", ts: Date.now() });
      } else if (!trace) {
        msg.logs.push({ from: "系统", text: "(无 trace)", ts: Date.now() });
      }
      return;
    }

    runToken += 1;
    const token = runToken;

    const graphNodes = new Map<string, SwarmGraphNode>();
    for (const n of graph.nodes) {
      graphNodes.set(n.id, n);
      if (n.instanceId) graphNodes.set(n.instanceId, n);
    }
    const edgeMap = new Map(graph.edges.map((e) => [e.id, e]));
    const orderedEvents = [...graph.events].sort((a, b) => a.seq - b.seq);

    msg.logs.push({
      from: "蜂群",
      text: `${graph.difficulty || "未知"}难度 · ${graph.nodes.length} 节点 · ${graph.edges.length} 边 · 开始协作`,
      ts: Date.now(),
    });
    await sleep(320);

    for (const event of orderedEvents) {
      if (token !== runToken) return; // 被中断
      const label = EVENT_KIND_LABEL[event.kind] || event.kind;
      const from = nodeLabel(graphNodes, event.nodeId || event.instanceId);

      if (event.kind === "agent_start") {
        msg.logs.push({ from, text: `▶ ${shortText(event.text, 80) || "开始执行"}`, ts: Date.now() });
        await sleep(340);
      } else if (event.kind === "agent_result" || event.kind === "review_verdict") {
        const rejected = event.verdict === "REJECT" || event.status === "rejected";
        const prefix = event.kind === "review_verdict" ? (rejected ? "✗ 驳回" : "✓ 通过") : "✓ 完成";
        msg.logs.push({ from, text: `${prefix} ${shortText(event.text, 100)}`, ts: Date.now() });
        await sleep(420);
      } else {
        // 边事件(handoff/broadcast/report/inherit/backflow/revision/dispatch/aggregate)
        const edge = event.edgeId ? edgeMap.get(event.edgeId) : undefined;
        const srcName = event.fromNodeId ? nodeLabel(graphNodes, event.fromNodeId) : from;
        const dstName = event.toNodeId ? nodeLabel(graphNodes, event.toNodeId) : edge ? nodeLabel(graphNodes, edge.target) : "";
        if (srcName && dstName && srcName !== dstName) {
          msg.logs.push({ from: `${srcName} → ${dstName}`, text: `${label} ${shortText(event.text, 90)}`.trim(), ts: Date.now() });
        } else {
          msg.logs.push({ from, text: `${label} ${shortText(event.text, 100)}`.trim(), ts: Date.now() });
        }
        await sleep(event.kind === "broadcast" ? 460 : 300);
      }
    }
    if (token === runToken) {
      msg.logs.push({ from: "旗舰", text: "聚合完成,产出最终答案", ts: Date.now() });
    }
  }

  return { replay, stop };
}
