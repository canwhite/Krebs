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

const sessionStates = new Map<string, SessionState>();

function getSessionState(sessionId: string): SessionState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      originalGoal: "",
      goalInitialized: false,
      turnCount: 0,
      retryCount: 0,
      pendingCorrection: null,
      pendingCorrectionTurn: 0,
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

    // Clear pending correction on new user message
    if (state.pendingCorrection !== null) {
      console.log(`[SelfVerification] New user message, clearing pending`);
      state.pendingCorrection = null;
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

    // If there's a pending correction, don't verify again until it's injected
    if (state.pendingCorrection) {
      console.log(`[SelfVerification] Pending correction exists, will inject in context`);
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

      // Set pending correction with retry number for tracking
      state.pendingCorrection = `${SELF_VERIFICATION_MARKER}-${state.retryCount} ${verification.reason}\nPlease correct and continue.`;
      state.pendingCorrectionTurn = state.turnCount;
    } else {
      console.log(`[SelfVerification] Verification passed`);
    }
  });

  // 3. context event: inject correction message
  api.on("context", async (event: ContextEvent, ctx): Promise<ContextEventResult> => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = getSessionState(sessionId);

    // Safety: if correction pending for too many turns, clear it
    if (state.pendingCorrection && state.turnCount - state.pendingCorrectionTurn > 5) {
      console.log(`[SelfVerification] Correction pending too long, clearing`);
      state.pendingCorrection = null;
    }

    // If there's a pending correction to inject
    if (state.pendingCorrection) {
      // Filter out previous correction messages to avoid loops
      event.messages = event.messages.filter((m) => !isSelfVerificationMessage(m));

      // Prepend correction message
      event.messages.unshift({
        role: "user",
        content: state.pendingCorrection,
        id: "self-verification-correction",
      } as any);

      console.log(`[SelfVerification] Injected correction via context`);
      state.pendingCorrection = null;

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
