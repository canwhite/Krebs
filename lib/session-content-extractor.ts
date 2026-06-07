/**
 * Session 内容提取器
 *
 * 从 AI 输出的 messages 数组中提取最后一条 assistant 消息的 text 内容。
 */

export function extractFromSessionText(
  messages: any[],
  logger?: { log: (msg: string) => void },
): string {
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const lastMessage = assistantMessages[assistantMessages.length - 1];

  if (!lastMessage?.content) {
    logger?.log("[EXTRACT] 无 assistant 消息或 content 为空");
    return "";
  }

  const textParts =
    lastMessage.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text) || [];

  const result = textParts.join("").trim();
  logger?.log(`[EXTRACT] 提取到 ${textParts.length} 段 text，共 ${result.length} 字符`);
  return result;
}