/**
 * Spawn Subagent 工具
 *
 * 允许 Agent 在隔离会话中生成后台子代理运行，执行复杂或耗时的任务，并将结果通知回请求者。
 */

import crypto from "node:crypto";
import { createLogger } from "@/shared/logger.js";
import type { Tool } from "../tools/types.js";
import type { SubagentToolsConfig, SubagentSkillsConfig } from "../subagent/types.js";

const log = createLogger("SpawnSubagentTool");

export interface SpawnSubagentParams {
  /** 任务描述（必需） */
  task: string;
  /** 可选标签，用于识别任务 */
  label?: string;
  /** 目标 agent ID（默认使用当前 agent） */
  agentId?: string;
  /** 模型覆盖（默认使用配置的模型） */
  model?: string;
  /** 思考级别（default, high, low） */
  thinking?: string;
  /** 运行超时时间（秒） */
  runTimeoutSeconds?: number;
  /** 清理策略：delete（完成后删除会话）或 keep（保留会话） */
  cleanup?: "delete" | "keep";
  /** 通知模式 */
  announceMode?: "steer" | "followup" | "collect" | "silent";
  /** 工具配置 */
  tools?: SubagentToolsConfig;
  /** 技能配置 */
  skills?: SubagentSkillsConfig;
}

/**
 * 创建 spawn_subagent 工具
 */
export function createSpawnSubagentTool(
  getSessionKey: () => string,
  getDisplayName: () => string,
  getRegistry: () => any, // SubagentRegistry
): Tool {
  return {
    name: "spawn_subagent",
    description:
      "在隔离会话中生成后台子代理运行，并将结果通知回请求者聊天。适合并行处理、资源隔离、专业化执行等场景。",
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "任务描述（必需）",
        },
        label: {
          type: "string",
          description: "可选标签，用于识别任务",
        },
        agentId: {
          type: "string",
          description: "目标 agent ID（默认使用当前 agent）",
        },
        model: {
          type: "string",
          description: "模型覆盖（默认使用配置的模型）",
        },
        thinking: {
          type: "string",
          enum: ["default", "high", "low"],
          description: "思考级别",
        },
        runTimeoutSeconds: {
          type: "number",
          description: "运行超时时间（秒）",
        },
        cleanup: {
          type: "string",
          enum: ["delete", "keep"],
          description: '清理策略：delete（完成后删除会话）或 keep（保留会话）',
        },
        announceMode: {
          type: "string",
          enum: ["steer", "followup", "collect", "silent"],
          description: "通知模式：steer（立即通知）、followup（后续消息）、collect（收集统一通知）、silent（静默）",
        },
        tools: {
          type: "object",
          description: "子代理工具配置",
          properties: {
            allow: {
              type: "array",
              items: { type: "string" },
              description: "明确允许的工具列表",
            },
            deny: {
              type: "array",
              items: { type: "string" },
              description: "明确拒绝的工具列表",
            },
            inheritTools: {
              type: "boolean",
              description: "是否继承父 agent 的工具配置",
            },
            allowNestedSubagents: {
              type: "boolean",
              description: "是否允许子代理再创建子代理",
            },
          },
        },
        skills: {
          type: "object",
          description: "子代理技能配置",
          properties: {
            inherit: {
              type: "boolean",
              description: "是否继承父 agent 的技能",
            },
            extraDirs: {
              type: "array",
              items: { type: "string" },
              description: "额外的技能目录",
            },
            allow: {
              type: "array",
              items: { type: "string" },
              description: "技能白名单",
            },
            deny: {
              type: "array",
              items: { type: "string" },
              description: "技能黑名单",
            },
          },
        },
      },
      required: ["task"],
    },
    execute: async (params: unknown) => {
      const p = params as SpawnSubagentParams;

      // 获取 SubagentRegistry
      const registry = getRegistry();
      if (!registry) {
        return {
          success: false,
          error: "Subagent system is not enabled. Please enable it in the agent configuration.",
        };
      }

      // 生成唯一 ID
      const runId = crypto.randomUUID();
      const taskHash = crypto
        .createHash("sha256")
        .update(p.task)
        .digest("hex")
        .slice(0, 16);

      // 构建子会话键
      const requesterSessionKey = getSessionKey();
      const requesterDisplayKey = getDisplayName();
      const childSessionKey = `subagent:${runId}:${taskHash}`;

      try {
        // 注册 subagent 运行
        registry.register({
          runId,
          childSessionKey,
          requesterSessionKey,
          requesterDisplayKey,
          task: p.task,
          label: p.label,
          agentId: p.agentId,
          model: p.model,
          thinkingLevel: p.thinking,
          runTimeoutSeconds: p.runTimeoutSeconds,
          cleanup: p.cleanup || "delete",
          tools: p.tools,
          skills: p.skills,
        });

        log.info(
          `Spawned subagent ${runId.slice(0, 8)} for session ${requesterSessionKey}`,
        );

        return {
          success: true,
          data: {
            runId,
            childSessionKey,
            status: "registered",
            message: `Subagent ${runId.slice(0, 8)} has been spawned to handle the task: "${p.task}"`,
          },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log.error(`Failed to spawn subagent: ${errorMsg}`);

        return {
          success: false,
          error: errorMsg,
        };
      }
    },
  };
}
