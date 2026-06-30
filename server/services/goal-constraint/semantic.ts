/**
 * Goal Constraint System - Semantic Analyzer
 *
 * Uses BM25-based drift detection with hybrid scoring.
 */

import { buildGoalIndex, scoreGoalDrift } from "./embedding.js";
import { GOAL_CONSTRAINT_THRESHOLDS, STOP_WORDS, type CoreGoal } from "./types.js";

export class SemanticAnalyzer {
  /**
   * Extract keywords from text (top 20, stopword filtered)
   */
  extractKeywords(text: string): string[] {
    const normalized = text.normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').toLowerCase();
    const tokens = normalized.split(/[\s\p{P}]+/u);
    const freq = new Map<string, number>();

    for (const token of tokens) {
      if (token.length >= 2 && !STOP_WORDS.has(token)) {
        freq.set(token, (freq.get(token) || 0) + 1);
      }
    }

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  /**
   * Calculate keyword match rate between message tokens and goal keywords
   */
  keywordMatchRate(messageTokens: string[], goalKeywords: string[]): number {
    if (messageTokens.length === 0 || goalKeywords.length === 0) return 0;
    const matched = messageTokens.filter(t => goalKeywords.includes(t)).length;
    return matched / goalKeywords.length;
  }

  /**
   * Calculate drift score using BM25 + keyword hybrid approach
   */
  calculateDriftScore(
    messageTokens: string[],
    coreGoals: CoreGoal[]
  ): { bm25: number; keyword: number; hybrid: number; dominantGoal: CoreGoal | null } {
    if (coreGoals.length === 0) {
      return { bm25: 0, keyword: 0, hybrid: 0, dominantGoal: null };
    }

    const goalIndex = buildGoalIndex(coreGoals);
    const avgGoalTokenCount = coreGoals.reduce((sum, g) => sum + g.keywords.length, 0) / Math.max(1, coreGoals.length);
    const bm25Scores = scoreGoalDrift(messageTokens, goalIndex, avgGoalTokenCount);

    let bestHybrid = 0;
    let bestBm25 = 0;
    let bestKeyword = 0;
    let dominantGoal: CoreGoal | null = null;

    for (const goal of coreGoals) {
      const matchedTokens = messageTokens.filter(t => goal.keywords.includes(t)).length;
      const keywordRate = goal.keywords.length > 0 ? matchedTokens / goal.keywords.length : 0;
      const bm25Score = bm25Scores.get(goal.id) ?? 0;
      const normalizedBm25 = Math.min(bm25Score / 10, 1);
      const hybrid = GOAL_CONSTRAINT_THRESHOLDS.SEMANTIC_WEIGHT * normalizedBm25
                   + GOAL_CONSTRAINT_THRESHOLDS.KEYWORD_WEIGHT * keywordRate;

      if (hybrid > bestHybrid) {
        bestHybrid = hybrid;
        bestBm25 = normalizedBm25;
        bestKeyword = keywordRate;
        dominantGoal = goal;
      }
    }

    return { bm25: bestBm25, keyword: bestKeyword, hybrid: bestHybrid, dominantGoal };
  }
}
