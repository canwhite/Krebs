/**
 * 切换会话处理器
 * 处理 switch_session 消息类型
 */

import type { WebSocket } from "bun";
import { getSessionById } from "../../db/index.js";
import { lruSessionManager } from "../session-service.js";
import { subscribeToSessionEvents } from "../event-subscription.js";

export interface SwitchSessionHandler {
  handle(ws: WebSocket, message: { type: "switch_session"; sessionId: string }): Promise<void>;
}

export function createSwitchSessionHandler(): SwitchSessionHandler {
  return {
    async handle(ws: WebSocket, message: { type: "switch_session"; sessionId: string }) {
      if ((ws as any).data.isSwitchingSession) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Session 切换中，请稍后",
          }),
        );
        return;
      }

      console.log(`[WebSocket] 切换 session 到: ${message.sessionId}`);

      const sessionMeta = getSessionById(message.sessionId);
      if (!sessionMeta || !sessionMeta.file_path) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "Session 不存在或文件路径无效",
          }),
        );
        return;
      }

      (ws as any).data.isSwitchingSession = true;

      try {
        const runtime = (ws as any).data.runtime;
        if (!runtime) {
          throw new Error("Runtime 不存在");
        }

        // 取消旧的事件订阅
        const oldUnsubscribe = (ws as any).data.unsubscribe;
        if (oldUnsubscribe) {
          try {
            oldUnsubscribe();
            console.log(`[WebSocket] 已取消旧 session 的事件订阅`);
          } catch (e) {
            console.error(`[WebSocket] 取消旧订阅失败:`, e);
          }
        }

        const result = await runtime.switchSession(sessionMeta.file_path);
        if (!result.cancelled) {
          // 更新 session 引用
          const newSession = runtime.session;

          // 使用共享的事件订阅工厂
          const unsubscribe = subscribeToSessionEvents(
            ws,
            newSession,
            (ws as any).data.logger,
          );
          (ws as any).data.unsubscribe = unsubscribe;

          // P1-1 修复: 检查目标 sessionId 是否已存在，清理旧 runtime
          const existingRuntime = lruSessionManager.getSession(message.sessionId);
          if (existingRuntime && existingRuntime !== runtime) {
            try {
              existingRuntime.dispose();
              console.log(
                `[WebSocket] 已清理被覆盖的 runtime: ${message.sessionId}`,
              );
            } catch (e) {
              console.error(`[WebSocket] 清理旧 runtime 失败:`, e);
            }
          }

          // Update sessions via LRU manager
          lruSessionManager.addSession(message.sessionId, runtime, sessionMeta.file_path);

          // Remove old sessionId mapping if different
          const oldSessionId = (ws as any).data.sessionId;
          if (oldSessionId && oldSessionId !== message.sessionId) {
            lruSessionManager.removeSession(oldSessionId);
          }

          // Update the sessionId in ws.data
          (ws as any).data.sessionId = message.sessionId;
          (ws as any).data.firstMessageSaved = true;
          (ws as any).data.session = newSession;

          ws.send(
            JSON.stringify({
              type: "session_switched",
              sessionId: message.sessionId,
            }),
          );
          console.log(`[WebSocket] Session 切换成功: ${message.sessionId}`);
        } else {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "切换 session 被取消",
            }),
          );
        }
      } catch (error: any) {
        console.error(`[WebSocket] 切换 session 出错:`, error);
        ws.send(
          JSON.stringify({
            type: "error",
            message: "切换 session 出错，请重试",
          }),
        );
      } finally {
        (ws as any).data.isSwitchingSession = false;
      }
    },
  };
}
