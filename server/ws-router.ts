/**
 * WebSocket 路由器
 * 负责分发消息到对应的处理器
 */

import type { WebSocket } from "bun";
import type { WebSocketIncomingMessage } from "./ws-message.js";
import { parseMessage } from "./ws-message.js";
import type { AuthHandler } from "./handlers/AuthHandler.js";
import type { StopHandler } from "./handlers/StopHandler.js";
import type { SwitchSessionHandler } from "./handlers/SwitchSessionHandler.js";
import type { PromptHandler } from "./handlers/PromptHandler.js";

export interface WsRouter {
  handleMessage(ws: WebSocket, rawMessage: string | Buffer): void;
}

interface WsRouterDeps {
  authHandler: AuthHandler;
  stopHandler: StopHandler;
  switchSessionHandler: SwitchSessionHandler;
  promptHandler: PromptHandler;
}

export function createWsRouter(deps: WsRouterDeps): WsRouter {
  const { authHandler, stopHandler, switchSessionHandler, promptHandler } = deps;

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
        authHandler.handle(ws, message);
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
        case "stop":
          stopHandler.handle(ws, message);
          break;
        case "switch_session":
          switchSessionHandler.handle(ws, message);
          break;
        case "prompt":
          promptHandler.handle(ws, message);
          break;
      }
    },
  };
}
