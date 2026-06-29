/**
 * Memory Consolidation - Types and Constants
 */

export interface ConsolidationState {
  messageCountAtConsolidation: number;
  summaryText: string;
  tokensAtConsolidation: number;
  createdAt: number;
}

export interface ConsolidationResult {
  success: boolean;
  summaryText: string;
  messageCount: number;
  isUseful: boolean;
}

export const MEMORY_THRESHOLD = 0.50; // 50% token usage
export const MEMORY_THRESHOLD_MAX = 0.70; // Upper bound for this layer
export const MIN_SUMMARY_LENGTH = 50; // Minimum chars for useful summary
export const MEMORY_FILE_NAME = "MEMORY.md";
export const CUSTOM_ENTRY_TYPE = "memory_consolidation";
export const INVALIDATION_ENTRY_TYPE = "consolidation_invalidation";
