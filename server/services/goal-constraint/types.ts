/**
 * Goal Constraint System - Type Definitions
 */

export interface CoreGoal {
  id: string;
  text: string;           // goal text from LLM extraction
  keywords: string[];     // extracted keywords (BM25-based)
  priority: number;
  createdAt: number;
}

export interface KeyMetric {
  name: string;           // metric pattern matched
  value: string;          // captured value
  context: string;        // message snippet
}

export interface GoalSummary {
  id: string;
  sessionId: string;
  threshold: number;      // 25 | 40 | 55
  coreGoals: CoreGoal[];
  keyMetrics: KeyMetric[];
  userMessages: string[];
  assistantMessages: string[];
  createdAt: number;
}

export interface DriftResult {
  hasDrifted: boolean;
  bm25Score: number;
  keywordMatchRate: number;
  hybridScore: number;
  dominantGoal: CoreGoal | null;
  details: string;
}

/**
 * Session state for tracking threshold hits and correction cooldowns
 */
export interface SessionState {
  thresholdsHit: Set<number>;
  lastCorrectionAt: number;
  correctionCooldownTurns: number;
  messageCount: number;
}

export const GOAL_CONSTRAINT_THRESHOLDS = {
  // Avoid conflict with contextCollapse (75%)
  CHECK_PERCENTAGES: [25, 40, 55] as const,
  DRIFT_SEMANTIC_THRESHOLD: 0.50,
  DRIFT_KEYWORD_THRESHOLD: 0.50,
  DRIFT_HYBRID_THRESHOLD: 0.50,
  SEMANTIC_WEIGHT: 0.4,
  KEYWORD_WEIGHT: 0.6,
  RECENT_MESSAGES_FOR_DRIFT: 20,
  MIN_MESSAGES_BEFORE_DRIFT_CHECK: 3,
  CORRECTION_COOLDOWN_TURNS: 3,
  CORRECTION_MESSAGE_ID: "goal_constraint_correction",
} as const;

export const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  '我', '你', '他', '她', '它', '们', '的', '了', '在', '是', '和', '与'
]);
