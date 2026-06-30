/**
 * Agent Manager
 * 负责 subagent 的生命周期管理和并发控制
 */

import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { AgentRecord, AgentOptions, SubagentEvent } from "./types.js";
import { AgentQueue } from "./queue.js";
import { createSubagentSession, handleSubagentEvent, buildSubagentPrompt } from "./agent-runner.js";

// Session state keyed by parent sessionId
interface SessionState {
  queue: AgentQueue;
  records: Map<string, AgentRecord>;
  maxConcurrent: number;
}

const sessionStates = new Map<string, SessionState>();

function getOrCreateSessionState(sessionId: string): SessionState {
  let state = sessionStates.get(sessionId);
  if (!state) {
    state = {
      queue: new AgentQueue(),
      records: new Map(),
      maxConcurrent: 5,
    };
    sessionStates.set(sessionId, state);
  }
  return state;
}

function cleanupSessionState(sessionId: string): void {
  const state = sessionStates.get(sessionId);
  if (!state) return;

  // Unsubscribe all records
  for (const record of state.records.values()) {
    if (record.unsubscribe) {
      record.unsubscribe();
    }
  }

  sessionStates.delete(sessionId);
}

/**
 * Create and start a subagent
 */
export async function createAgent(
  parentSessionId: string,
  task: string,
  type: string,
  cwd: string,
  options?: AgentOptions,
  ctx?: any
): Promise<{ agentId: string; status: string }> {
  const state = getOrCreateSessionState(parentSessionId);
  const agentId = generateAgentId();

  // Build prompt with inheritContext if enabled
  const prompt = ctx
    ? buildSubagentPrompt(task, ctx, options ?? {})
    : task;

  // Create session
  const session = await createSubagentSession(prompt, type, cwd, options);

  // Create record
  const record: AgentRecord = {
    id: agentId,
    session,
    type,
    status: "pending",
    createdAt: Date.now(),
    timeoutMs: options?.timeoutMs,
  };

  // Subscribe to session events
  const unsubscribe = session.subscribe((event: any) => {
    const subagentEvent = event as SubagentEvent;
    handleSubagentEvent(subagentEvent, session, record);
  });
  record.unsubscribe = unsubscribe;

  // Store record
  state.records.set(agentId, record);

  // Enqueue if at capacity, otherwise start immediately
  if (state.queue.size >= state.maxConcurrent) {
    state.queue.enqueue(agentId, record);
    record.status = "pending";
  } else {
    startAgent(record);
  }

  return { agentId, status: record.status };
}

/**
 * Start executing an agent
 */
function startAgent(record: AgentRecord): void {
  record.status = "running";
  // Session is already created and subscribed, just let it run
  // The session.prompt() was called in createSubagentSession
}

/**
 * Get agent result
 */
export function getAgentResult(
  parentSessionId: string,
  agentId: string
): { status: string; messages?: any[]; error?: string } {
  const state = sessionStates.get(parentSessionId);
  if (!state) {
    return { status: "not_found", error: "Session state not found" };
  }

  const record = state.records.get(agentId);
  if (!record) {
    return { status: "not_found", error: "Agent not found" };
  }

  return {
    status: record.status,
    messages: record.result,
    error: record.status === "failed" ? "Agent failed" : undefined,
  };
}

/**
 * Steer a running agent (send message)
 */
export function steerAgent(
  parentSessionId: string,
  agentId: string,
  message: string
): { success: boolean; error?: string } {
  const state = sessionStates.get(parentSessionId);
  if (!state) {
    return { success: false, error: "Session state not found" };
  }

  const record = state.records.get(agentId);
  if (!record) {
    return { success: false, error: "Agent not found" };
  }

  if (record.status !== "running") {
    return { success: false, error: "Agent is not running" };
  }

  // For now, just append to session - steering implementation depends on agent core support
  record.session.prompt(message);
  return { success: true };
}

/**
 * Abort an agent
 */
export function abortAgent(
  parentSessionId: string,
  agentId: string
): { success: boolean; error?: string } {
  const state = sessionStates.get(parentSessionId);
  if (!state) {
    return { success: false, error: "Session state not found" };
  }

  const record = state.records.get(agentId);
  if (!record) {
    return { success: false, error: "Agent not found" };
  }

  record.session.abort();
  record.status = "cancelled";

  // Cleanup
  if (record.unsubscribe) {
    record.unsubscribe();
  }

  state.records.delete(agentId);
  state.queue.remove(agentId);

  // Start next in queue
  processQueue(state);

  return { success: true };
}

/**
 * List all agents for a session
 */
export function listAgents(
  parentSessionId: string
): Array<{ id: string; type: string; status: string; createdAt: number }> {
  const state = sessionStates.get(parentSessionId);
  if (!state) {
    return [];
  }

  return Array.from(state.records.values()).map((record) => ({
    id: record.id,
    type: record.type,
    status: record.status,
    createdAt: record.createdAt,
  }));
}

/**
 * Process queue - start next pending agent
 */
function processQueue(state: SessionState): void {
  while (state.queue.size > 0 && state.records.size < state.maxConcurrent) {
    const next = state.queue.dequeue();
    if (next && state.records.has(next.id)) {
      startAgent(next);
    }
  }
}

/**
 * Handle agent completion - called when agent_end event is received
 */
export function onAgentComplete(parentSessionId: string, agentId: string): void {
  const state = sessionStates.get(parentSessionId);
  if (!state) return;

  const record = state.records.get(agentId);
  if (!record) return;

  // Remove from records
  state.records.delete(agentId);

  // Process queue for next agent
  processQueue(state);

  // If no more agents, cleanup state
  if (state.records.size === 0 && state.queue.size === 0) {
    // Keep state around for a bit in case of late events
    setTimeout(() => {
      const s = sessionStates.get(parentSessionId);
      if (s && s.records.size === 0 && s.queue.size === 0) {
        cleanupSessionState(parentSessionId);
      }
    }, 5000);
  }
}

/**
 * Cleanup all agents for a session
 */
export function cleanupAgents(parentSessionId: string): void {
  cleanupSessionState(parentSessionId);
}

/**
 * Generate unique agent ID
 */
function generateAgentId(): string {
  return `agent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
