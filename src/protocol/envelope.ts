// protocol/envelope.ts
// GEP-A2A 7 字段信封构造/校验。对齐 skill.md 的协议规范。

import crypto from "node:crypto";
import type { AgentMessage, MessageIntent, MessageType } from "../agents/types.js";

/** 生成 message_id:msg_<unix_ms>_<rand4> */
export function newMessageId(): string {
  return `msg_${Date.now()}_${crypto.randomBytes(2).toString("hex")}`;
}

/** 构造一条 GEP-A2A 信封消息 */
export function buildMessage(args: {
  senderId: string;
  messageType?: MessageType;
  intent: MessageIntent;
  to?: string;
  task?: AgentMessage["payload"]["task"];
  contextBlob?: string;
  feedback?: string;
  verdict?: "APPROVE" | "REJECT";
  hint?: string;
  rewardWeight?: number;
}): AgentMessage {
  return {
    protocol: "gep-a2a",
    protocol_version: "1.0.0",
    message_type: args.messageType ?? "dialog",
    message_id: newMessageId(),
    sender_id: args.senderId,
    timestamp: new Date().toISOString(),
    payload: {
      intent: args.intent,
      to: args.to,
      task: args.task,
      context_blob: args.contextBlob,
      feedback: args.feedback,
      verdict: args.verdict,
      hint: args.hint,
      reward_weight: args.rewardWeight,
    },
  };
}

/** 校验信封完整性(7 个必填字段) */
export function isValidEnvelope(msg: AgentMessage): boolean {
  return !!(
    msg.protocol === "gep-a2a" &&
    msg.protocol_version &&
    msg.message_type &&
    msg.message_id &&
    msg.sender_id &&
    msg.timestamp &&
    msg.payload
  );
}

/** 人类可读的消息摘要(用于 trace/日志) */
export function summarizeMessage(msg: AgentMessage): string {
  const p = msg.payload;
  const target = p.to ? `→${p.to}` : "(广播)";
  let detail = "";
  if (p.intent === "handoff" && p.context_blob) detail = ` ctx:${p.context_blob.length}字`;
  if (p.intent === "breakthrough" && p.hint) detail = ` hint:${p.hint.length}字`;
  if (p.feedback) detail = ` feedback:${p.feedback.length}字`;
  return `${msg.sender_id} ${p.intent}${target}${detail}`;
}
