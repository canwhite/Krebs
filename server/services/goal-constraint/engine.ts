/**
 * Goal Constraint System - Engine
 *
 * Orchestrates goal extraction, drift detection, and correction generation.
 */

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { extractGoalsWithLLM } from "./llm.js";
import { SemanticAnalyzer } from "./semantic.js";
import { GOAL_CONSTRAINT_THRESHOLDS, STOP_WORDS, type DriftResult, type GoalSummary } from "./types.js";

export class GoalConstraintEngine {
  private latestSummary: GoalSummary | null = null;
  private lastCorrectionAt: number = 0;
  private semanticAnalyzer = new SemanticAnalyzer();

  constructor(
    private sessionId: string,
    private ctx: ExtensionContext
  ) {}

  /**
   * Check if any token threshold has been reached
   */
  checkTokenThresholds(state: { thresholdsHit: Set<number> }): number | null {
    const usage = this.ctx.getContextUsage?.();
    if (!usage?.tokens) return null;

    const thresholds = [...GOAL_CONSTRAINT_THRESHOLDS.CHECK_PERCENTAGES];
    for (const threshold of thresholds) {
      if (state.thresholdsHit.has(threshold)) continue;
      const percent = (usage.tokens / usage.contextWindow) * 100;
      if (percent >= threshold) {
        return threshold;
      }
    }
    return null;
  }

  /**
   * Generate goal summary (LLM preferred, fallback to heuristics)
   */
  async generateGoalSummary(threshold: number, messages: AgentMessage[]): Promise<GoalSummary> {
    const { goals, metrics } = await extractGoalsWithLLM(messages, this.ctx);

    this.latestSummary = {
      id: `gs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId: this.sessionId,
      threshold,
      coreGoals: goals,
      keyMetrics: metrics,
      userMessages: this.extractUserMessages(messages),
      assistantMessages: this.extractAssistantMessages(messages),
      createdAt: Date.now()
    };

    return this.latestSummary;
  }

  /**
   * Detect drift in recent messages
   */
  detectDrift(
    messages: AgentMessage[],
    state: { correctionCooldownTurns: number; messageCount: number }
  ): DriftResult {
    // Warmup check
    if (state.messageCount < GOAL_CONSTRAINT_THRESHOLDS.MIN_MESSAGES_BEFORE_DRIFT_CHECK) {
      return { hasDrifted: false, bm25Score: 1, keywordMatchRate: 1, hybridScore: 1, dominantGoal: null, details: "Warmup" };
    }

    // Cooldown check (DO NOT decrement here - Extension handles it)
    if (state.correctionCooldownTurns > 0) {
      return { hasDrifted: false, bm25Score: 1, keywordMatchRate: 1, hybridScore: 1, dominantGoal: null, details: "Cooldown" };
    }

    if (!this.latestSummary || this.latestSummary.coreGoals.length === 0) {
      return { hasDrifted: false, bm25Score: 1, keywordMatchRate: 1, hybridScore: 1, dominantGoal: null, details: "No summary" };
    }

    // Get recent messages text
    const recentMessages = messages.slice(-GOAL_CONSTRAINT_THRESHOLDS.RECENT_MESSAGES_FOR_DRIFT);
    const recentText = recentMessages
      .map(m => "content" in m && typeof m.content === "string" ? m.content : "")
      .filter(Boolean)
      .join(" ");

    if (!recentText.trim()) {
      return { hasDrifted: false, bm25Score: 1, keywordMatchRate: 1, hybridScore: 1, dominantGoal: null, details: "No text" };
    }

    // Tokenize recent messages
    const normalized = recentText.normalize('NFC').replace(/[^\p{L}\p{N}\s]/gu, ' ').toLowerCase();
    const messageTokens = normalized.split(/[\s\p{P}]+/u).filter(t => t.length >= 2 && !STOP_WORDS.has(t));

    // Calculate drift score
    const { bm25, keyword, hybrid, dominantGoal } = this.semanticAnalyzer.calculateDriftScore(
      messageTokens,
      this.latestSummary.coreGoals
    );

    const hasDrifted = keyword < GOAL_CONSTRAINT_THRESHOLDS.DRIFT_KEYWORD_THRESHOLD
                    || hybrid < GOAL_CONSTRAINT_THRESHOLDS.DRIFT_HYBRID_THRESHOLD;

    return {
      hasDrifted,
      bm25Score: bm25,
      keywordMatchRate: keyword,
      hybridScore: hybrid,
      dominantGoal,
      details: hasDrifted ? "Drift detected" : "Within threshold"
    };
  }

  /**
   * Generate correction message for drifted conversation
   */
  generateCorrectionMessage(drift: DriftResult, summary: GoalSummary): string {
    const goals = summary.coreGoals.map(g => `- ${g.text}`).join("\n");
    const metrics = summary.keyMetrics.map(m => `- ${m.name}: ${m.value}`).join("\n");

    return `[GOAL CONSTRAINT] Conversation has drifted from core goals.

CORE GOALS:
${goals}

KEY METRICS:
${metrics}

Please re-orient toward these objectives.`;
  }

  /**
   * Get the latest goal summary
   */
  getLatestSummary(): GoalSummary | null {
    return this.latestSummary;
  }

  /**
   * Check if drift detection is possible
   */
  canCheckDrift(): boolean {
    return this.latestSummary !== null && this.latestSummary.coreGoals.length > 0;
  }

  /**
   * Record that a correction was made (for cooldown tracking)
   */
  recordCorrection(): void {
    this.lastCorrectionAt = Date.now();
  }

  private extractUserMessages(messages: AgentMessage[]): string[] {
    return messages
      .filter(m => m.role === "user" && "content" in m)
      .map(m => "content" in m && typeof m.content === "string" ? m.content : "")
      .filter(Boolean);
  }

  private extractAssistantMessages(messages: AgentMessage[]): string[] {
    return messages
      .filter(m => m.role === "assistant" && "content" in m)
      .map(m => "content" in m && typeof m.content === "string" ? m.content : "")
      .filter(Boolean);
  }
}
