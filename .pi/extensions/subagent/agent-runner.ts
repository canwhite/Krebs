/**
 * Agent Runner
 * 负责创建和管理 subagent sessions
 */

import {
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  AuthStorage,
  ModelRegistry,
  type AgentSession,
  type CreateAgentSessionRuntimeFactory,
} from "@earendil-works/pi-coding-agent";
import { MODEL_CONFIG } from "../../../server/session-service.js";
import { getDefaultExecutor, createSandboxBashTool } from "../../../server/sandbox/mod.js";
import { TOOLS } from "../../../tools/index.js";
import type { AgentOptions, AgentRecord, SubagentEvent } from "./types.js";
import { getAgentConfig } from "./types.js";
import { buildCleanContext } from "./context.js";
import { ExtensionCache } from "./session-cache.js";

// Extensions to exclude from subagents (Krebs-specific)
const KREBS_EXCLUDE_EXTENSIONS = [
  'memory-context',
  'memory',
  'session-history-rag',
  'goal-constraint',
  'self-verification',
];

function extensionCanonicalName(path: string): string {
  return path.split("/").pop()?.replace(/\/index\.ts$/, "") ?? path;
}

// Extensions override for subagents
const extensionsOverride = (base: any) => {
  return {
    ...base,
    extensions: base.extensions.filter((e: any) => {
      const name = extensionCanonicalName(e.path);
      return !KREBS_EXCLUDE_EXTENSIONS.includes(name);
    }),
  };
};

// Global extension cache
const extensionCache = new ExtensionCache();

/**
 * 创建 subagent session
 */
export async function createSubagentSession(
  prompt: string,
  type: string,
  cwd: string,
  options?: AgentOptions
): Promise<AgentSession> {
  const config = getAgentConfig(type);
  const mergedOptions = { ...config, ...options };

  // Create sandbox bash tool
  const passthroughBash = async (command: string, cwd: string) => {
    return new Promise<{ content: { type: "text"; text: string }[]; details: { exitCode: number; stderr: string } }>((resolve, reject) => {
      const { spawn } = require("child_process");
      const shell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";
      const shellArgs = process.platform === "win32" ? ["/c", command] : ["-c", command];
      const proc = spawn(shell, shellArgs, { cwd, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      proc.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
      proc.stderr?.on("data", (data: Buffer) => { stderr += data.toString(); });
      proc.on("close", (code: number | null) => {
        resolve({
          content: [{ type: "text", text: stdout }],
          details: { exitCode: code ?? 0, stderr },
        });
      });
      proc.on("error", reject);
    });
  };

  const bashTool = createSandboxBashTool(getDefaultExecutor(), cwd, passthroughBash);

  // Create filtered resource loader
  const filteredLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    extensionsOverride,
    skillsOverride: () => ({ skills: [], diagnostics: [] }),
    systemPromptOverride: () => "",
    noPromptTemplates: true,
    noThemes: true,
  });

  // Get cached extensions
  await extensionCache.getOrReload(cwd, filteredLoader);

  // Create auth storage and model registry
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey(MODEL_CONFIG.provider, MODEL_CONFIG.apiKey);

  const modelRegistry = ModelRegistry.create(authStorage);

  const model = {
    id: MODEL_CONFIG.modelId,
    name: MODEL_CONFIG.modelId,
    api: "openai-completions" as const,
    provider: MODEL_CONFIG.provider,
    baseUrl: MODEL_CONFIG.baseUrl,
    reasoning: false,
    input: ["text", "image"] as ("text" | "image")[],
    cost: { input: 0.27, output: 1.1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 131072,
    compat: { supportsReasoningEffort: false },
  };

  // Create session
  const result = await createAgentSession({
    cwd,
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    tools: ["read", "bash", "edit"],
    customTools: [bashTool as any, ...TOOLS.map((t) => t.tool)],
    resourceLoader: filteredLoader,
  });

  const session = result.session;

  // Start timeout if configured
  if (mergedOptions.timeoutMs) {
    startTimeout(session, mergedOptions.timeoutMs, session.sessionId);
  }

  // Execute prompt
  session.prompt(prompt);

  return session;
}

/**
 * 启动超时计时器
 */
function startTimeout(
  session: AgentSession,
  timeoutMs: number,
  agentId: string
): void {
  setTimeout(() => {
    console.warn(`[Subagent] Agent ${agentId} timed out after ${timeoutMs}ms`);
    session.abort();
  }, timeoutMs);
}

/**
 * 事件处理函数
 */
export function handleSubagentEvent(
  event: SubagentEvent,
  session: AgentSession,
  record: AgentRecord
): void {
  switch (event.type) {
    case "agent_start":
      record.status = "running";
      break;
    case "agent_end":
      record.status = "done";
      record.result = event.messages;
      if (record.unsubscribe) record.unsubscribe();
      break;
    case "error":
      record.status = "failed";
      console.error(`[Subagent] Error: ${event.error}`);
      break;
  }
}

/**
 * 构建带 inheritContext 的 prompt
 */
export function buildSubagentPrompt(
  task: string,
  ctx: any,
  options: AgentOptions
): string {
  if (!options.inheritContext) {
    return task;
  }

  const cleanContext = buildCleanContext(ctx, {
    maxMessages: options.maxContextMessages ?? 10,
    includeSummaries: options.includeSummaries ?? false,
    filterSensitive: options.filterSensitive ?? true,
  });

  if (!cleanContext) return task;

  return `${cleanContext}\n\n# Your Task\n${task}`;
}
