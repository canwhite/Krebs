/**
 * Goal Constraint System - Memlight BM25 Embedding
 *
 * BM25-based keyword extraction and scoring for goal drift detection.
 * Uses the same BM25 algorithm as session-history-rAG.
 */

import type { CoreGoal } from "./types.js";
import { STOP_WORDS } from "./types.js";

// BM25 parameters
const K1 = 1.5;
const B = 0.75;

export interface GoalIndexEntry {
  goalId: string;
  keywords: string[];
  tokenCount: number;
}

export interface GoalIndex {
  goals: GoalIndexEntry[];
  avgTokenCount: number;
}

/**
 * Build a BM25 index from core goals
 */
export function buildGoalIndex(coreGoals: CoreGoal[]): GoalIndex {
  const entries: GoalIndexEntry[] = coreGoals.map(goal => ({
    goalId: goal.id,
    keywords: goal.keywords,
    tokenCount: goal.keywords.length,
  }));

  const totalTokens = entries.reduce((sum, e) => sum + e.tokenCount, 0);
  const avgTokenCount = entries.length > 0 ? totalTokens / entries.length : 1;

  return { goals: entries, avgTokenCount };
}

/**
 * Score message tokens against goal index using BM25
 */
export function scoreGoalDrift(
  messageTokens: string[],
  goalIndex: GoalIndex,
  avgGoalTokenCount: number
): Map<string, number> {
  const scores = new Map<string, number>();
  const N = goalIndex.goals.length;

  if (N === 0 || messageTokens.length === 0) {
    return scores;
  }

  // Compute document frequency for each token
  const df = new Map<string, number>();
  for (const token of messageTokens) {
    let count = 0;
    for (const entry of goalIndex.goals) {
      if (entry.keywords.includes(token)) count++;
    }
    df.set(token, count);
  }

  // Calculate BM25 score for each goal
  for (const entry of goalIndex.goals) {
    let score = 0;

    for (const token of messageTokens) {
      const tf = entry.keywords.filter(t => t === token).length;
      if (tf === 0) continue;

      // IDF: log((N - d + 0.5) / (d + 0.5))
      const d = df.get(token) ?? 0;
      const idf = Math.log((N - d + 0.5) / (d + 0.5) + 1);

      // TF normalization
      const docLen = entry.tokenCount;
      const avgDocLen = avgGoalTokenCount || 1;
      const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * docLen / avgDocLen));

      score += idf * tfNorm;
    }

    scores.set(entry.goalId, score);
  }

  return scores;
}

/**
 * Extract keywords from text using TF-IDF-like approach
 */
export function extractGoalKeywords(text: string): { keywords: string[] } {
  const normalized = text.normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').toLowerCase();
  const tokens = normalized.split(/[\s\p{P}]+/u);
  const freq = new Map<string, number>();

  for (const token of tokens) {
    if (token.length >= 2 && !STOP_WORDS.has(token)) {
      freq.set(token, (freq.get(token) || 0) + 1);
    }
  }

  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);

  return { keywords };
}

/**
 * Check if text contains Chinese characters
 */
export function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * Character-level n-gram tokenization (fallback when jieba is unavailable)
 */
export function charNgram(text: string, min = 2, max = 4): string[] {
  const tokens: string[] = [];
  for (let i = 0; i < text.length; i++) {
    for (let len = min; len <= max && i + len <= text.length; len++) {
      tokens.push(text.slice(i, i + len));
    }
  }
  return [...new Set(tokens)];
}

/**
 * Normalize text for BM25 indexing
 */
export function preprocessForQuery(text: string): string[] {
  const normalized = text.normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').toLowerCase();
  const tokens = normalized.split(/[\s\p{P}]+/u).filter(
    t => t.length >= 2 && !STOP_WORDS.has(t)
  );
  return tokens;
}
