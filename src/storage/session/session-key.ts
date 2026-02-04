/**
 * Session Key 解析和规范化工具
 *
 * 参考 openclaw-cn-ds 的 session key 设计
 * 支持：agent:{agentId}:{key} 格式
 */

import type { ParsedSessionKey } from "./types.js";

/**
 * 解析 Session Key
 *
 * 支持的格式：
 * - `agent:{agentId}:{key}` - 多 agent 场景
 * - `{key}` - 简单场景
 * - `global` - 全局会话
 * - `unknown` - 未知会话
 *
 * @param sessionKey - 会话 key
 * @returns 解析结果，如果格式无效返回 null
 */
export function parseSessionKey(
  sessionKey: string | undefined | null,
): ParsedSessionKey | null {
  const raw = (sessionKey ?? "").trim();
  if (!raw) return null;

  // 特殊 key
  if (raw === "global" || raw === "unknown") {
    return { agentId: undefined, key: raw, raw };
  }

  const parts = raw.split(":").filter(Boolean);
  if (parts.length < 1) return null;

  // agent:{agentId}:{key} 格式
  if (parts[0] === "agent") {
    if (parts.length < 3) return null;
    const agentId = parts[1]?.trim();
    const key = parts.slice(2).join(":");
    if (!agentId || !key) return null;
    return { agentId, key, raw };
  }

  // 简单格式
  return { agentId: undefined, key: raw, raw };
}

/**
 * 构建 Session Key
 *
 * @param agentId - Agent ID（可选）
 * @param key - 会话标识
 * @returns 完整的 session key
 */
export function buildSessionKey(
  agentId: string | undefined,
  key: string,
): string {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    throw new Error("Session key cannot be empty");
  }

  // 特殊 key
  if (normalizedKey === "global" || normalizedKey === "unknown") {
    return normalizedKey;
  }

  // 多 agent 场景（检查是否传入了 agentId 参数，即使它是空字符串）
  if (agentId !== undefined) {
    const normalizedAgentId = agentId.trim();
    if (!normalizedAgentId) {
      throw new Error("Agent ID cannot be empty");
    }
    return `agent:${normalizedAgentId}:${normalizedKey}`;
  }

  // 简单场景
  return normalizedKey;
}

/**
 * 规范化 Agent ID
 *
 * @param agentId - Agent ID
 * @returns 规范化后的 Agent ID
 */
export function normalizeAgentId(agentId: string): string {
  return agentId.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * 判断是否为多 agent Session Key
 *
 * @param sessionKey - 会话 key
 * @returns 是否为多 agent key
 */
export function isMultiAgentSessionKey(
  sessionKey: string | undefined | null,
): boolean {
  const parsed = parseSessionKey(sessionKey);
  return parsed !== null && parsed.agentId !== undefined;
}

/**
 * 判断是否为特殊 Session Key（global 或 unknown）
 *
 * @param sessionKey - 会话 key
 * @returns 是否为特殊 key
 */
export function isSpecialSessionKey(
  sessionKey: string | undefined | null,
): boolean {
  const raw = (sessionKey ?? "").trim();
  return raw === "global" || raw === "unknown";
}

/**
 * 提取 Agent ID
 *
 * @param sessionKey - 会话 key
 * @param defaultAgentId - 默认 Agent ID
 * @returns Agent ID
 */
export function resolveAgentId(
  sessionKey: string | undefined | null,
  defaultAgentId: string,
): string {
  const parsed = parseSessionKey(sessionKey);
  if (parsed?.agentId) {
    return parsed.agentId;
  }
  return defaultAgentId;
}

/**
 * 规范化 Session Key
 *
 * 确保格式一致，方便存储和查找
 *
 * @param sessionKey - 会话 key
 * @param defaultAgentId - 默认 Agent ID（用于简单 key）
 * @returns 规范化后的 session key
 */
export function canonicalizeSessionKey(
  sessionKey: string,
  defaultAgentId?: string,
): string {
  const parsed = parseSessionKey(sessionKey);
  if (!parsed) {
    throw new Error(`Invalid session key: ${sessionKey}`);
  }

  // 特殊 key 直接返回
  if (parsed.key === "global" || parsed.key === "unknown") {
    return parsed.key;
  }

  // 多 agent key
  if (parsed.agentId) {
    const normalizedAgentId = normalizeAgentId(parsed.agentId);
    return buildSessionKey(normalizedAgentId, parsed.key);
  }

  // 简单 key，添加默认 agent
  if (defaultAgentId) {
    const normalizedDefaultAgentId = normalizeAgentId(defaultAgentId);
    return buildSessionKey(normalizedDefaultAgentId, parsed.key);
  }

  // 没有默认 agent，返回简单 key
  return parsed.key;
}
