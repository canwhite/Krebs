/**
 * 停止处理器
 * 处理 stop 消息类型，中止当前 AI 生成
 */

import type { WebSocket } from "bun";

export interface StopHandler {
  handle(ws: WebSocket, message: { type: "stop" }): Promise<void>;
}

export function createStopHandler(): StopHandler {
  return {
    async handle(ws: WebSocket, _message: { type: "stop" }) {
      console.log(`[WebSocket] 收到停止请求`);
      const session = (ws as any).data?.session;
      if (session?.isStreaming) {
        await session.abort();
        console.log(`[WebSocket] 已停止 AI 回复`);
      }
    },
  };
}
