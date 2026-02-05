/**
 * Payload 系统 - 统一的消息格式
 *
 * 参考 openclaw-cn-ds 的 buildEmbeddedRunPayloads 设计
 * 支持工具结果分离、回复指令、流式分块等功能
 */

/**
 * Payload 类型
 */
export type PayloadKind = "text" | "tool_result" | "media" | "error";

/**
 * 基础 Payload 接口
 */
export interface BasePayload {
  kind: PayloadKind;
  timestamp?: number;
}

/**
 * 文本 Payload
 */
export interface TextPayload extends BasePayload {
  kind: "text";
  text: string;
  // 回复指令
  replyTo?: string;  // @reply:user-id
  final?: boolean;   // @final 标记
  silent?: boolean;  // @silent 不输出
}

/**
 * 工具结果 Payload
 */
export interface ToolResultPayload extends BasePayload {
  kind: "tool_result";
  toolCallId: string;
  toolName: string;
  result: unknown;
  success?: boolean;
  error?: string;
}

/**
 * 媒体 Payload（图片、音频等）
 */
export interface MediaPayload extends BasePayload {
  kind: "media";
  mediaType: "image" | "audio" | "video" | "file";
  url?: string;
  data?: string;  // base64 编码
  mimeType?: string;
}

/**
 * 错误 Payload
 */
export interface ErrorPayload extends BasePayload {
  kind: "error";
  error: string;
  code?: string;
  details?: unknown;
}

/**
 * Payload 联合类型
 */
export type Payload = TextPayload | ToolResultPayload | MediaPayload | ErrorPayload;

/**
 * Payload 构建选项
 */
export interface PayloadBuildOptions {
  // 工具结果格式
  toolResultFormat?: "json" | "markdown" | "plain";
  // 是否包含回复指令
  includeDirectives?: boolean;
  // 是否过滤静默消息
  filterSilent?: boolean;
}

/**
 * Payload 列表（有序）
 */
export type PayloadList = Payload[];
