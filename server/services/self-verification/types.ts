/**
 * Self-Verification - Types and Constants
 */

export const SELF_VERIFICATION_MARKER = "[SELF-VERIFICATION]";
export const MAX_RETRIES = 5;
export const SKIP_FIRST_N_TURNS = 2; // skip first 2 turns

export interface SessionState {
  originalGoal: string;
  goalInitialized: boolean; // true once originalGoal is set from first user message
  turnCount: number;
  retryCount: number;
  pendingCorrections: Array<{ correction: string; turnNumber: number }>;
  lastVerifiedContent: string; // avoid verifying same content repeatedly
}

export interface VerificationResult {
  passed: boolean;
  reason?: string;
}
