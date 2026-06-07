/**
 * 认证处理器
 * 处理 auth 消息类型
 */

import type { WebSocket } from "bun";

export interface AuthHandler {
  handle(ws: WebSocket, message: { type: "auth" }): void;
}

export function createAuthHandler(): AuthHandler {
  return {
    handle(ws: WebSocket, _message: { type: "auth" }) {
      (ws as any).data.authenticated = true;
      console.log("[WebSocket] 认证成功（本地前端）");
      ws.send(JSON.stringify({ type: "auth_success" }));
    },
  };
}
