import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { parseThinkTagsFromDelta } from "./think-parser.js";
import {
  extractFromTurnEvent,
  extractFromSessionFile,
  extractFromMessages,
} from "../lib/session-transcript.js";

// ==================== Shared State ====================

interface SharedState {
  hasSentResponseStart: boolean;
  hasSentResponseEnd: boolean;
  messageStartTime: number | null;
  textDeltas: string[];
  isProcessingMessageEnd: boolean;
}

// ==================== Message Event Handler ====================

class MessageEventHandler {
  constructor(
    private ws: any,
    private logger: { log: (msg: string) => void },
    private state: SharedState,
  ) {}

  onMessageStart(event: { type: string }) {
    this.state.messageStartTime = Date.now();
    this.ws.send(JSON.stringify({ type: "message_start" }));
  }

  onMessageEnd(event: { type: string }) {
    this.ws.send(JSON.stringify({ type: "message_end" }));

    const elapsed = this.state.messageStartTime
      ? Date.now() - this.state.messageStartTime
      : 0;

    if (elapsed < 300 && !this.state.hasSentResponseStart) {
      this.logger.log(
        `[SESSION] 检测到快速拒绝 (${elapsed}ms)，跳过并等待新消息`,
      );
      this.state.messageStartTime = null;
      return;
    }

    // Guard against concurrent message_end events
    if (this.state.isProcessingMessageEnd) {
      this.logger.log("[SESSION] message_end 已在处理中，跳过重复事件");
      return;
    }
    this.state.isProcessingMessageEnd = true;
    this.logger.log("[SESSION] message_end 收到，等待 turn_end");
  }

  onMessageUpdate(event: any) {
    if (!this.state.hasSentResponseStart) {
      this.state.hasSentResponseStart = true;
      this.ws.send(JSON.stringify({ type: "response_start" }));
    }

    const ev = event.assistantMessageEvent;

    if (ev.type === "text_delta") {
      const rawDelta = ev.delta;
      this.state.textDeltas.push(rawDelta);

      const { textDelta, thinkDelta } = parseThinkTagsFromDelta(rawDelta, this.ws);

      if (textDelta && textDelta.trim().length > 0) {
        this.ws.send(JSON.stringify({ type: "text_delta", delta: textDelta }));
      }

      if (thinkDelta) {
        this.ws.send(JSON.stringify({ type: "think_block", content: thinkDelta }));
      }
    } else if (ev.type === "thinking_start") {
      this.logger.log(`[THINKING_START] ContentIndex: ${ev.contentIndex}`);
      this.ws.send(
        JSON.stringify({ type: "thinking_start", contentIndex: ev.contentIndex }),
      );
    } else if (ev.type === "thinking_delta") {
      this.ws.send(JSON.stringify({ type: "thinking_delta", delta: ev.delta }));
    } else if (ev.type === "thinking_end") {
      this.logger.log(`[THINKING_END] ContentIndex: ${ev.contentIndex}`);
      this.ws.send(
        JSON.stringify({
          type: "thinking_end",
          contentIndex: ev.contentIndex,
          content: ev.content,
        }),
      );
    } else if (ev.type === "toolcall_start") {
      const partial = ev.partial;
      const toolCall = partial.content?.[ev.contentIndex];
      if (toolCall && toolCall.type === "toolCall") {
        this.logger.log(
          `[TOOLCALL_START] Tool: ${toolCall.name}, ContentIndex: ${ev.contentIndex}`,
        );
        this.ws.send(
          JSON.stringify({
            type: "tool_call_start",
            tool: toolCall.name,
            contentIndex: ev.contentIndex,
          }),
        );
      }
    } else if (ev.type === "toolcall_end") {
      this.logger.log(`[TOOLCALL_END] ContentIndex: ${ev.contentIndex}`);
    } else {
      this.logger.log(
        `[MESSAGE_UPDATE] ${JSON.stringify(ev).substring(0, 200)}...`,
      );
    }
  }
}

// ==================== Tool Event Handler ====================

class ToolEventHandler {
  constructor(
    private ws: any,
    private logger: { log: (msg: string) => void },
  ) {}

  onExecutionStart(event: { toolName: string; args: any }) {
    this.logger.log(
      `[TOOL_EXECUTION_START] Tool: ${event.toolName}, Args: ${JSON.stringify(event.args).substring(0, 100)}...`,
    );
    this.ws.send(
      JSON.stringify({
        type: "tool_start",
        tool: event.toolName,
        args: event.args,
      }),
    );
  }

  onExecutionEnd(event: { toolName: string; result: any; isError: boolean }) {
    let content = "";
    if (event.result?.content) {
      for (const item of event.result.content) {
        if (item.type === "text") content += item.text;
      }
    }
    this.logger.log(
      `[TOOL_EXECUTION_END] Tool: ${event.toolName}, Success: ${!event.isError}`,
    );
    this.ws.send(
      JSON.stringify({
        type: "tool_end",
        tool: event.toolName,
        success: !event.isError,
        result: content,
      }),
    );
  }
}

// ==================== Session End Handler ====================

class SessionEndHandler {
  constructor(
    private ws: any,
    private logger: { log: (msg: string) => void },
    private state: SharedState,
    private session: AgentSession,
  ) {}

  onTurnEnd(event: any) {
    // Clear message_end guard
    this.state.isProcessingMessageEnd = false;

    this.logger.log("[SESSION] turn_end 收到，发送完整内容");
    const completeContent = extractFromTurnEvent(event.message);
    this.ws.send(
      JSON.stringify({ type: "turn_end", content: completeContent }),
    );
  }

  onAgentEnd() {
    if (this.state.hasSentResponseEnd) return;
    this.state.hasSentResponseEnd = true;
    this.state.hasSentResponseStart = false;

    this.logger.log("[SESSION] agent_end 收到，发送 response_end");

    const sessionFilePath = this.session.sessionFile;
    if (!sessionFilePath) {
      this.ws.send(
        JSON.stringify({ type: "response_end", generatedContent: undefined }),
      );
      return;
    }

    void (async () => {
      const fullTextResponse = await extractFromSessionFile(
        sessionFilePath,
        this.logger,
      );
      const generatedContent = extractFromMessages(fullTextResponse);
      this.ws.send(
        JSON.stringify({ type: "response_end", generatedContent }),
      );
      this.state.textDeltas.length = 0;
    })();
  }
}

// ==================== Retry Helpers ====================

function isRateLimitError(errorMessage: string): boolean {
  const msg = (errorMessage || "").toLowerCase();
  return msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests");
}

// 彻底失败处理：session.abort() + 通知用户
// 注意：此函数可能被调用时 retryState 已为 null（如 timer 回调 catch 中调用）
async function handleRetryFailure(
  ws: any,
  session: AgentSession,
  errMsg: string,
  sessionEndHandler: SessionEndHandler,
  attempt: number,
) {
  // 从 ws.data 获取当前的 retryState（可能被其他代码已清空）
  const currentRetryState = ws.data?.retryState;

  // 清理 timer（如存在）
  if (currentRetryState?.timer) {
    clearTimeout(currentRetryState.timer);
  }
  // 清理 retryState
  ws.data.retryState = null;

  try {
    // 尝试 abort，成功会触发 agent_end → sessionEndHandler.onAgentEnd()
    await session.abort();
  } catch (e) {
    // abort 失败（session 已卡死），手动触发 handler 兜底
    sessionEndHandler.onAgentEnd();
  }

  // 通知用户
  ws.send(JSON.stringify({
    type: "retry_failed",
    attempt,
    finalError: errMsg,
  }));
}

function startRetryDelay(
  ws: any,
  session: AgentSession,
  sessionEndHandler: SessionEndHandler,
) {
  const retryState = ws.data?.retryState;
  if (!retryState) return;

  const delayMs = retryState.delays[retryState.attempt - 1];
  const attempt = retryState.attempt;
  const maxAttempts = retryState.maxAttempts;

  ws.send(JSON.stringify({
    type: "rate_limited",
    attempt,
    maxAttempts,
    retryAfter: delayMs / 1000,
    message: `API 限流，${delayMs / 1000}s 后自动重试 (${attempt}/${maxAttempts})`,
  }));

  if (retryState.timer) clearTimeout(retryState.timer);

  retryState.timer = setTimeout(async () => {
    retryState.timer = null;
    const savedPrompt = retryState.prompt;
    const currentAttempt = retryState.attempt;
    if (!savedPrompt) {
      handleRetryFailure(ws, session, "no saved prompt", sessionEndHandler, currentAttempt);
      return;
    }
    try {
      // 必须 await abort，等待 agent 完全停止
      await session.abort();
      // 确保 agent 完全 idle
      if (session.isStreaming) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await session.prompt(savedPrompt);
    } catch (err: any) {
      handleRetryFailure(ws, session, err?.message || "unknown error", sessionEndHandler, currentAttempt);
    }
  }, delayMs);
}

// ==================== Main Subscribe ====================

export function subscribeToSessionEvents(
  ws: any,
  session: AgentSession,
  logger: { log: (msg: string) => void },
  options: { hasSentResponseStart?: boolean; textDeltas?: string[] } = {},
): () => void {
  const state: SharedState = {
    hasSentResponseStart: options.hasSentResponseStart ?? false,
    hasSentResponseEnd: false,
    messageStartTime: null,
    textDeltas: options.textDeltas ?? [],
    isProcessingMessageEnd: false,
  };

  const messageHandler = new MessageEventHandler(ws, logger, state);
  const toolHandler = new ToolEventHandler(ws, logger);
  const sessionEndHandler = new SessionEndHandler(ws, logger, state, session);

  const unsubscribe = session.subscribe((event) => {
    logger.log(`[EVENT] Type: ${event.type}`);

    // NOTE: event order must be preserved — handlers are dispatched by type only

    // ========== 429 Retry Logic ==========
    // 处理 429 错误的自动重试
    // 注意：pi-coding-agent 会发出 type: "message" 的事件（不在 AgentSession 类型定义中）
    const ev = event as any;
    if (ev.type === "message" && ev.stopReason === "error") {
      const errMsg = ev.errorMessage || "";
      if (isRateLimitError(errMsg)) {
        const retryState = ws.data?.retryState;

        if (!retryState) {
          // 首次 429，初始化 retry state
          const lastPrompt = ws.data?.lastPrompt || "";
          if (!lastPrompt) {
            // 没有保存的 prompt，无法重试，走彻底失败流程
            handleRetryFailure(ws, session, errMsg, sessionEndHandler, 0);
            return;
          }
          ws.data.retryState = {
            prompt: lastPrompt,
            attempt: 1,
            maxAttempts: 3,
            delays: [2000, 4000, 8000],
            timer: null,
          };
          startRetryDelay(ws, session, sessionEndHandler);
        } else if (retryState.attempt < retryState.maxAttempts) {
          // retry 中再次 429，增加 attempt，继续
          retryState.attempt++;
          startRetryDelay(ws, session, sessionEndHandler);
        } else {
          // 彻底失败
          handleRetryFailure(ws, session, errMsg, sessionEndHandler, retryState.attempt);
        }
        return;
      }
    }

    // 成功响应时清理 retryState（仅非 error 的响应）
    if (event.type === "message_end") {
      const msgEvent = event as any;
      const retryState = ws.data?.retryState;
      if (retryState && msgEvent.stopReason !== "error") {
        if (retryState.timer) clearTimeout(retryState.timer);
        ws.data.retryState = null;
      }
    }
    // ========== End 429 Retry Logic ==========

    if (event.type === "message_start") {
      messageHandler.onMessageStart(event);
    } else if (event.type === "message_end") {
      messageHandler.onMessageEnd(event);
    } else if (event.type === "message_update") {
      messageHandler.onMessageUpdate(event);
    } else if (event.type === "tool_execution_start") {
      toolHandler.onExecutionStart(event);
    } else if (event.type === "tool_execution_end") {
      toolHandler.onExecutionEnd(event);
    } else if (event.type === "turn_end") {
      sessionEndHandler.onTurnEnd(event);
    } else if (event.type === "agent_end") {
      sessionEndHandler.onAgentEnd();
    } else if (event.type === "auto_retry_start") {
      const ev = event as any;
      const delaySec = Math.ceil(ev.delayMs / 1000);
      ws.send(JSON.stringify({
        type: "rate_limited",
        attempt: ev.attempt,
        maxAttempts: ev.maxAttempts,
        retryAfter: delaySec,
        message: `API 限流，${delaySec}s 后自动重试 (${ev.attempt}/${ev.maxAttempts})`,
      }));
    } else if (event.type === "auto_retry_end") {
      const ev = event as any;
      if (ev.success) {
        ws.send(JSON.stringify({ type: "retry_success", attempt: ev.attempt }));
      } else {
        // 重试彻底失败，session 已终止，通知前端
        ws.send(JSON.stringify({
          type: "retry_failed",
          attempt: ev.attempt,
          finalError: ev.finalError,
        }));
        // agent_end 已发过 response_end，此处不再补发，避免重复
      }
    }
  });

  return unsubscribe;
}
