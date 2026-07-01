/**
 * WebSocket 路由器
 * 负责分发消息到对应的处理器
 */

import type { WebSocket } from "bun";
import type { WebSocketIncomingMessage } from "./ws-message.js";
import { parseMessage } from "./ws-message.js";
import type { SwitchSessionHandler } from "./handlers/SwitchSessionHandler.js";
import type { PromptHandler } from "./handlers/PromptHandler.js";

export interface WsRouter {
  handleMessage(ws: WebSocket, rawMessage: string | Buffer): void;
}

interface WsRouterDeps {
  switchSessionHandler: SwitchSessionHandler;
  promptHandler: PromptHandler;
}

export function createWsRouter(deps: WsRouterDeps): WsRouter {
  const { switchSessionHandler, promptHandler } = deps;

  return {
    handleMessage(ws: WebSocket, rawMessage: string | Buffer) {
      const message = parseMessage(rawMessage);
      if (!message) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "无效的消息格式",
          }),
        );
        return;
      }

      // 认证消息可以直接处理
      if (message.type === "auth") {
        (ws as any).data.authenticated = true;
        console.log("[WebSocket] 认证成功（本地前端）");
        ws.send(JSON.stringify({ type: "auth_success" }));
        return;
      }

      // 其他消息需要先认证
      if (!(ws as any).data?.authenticated) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: "未认证，请先发送 auth 消息",
          }),
        );
        ws.close(1008, "Unauthorized");
        return;
      }

      // 路由到对应的处理器
      switch (message.type) {
        case "stop": {
          console.log(`[WebSocket] 收到停止请求`);
          const session = (ws as any).data?.session;
          if (session?.isStreaming) {
            session.abort();
            console.log(`[WebSocket] 已停止 AI 回复`);
          }
          break;
        }
        case "switch_session":
          switchSessionHandler.handle(ws, message);
          break;
        case "prompt":
          promptHandler.handle(ws, message);
          break;
        case "abort_retry": {
          const session = (ws as any).data?.session;
          session?.abortRetry(); // 幂等，非重试状态无操作
          ws.send(JSON.stringify({ type: "retry_aborted" }));
          break;
        }
      }
    },
  };
}
