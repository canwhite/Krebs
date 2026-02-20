/**
 * System Prompt 构建模块
 *
 * 参考 openclaw-cn-ds 的 system prompt 机制
 * 职责：
 * - 动态构建 agent 的 system prompt
 * - 支持三种模式：full/minimal/none
 * - 集成工具、技能、工作区等上下文信息
 * - 增强的工具系统（排序、摘要、大小写解析）
 * - 支持上下文文件加载（SOUL.md, AGENTS.md, TOOLS.md）
 * - 自动检测 git root
 */

import fs from "node:fs";
import path from "node:path";
import type { Tool as ToolType, ToolConfig } from "@/agent/tools/index.js";

// 重新导出 Tool 类型以供外部使用
export type Tool = ToolType;

/**
 * 自动检测 git root
 * 参考 openclaw-cn-ds 设计
 *
 * @param startDir - 起始目录
 * @returns git root 路径，如果未找到返回 null
 */
export function findGitRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  for (let i = 0; i < 12; i += 1) {
    const gitPath = path.join(current, ".git");
    try {
      const stat = fs.statSync(gitPath);
      if (stat.isDirectory() || stat.isFile()) {
        return current;
      }
    } catch {
      // 忽略 .git 不存在的错误
    }
    const parent = path.dirname(current);
    if (parent === current) break; // 已到达根目录
    current = parent;
  }
  return null;
}

/**
 * 核心工具摘要（硬编码，确保一致性）
 * 参考 openclaw-cn-ds 设计
 */
const CORE_TOOL_SUMMARIES: Record<string, string> = {
  read: "Read file contents",
  write: "Create or overwrite files",
  edit: "Make precise edits to files",
  apply_patch: "Apply multi-file patches",
  grep: "Search file contents for patterns",
  find: "Find files by glob pattern",
  ls: "List directory contents",
  exec: "Run shell commands",
  process: "Manage background exec sessions",
  web_search: "Search the web",
  web_fetch: "Fetch and extract readable content from a URL",
  memory_search: "Search long-term memory",
  memory_save: "Save important information to memory",
  memory_stats: "Get memory statistics",
};

/**
 * 工具优先级排序（常用工具在前）
 * 参考 openclaw-cn-ds 设计
 */
const TOOL_ORDER = [
  "read",
  "write",
  "edit",
  "apply_patch",
  "grep",
  "find",
  "ls",
  "exec",
  "process",
  "web_search",
  "web_fetch",
  "memory_search",
  "memory_save",
  "memory_stats",
];

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
 * 运行时信息
 */
export interface RuntimeInfo {
  agentId?: string;
  host?: string;
  os?: string;
  arch?: string;
  node?: string;
  model?: string;
  defaultModel?: string;
  repoRoot?: string;
  environment?: "development" | "production" | "test";
  channel?: string;
  capabilities?: string[];
}

/**
 * 上下文文件
 */
export interface ContextFile {
  path: string;
  content: string;
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
  runtime?: RuntimeInfo;

  // 上下文文件（新增）
  contextFiles?: ContextFile[];

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
  const isMinimal = config.promptMode === "minimal";

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

    // Tool Call Style（新增）
    if (!isMinimal) {
      parts.push(buildToolCallStyleSection());
    }

    // Memory Recall（新增，如果有记忆工具）
    if (config.tools && config.tools.length > 0) {
      const availableTools = new Set(config.tools.map(t => t.name.toLowerCase()));
      const memorySection = buildMemorySection(availableTools);
      if (memorySection) {
        parts.push(memorySection);
      }
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

    // 上下文文件（新增）
    if (config.contextFiles && config.contextFiles.length > 0) {
      const contextSection = buildContextFilesSection(config.contextFiles);
      if (contextSection) {
        parts.push(contextSection);
      }
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
 * 参考 openclaw-cn-ds 设计：
 * - 工具按优先级排序
 * - 核心工具有标准摘要
 * - 大小写不敏感的工具名解析
 */
function buildToolsSection(tools: Tool[]): string {
  // 1. 工具去重和规范化（大小写不敏感）
  const canonicalByNormalized = new Map<string, string>();
  for (const tool of tools) {
    const normalized = tool.name.toLowerCase();
    if (!canonicalByNormalized.has(normalized)) {
      canonicalByNormalized.set(normalized, tool.name);
    }
  }

  // 2. 解析工具名（大小写不敏感）
  const resolveToolName = (normalized: string) =>
    canonicalByNormalized.get(normalized) ?? normalized;

  // 3. 获取所有可用工具（规范化）
  const availableTools = new Set(tools.map(t => t.name.toLowerCase()));

  // 4. 外部工具摘要（自定义工具）
  const externalToolSummaries = new Map<string, string>();
  for (const tool of tools) {
    const normalized = tool.name.toLowerCase();
    const summary = tool.description?.trim();
    if (normalized && summary) {
      externalToolSummaries.set(normalized, summary);
    }
  }

  // 5. 生成工具列表（按优先级排序）
  const toolLines: string[] = [];
  const enabledTools = TOOL_ORDER.filter(tool => availableTools.has(tool));

  for (const toolName of enabledTools) {
    const canonicalName = resolveToolName(toolName);
    const summary = CORE_TOOL_SUMMARIES[toolName] ?? externalToolSummaries.get(toolName);
    toolLines.push(summary ? `- \`${canonicalName}\`: ${summary}` : `- \`${canonicalName}\``);
  }

  // 6. 添加额外工具（不在 TOOL_ORDER 中的）
  const extraTools = Array.from(
    new Set(tools.map(t => t.name.toLowerCase()).filter(t => !TOOL_ORDER.includes(t)))
  ).sort();

  for (const toolName of extraTools) {
    const canonicalName = resolveToolName(toolName);
    const summary = externalToolSummaries.get(toolName);
    toolLines.push(summary ? `- \`${canonicalName}\`: ${summary}` : `- \`${canonicalName}\``);
  }

  return `## Tooling

Tool availability (filtered by policy):
Tool names are case-sensitive. Call tools exactly as listed.
${
  toolLines.length > 0
    ? toolLines.join("\n")
    : "Pi lists the standard tools above. This runtime enables basic file operations."
}

TOOLS.md does not control tool availability; it is user guidance for how to use external tools.
If a task is more complex or takes longer, consider breaking it down into smaller steps.`;
}

/**
 * 构建工具调用风格部分（新增）
 * 参考 openclaw-cn-ds 设计
 */
function buildToolCallStyleSection(): string {
  return `## Tool Call Style

Default: do not narrate routine, low-risk tool calls (just call the tool).
Narrate only when it helps:
- Multi-step work
- Complex/challenging problems
- Sensitive actions (e.g., deletions)
- When the user explicitly asks

Keep narration brief and value-dense; avoid repeating obvious steps.
Use plain human language for narration unless in a technical context.`;
}

/**
 * 构建记忆检索部分（新增）
 * 参考 openclaw-cn-ds 设计
 */
function buildMemorySection(availableTools: Set<string>): string {
  if (!availableTools.has("memory_search") && !availableTools.has("memory_get")) {
    return "";
  }

  return `## Memory Recall

Before answering anything about prior work, decisions, dates, people, preferences, or todos:
1. Run memory_search on MEMORY.md + memory/*.md
2. Use memory_get to pull only the needed lines
3. If low confidence after search, say you checked

This helps maintain context across conversations and improves response accuracy.`;
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
 * 构建上下文文件部分（新增）
 * 参考 openclaw-cn-ds 设计
 */
function buildContextFilesSection(contextFiles: ContextFile[]): string {
  if (!contextFiles || contextFiles.length === 0) {
    return "";
  }

  // 检查是否有 SOUL.md
  const hasSoulFile = contextFiles.some((file) => {
    const normalizedPath = file.path.trim().replace(/\\/g, "/");
    const baseName = normalizedPath.split("/").pop() ?? normalizedPath;
    return baseName.toLowerCase() === "soul.md";
  });

  const lines: string[] = ["# Project Context", "", "The following project context files have been loaded:"];

  if (hasSoulFile) {
    lines.push(
      "",
      "If SOUL.md is present, embody its persona and tone.",
      "Avoid stiff, generic replies; follow its guidance unless higher-priority instructions override it."
    );
  }

  lines.push("");
  for (const file of contextFiles) {
    lines.push(`## ${file.path}`, "", file.content, "");
  }

  return lines.join("\n");
}

/**
 * 构建运行时部分（增强）
 * 参考 openclaw-cn-ds 设计
 */
function buildRuntimeSection(runtime: RuntimeInfo): string {
  const parts: string[] = [];

  if (runtime.agentId) parts.push(`agent=${runtime.agentId}`);
  if (runtime.host) parts.push(`host=${runtime.host}`);
  if (runtime.repoRoot) parts.push(`repo=${runtime.repoRoot}`);
  if (runtime.os) parts.push(`os=${runtime.os}${runtime.arch ? ` (${runtime.arch})` : ""}`);
  if (runtime.node) parts.push(`node=${runtime.node}`);
  if (runtime.model) parts.push(`model=${runtime.model}`);
  if (runtime.defaultModel) parts.push(`default_model=${runtime.defaultModel}`);
  if (runtime.environment) parts.push(`env=${runtime.environment}`);
  if (runtime.channel) parts.push(`channel=${runtime.channel}`);
  if (runtime.capabilities && runtime.capabilities.length > 0) {
    parts.push(`capabilities=${runtime.capabilities.join(",")}`);
  }

  return `## Runtime

Runtime: ${parts.length > 0 ? parts.join(" | ") : "unknown"}`;
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
7. **Be efficient**: Combine related operations when possible to minimize tool calls

**IMPORTANT - When to stop tool calling:**
- For content display/formatting tasks (e.g., "display these formulas", "show this content"):
  → First check if tools are actually needed
  → If the content is already provided in the user message, just format and display it directly
  → Only use tools if you need to read/write files as explicitly requested
- After a successful tool operation:
  → If the task is complete, generate your final text response immediately
  → DO NOT make additional tool calls unless necessary
  → Remember: Your goal is to HELP the user, not to maximize tool usage
- Avoid repetitive tool calls:
  → If a tool call succeeds, don't call the same tool again with similar parameters
  → If you find yourself making multiple similar calls, stop and reassess your approach`;
}
