/**
 * WebSocket 消息类型定义
 */

/** 消息类型枚举 */
type MessageType = "auth" | "stop" | "switch_session" | "prompt" | "abort_retry";

/** 基础消息接口 */
interface BaseMessage {
  type: MessageType;
}

/** 认证消息 */
interface AuthMessage extends BaseMessage {
  type: "auth";
}

/** 停止生成消息 */
interface StopMessage extends BaseMessage {
  type: "stop";
}

/** 切换会话消息 */
interface SwitchSessionMessage extends BaseMessage {
  type: "switch_session";
  sessionId: string;
}

/** 发送提示消息 */
interface PromptMessage extends BaseMessage {
  type: "prompt";
  message: string;
}

/** 中止重试消息 */
interface AbortRetryMessage extends BaseMessage {
  type: "abort_retry";
}

/** 联合类型 */
type WebSocketIncomingMessage =
  | AuthMessage
  | StopMessage
  | SwitchSessionMessage
  | PromptMessage
  | AbortRetryMessage;

/** 解析消息 */
function parseMessage(raw: string | Buffer): WebSocketIncomingMessage | null {
  try {
    const data = JSON.parse(raw.toString());
    if (data.type && ["auth", "stop", "switch_session", "prompt", "abort_retry"].includes(data.type)) {
      return data as WebSocketIncomingMessage;
    }
    return null;
  } catch {
    return null;
  }
}

export type {
  MessageType,
  BaseMessage,
  AuthMessage,
  StopMessage,
  SwitchSessionMessage,
  PromptMessage,
  WebSocketIncomingMessage,
};
export { parseMessage };
