/**
 * System Prompt 构建模块
 *
 * 参考 openclaw-cn-ds 的 system prompt 机制
 * 职责：
 * - 动态构建 agent 的 system prompt
 * - 支持三种模式：full/minimal/none
 * - 集成工具、技能、工作区等上下文信息
 */

import type { Tool, ToolConfig } from "@/agent/tools/index.js";

/**
 * System Prompt 模式
 */
export type PromptMode = "full" | "minimal" | "none";

/**
 * 沙盒信息
 */
export interface SandboxInfo {
  enabled: boolean;
  type?: "docker" | "vm" | "chroot";
  limits?: {
    cpu?: string;
    memory?: string;
    disk?: string;
  };
}

/**
 * System Prompt 构建配置
 */
export interface SystemPromptConfig {
  // 基础配置
  promptMode: PromptMode;
  basePrompt?: string;

  // 工具和技能
  tools?: Tool[];
  toolConfig?: ToolConfig;
  skills?: Array<{
    name: string;
    description: string;
    prompt?: string;
  }>;

  // 上下文信息
  workspaceDir?: string;
  timezone?: string;
  sandboxInfo?: SandboxInfo;

  // 用户信息
  userIdentity?: string;

  // 运行时信息
  runtime?: {
    version?: string;
    environment?: "development" | "production" | "test";
  };

  // 自定义部分
  extraSections?: Array<{
    title: string;
    content: string;
  }>;
}

/**
 * 构建 Agent System Prompt
 *
 * @param config - System prompt 配置
 * @returns 完整的 system prompt 字符串
 */
export function buildAgentSystemPrompt(
  config: SystemPromptConfig
): string {
  const parts: string[] = [];

  // 模式为 none 时，只返回基础提示
  if (config.promptMode === "none") {
    return config.basePrompt || "You are a helpful AI assistant.";
  }

  // 基础身份
  parts.push(buildBaseSection(config.basePrompt));

  // 根据 promptMode 决定添加哪些部分
  if (config.promptMode === "full" || config.promptMode === "minimal") {
    // 工具列表（重要）
    if (config.tools && config.tools.length > 0) {
      parts.push(buildToolsSection(config.tools));
    }

    // Skills（如果有）
    if (config.skills && config.skills.length > 0) {
      parts.push(buildSkillsSection(config.skills));
    }

    // 工作区信息（full 模式）
    if (config.promptMode === "full") {
      if (config.workspaceDir) {
        parts.push(buildWorkspaceSection(config.workspaceDir));
      }

      // 时间信息
      parts.push(buildTimeSection(config.timezone));

      // 沙盒信息（如果有）
      if (config.sandboxInfo?.enabled) {
        parts.push(buildSandboxSection(config.sandboxInfo));
      }

      // 用户身份（如果有）
      if (config.userIdentity) {
        parts.push(buildUserIdentitySection(config.userIdentity));
      }

      // 运行时信息（如果有）
      if (config.runtime) {
        parts.push(buildRuntimeSection(config.runtime));
      }
    }

    // Tool Calling 指导
    if (config.tools && config.tools.length > 0) {
      parts.push(buildToolCallingGuidance(config.toolConfig));
    }
  }

  // 自定义部分（如果有）
  if (config.extraSections && config.extraSections.length > 0) {
    for (const section of config.extraSections) {
      parts.push(`## ${section.title}\n\n${section.content}`);
    }
  }

  return parts.join("\n\n");
}

/**
 * 构建基础身份部分
 */
function buildBaseSection(basePrompt?: string): string {
  const defaultPrompt =
    "You are a personal AI assistant running in Krebs. You help users accomplish tasks using available tools and skills.";
  return basePrompt || defaultPrompt;
}

/**
 * 构建工具列表部分
 */
function buildToolsSection(tools: Tool[]): string {
  const toolList = tools
    .map(
      (tool) =>
        `- \`${tool.name}\`: ${tool.description || "No description available"}`
    )
    .join("\n");

  return `## Available Tools

You have access to the following tools:

${toolList}

Use these tools to accomplish tasks. Each tool has a specific purpose - choose the right tool for the job.`;
}

/**
 * 构建技能列表部分
 */
function buildSkillsSection(skills: Array<{ name: string; description: string; prompt?: string }>): string {
  const skillList = skills
    .map((skill) => {
      let desc = `- \`${skill.name}\`: ${skill.description}`;
      if (skill.prompt) {
        desc += `\n  ${skill.prompt}`;
      }
      return desc;
    })
    .join("\n");

  return `## Skills (Available)

You have access to the following specialized skills:

${skillList}

These skills provide additional capabilities. Use them when relevant to the task.`;
}

/**
 * 构建工作区部分
 */
function buildWorkspaceSection(workspaceDir: string): string {
  return `## Workspace

Working directory: \`${workspaceDir}\`

When working with files, use this workspace as the base directory for all file operations.`;
}

/**
 * 构建时间部分
 */
function buildTimeSection(timezone?: string): string {
  const now = new Date();
  const isoTime = now.toISOString();
  const localTime = now.toLocaleString();

  let timeInfo = `Current time (UTC): ${isoTime}`;
  if (timezone) {
    timeInfo += `\nTimezone: ${timezone}`;
    timeInfo += `\nLocal time: ${localTime}`;
  }

  return `## Current Date & Time

${timeInfo}

Keep the current time in mind when scheduling tasks or referring to dates.`;
}

/**
 * 构建沙盒部分
 */
function buildSandboxSection(sandboxInfo: SandboxInfo): string {
  let content = `## Sandbox Environment

You are running in a ${sandboxInfo.type || "sandboxed"} environment.`;

  if (sandboxInfo.limits) {
    content += "\n\nResource limits:";
    if (sandboxInfo.limits.cpu) {
      content += `\n- CPU: ${sandboxInfo.limits.cpu}`;
    }
    if (sandboxInfo.limits.memory) {
      content += `\n- Memory: ${sandboxInfo.limits.memory}`;
    }
    if (sandboxInfo.limits.disk) {
      content += `\n- Disk: ${sandboxInfo.limits.disk}`;
    }
  }

  return content;
}

/**
 * 构建用户身份部分
 */
function buildUserIdentitySection(userIdentity: string): string {
  return `## User Identity

${userIdentity}

Tailor your responses to this specific user context.`;
}

/**
 * 构建运行时部分
 */
function buildRuntimeSection(runtime: { version?: string; environment?: string }): string {
  let content = "## Runtime Information";

  if (runtime.version) {
    content += `\n\nVersion: ${runtime.version}`;
  }

  if (runtime.environment) {
    content += `\nEnvironment: ${runtime.environment}`;
  }

  return content;
}

/**
 * 构建 Tool Calling 指导部分
 */
function buildToolCallingGuidance(toolConfig?: ToolConfig): string {
  const maxIterations = toolConfig?.maxIterations ?? 10;

  return `## Tool Calling Guidelines

1. **Choose the right tool**: Carefully select the most appropriate tool for each task
2. **Provide accurate parameters**: Ensure all required parameters are provided with correct values
3. **Iterate if needed**: You can make multiple tool calls to accomplish complex tasks
4. **Maximum iterations**: You can make up to ${maxIterations} tool calls per user message
5. **Stop when done**: Don't make unnecessary tool calls - stop when the task is complete
6. **Handle errors gracefully**: If a tool call fails, try to understand the error and adjust your approach
7. **Be efficient**: Combine related operations when possible to minimize tool calls`;
}
