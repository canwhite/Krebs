/**
 * Self-Verification Extension
 *
 * Verifies Agent's response at turn_end.
 * On failure, injects a correction message to have Agent self-correct.
 */

import type {
  ExtensionAPI,
  TurnEndEvent,
  BeforeAgentStartEvent,
  ContextEvent,
} from "@earendil-works/pi-coding-agent";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

/** Context event result type (not re-exported from earendil-works pi-coding-agent) */
type ContextEventResult = { messages?: AgentMessage[] };
import {
  MAX_RETRIES,
  SKIP_FIRST_N_TURNS,
  SELF_VERIFICATION_MARKER,
  type SessionState,
} from "../../../server/services/self-verification/types.js";
import { verifyResult } from "../../../server/services/self-verification/llm.js";

interface CorrectionItem {
  correction: string;
  turnNumber: number;
}

const sessionStates = new Map<string, SessionState>();

function getSessionState(sessionId: string): SessionState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      originalGoal: "",
      goalInitialized: false,
      turnCount: 0,
      retryCount: 0,
      pendingCorrections: [],
      lastVerifiedContent: "",
    });
  }
  return sessionStates.get(sessionId)!;
}

function getLastAssistantContent(message: any): string {
  if (!message.content) return "";
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((c: any) => c.type === "text")
    .map((c: any) => c.text)
    .join("");
}

function isSelfVerificationMessage(msg: any): boolean {
  if (!msg.content) return false;
  const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
  return content.includes(SELF_VERIFICATION_MARKER);
}

export default function (api: ExtensionAPI) {
  // 1. Capture original goal (only on first message, not on each before_agent_start)
  api.on("before_agent_start", (event: BeforeAgentStartEvent, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = getSessionState(sessionId);

    // Only initialize goal once from the first user message
    if (!state.goalInitialized) {
      state.originalGoal = event.prompt;
      state.goalInitialized = true;
      console.log(`[SelfVerification] Goal initialized: ${event.prompt.substring(0, 50)}...`);
    }

    // Clear pending corrections on new user message (new topic = fresh start)
    if (state.pendingCorrections.length > 0) {
      console.log(`[SelfVerification] New user message, clearing ${state.pendingCorrections.length} pending corrections`);
      state.pendingCorrections = [];
    }

    return {};
  });

  // 2. Verify after each turn (skip first N turns)
  api.on("turn_end", async (event: TurnEndEvent, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = getSessionState(sessionId);

    state.turnCount++;
    console.log(`[SelfVerification] Turn ${state.turnCount} ended`);

    // Skip first N turns
    if (state.turnCount <= SKIP_FIRST_N_TURNS) {
      console.log(`[SelfVerification] Skipping (turn ${state.turnCount} <= ${SKIP_FIRST_N_TURNS})`);
      return;
    }

    // If there are pending corrections, don't verify again until one is injected
    if (state.pendingCorrections.length > 0) {
      console.log(`[SelfVerification] Pending corrections exist (${state.pendingCorrections.length}), will inject in context`);
      // Still update lastVerifiedContent to avoid false positive when corrections are eventually injected
      const result = getLastAssistantContent(event.message);
      if (result) {
        state.lastVerifiedContent = result;
      }
      return;
    }

    // Max retries reached
    if (state.retryCount >= MAX_RETRIES) {
      console.log(`[SelfVerification] Max corrections (${MAX_RETRIES}) reached`);
      return;
    }

    // Get this turn's result
    const result = getLastAssistantContent(event.message);
    if (!result) {
      console.log(`[SelfVerification] No result to verify`);
      return;
    }

    // Don't verify the same content repeatedly
    if (result === state.lastVerifiedContent) {
      console.log(`[SelfVerification] Same content, skipping`);
      return;
    }
    state.lastVerifiedContent = result;

    // Call LLM to verify
    const verification = await verifyResult(result, state.originalGoal, ctx);

    if (!verification.passed) {
      state.retryCount++;
      console.log(`[SelfVerification] Correction ${state.retryCount}/${MAX_RETRIES}: ${verification.reason}`);

      // Queue the correction instead of overwriting
      const correctionItem: CorrectionItem = {
        correction: `${SELF_VERIFICATION_MARKER}-${state.retryCount} ${verification.reason}\nPlease correct and continue.`,
        turnNumber: state.turnCount,
      };
      state.pendingCorrections.push(correctionItem);
    } else {
      console.log(`[SelfVerification] Verification passed`);
    }
  });

  // 3. context event: inject correction message
  api.on("context", async (event: ContextEvent, ctx): Promise<ContextEventResult> => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = getSessionState(sessionId);

    // Safety: if oldest correction has been pending for too many turns, clear it
    const oldestCorrection = state.pendingCorrections[0];
    if (oldestCorrection && state.turnCount - oldestCorrection.turnNumber > 5) {
      console.log(`[SelfVerification] Correction pending too long, clearing`);
      state.pendingCorrections.shift();
    }

    // If there are pending corrections to inject
    if (state.pendingCorrections.length > 0) {
      // Filter out previous correction messages to avoid loops
      event.messages = event.messages.filter((m) => !isSelfVerificationMessage(m));

      // Inject one correction from the front of the queue
      const correctionItem = state.pendingCorrections.shift()!;
      event.messages.unshift({
        role: "user",
        content: correctionItem.correction,
        id: "self-verification-correction",
      } as any);

      console.log(`[SelfVerification] Injected correction via context (${state.pendingCorrections.length} remaining)`);

      return { messages: event.messages };
    }

    return {};
  });

  // 4. Cleanup on session end
  api.on("session_shutdown", (_, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    if (sessionId) {
      sessionStates.delete(sessionId);
    }
  });
}
