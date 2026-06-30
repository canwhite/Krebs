/**
 * Group Join
 * 等待多个 agent 完成并收集结果
 */

import type { AgentResult, GroupJoinOptions } from "./types.js";

type CompletionCallback = (results: Map<string, AgentResult>) => void;

/**
 * GroupJoin manages waiting for multiple agents to complete
 */
export class GroupJoin {
  private parentSessionId: string;
  private pendingAgents: Set<string>;
  private results: Map<string, AgentResult>;
  private timeoutMs?: number;
  private onComplete?: CompletionCallback;
  private timer?: ReturnType<typeof setTimeout>;
  private isResolved: boolean = false;

  constructor(parentSessionId: string, options: GroupJoinOptions) {
    this.parentSessionId = parentSessionId;
    this.pendingAgents = new Set(options.agentIds);
    this.results = new Map();
    this.timeoutMs = options.timeoutMs;
    this.onComplete = options.onComplete;
  }

  /**
   * Start waiting for agents
   */
  start(checkFn: (agentId: string) => AgentResult | null): Promise<Map<string, AgentResult>> {
    return new Promise((resolve) => {
      // Set timeout
      if (this.timeoutMs) {
        this.timer = setTimeout(() => {
          this.handleTimeout();
          resolve(this.results);
        }, this.timeoutMs);
      }

      // Check agents periodically
      this.checkAgents(checkFn, resolve);
    });
  }

  /**
   * Check status of all pending agents
   */
  private checkAgents(
    checkFn: (agentId: string) => AgentResult | null,
    resolve: (results: Map<string, AgentResult>) => void
  ): void {
    if (this.isResolved) return;

    for (const agentId of this.pendingAgents) {
      const result = checkFn(agentId);

      if (result) {
        this.results.set(agentId, result);
        this.pendingAgents.delete(agentId);
      } else if (this.isAgentDone(agentId, checkFn)) {
        // Agent completed with no result (may have been cleaned up)
        this.results.set(agentId, {
          agentId,
          status: "unknown",
        });
        this.pendingAgents.delete(agentId);
      }
    }

    // Check if all done
    if (this.pendingAgents.size === 0) {
      this.handleComplete();
      resolve(this.results);
      return;
    }

    // Schedule next check
    setTimeout(() => {
      this.checkAgents(checkFn, resolve);
    }, 1000);
  }

  /**
   * Check if an agent is done (helper for checkAgents)
   */
  private isAgentDone(agentId: string, checkFn: (agentId: string) => AgentResult | null): boolean {
    // Try to get result - if it throws or returns undefined, agent might be done
    try {
      const result = checkFn(agentId);
      return result !== null;
    } catch {
      return true;
    }
  }

  /**
   * Handle all agents completing
   */
  private handleComplete(): void {
    if (this.isResolved) return;
    this.isResolved = true;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    if (this.onComplete) {
      this.onComplete(this.results);
    }
  }

  /**
   * Handle timeout
   */
  private handleTimeout(): void {
    if (this.isResolved) return;
    this.isResolved = true;

    // Mark remaining agents as timed out
    for (const agentId of this.pendingAgents) {
      this.results.set(agentId, {
        agentId,
        status: "timeout",
        error: "Group join timed out",
      });
    }

    this.handleComplete();
  }

  /**
   * Cancel waiting
   */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.isResolved = true;
  }

  /**
   * Get current results
   */
  getResults(): Map<string, AgentResult> {
    return new Map(this.results);
  }

  /**
   * Get pending count
   */
  getPendingCount(): number {
    return this.pendingAgents.size;
  }
}

/**
 * Wait for multiple agents to complete
 */
export async function waitForAgents(
  parentSessionId: string,
  agentIds: string[],
  timeoutMs?: number,
  onComplete?: (results: Map<string, AgentResult>) => void
): Promise<Map<string, AgentResult>> {
  // This is a placeholder - actual implementation would need
  // access to the agent manager to check status
  // The actual usage would be via the agent tool
  return new Map();
}

/**
 * Check if all agents in a group are done
 */
export function areAllDone(records: Map<string, { status: string }>): boolean {
  for (const record of records.values()) {
    if (record.status === "pending" || record.status === "running") {
      return false;
    }
  }
  return true;
}

/**
 * Get summary of group results
 */
export function summarizeResults(results: Map<string, AgentResult>): {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  pending: number;
} {
  let succeeded = 0;
  let failed = 0;
  let cancelled = 0;
  let pending = 0;

  for (const result of results.values()) {
    switch (result.status) {
      case "done":
        succeeded++;
        break;
      case "failed":
        failed++;
        break;
      case "cancelled":
        cancelled++;
        break;
      case "pending":
      case "running":
        pending++;
        break;
    }
  }

  return {
    total: results.size,
    succeeded,
    failed,
    cancelled,
    pending,
  };
}
