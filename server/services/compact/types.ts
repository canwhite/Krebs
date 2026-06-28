/**
 * Shared types for compact services
 */

export interface MicroCompactConfig {
  /** 保留最近 N 个 tool result */
  keepRecent: number;
  /** 超过多少轮视为"旧" */
  maxAge: number;
  /** 内容长度阈值，超过才 truncate */
  truncateThreshold: number;
  /** 是否启用 */
  enabled: boolean;
}

export const DEFAULT_MICRO_COMPACT_CONFIG: MicroCompactConfig = {
  keepRecent: 8,
  maxAge: 15,
  truncateThreshold: 300,
  enabled: true,
};

/**
 * Micro Compact 持久化到 transcript 的数据结构
 */
export interface MicroCompactEntry {
  originalContent: string;
  toolName: string;
  truncatedAt: number;
  originalMessageIndex: number;
}

/**
 * Context Collapse 配置
 */
export interface ContextCollapseConfig {
  /** 保留最近的 token 数 */
  keepRecentTokens: number;
  /** 保留最近 N 轮对话 */
  keepRecentRounds: number;
  /** 最小压缩阈值 */
  minCompressionTokens: number;
  /** 触发阈值（百分比） */
  triggerThreshold: number;
  /** 是否启用 */
  enabled: boolean;
}

export const DEFAULT_CONTEXT_COLLAPSE_CONFIG: ContextCollapseConfig = {
  keepRecentTokens: 8000,
  keepRecentRounds: 10,
  minCompressionTokens: 5000,
  triggerThreshold: 0.75, // 75%
  enabled: true,
};

/**
 * 压缩层级阈值配置
 */
export const LAYER_THRESHOLDS = {
  budget_reduction: 0.50,
  snip: 0.60,
  micro_compact: 0.70,
  context_collapse: 0.75,
  auto_compact: 0.835,
} as const;
