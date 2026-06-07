import {
  createAgentSession,
  type ToolDefinition,
  type AgentSession,
  createBashTool,
  createReadTool,
  createEditTool,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  createSyntheticSourceInfo,
  createAgentSessionRuntime,
  DefaultResourceLoader,
  AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
  getAgentDir,
  createAgentSessionServices,
} from "@mariozechner/pi-coding-agent";
import subagents from "@tintinweb/pi-subagents/dist/index.js";
import tasks from "@tintinweb/pi-tasks/dist/index.js";
import type { Model } from "@mariozechner/pi-ai";
import { getModel } from "@mariozechner/pi-ai";
import { join } from "path";
import { existsSync, readFileSync } from "fs";
import { TOOLS } from "../tools/index.js";
import { SKILLS } from "../skills/index.js";
import { systemPrompt } from "../prompts/index.js";
import {
  extractFromSessionFile,
  extractFromTurnEvent,
} from "../lib/session-transcript.js";

// ==================== 模型配置 ====================
export const MODEL_CONFIG = {
  apiKey:
    process.env.API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    "",
  provider: process.env.MODEL_PROVIDER || "deepseek",
  baseUrl: process.env.MODEL_BASE_URL || "https://api.deepseek.com/v1",
  modelId: process.env.MODEL_ID || "deepseek-chat",
} as const;

function createModel(): Model<"openai-completions"> {
  return {
    id: MODEL_CONFIG.modelId,
    name: MODEL_CONFIG.modelId,
    api: "openai-completions",
    provider: MODEL_CONFIG.provider,
    baseUrl: MODEL_CONFIG.baseUrl,
    reasoning: false,
    input: ["text", "image"] as ("text" | "image")[],
    cost: { input: 0.27, output: 1.1, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 204800,
    maxTokens: 131072,
    compat: {
      supportsReasoningEffort: false,
    },
  };
}

const sessions = new Map<string, AgentSessionRuntime>();

// 创建 runtime factory
const createRuntimeFactory: CreateAgentSessionRuntimeFactory = async (
  options
) => {
  const cwd = options.cwd;
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  // 设置运行时 API Key（使用配置中的 provider 名称）
  authStorage.setRuntimeApiKey(MODEL_CONFIG.provider, MODEL_CONFIG.apiKey);

  // 选择模型：如果配置了 baseUrl 则使用自定义模型，否则使用内置 Claude 模型
  const model = MODEL_CONFIG.baseUrl
    ? createModel()
    : getModel("anthropic", "claude-sonnet-4-20250514");

  const skills = SKILLS.map((s) => ({
    ...s,
    sourceInfo: createSyntheticSourceInfo(s.filePath, {
      source: s.source,
      baseDir: s.baseDir,
    }),
  }));

  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    extensionFactories: [subagents as any, tasks as any],
    skillsOverride: () => ({ skills, diagnostics: [] }),
    systemPromptOverride: () => systemPrompt,
    noPromptTemplates: true,
    noThemes: true,
  });
  await resourceLoader.reload();

  const result = await createAgentSession({
    ...options,
    model,
    thinkingLevel: "off",
    authStorage,
    modelRegistry,
    tools: [
      createReadTool(cwd),
      createBashTool(join(cwd, "custom")),
      createEditTool(cwd),
    ],
    customTools: TOOLS.map((t) => t.tool),
    resourceLoader,
  });

  // 创建 services 以返回完整的 RuntimeResult
  const services = await createAgentSessionServices({
    cwd,
    agentDir: getAgentDir(),
  });

  return {
    ...result,
    services,
    diagnostics: [],
  };
};

async function createRuntime(sessionId: string, sessionPath?: string) {
  const cwd = process.cwd();
  const sessionManager = SessionManager.create(cwd, join(cwd, "sessions"));

  const runtime = await createAgentSessionRuntime(createRuntimeFactory, {
    cwd,
    agentDir: getAgentDir(),
    sessionManager,
  });

  // 如果指定了 sessionPath，切换到该会话
  if (sessionPath) {
    const result = await runtime.switchSession(sessionPath);
    if (result.cancelled) {
      throw new Error("Session 切换被取消");
    }
  }

  sessions.set(sessionId, runtime);
  return { runtime };
}

function getSession(sessionId: string) {
  return sessions.get(sessionId);
}

async function deleteSession(sessionId: string) {
  const runtime = sessions.get(sessionId);
  if (runtime) {
    try {
      const session = runtime.session;
      // 检查 session 状态
      if (session.isStreaming) {
        console.log(`[DELETE] Session ${sessionId} 仍在运行，先终止`);
        await session.abort().catch(() => {
          // 忽略 abort 错误
        });
      }

      await runtime.dispose();
      sessions.delete(sessionId);
      console.log(`[DELETE] Session ${sessionId} 已清理`);
    } catch (error) {
      console.error(`[DELETE] Session ${sessionId} 清理失败:`, error);
    }
  }
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Session/HTTP 超时配置（毫秒）- 默认 8 分钟
const SESSION_TIMEOUT_MS = parseInt(
  process.env.SESSION_TIMEOUT_MS || "480000",
  10,
);

/**
 * 等待 Session 完成执行（等待 agent_end 事件）
 * agent_end 是最外层事件，表示整个 Agent 会话结束
 * 包含所有消息，可以直接从中提取内容
 */
async function waitForSessionComplete(
  session: AgentSession,
  logger?: { log: (msg: string) => void },
): Promise<{ messages: any[] }> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let resolved = false;
    let unsubscribe: () => void;

    // 超时关闭
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;

      try {
        if (unsubscribe) unsubscribe();
      } catch (e) {}
      clearInterval(checkInterval);

      reject(
        new Error(
          `Session 超时 (${SESSION_TIMEOUT_MS}ms)，当前状态: isStreaming=${session.isStreaming}`,
        ),
      );
    }, SESSION_TIMEOUT_MS);

    // 成功关闭 - 等待 agent_end（整个会话结束）
    unsubscribe = session.subscribe((event) => {
      if (event.type === "agent_end") {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        clearInterval(checkInterval);
        try {
          unsubscribe();
        } catch (e) {}
        logger?.log(
          `[SESSION] agent_end 收到，耗时: ${Date.now() - startTime}ms`,
        );
        // 返回所有消息，供调用方提取内容
        resolve({ messages: (event as any).messages || [] });
      }
    });

    // 备用：如果 isStreaming 变成 false，也认为完成
    const checkInterval = setInterval(() => {
      if (!session.isStreaming) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        clearInterval(checkInterval);
        try {
          unsubscribe();
        } catch (e) {}
        logger?.log(
          `[SESSION] isStreaming=false，耗时: ${Date.now() - startTime}ms`,
        );
        // 返回空消息数组
        resolve({ messages: [] });
      }
    }, 500);
  });
}

// 导出本地定义的函数
export {
  createRuntime,
  getSession,
  deleteSession,
  generateSessionId,
  waitForSessionComplete,
  sessions,
};

// Re-export from unified transcript module for backward compatibility
export {
  extractFromSessionFile as getLastAssistantMessageFromFile,
  extractFromTurnEvent as extractCompleteContent,
} from "../lib/session-transcript.js";
