/**
 * Subagent Extension
 * Krebs optimized subagent implementation
 */

import { Type } from "@sinclair/typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import {
  createAgent,
  getAgentResult,
  steerAgent,
  abortAgent,
  cleanupAgents,
} from "./agent-manager.js";
import { SubagentScheduler } from "./scheduler.js";
import { loadCustomAgents } from "./custom-agents.js";
import { createFleetView } from "./fleet-view.js";

// Task record for task management
interface TaskRecord {
  id: string;
  name: string;
  description?: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  agentId?: string;
  result?: any;
  createdAt: number;
}

// Scheduler instances by session
const schedulers = new Map<string, SubagentScheduler>();
// Task records by session
const taskRecords = new Map<string, Map<string, TaskRecord>>();

/**
 * Get or create scheduler for session
 */
function getScheduler(ctx: ExtensionContext): SubagentScheduler {
  const sessionId = (ctx.sessionManager as any).getSessionId();
  let scheduler = schedulers.get(sessionId);
  if (!scheduler) {
    scheduler = new SubagentScheduler(sessionId, async (task, options) => {
      const result = await createAgent(
        sessionId,
        task,
        options?.type ?? "general-purpose",
        options?.cwd ?? ctx.cwd,
        options,
        ctx
      );
      return result.agentId;
    });
    schedulers.set(sessionId, scheduler);
  }
  return scheduler;
}

/**
 * Get task record map for session
 */
function getTaskMap(ctx: ExtensionContext): Map<string, TaskRecord> {
  const sessionId = (ctx.sessionManager as any).getSessionId();
  let map = taskRecords.get(sessionId);
  if (!map) {
    map = new Map();
    taskRecords.set(sessionId, map);
  }
  return map;
}

// Tool names
const SUBAGENT_TOOL_NAME = "Agent";
const GET_RESULT_TOOL_NAME = "get_subagent_result";
const STEER_TOOL_NAME = "steer_subagent";
const TASK_CREATE_TOOL_NAME = "TaskCreate";
const TASK_LIST_TOOL_NAME = "TaskList";
const TASK_GET_TOOL_NAME = "TaskGet";
const TASK_UPDATE_TOOL_NAME = "TaskUpdate";
const TASK_EXECUTE_TOOL_NAME = "TaskExecute";
const FLEET_VIEW_TOOL_NAME = "FleetView";
const SCHEDULE_TOOL_NAME = "Schedule";
const CANCEL_SCHEDULE_TOOL_NAME = "CancelSchedule";
const LOAD_CUSTOM_AGENTS_TOOL_NAME = "LoadCustomAgents";
const CLEANUP_AGENTS_TOOL_NAME = "CleanupAgents";

/**
 * Helper to create tool result
 */
function toolResult(content: string, details?: any): AgentToolResult<any> {
  return {
    content: [{ type: "text" as const, text: content }],
    details: details ?? {},
  };
}

/**
 * Register all subagent tools
 */
export default function registerSubagentExtension(pi: ExtensionAPI): void {
  // ========== Agent Tool ==========

  pi.registerTool(defineTool({
    name: SUBAGENT_TOOL_NAME,
    label: "Agent",
    description: "Start a subagent to perform tasks",
    promptSnippet: "Launch autonomous sub-agents for complex multi-step tasks",
    parameters: Type.Object({
      name: Type.Optional(Type.String()),
      task: Type.String({ description: "Task description for the agent" }),
      type: Type.Optional(Type.String({ description: "Agent type: general-purpose or research" })),
      background: Type.Optional(Type.Boolean({ description: "Run in background" })),
      inheritContext: Type.Optional(Type.Boolean({ description: "Include parent conversation context" })),
      maxContextMessages: Type.Optional(Type.Number({ description: "Max parent messages to include" })),
      timeoutMs: Type.Optional(Type.Number({ description: "Timeout in milliseconds" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<AgentToolResult<any>> {
      const sessionId = (ctx.sessionManager as any).getSessionId();
      const cwd = (params as any).cwd ?? ctx.cwd;

      const result = await createAgent(
        sessionId,
        params.task,
        params.type ?? "general-purpose",
        cwd,
        {
          inheritContext: params.inheritContext ?? false,
          maxContextMessages: params.maxContextMessages ?? 10,
          timeoutMs: params.timeoutMs ?? 300000,
        },
        ctx
      );

      return toolResult(result.agentId, { agentId: result.agentId, status: result.status });
    },
  }));

  // ========== Get Subagent Result ==========

  pi.registerTool(defineTool({
    name: GET_RESULT_TOOL_NAME,
    label: "Get Subagent Result",
    description: "Get the result of a subagent",
    parameters: Type.Object({
      agentId: Type.String({ description: "Agent ID" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const sessionId = (ctx.sessionManager as any).getSessionId();
      const result = getAgentResult(sessionId, params.agentId);
      return toolResult(JSON.stringify(result), result);
    },
  }));

  // ========== Steer Subagent ==========

  pi.registerTool(defineTool({
    name: STEER_TOOL_NAME,
    label: "Steer Subagent",
    description: "Send a message to a running subagent",
    parameters: Type.Object({
      agentId: Type.String({ description: "Agent ID" }),
      message: Type.String({ description: "Message to send" }),
      streamingBehavior: Type.Optional(Type.String({ enum: ["steer", "followUp"] })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const sessionId = (ctx.sessionManager as any).getSessionId();
      const result = steerAgent(sessionId, params.agentId, params.message);
      return toolResult(JSON.stringify(result), result);
    },
  }));

  // ========== Task Create ==========

  pi.registerTool(defineTool({
    name: TASK_CREATE_TOOL_NAME,
    label: "Task Create",
    description: "Create a task",
    parameters: Type.Object({
      name: Type.String({ description: "Task name" }),
      description: Type.Optional(Type.String({ description: "Task description" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const taskMap = getTaskMap(ctx);
      const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const record: TaskRecord = {
        id,
        name: params.name,
        description: params.description,
        status: "pending",
        createdAt: Date.now(),
      };

      taskMap.set(id, record);

      return toolResult(JSON.stringify({ taskId: id, status: "pending" }), { taskId: id });
    },
  }));

  // ========== Task List ==========

  pi.registerTool(defineTool({
    name: TASK_LIST_TOOL_NAME,
    label: "Task List",
    description: "List all tasks",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const taskMap = getTaskMap(ctx);
      const tasks = Array.from(taskMap.values()).map((t) => ({
        taskId: t.id,
        name: t.name,
        status: t.status,
        createdAt: t.createdAt,
      }));
      return toolResult(JSON.stringify({ tasks }), { tasks });
    },
  }));

  // ========== Task Get ==========

  pi.registerTool(defineTool({
    name: TASK_GET_TOOL_NAME,
    label: "Task Get",
    description: "Get task details",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const taskMap = getTaskMap(ctx);
      const task = taskMap.get(params.taskId);

      if (!task) {
        return toolResult(JSON.stringify({ error: "Task not found" }), { error: "Task not found" });
      }

      return toolResult(JSON.stringify({
        taskId: task.id,
        name: task.name,
        description: task.description,
        status: task.status,
        agentId: task.agentId,
        createdAt: task.createdAt,
      }), { task });
    },
  }));

  // ========== Task Update ==========

  pi.registerTool(defineTool({
    name: TASK_UPDATE_TOOL_NAME,
    label: "Task Update",
    description: "Update task status",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID" }),
      status: Type.Optional(Type.String({ enum: ["pending", "running", "done", "failed", "cancelled"] })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const taskMap = getTaskMap(ctx);
      const task = taskMap.get(params.taskId);

      if (!task) {
        return toolResult(JSON.stringify({ success: false, error: "Task not found" }), { error: "Task not found" });
      }

      if (params.status) {
        task.status = params.status as TaskRecord["status"];
      }

      return toolResult(JSON.stringify({ success: true }), { success: true });
    },
  }));

  // ========== Task Execute ==========

  pi.registerTool(defineTool({
    name: TASK_EXECUTE_TOOL_NAME,
    label: "Task Execute",
    description: "Execute a task using a subagent",
    parameters: Type.Object({
      taskId: Type.String({ description: "Task ID" }),
      agentType: Type.Optional(Type.String({ enum: ["general-purpose", "research"] })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const taskMap = getTaskMap(ctx);
      const task = taskMap.get(params.taskId);

      if (!task) {
        return toolResult(JSON.stringify({ success: false, error: "Task not found" }), { error: "Task not found" });
      }

      const sessionId = (ctx.sessionManager as any).getSessionId();
      const cwd = ctx.cwd;

      task.status = "running";

      const result = await createAgent(
        sessionId,
        task.description ?? task.name,
        params.agentType ?? "general-purpose",
        cwd,
        {},
        ctx
      );

      task.agentId = result.agentId;

      return toolResult(JSON.stringify({ success: true, agentId: result.agentId, status: result.status }), { success: true, agentId: result.agentId });
    },
  }));

  // ========== Fleet View ==========

  pi.registerTool(defineTool({
    name: FLEET_VIEW_TOOL_NAME,
    label: "Fleet View",
    description: "View all running agents",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const sessionId = (ctx.sessionManager as any).getSessionId();
      const fleetView = createFleetView(sessionId);
      return toolResult(fleetView.render(), {});
    },
  }));

  // ========== Schedule ==========

  pi.registerTool(defineTool({
    name: SCHEDULE_TOOL_NAME,
    label: "Schedule",
    description: "Schedule a recurring task",
    parameters: Type.Object({
      task: Type.String({ description: "Task description" }),
      cron: Type.Optional(Type.String({ description: "Cron expression" })),
      intervalMs: Type.Optional(Type.Number({ description: "Interval in milliseconds" })),
      agentType: Type.Optional(Type.String({ enum: ["general-purpose", "research"] })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const scheduler = getScheduler(ctx);

      const jobId = scheduler.addJob({
        task: params.task,
        cron: params.cron,
        intervalMs: params.intervalMs,
        options: { type: params.agentType },
      } as any);

      return toolResult(JSON.stringify({ jobId, status: "scheduled" }), { jobId });
    },
  }));

  // ========== Cancel Schedule ==========

  pi.registerTool(defineTool({
    name: CANCEL_SCHEDULE_TOOL_NAME,
    label: "Cancel Schedule",
    description: "Cancel a scheduled job",
    parameters: Type.Object({
      jobId: Type.String({ description: "Job ID" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const scheduler = getScheduler(ctx);
      const success = scheduler.removeJob(params.jobId);
      return toolResult(JSON.stringify({ success }), { success });
    },
  }));

  // ========== Load Custom Agents ==========

  pi.registerTool(defineTool({
    name: LOAD_CUSTOM_AGENTS_TOOL_NAME,
    label: "Load Custom Agents",
    description: "Load custom agents from .pi/agents",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const agents = await loadCustomAgents(ctx.cwd);

      return toolResult(JSON.stringify({
        agents: agents.map((a) => ({
          name: a.name,
          description: a.description,
          displayName: a.displayName,
          tools: a.tools,
        })),
      }), { agents });
    },
  }));

  // ========== Cleanup Agents ==========

  pi.registerTool(defineTool({
    name: CLEANUP_AGENTS_TOOL_NAME,
    label: "Cleanup Agents",
    description: "Cleanup all agents for this session",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const sessionId = (ctx.sessionManager as any).getSessionId();
      cleanupAgents(sessionId);
      schedulers.delete(sessionId);
      taskRecords.delete(sessionId);
      return toolResult(JSON.stringify({ success: true }), { success: true });
    },
  }));
}
