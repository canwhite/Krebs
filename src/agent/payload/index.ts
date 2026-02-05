/**
 * Payload 系统 - 统一的消息格式
 *
 * 参考 openclaw-cn-ds 的 buildEmbeddedRunPayloads 设计
 */

export type {
  Payload,
  PayloadList,
  PayloadKind,
  BasePayload,
  TextPayload,
  ToolResultPayload,
  MediaPayload,
  ErrorPayload,
  PayloadBuildOptions,
} from "./types.js";

export {
  parseDirectives,
  createTextPayload,
  createToolResultPayload,
  buildToolResultPayloads,
  buildPayloads,
  applyReplyMode,
  formatToolResult,
} from "./builder.js";
