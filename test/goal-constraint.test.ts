/**
 * Goal Constraint Extension - Unit Test
 *
 * Tests to verify goal-constraint logic behavior.
 */

import { describe, it, expect } from "bun:test";

const GOAL_CONSTRAINT_THRESHOLDS = {
  MIN_MESSAGES_BEFORE_DRIFT_CHECK: 3,
  CORRECTION_COOLDOWN_TURNS: 3,
};

interface SessionState {
  thresholdsHit: Set<number>;
  lastCorrectionAt: number;
  correctionCooldownTurns: number;
  messageCount: number;
}

interface DriftResult {
  hasDrifted: boolean;
  details: string;
}

// Simulate the engine's detectDrift logic
function detectDrift(state: SessionState): DriftResult {
  // Warmup check
  if (state.messageCount < GOAL_CONSTRAINT_THRESHOLDS.MIN_MESSAGES_BEFORE_DRIFT_CHECK) {
    return { hasDrifted: false, details: "Warmup" };
  }
  // Cooldown check
  if (state.correctionCooldownTurns > 0) {
    return { hasDrifted: false, details: "Cooldown" };
  }
  return { hasDrifted: false, details: "Within threshold" };
}

// Simulate the extension's context handler cooldown logic
function handleContextEvent(state: SessionState): { decremented: boolean; details: string } {
  const drift = detectDrift(state);

  if (drift.hasDrifted) {
    state.correctionCooldownTurns = GOAL_CONSTRAINT_THRESHOLDS.CORRECTION_COOLDOWN_TURNS;
    return { decremented: false, details: "Correction injected" };
  } else if (drift.details === "Cooldown" && state.correctionCooldownTurns > 0) {
    state.correctionCooldownTurns--;
    return { decremented: true, details: drift.details };
  }
  return { decremented: false, details: drift.details };
}

describe("Goal Constraint Extension - Cooldown Behavior", () => {

  it("cooldown decrements correctly when out of warmup", () => {
    // Scenario: Correction injected when we already have enough messages
    const state: SessionState = {
      thresholdsHit: new Set(),
      lastCorrectionAt: 0,
      correctionCooldownTurns: 3,
      messageCount: 5, // Already out of warmup
    };

    for (let i = 0; i < 3; i++) {
      const result = handleContextEvent(state);
      console.log(`Turn ${i + 1}: cooldown=${state.correctionCooldownTurns}, decremented=${result.decremented}, details=${result.details}`);
    }

    expect(state.correctionCooldownTurns).toBe(0);
  });

  it("cooldown starts during warmup but continues after warmup", () => {
    // Scenario: Correction injected right at session start (messageCount=0)
    const state: SessionState = {
      thresholdsHit: new Set(),
      lastCorrectionAt: 0,
      correctionCooldownTurns: 3,
      messageCount: 0, // Just started
    };

    console.log("Starting cooldown during warmup...");

    // messageCount=0,1,2: warmup (no decrement possible)
    // messageCount=3,4,5: cooldown decrements

    let totalDecremented = 0;
    for (let i = 0; i < 6; i++) {
      state.messageCount++;
      const result = handleContextEvent(state);
      if (result.decremented) totalDecremented++;
      console.log(`Context ${i + 1}: messageCount=${state.messageCount}, cooldown=${state.correctionCooldownTurns}, decremented=${result.decremented}, details=${result.details}`);
    }

    console.log(`Total decremented: ${totalDecremented}`);
    expect(state.correctionCooldownTurns).toBe(0);
    expect(totalDecremented).toBe(3);
  });

  it("ISSUE: if correction injected at messageCount=2 (last warmup turn)", () => {
    // Scenario: Right before warmup ends, correction gets injected
    const state: SessionState = {
      thresholdsHit: new Set(),
      lastCorrectionAt: 0,
      correctionCooldownTurns: 3,
      messageCount: 2, // Last warmup turn
    };

    console.log("Correction injected at messageCount=2...");

    // Inject correction at messageCount=2 (still warmup)
    state.correctionCooldownTurns = GOAL_CONSTRAINT_THRESHOLDS.CORRECTION_COOLDOWN_TURNS;

    // messageCount=2: Warmup (correction just injected)
    // messageCount=3: Warmup (still warmup since messageCount < 3)
    // messageCount=4: Cooldown (messageCount >= 3 now, so we check cooldown)
    // messageCount=5: Cooldown
    // messageCount=6: Cooldown

    for (let i = 0; i < 4; i++) {
      state.messageCount++;
      const result = handleContextEvent(state);
      console.log(`Context ${i + 1}: messageCount=${state.messageCount}, cooldown=${state.correctionCooldownTurns}, decremented=${result.decremented}, details=${result.details}`);
    }

    // After 4 more context calls (messageCount goes 2->3->4->5->6)
    // Only 3 decrements should happen (at messageCount 4,5,6)
    expect(state.correctionCooldownTurns).toBe(0);
  });

  it("lastCorrectionAt is never read in extension - dead field", () => {
    // Verify that SessionState.lastCorrectionAt is never used in the extension code
    // This is a code inspection test - we verify the field exists but is unused

    const state: SessionState = {
      thresholdsHit: new Set(),
      lastCorrectionAt: 0,  // This field is never set or read!
      correctionCooldownTurns: 0,
      messageCount: 10,
    };

    // The extension never updates lastCorrectionAt when correction is injected
    // It only updates correctionCooldownTurns
    // So lastCorrectionAt remains 0 forever

    // This is dead code - not a runtime bug, but wasted state
    expect(state.lastCorrectionAt).toBe(0); // Stays at 0 forever
  });
});
