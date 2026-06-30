/**
 * 敏感信息过滤
 * 防止 API keys、密码、私钥等通过 context 泄露给 subagent
 */

import type { TextContent, ImageContent } from "@earendil-works/pi-ai";

// 敏感信息过滤模式（增强版）
const SENSITIVE_PATTERNS = [
  /sk-[\w]{20,}/gi,                              // OpenAI / Anthropic API Keys
  /AIza[A-Za-z0-9_-]{35,}/gi,                    // Google API Keys
  /AKIA[A-Z0-9]{16}/gi,                          // AWS Access Key ID
  /-----BEGIN (?:RSA|EC|DSA|OPENSSH)?PRIVATE KEY-----/gi,  // PEM 私钥
  /(?:^|\s)eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/gi,  // JWT
  // Stripe keys
  /sk_live_[A-Za-z0-9]{24,}/gi,
  /sk_test_[A-Za-z0-9]{24,}/gi,
  // GitHub tokens
  /ghp_[A-Za-z0-9]{36,}/gi,
  /gho_[A-Za-z0-9]{36,}/gi,
];

/**
 * 从 AgentMessage content 中提取纯文本
 * ImageContent 被静默丢弃（图片无法转为文本）
 */
export function extractText(content: string | TextContent[] | ImageContent[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((c): c is TextContent => c.type === "text")
    .map(c => c.text)
    .join("");
}

/**
 * 过滤敏感信息
 */
export function filterSensitiveData(text: string): string {
  let filtered = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    filtered = filtered.replace(pattern, '[REDACTED]');
  }
  return filtered;
}
