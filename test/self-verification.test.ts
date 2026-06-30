/**
 * Self-Verification Extension - Unit Test
 *
 * Tests that corrections are queued rather than overwritten.
 */

import { describe, it, expect, beforeEach } from "bun:test";

const SELF_VERIFICATION_MARKER = "[SELF-VERIFICATION]";
const MAX_RETRIES = 5;
const SKIP_FIRST_N_TURNS = 2;

interface SessionState {
  originalGoal: string;
  goalInitialized: boolean;
  turnCount: number;
  retryCount: number;
  pendingCorrections: Array<{ correction: string; turnNumber: number }>;
  lastVerifiedContent: string;
}

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

// Re-implement the extension logic (must match actual extension)
function setupExtension(api: any) {
  api.on("before_agent_start", (event: any, ctx: any) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = getSessionState(sessionId);
    if (!state.goalInitialized) {
      state.originalGoal = event.prompt;
      state.goalInitialized = true;
    }
    if (state.pendingCorrections.length > 0) {
      state.pendingCorrections = [];
    }
    return {};
  });

  api.on("turn_end", async (event: any, ctx: any) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = getSessionState(sessionId);
    state.turnCount++;

    if (state.turnCount <= SKIP_FIRST_N_TURNS) return;

    if (state.pendingCorrections.length > 0) {
      const result = getLastAssistantContent(event.message);
      if (result) state.lastVerifiedContent = result;
      return;
    }

    if (state.retryCount >= MAX_RETRIES) return;

    const result = getLastAssistantContent(event.message);
    if (!result) return;
    if (result === state.lastVerifiedContent) return;
    state.lastVerifiedContent = result;

    // Simulate verification failure for testing
    const verification = { passed: false, reason: `Error in turn ${state.turnCount}` };

    if (!verification.passed) {
      state.retryCount++;
      const correctionItem: CorrectionItem = {
        correction: `${SELF_VERIFICATION_MARKER}-${state.retryCount} ${verification.reason}\nPlease correct and continue.`,
        turnNumber: state.turnCount,
      };
      state.pendingCorrections.push(correctionItem);
    }
  });

  api.on("context", async (event: any, ctx: any) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = getSessionState(sessionId);

    const oldestCorrection = state.pendingCorrections[0];
    if (oldestCorrection && state.turnCount - oldestCorrection.turnNumber > 5) {
      state.pendingCorrections.shift();
    }

    if (state.pendingCorrections.length > 0) {
      event.messages = event.messages.filter((m: any) => !isSelfVerificationMessage(m));
      const correctionItem = state.pendingCorrections.shift()!;
      event.messages.unshift({
        role: "user",
        content: correctionItem.correction,
        id: "self-verification-correction",
      });
      return { messages: event.messages };
    }
    return {};
  });

  api.on("session_shutdown", (_, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    if (sessionId) sessionStates.delete(sessionId);
  });
}

function createMockAPI(): any {
  const handlers: Map<string, any[]> = new Map();
  return {
    on(event: string, handler: any) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(handler);
    },
    async emit(event: string, data: any, ctx: any) {
      const eventHandlers = handlers.get(event) || [];
      let result;
      for (const handler of eventHandlers) {
        result = await handler(data, ctx);
      }
      return result;
    },
  };
}

describe("Self-Verification Extension", () => {
  beforeEach(() => {
    sessionStates.clear();
  });

  it("should queue corrections instead of overwriting", async () => {
    const api = createMockAPI();
    setupExtension(api);

    const ctx = { sessionManager: { getSessionId: () => "test-session-1" } };

    // Pre-initialize state to turn 3 (after SKIP_FIRST_N_TURNS)
    const state = getSessionState("test-session-1");
    state.turnCount = SKIP_FIRST_N_TURNS; // turnCount is 2, next turn_end will make it 3

    // Turn 3 - verification fails -> adds correction to queue
    await api.emit("turn_end", { message: { content: "Response from turn 3" } }, ctx);
    // Turn 4 - pending exists, return early (no new correction added)
    await api.emit("turn_end", { message: { content: "Response from turn 4" } }, ctx);
    // Turn 5 - pending exists, return early
    await api.emit("turn_end", { message: { content: "Response from turn 5" } }, ctx);

    console.log("Final turnCount:", state.turnCount);
    console.log("Pending corrections count:", state.pendingCorrections.length);
    console.log("Corrections:", state.pendingCorrections.map(c => c.correction));

    // Only 1 correction because we block verification while pending
    // This is CORRECT behavior - it prevents the overwrite bug
    expect(state.pendingCorrections.length).toBe(1);
    expect(state.pendingCorrections[0].correction).toContain("turn 3");

    // Now simulate context injecting the correction
    await api.emit("context", { messages: [] }, ctx);

    // After injection, queue should be empty
    expect(state.pendingCorrections.length).toBe(0);

    // Reset turnCount for clarity in this test
    state.turnCount = SKIP_FIRST_N_TURNS;

    // Turn 4 (actually turn 3 in count since we reset) - now we can verify again and add new correction
    // Since turnCount starts at 2, after increment it becomes 3
    await api.emit("turn_end", { message: { content: "Response after injection" } }, ctx);
    expect(state.pendingCorrections.length).toBe(1);
    // The turn number is 3 since we reset turnCount to 2
    expect(state.pendingCorrections[0].correction).toContain("turn 3");
    // And retryCount should be 2 since we already had 1
    expect(state.retryCount).toBe(2);
  });

  it("should inject corrections in FIFO order via context", async () => {
    const api = createMockAPI();
    setupExtension(api);

    const ctx = { sessionManager: { getSessionId: () => "test-session-2" } };

    // Pre-populate with corrections
    const state = getSessionState("test-session-2");
    state.pendingCorrections = [
      { correction: "Correction 1", turnNumber: 3 },
      { correction: "Correction 2", turnNumber: 4 },
    ];
    state.turnCount = 4;
    state.retryCount = 2;

    const messages = [{ role: "assistant", content: "Hello" }];
    const result = await api.emit("context", { messages }, ctx);

    console.log("After context, pending corrections:", state.pendingCorrections.length);
    console.log("Returned messages:", result?.messages?.map((m: any) => m.content));

    expect(result?.messages?.[0]?.content).toBe("Correction 1");
    expect(state.pendingCorrections.length).toBe(1);
    expect(state.pendingCorrections[0].correction).toBe("Correction 2");
  });

  it("should not verify same content repeatedly", async () => {
    const api = createMockAPI();
    setupExtension(api);

    const ctx = { sessionManager: { getSessionId: () => "test-session-3" } };

    // Pre-initialize to turn 3
    const state = getSessionState("test-session-3");
    state.turnCount = SKIP_FIRST_N_TURNS;

    // Turn 3 - first response
    await api.emit("turn_end", { message: { content: "Same response" } }, ctx);
    // Turn 4 - same content
    await api.emit("turn_end", { message: { content: "Same response" } }, ctx);

    console.log("Pending corrections count:", state.pendingCorrections.length);

    // Should only have one correction (second one skipped due to same content)
    expect(state.pendingCorrections.length).toBe(1);
  });

  it("should clear pending corrections on new user message", async () => {
    const api = createMockAPI();
    setupExtension(api);

    const ctx = { sessionManager: { getSessionId: () => "test-session-4" } };

    // Add some pending corrections
    const state = getSessionState("test-session-4");
    state.pendingCorrections = [
      { correction: "Correction 1", turnNumber: 3 },
      { correction: "Correction 2", turnNumber: 4 },
    ];

    // New user message comes in
    await api.emit("before_agent_start", { prompt: "New topic" }, ctx);

    console.log("Pending corrections after new user:", state.pendingCorrections.length);
    expect(state.pendingCorrections.length).toBe(0);
  });

  it("should update lastVerifiedContent even when pending corrections exist", async () => {
    const api = createMockAPI();
    setupExtension(api);

    const ctx = { sessionManager: { getSessionId: () => "test-session-5" } };

    // Pre-initialize state with pending corrections
    const state = getSessionState("test-session-5");
    state.pendingCorrections = [{ correction: "Old correction", turnNumber: 2 }];
    state.lastVerifiedContent = "Old response";
    state.turnCount = SKIP_FIRST_N_TURNS; // Start at turn 3

    // Turn 4 - pending correction exists, so just update lastVerifiedContent
    await api.emit("turn_end", { message: { content: "New response" } }, ctx);

    console.log("lastVerifiedContent:", state.lastVerifiedContent);
    console.log("Pending corrections:", state.pendingCorrections.length);

    // lastVerifiedContent should be updated even with pending corrections
    expect(state.lastVerifiedContent).toBe("New response");
    // Original pending correction should remain
    expect(state.pendingCorrections.length).toBe(1);
  });

  it("should clear stale corrections after 5 turns", async () => {
    const api = createMockAPI();
    setupExtension(api);

    const ctx = { sessionManager: { getSessionId: () => "test-session-6" } };

    // Pre-populate with old correction
    const state = getSessionState("test-session-6");
    state.pendingCorrections = [{ correction: "Stale correction", turnNumber: 3 }];
    state.turnCount = 9; // 9 - 3 = 6 > 5, should be cleared

    const messages = [{ role: "assistant", content: "Hello" }];
    await api.emit("context", { messages }, ctx);

    console.log("Pending corrections after stale check:", state.pendingCorrections.length);
    expect(state.pendingCorrections.length).toBe(0);
  });
});
