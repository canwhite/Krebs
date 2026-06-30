/**
 * Goal Constraint Extension
 *
 * Hooks into the context event to:
 * 1. Generate goal summaries at 25%, 40%, 55% token thresholds
 * 2. Detect drift from core goals using BM25 hybrid scoring
 * 3. Inject correction messages when drift is detected
 */

import type { ExtensionAPI, ContextEvent } from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

/** Context event result type (not re-exported from earendil-works pi-coding-agent) */
type ContextEventResult = { messages?: AgentMessage[] };
import { GoalConstraintEngine } from "../../../server/services/goal-constraint/engine.js";
import { GOAL_CONSTRAINT_THRESHOLDS, type SessionState } from "../../../server/services/goal-constraint/types.js";
import { goalStorage } from "../../../server/services/goal-constraint/storage.js";

// Engine and state per session
const engines = new Map<string, GoalConstraintEngine>();
const sessionStates = new Map<string, SessionState>();

function getOrCreateEngine(sessionId: string, ctx: any): GoalConstraintEngine {
  if (!engines.has(sessionId)) {
    engines.set(sessionId, new GoalConstraintEngine(sessionId, ctx));
  }
  return engines.get(sessionId)!;
}

function getSessionState(sessionId: string): SessionState {
  if (!sessionStates.has(sessionId)) {
    // Check storage for previously hit thresholds
    const storedStatus = goalStorage.getThresholdStatus(sessionId);
    sessionStates.set(sessionId, {
      thresholdsHit: new Set([
        ...(storedStatus[25] ? [25] : []),
        ...(storedStatus[40] ? [40] : []),
        ...(storedStatus[55] ? [55] : []),
      ]),
      lastCorrectionAt: 0,
      correctionCooldownTurns: 0,
      messageCount: 0,
    });
  }
  return sessionStates.get(sessionId)!;
}

function cleanupEngine(sessionId: string) {
  engines.delete(sessionId);
  sessionStates.delete(sessionId);
}

function isCorrectionMessage(msg: any): boolean {
  if (!msg.content) return false;
  const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
  return content.includes("[GOAL CONSTRAINT]");
}

export default function (api: ExtensionAPI) {
  api.on("context", async (event, ctx): Promise<ContextEventResult> => {
    const sessionId = ctx.sessionManager.getSessionId();
    const engine = getOrCreateEngine(sessionId, ctx);

    // Skip correction messages in analysis
    const messages = event.messages.filter(m => !isCorrectionMessage(m));

    const state = getSessionState(sessionId);
    state.messageCount++;

    // 1. Token threshold detection → generate summary
    const threshold = engine.checkTokenThresholds(state);
    if (threshold !== null) {
      const summary = await engine.generateGoalSummary(threshold, messages);

      // Update thresholdsHit to prevent duplicate triggers
      state.thresholdsHit.add(threshold);

      // Persist summary and threshold hit to storage
      await goalStorage.saveGoalSummary(summary);
      goalStorage.markThresholdHit(sessionId, threshold);

      ctx.ui?.notify(
        `Goal Summary @ ${threshold}%: ${summary.coreGoals.length} goals extracted`,
        "info"
      );
    }

    // 2. Drift detection (with warmup + cooldown protection)
    if (engine.canCheckDrift()) {
      const drift = engine.detectDrift(messages, {
        correctionCooldownTurns: state.correctionCooldownTurns,
        messageCount: state.messageCount
      });

      if (drift.hasDrifted) {
        const summary = engine.getLatestSummary();
        if (summary) {
          const correction = engine.generateCorrectionMessage(drift, summary);

          // Inject correction message with marker for filtering
          event.messages.unshift({
            role: "user",
            content: correction,
            id: GOAL_CONSTRAINT_THRESHOLDS.CORRECTION_MESSAGE_ID
          } as any);

          engine.recordCorrection();
          state.correctionCooldownTurns = GOAL_CONSTRAINT_THRESHOLDS.CORRECTION_COOLDOWN_TURNS;

          ctx.ui?.notify(
            `Drift detected (score: ${drift.hybridScore.toFixed(2)}), correction injected`,
            "warning"
          );
        }
      } else if (drift.details === "Cooldown" && state.correctionCooldownTurns > 0) {
        // Decrement cooldown in extension (not in engine - engine modifies local copy)
        state.correctionCooldownTurns--;
      }
    }

    // IMPORTANT: Return { messages } so framework applies modifications
    return { messages: event.messages };
  });

  api.on("session_shutdown", (_, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    if (sessionId) {
      cleanupEngine(sessionId);
    }
  });
}
