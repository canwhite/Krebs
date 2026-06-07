/**
 * WebSocket 连接上下文
 * 封装每个 WebSocket 连接的状态
 */

import type { AgentSessionRuntime } from "@mariozechner/pi-coding-agent";
import type { MonitorLogger } from "../lib/logger.js";

interface WsData {
  sessionId: string;
  logger: MonitorLogger;
  authenticated: boolean;
  runtime?: AgentSessionRuntime;
  session?: any;
  firstMessageSaved?: boolean;
  isSwitchingSession?: boolean;
  unsubscribe?: () => void;
  messageStartTime?: number;
}

/** WebSocket 连接上下文接口 */
interface WsContext {
  sessionId: string;
  logger: MonitorLogger;
  authenticated: boolean;
  runtime?: AgentSessionRuntime;
  session?: any;
  firstMessageSaved: boolean;
  isSwitchingSession: boolean;
  unsubscribe?: () => void;
  messageStartTime?: number;
}

/** 从 ws.data 创建只读上下文 */
function createWsContext(ws: any): WsContext {
  const data = ws.data as WsData;
  return {
    sessionId: data.sessionId,
    logger: data.logger,
    authenticated: data.authenticated,
    runtime: data.runtime,
    session: data.session,
    firstMessageSaved: data.firstMessageSaved ?? false,
    isSwitchingSession: data.isSwitchingSession ?? false,
    unsubscribe: data.unsubscribe,
    messageStartTime: data.messageStartTime,
  };
}

/** 更新 ws.data */
function updateWsData(ws: any, updates: Partial<WsData>): void {
  Object.assign(ws.data, updates);
}

export type { WsContext, WsData };
export { createWsContext, updateWsData };
