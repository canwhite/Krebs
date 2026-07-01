/**
 * Prompt 消息处理器
 * 处理 prompt 消息类型，发送消息给 AI
 */

import type { WebSocket } from "bun";
import { saveSessionMeta } from "../../db/index.js";

export interface PromptHandler {
  handle(ws: WebSocket, message: { type: "prompt"; message: string }): void;
}

export function createPromptHandler(): PromptHandler {
  return {
    handle(ws: WebSocket, message: { type: "prompt"; message: string }) {
      console.log(`[WebSocket] 收到消息: ${message.message}`);

      const sessionId = (ws as any).data?.sessionId;
      const session = (ws as any).data?.session;
      const retryState = (ws as any).data?.retryState;

      const firstMessageSaved = (ws as any).data?.firstMessageSaved;
      if (!firstMessageSaved && session) {
        const filePath = session.sessionFile;
        if (filePath) {
          saveSessionMeta(sessionId, message.message, filePath);
          (ws as any).data.firstMessageSaved = true;
        }
      }

      // 保存 lastPrompt 以便 retry 时使用
      (ws as any).data.lastPrompt = message.message;

      // 如果在 retry 期间，拒绝新 prompt
      if (retryState) {
        ws.send(
          JSON.stringify({
            type: "rate_limited",
            attempt: retryState.attempt,
            maxAttempts: retryState.maxAttempts,
            retryAfter: 0,
            message: `正在等待 API 重试 (${retryState.attempt}/${retryState.maxAttempts})，请稍后`,
          }),
        );
        return;
      }

      if (session.isRetrying) {
        ws.send(
          JSON.stringify({
            type: "rate_limited",
            message: "正在等待 API 重试，请稍后",
          }),
        );
        return;
      }

      if (session.isStreaming) {
        console.log(`[WebSocket] 会话正在响应中，将新消息加入队列`);

        ws.send(
          JSON.stringify({
            type: "question_queued",
            question: message.message,
          }),
        );

        session.followUp(message.message).catch((error: Error) => {
          const errorMessage = error?.message || "未知错误";
          const wsLogger = (ws as any).data?.logger;
          if (wsLogger) {
            wsLogger.log(`[ERROR] followUp 失败: ${errorMessage}`);
          }
          console.error(`[WebSocket] followUp 失败:`, error);

          ws.send(
            JSON.stringify({
              type: "error",
              message: "消息处理失败，请重试",
            }),
          );
        });
      } else {
        session.prompt(message.message).catch((error: Error) => {
          const errorMessage = error?.message || "未知错误";
          const wsLogger = (ws as any).data?.logger;
          if (wsLogger) {
            wsLogger.log(`[ERROR] prompt 失败: ${errorMessage}`);
          }
          console.error(`[WebSocket] prompt 失败:`, error);

          ws.send(
            JSON.stringify({
              type: "error",
              message: "消息处理失败，请重试",
            }),
          );
        });
      }
    },
  };
}
