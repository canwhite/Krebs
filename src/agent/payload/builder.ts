/**
 * Payload 构建器
 *
 * 职责：
 * - 将 Agent 结果转换为 Payload 列表
 * - 解析回复指令（@reply、@final、@silent）
 * - 分离工具结果和文本内容
 */

import type { PayloadList, PayloadBuildOptions, TextPayload, ToolResultPayload } from "./types.js";

/**
 * 回复指令正则表达式
 */
const DIRECTIVE_PATTERNS = {
  replyTo: /@reply:([^\s,]+)/g,  // 匹配 @reply: 后面的非空白、非逗号字符
  final: /@final/g,
  silent: /@silent/g,
};

/**
 * 解析回复指令
 */
export function parseDirectives(text: string): {
  replyTo?: string;
  final: boolean;
  silent: boolean;
  cleanText: string;
} {
  let replyTo: string | undefined;
  let final = false;
  let silent = false;
  let cleanText = text;

  // 解析 @reply（使用 exec 获取第一个匹配）
  const replyRegex = new RegExp(DIRECTIVE_PATTERNS.replyTo);
  const replyMatch = replyRegex.exec(text);
  if (replyMatch && replyMatch[1]) {
    replyTo = replyMatch[1];
    // 移除指令（但保留其他内容）
    cleanText = cleanText.replace(DIRECTIVE_PATTERNS.replyTo, "");
  }

  // 解析 @final
  if (DIRECTIVE_PATTERNS.final.test(text)) {
    final = true;
    cleanText = cleanText.replace(DIRECTIVE_PATTERNS.final, "");
  }

  // 解析 @silent
  if (DIRECTIVE_PATTERNS.silent.test(text)) {
    silent = true;
    cleanText = cleanText.replace(DIRECTIVE_PATTERNS.silent, "");
  }

  // 清理多余的空格（将多个空格替换为单个空格，并trim）
  cleanText = cleanText.replace(/\s+/g, " ").trim();

  return { replyTo, final, silent, cleanText };
}

/**
 * 创建文本 Payload
 */
export function createTextPayload(
  text: string,
  options?: PayloadBuildOptions
): TextPayload {
  const includeDirectives = options?.includeDirectives !== false;

  const payload: TextPayload = {
    kind: "text",
    text,
    timestamp: Date.now(),
  };

  // 解析回复指令
  if (includeDirectives) {
    const directives = parseDirectives(text);
    if (directives.replyTo) payload.replyTo = directives.replyTo;
    if (directives.final) payload.final = true;
    if (directives.silent) payload.silent = true;

    // 使用清理后的文本
    payload.text = directives.cleanText;
  }

  return payload;
}

/**
 * 创建工具结果 Payload
 */
export function createToolResultPayload(
  toolCallId: string,
  toolName: string,
  result: unknown,
  success: boolean = true,
  error?: string
): ToolResultPayload {
  return {
    kind: "tool_result",
    toolCallId,
    toolName,
    result,
    success,
    error,
    timestamp: Date.now(),
  };
}

/**
 * 从工具调用结果构建 Payload 列表
 */
export function buildToolResultPayloads(toolResults: any[]): PayloadList {
  return toolResults.map((toolResult) => {
    const success = !toolResult.result?.error;
    const error = toolResult.result?.error;

    return createToolResultPayload(
      toolResult.id,
      toolResult.name,
      toolResult.result,
      success,
      error
    );
  });
}

/**
 * 构建完整的 Payload 列表
 */
export interface BuildPayloadsParams {
  // Agent 响应内容
  content?: string;
  // 工具调用结果
  toolResults?: any[];
  // 选项
  options?: PayloadBuildOptions;
}

/**
 * 构建 Payload 列表
 */
export function buildPayloads(params: BuildPayloadsParams): PayloadList {
  const payloads: PayloadList = [];
  const { content, toolResults, options } = params;

  // 1. 添加文本内容（如果有）
  if (content && content.trim()) {
    const textPayload = createTextPayload(content, options);
    payloads.push(textPayload);
  }

  // 2. 添加工具结果（如果有）
  if (toolResults && toolResults.length > 0) {
    const toolPayloads = buildToolResultPayloads(toolResults);
    payloads.push(...toolPayloads);
  }

  // 3. 过滤静默消息（如果需要）
  if (options?.filterSilent) {
    return payloads.filter((p) => !(p.kind === "text" && p.silent));
  }

  return payloads;
}

/**
 * 应用回复模式（根据 @final 标记）
 */
export function applyReplyMode(payloads: PayloadList, mode: "all" | "final_only"): PayloadList {
  if (mode === "all") {
    return payloads;
  }

  // final_only: 只返回标记为 final 的文本
  const finalPayloads = payloads.filter((p) => p.kind === "text" && p.final);

  // 如果没有 final 标记，返回所有文本（不含工具结果）
  if (finalPayloads.length === 0) {
    return payloads.filter((p) => p.kind === "text");
  }

  return finalPayloads;
}

/**
 * 格式化工具结果为文本
 */
export function formatToolResult(
  toolResult: ToolResultPayload,
  format: "json" | "markdown" | "plain" = "json"
): string {
  if (format === "json") {
    return JSON.stringify(toolResult.result, null, 2);
  }

  if (format === "markdown") {
    return `**Tool:** ${toolResult.toolName}\n\`\`\`\n${JSON.stringify(toolResult.result, null, 2)}\n\`\`\``;
  }

  // plain
  return `[${toolResult.toolName}] ${JSON.stringify(toolResult.result)}`;
}
