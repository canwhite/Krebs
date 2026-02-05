/**
 * 工具策略控制系统
 *
 * 参考 openclaw-cn-ds 的 tool-policy.ts
 * 提供 allow/deny 策略和配置文件管理
 */

import type { Tool } from "./types.js";
import { expandToolGroups, normalizeToolName } from "./groups.js";

/**
 * 工具配置文件类型
 */
export type ToolProfileId = "minimal" | "coding" | "full";

/**
 * 工具策略
 */
export interface ToolPolicy {
  /** 允许的工具列表（白名单） */
  allow?: string[];

  /** 禁止的工具列表（黑名单） */
  deny?: string[];
}

/**
 * 工具配置文件定义
 */
const TOOL_PROFILES: Record<ToolProfileId, ToolPolicy> = {
  /**
   * 最小配置 - 只允许基本工具
   */
  minimal: {
    allow: ["read_file"],
  },

  /**
   * 编程配置 - 允许文件操作和命令执行
   */
  coding: {
    allow: ["group:fs", "group:runtime", "group:web"],
  },

  /**
   * 完整配置 - 允许所有工具
   */
  full: {},
};

/**
 * 解析工具配置文件
 *
 * @param profileId - 配置文件 ID
 * @returns 工具策略，如果配置文件不存在则返回 undefined
 */
export function resolveToolProfile(profileId?: string): ToolPolicy | undefined {
  if (!profileId) return undefined;

  const profile = TOOL_PROFILES[profileId as ToolProfileId];
  if (!profile) {
    console.warn(`Unknown tool profile: ${profileId}`);
    return undefined;
  }

  // 返回副本，避免修改原始配置
  return {
    allow: profile.allow ? [...profile.allow] : undefined,
    deny: profile.deny ? [...profile.deny] : undefined,
  };
}

/**
 * 解析工具策略
 *
 * 合并配置文件和自定义策略，优先级：custom > profile
 *
 * @param profile - 配置文件 ID
 * @param customAllow - 自定义允许列表
 * @param customDeny - 自定义禁止列表
 * @returns 解析后的工具策略
 */
export function resolveToolPolicy(
  profile?: string,
  customAllow?: string[],
  customDeny?: string[]
): { allowed: Set<string>; denied: Set<string> } {
  // 1. 解析配置文件
  const profilePolicy = resolveToolProfile(profile);

  // 2. 合并 allow 策略
  const allowList = customAllow || profilePolicy?.allow || [];
  const expandedAllow = expandToolGroups(allowList);
  const allowed = new Set(expandedAllow.map(normalizeToolName));

  // 3. 合并 deny 策略
  const denyList = customDeny || profilePolicy?.deny || [];
  const expandedDeny = expandToolGroups(denyList);
  const denied = new Set(expandedDeny.map(normalizeToolName));

  // 4. deny 优先于 allow
  // 如果工具既在 allow 又在 deny，最终会被 denied

  return { allowed, denied };
}

/**
 * 根据策略过滤工具列表
 *
 * @param tools - 所有工具
 * @param policy - 工具策略
 * @returns 过滤后的工具列表
 */
export function filterToolsByPolicy(tools: Tool[], policy: { allowed: Set<string>; denied: Set<string> }): Tool[] {
  return tools.filter((tool) => {
    const toolName = normalizeToolName(tool.name);

    // 如果在 deny 列表中，直接拒绝
    if (policy.denied.has(toolName)) {
      return false;
    }

    // 如果 allowed 为空（允许所有），则通过
    if (policy.allowed.size === 0) {
      return true;
    }

    // 检查是否在 allow 列表中
    return policy.allowed.has(toolName);
  });
}

/**
 * 检查工具是否被策略允许
 *
 * @param toolName - 工具名称
 * @param policy - 工具策略
 * @returns 是否允许
 */
export function isToolAllowed(toolName: string, policy: { allowed: Set<string>; denied: Set<string> }): boolean {
  const normalized = normalizeToolName(toolName);

  // deny 优先
  if (policy.denied.has(normalized)) {
    return false;
  }

  // allowed 为空表示允许所有
  if (policy.allowed.size === 0) {
    return true;
  }

  return policy.allowed.has(normalized);
}

/**
 * 创建工具策略描述（用于日志和调试）
 *
 * @param policy - 工具策略
 * @returns 策略的文本描述
 */
export function describeToolPolicy(policy: { allowed: Set<string>; denied: Set<string> }): string {
  const parts: string[] = [];

  if (policy.allowed.size > 0) {
    parts.push(`allow: [${Array.from(policy.allowed).join(", ")}]`);
  } else {
    parts.push("allow: [all]");
  }

  if (policy.denied.size > 0) {
    parts.push(`deny: [${Array.from(policy.denied).join(", ")}]`);
  }

  return parts.join(" | ");
}

/**
 * 获取所有可用的配置文件名称
 */
export function getAvailableProfiles(): ToolProfileId[] {
  return Object.keys(TOOL_PROFILES) as ToolProfileId[];
}

/**
 * 获取配置文件的详细信息
 */
export function getProfileDetails(profileId: ToolProfileId): ToolPolicy | undefined {
  return TOOL_PROFILES[profileId];
}
