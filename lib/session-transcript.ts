/**
 * Session Transcript - 统一的会话内容提取模块
 *
 * 整合了原本分散在多处的内容提取逻辑：
 * - extractFromSessionText()
 * - getLastAssistantMessageFromFile()
 * - extractCompleteContent()
 */

import { BunFile } from "bun";

interface Logger {
  log(msg: string): void;
}

/**
 * 从 messages 数组中提取最后一条 assistant 消息的 text 内容
 */
export function extractFromMessages(
  messages: any[],
  logger?: Logger,
): string {
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const lastMessage = assistantMessages[assistantMessages.length - 1];

  if (!lastMessage?.content) {
    logger?.log("[Transcript] 无 assistant 消息或 content 为空");
    return "";
  }

  const textParts =
    lastMessage.content
      .filter((c: any) => c.type === "text" || c.type === "thinking")
      .map((c: any) => (c.type === "thinking" ? c.thinking : c.text)) || [];

  const result = textParts.join("").trim();
  logger?.log(
    `[Transcript] 提取到 ${textParts.length} 段 text，共 ${result.length} 字符`,
  );
  return result;
}

/**
 * 从 Session 文件中读取最后一条 assistant 消息的完整文本
 */
export async function extractFromSessionFile(
  sessionFilePath: string,
  logger?: Logger,
): Promise<any[]> {
  try {
    const file = Bun.file(sessionFilePath);
    const fileContent = await file.text();
    const lines = fileContent.split("\n").filter(Boolean);

    const messages: any[] = [];
    for (const line of lines) {
      try {
        if (!line) continue;
        const data = JSON.parse(line);
        if (data.type === "message" && data.message?.role === "assistant") {
          messages.push(data.message);
        }
      } catch (e) {
        // 忽略解析错误
      }
    }

    logger?.log(`[Transcript] 从文件读取 ${messages.length} 条 assistant 消息`);
    return messages;
  } catch (e) {
    logger?.log(`[Transcript] 读取文件失败: ${e}`);
    return [];
  }
}

/**
 * 从内存消息中提取完整文本内容（用于 turn_end 事件）
 */
export function extractFromTurnEvent(message: any): string {
  try {
    const textParts =
      message?.content
        ?.filter((c: any) => c.type === "text" || c.type === "thinking")
        .map((c: any) => (c.type === "thinking" ? c.thinking : c.text)) || [];
    return textParts.join("");
  } catch (e) {
    return "";
  }
}

/**
 * 带后备方案的内容提取
 * 优先从内存消息提取，如果没有内容则尝试从文件读取
 */
export async function extractWithFallback(
  messages: any[],
  sessionFilePath: string | undefined,
  logger?: Logger,
): Promise<string> {
  // 优先从传入的 messages 提取
  let content = extractFromMessages(messages, logger);

  // 如果消息中无内容且有文件路径，尝试从文件读取
  if ((!content || content === "") && sessionFilePath) {
    logger?.log("[Transcript] 消息中无内容，尝试从文件读取");
    const fileMessages = await extractFromSessionFile(sessionFilePath, logger);
    content = extractFromMessages(fileMessages, logger);
  }

  return content;
}
