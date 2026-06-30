/**
 * Fleet View
 * Krebs gateway doesn't have a terminal UI, so this is a no-op
 * The fleet state is managed through agent-manager and can be accessed
 * via the agent tool's output
 */

import type { AgentRecord } from "./types.js";

/**
 * FleetView provides a way to view running agents
 * In Krebs, this is handled via the agent tool output rather than a separate UI
 */
export class FleetView {
  private parentSessionId: string;

  constructor(parentSessionId: string) {
    this.parentSessionId = parentSessionId;
  }

  /**
   * Get current fleet status
   */
  getStatus(): FleetStatus {
    // This would need to be connected to agent-manager
    // For now, return empty status
    return {
      totalAgents: 0,
      running: 0,
      pending: 0,
      completed: 0,
      failed: 0,
      agents: [],
    };
  }

  /**
   * Render fleet view as text (for tool output)
   */
  render(): string {
    const status = this.getStatus();
    if (status.totalAgents === 0) {
      return "No active agents";
    }

    const lines = ["## Fleet Status", ""];
    lines.push(`Total: ${status.totalAgents} | Running: ${status.running} | Pending: ${status.pending} | Done: ${status.completed} | Failed: ${status.failed}`);
    lines.push("");

    if (status.agents.length > 0) {
      lines.push("| Agent ID | Type | Status | Created |");
      lines.push("|----------|------|--------|---------|");

      for (const agent of status.agents) {
        const age = Math.round((Date.now() - agent.createdAt) / 1000);
        lines.push(`| ${agent.id} | ${agent.type} | ${agent.status} | ${age}s ago |`);
      }
    }

    return lines.join("\n");
  }
}

export interface FleetStatus {
  totalAgents: number;
  running: number;
  pending: number;
  completed: number;
  failed: number;
  agents: Array<{
    id: string;
    type: string;
    status: string;
    createdAt: number;
  }>;
}

/**
 * Create fleet view for a session
 */
export function createFleetView(parentSessionId: string): FleetView {
  return new FleetView(parentSessionId);
}
