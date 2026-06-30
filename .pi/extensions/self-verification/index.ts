/**
 * Self-Verification Extension
 *
 * 在 turn_end 时验证 Agent 的回答是否正确，
 * 失败时注入修正消息让 Agent 继续修正。
 */

import type {
  ExtensionAPI,
  TurnEndEvent,
  BeforeAgentStartEvent,
  ContextEvent,
} from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

/** Context event result type (not re-exported from earendil-works pi-coding-agent) */
type ContextEventResult = { messages?: AgentMessage[] };
import {
  MAX_RETRIES,
  SKIP_FIRST_N_TURNS,
  SELF_VERIFICATION_MARKER,
  type SessionState,
} from "../../../server/services/self-verification/types.js";
import { verifyResult } from "../../../server/services/self-verification/llm.js";

const sessionStates = new Map<string, SessionState>();

function getSessionState(sessionId: string): SessionState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      originalGoal: "",
      turnCount: 0,
      retryCount: 0,
      pendingCorrection: null,
      lastVerifiedContent: "",
    });
  }
  return sessionStates.get(sessionId)!;
}

function getLastAssistantContent(message: any): string {
  if (!message.content) return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("");
}

function isSelfVerificationMessage(msg: any): boolean {
  if (!msg.content) return false;
  const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
  return content.includes(SELF_VERIFICATION_MARKER);
}

export default function (api: ExtensionAPI) {
  // 1. 捕获原始目标（每次新用户消息时更新）
  api.on("before_agent_start", (event: BeforeAgentStartEvent, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = getSessionState(sessionId);

    // 新的用户消息，清除 pending 和所有状态
    if (state.pendingCorrection !== null) {
      console.log(`[SelfVerification] New user message, clearing pending`);
    }
    state.pendingCorrection = null;
    state.originalGoal = event.prompt;
    state.retryCount = 0;
    state.lastVerifiedContent = "";
    state.turnCount = 0; // 重置 turnCount，新任务从头开始
    console.log(`[SelfVerification] New task: ${event.prompt.substring(0, 50)}...`);

    return {};
  });

  // 2. 每个 turn 结束时验证（跳过前两次）
  api.on("turn_end", async (event: TurnEndEvent, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = getSessionState(sessionId);

    state.turnCount++;
    console.log(`[SelfVerification] Turn ${state.turnCount} ended`);

    // 跳过前 N 次 turn
    if (state.turnCount <= SKIP_FIRST_N_TURNS) {
      console.log(`[SelfVerification] Skipping (turn ${state.turnCount} <= ${SKIP_FIRST_N_TURNS})`);
      return;
    }

    // 如果有待注入的修正消息（不重复验证同一个内容）
    if (state.pendingCorrection) {
      console.log(`[SelfVerification] Pending correction exists, will inject in context`);
      return;
    }

    // 超过最大修正次数，不再验证/修正
    if (state.retryCount >= MAX_RETRIES) {
      console.log(`[SelfVerification] Max corrections (${MAX_RETRIES}) reached`);
      return;
    }

    // 获取本 turn 的结果
    const result = getLastAssistantContent(event.message);
    if (!result) {
      console.log(`[SelfVerification] No result to verify`);
      return;
    }

    // 不重复验证同一个内容
    if (result === state.lastVerifiedContent) {
      console.log(`[SelfVerification] Same content, skipping`);
      return;
    }
    state.lastVerifiedContent = result;

    // 调用 LLM 验证
    const verification = await verifyResult(result, state.originalGoal, ctx);

    if (!verification.passed) {
      state.retryCount++;
      console.log(`[SelfVerification] Correction ${state.retryCount}/${MAX_RETRIES}: ${verification.reason}`);

      // 设置待注入的修正消息，在 context 事件中注入（带序号区分）
      state.pendingCorrection = `${SELF_VERIFICATION_MARKER}-${state.retryCount} ${verification.reason}\n请修正并继续。`;
    } else {
      console.log(`[SelfVerification] Verification passed`);
    }
  });

  // 3. context 事件：注入修正消息（参考 Goal Constraint 方式）
  api.on("context", async (event: ContextEvent, ctx): Promise<ContextEventResult> => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = getSessionState(sessionId);

    // 如果有待注入的修正消息
    if (state.pendingCorrection) {
      // 过滤掉之前的修正消息，避免循环
      event.messages = event.messages.filter((m) => !isSelfVerificationMessage(m));

      // 注入修正消息
      event.messages.unshift({
        role: "user",
        content: state.pendingCorrection,
        id: "self-verification-correction",
      } as any);

      console.log(`[SelfVerification] Injected correction via context`);
      state.pendingCorrection = null;

      return { messages: event.messages };
    }

    return {};
  });

  // 4. Session 结束时清理
  api.on("session_shutdown", (_, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    if (sessionId) {
      sessionStates.delete(sessionId);
    }
  });
}
