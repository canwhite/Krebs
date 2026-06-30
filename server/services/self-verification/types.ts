/**
 * Self-Verification - Types and Constants
 */

export const SELF_VERIFICATION_MARKER = "[SELF-VERIFICATION]";
export const MAX_RETRIES = 5;
export const SKIP_FIRST_N_TURNS = 2; // 跳过前两次 turn

export interface SessionState {
  originalGoal: string;
  turnCount: number;
  retryCount: number;
  pendingCorrection: string | null;
  lastVerifiedContent: string; // 避免重复验证同一个内容
}

export interface VerificationResult {
  passed: boolean;
  reason?: string;
}
