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
