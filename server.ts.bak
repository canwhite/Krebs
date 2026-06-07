/// <reference types="bun-types" />
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
  createExtensionRuntime,
  createSyntheticSourceInfo,
  createAgentSessionRuntime,
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
import { MonitorLogger } from "./lib/logger.js";
import { extractFromSessionText } from "./lib/session-content-extractor.js";
import {
  saveSessionMeta,
  getAllSessions,
  getSessionById,
  deleteSessionFromDb,
} from "./db/index.js";
import { TOOLS } from "./tools/index.js";
import { SKILLS } from "./skills/index.js";
import { systemPrompt } from "./prompts/index.js";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";

// ==================== Think Tag Parser ====================
/**
 * 从 text_delta 中提取 think 标签内容和普通内容
 *
 * 返回：{ textDelta: string, thinkDelta?: string }
 * - textDelta: 过滤掉 think 标签后的普通内容
 * - thinkDelta: think 标签内的内容（如果有）
 */
interface ParsedDelta {
  textDelta: string;
  thinkDelta?: string;
}

interface ThinkParserState {
  isInThinkTag: boolean;
  pendingContent: string;
  currentThinkContent: string;
}

const thinkParserStates = new Map<any, ThinkParserState>();

// ==================== Event Subscription Helper ====================
/**
 * 为 session 切换设置新的事件订阅
 * 用于 switch_session 后重新订阅新 session 的事件
 */
function setupEventSubscriptionForSwitch(ws: any, session: AgentSession, logger: any): void {
  // Send response_start when AI starts responding
  let hasSentResponseStart = false;
  const textDeltas: string[] = [];
  // 防止 message_end 并发处理的标志位
  let isProcessingMessageEnd = false;
  let hasSentResponseEnd = false;

  // 保存 unsubscribe 函数以便在连接关闭时清理
  const unsubscribe = session.subscribe((event) => {
    logger.log(`[EVENT] Type: ${event.type}`);

    // 记录 message_start 时间，用于检测快速拒绝
    if (event.type === "message_start") {
      (ws as any).data.messageStartTime = Date.now();
      // 发送 message_start 给前端（用于控制停止按钮）
      ws.send(
        JSON.stringify({
          type: "message_start",
        }),
      );
    }

    // 检测快速拒绝：如果 message_start 到 message_end < 300ms，认为是被模型过滤
    if (event.type === "message_end") {
      // 发送 message_end 给前端（用于控制停止按钮）
      ws.send(
        JSON.stringify({
          type: "message_end",
        }),
      );

      const messageStartTime = (ws as any).data.messageStartTime;
      const elapsed = messageStartTime
        ? Date.now() - messageStartTime
        : 0;

      if (elapsed < 300 && !hasSentResponseStart) {
        logger.log(
          `[SESSION] 检测到快速拒绝 (${elapsed}ms)，跳过并等待新消息`,
        );
        (ws as any).data.messageStartTime = null;
        return; // 跳过这个空的 message_end，等待后续
      }
    }

    if (event.type === "message_update") {
      if (!hasSentResponseStart) {
        hasSentResponseStart = true;
        ws.send(
          JSON.stringify({
            type: "response_start",
          }),
        );
      }
      if (event.assistantMessageEvent.type === "text_delta") {
        const rawDelta = event.assistantMessageEvent.delta;
        textDeltas.push(rawDelta);

        // 解析 think 标签
        const { textDelta, thinkDelta } = parseThinkTagsFromDelta(rawDelta, ws);

        // 发送普通文本内容（如果有实质内容）
        if (textDelta && textDelta.trim().length > 0) {
          ws.send(
            JSON.stringify({
              type: "text_delta",
              delta: textDelta,
            }),
          );
        }

        // 发送 think 内容（如果有）
        if (thinkDelta) {
          ws.send(
            JSON.stringify({
              type: "think_block",
              content: thinkDelta,
            }),
          );
        }
      } else if (
        event.assistantMessageEvent.type === "thinking_start"
      ) {
        logger.log(
          `[THINKING_START] ContentIndex: ${event.assistantMessageEvent.contentIndex}`,
        );
        ws.send(
          JSON.stringify({
            type: "thinking_start",
            contentIndex: event.assistantMessageEvent.contentIndex,
          }),
        );
      } else if (
        event.assistantMessageEvent.type === "thinking_delta"
      ) {
        ws.send(
          JSON.stringify({
            type: "thinking_delta",
            delta: event.assistantMessageEvent.delta,
          }),
        );
      } else if (event.assistantMessageEvent.type === "thinking_end") {
        logger.log(
          `[THINKING_END] ContentIndex: ${event.assistantMessageEvent.contentIndex}`,
        );
        ws.send(
          JSON.stringify({
            type: "thinking_end",
            contentIndex: event.assistantMessageEvent.contentIndex,
            content: event.assistantMessageEvent.content,
          }),
        );
      } else if (
        event.assistantMessageEvent.type === "toolcall_start"
      ) {
        // LLM started generating a tool call - show loading immediately
        const partial = event.assistantMessageEvent.partial;
        const toolCall =
          partial.content?.[event.assistantMessageEvent.contentIndex];
        if (toolCall && toolCall.type === "toolCall") {
          logger.log(
            `[TOOLCALL_START] Tool: ${toolCall.name}, ContentIndex: ${event.assistantMessageEvent.contentIndex}`,
          );
          ws.send(
            JSON.stringify({
              type: "tool_call_start",
              tool: toolCall.name,
              contentIndex: event.assistantMessageEvent.contentIndex,
            }),
          );
        }
      } else if (event.assistantMessageEvent.type === "toolcall_end") {
        // LLM finished generating the tool call
        logger.log(
          `[TOOLCALL_END] ContentIndex: ${event.assistantMessageEvent.contentIndex}`,
        );
      } else {
        logger.log(
          `[MESSAGE_UPDATE] ${JSON.stringify(event.assistantMessageEvent).substring(0, 200)}...`,
        );
      }
    } else if (event.type === "tool_execution_start") {
      logger.log(
        `[TOOL_EXECUTION_START] Tool: ${event.toolName}, Args: ${JSON.stringify(event.args).substring(0, 100)}...`,
      );
      ws.send(
        JSON.stringify({
          type: "tool_start",
          tool: event.toolName,
          args: event.args,
        }),
      );
    } else if (event.type === "tool_execution_end") {
      const result = event.result;
      let content = "";

      if (result && result.content) {
        for (const item of result.content) {
          if (item.type === "text") {
            content += item.text;
          }
        }
      }

      logger.log(
        `[TOOL_EXECUTION_END] Tool: ${event.toolName}, Success: ${!event.isError}`,
      );

      ws.send(
        JSON.stringify({
          type: "tool_end",
          tool: event.toolName,
          success: !event.isError,
          result: content,
        }),
      );
    } else if (event.type === "message_end") {
      // 防止并发处理 message_end 事件
      if (isProcessingMessageEnd) {
        logger.log("[SESSION] message_end 已在处理中，跳过重复事件");
        return;
      }

      // 只标记 message_end 已处理，不发送 response_end
      // 等待 turn_end 或 agent_end 再发送 response_end
      isProcessingMessageEnd = true;
      logger.log("[SESSION] message_end 收到，等待 turn_end");
      isProcessingMessageEnd = false;
    }

    // turn_end: 发送完整消息内容供前端重新渲染
    if (event.type === "turn_end") {
      logger.log("[SESSION] turn_end 收到，发送完整内容");
      const completeContent = extractCompleteContent((event as any).message);
      ws.send(
        JSON.stringify({
          type: "turn_end",
          content: completeContent,
        }),
      );
    }

    // agent_end: 整个 Agent 执行结束，发送 response_end
    if (event.type === "agent_end" && !hasSentResponseEnd) {
      logger.log("[SESSION] agent_end 收到，发送 response_end");
      hasSentResponseEnd = true;
      hasSentResponseStart = false;

      const sessionFilePath = session.sessionFile;
      if (!sessionFilePath) {
        ws.send(
          JSON.stringify({
            type: "response_end",
            generatedContent: undefined,
          }),
        );
      } else {
        void (async () => {
          const fullTextResponse =
            await getLastAssistantMessageFromFile(
              sessionFilePath,
              logger,
            );
          const generatedContent =
            extractFromSessionText(fullTextResponse);
          ws.send(
            JSON.stringify({
              type: "response_end",
              generatedContent,
            }),
          );
          textDeltas.length = 0;
        })();
      }
    }
  });

  // 保存新的 unsubscribe 函数
  (ws as any).data.unsubscribe = unsubscribe;
}

function parseThinkTagsFromDelta(
  delta: string,
  ws: any,
): ParsedDelta {
  // 获取或初始化该连接的解析状态
  let state = thinkParserStates.get(ws);
  if (!state) {
    state = {
      isInThinkTag: false,
      pendingContent: "",
      currentThinkContent: ""
    };
    thinkParserStates.set(ws, state);
  }

  // 将新的增量添加到缓存
  state.pendingContent += delta;

  const result: ParsedDelta = { textDelta: "" };
  let remaining = state.pendingContent;

  // 处理所有可能的标签
  while (remaining.length > 0) {
    if (state.isInThinkTag) {
      // 在 think 标签内，查找结束标签 </think>
      const endTagIndex = remaining.indexOf("</think>");

      if (endTagIndex !== -1) {
        // 找到结束标签
        const thinkContent = remaining.substring(0, endTagIndex);
        result.thinkDelta = thinkContent; // 只发送最后一段增量，不发送累积内容

        // 重置状态
        remaining = remaining.substring(endTagIndex + "</think>".length);
        state.isInThinkTag = false;
        state.currentThinkContent = "";
      } else {
        // 仍在标签内，流式发送增量内容
        result.thinkDelta = remaining; // 发送增量而非累积内容
        state.currentThinkContent += remaining;
        state.pendingContent = "";
        return result;
      }
    } else {
      // 在标签外，查找开始标签 <think
      const startTagIndex = remaining.indexOf("<think");

      if (startTagIndex !== -1) {
        // 添加开始标签之前的内容作为普通文本
        result.textDelta += remaining.substring(0, startTagIndex);

        // 查找开始标签的结束位置 ">"
        const tagEndIndex = remaining.indexOf(">", startTagIndex);
        if (tagEndIndex !== -1) {
          remaining = remaining.substring(tagEndIndex + 1);
          state.isInThinkTag = true;
        } else {
          // 不完整的开始标签，保留到下次处理
          state.pendingContent = remaining.substring(0, startTagIndex);
          return result;
        }
      } else {
        // 没有找到标签，所有内容都是普通文本
        result.textDelta += remaining;
        remaining = "";
      }
    }
  }

  // 更新缓存
  state.pendingContent = remaining;
  return result;
}

// 在 WebSocket 关闭时清理状态
function cleanupThinkParserState(ws: any) {
  thinkParserStates.delete(ws);
}

// ==================== 模型配置 ====================
const MODEL_CONFIG = {
  apiKey:
    process.env.API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    "",
  provider: process.env.MODEL_PROVIDER || "deepseek",
  baseUrl: process.env.MODEL_BASE_URL || "https://api.deepseek.com/v1",
  modelId: process.env.MODEL_ID || "deepseek-chat",
} as const;

if (!MODEL_CONFIG.apiKey) {
  console.error("错误：未设置 API Key 环境变量");
  console.error("请设置以下之一：");
  console.error("  API_KEY=your_key_here           # 推荐，通用配置");
  console.error("  DEEPSEEK_API_KEY=your_key_here  # 兼容旧配置");
  console.error("  ANTHROPIC_API_KEY=your_key_here # 使用 Claude");
  process.exit(1);
}

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

// ==================== API Token 认证 ====================
// 生成或读取 API Token
function getOrGenerateToken(): string {
  const token = process.env.TOKEN;
  if (token && token !== "xxx") {
    console.log(`[AUTH] 使用现有 Token: ${token.substring(0, 8)}...`);
    return token;
  }

  const newToken = (globalThis as any).crypto.randomUUID() as string;
  const envPath = join(process.cwd(), ".env");

  let envContent = "";
  try {
    envContent = readFileSync(envPath, "utf-8");
  } catch (e) {
    // 文件不存在，使用空内容
  }

  const lines = envContent.split("\n");
  let tokenUpdated = false;
  const updatedLines = lines.map((line) => {
    if (line.startsWith("TOKEN=")) {
      tokenUpdated = true;
      return `TOKEN=${newToken}`;
    }
    return line;
  });

  if (!tokenUpdated) {
    updatedLines.push(`TOKEN=${newToken}`);
  }

  writeFileSync(envPath, updatedLines.join("\n"));
  console.log(`[AUTH] 生成新 Token: ${newToken}`);
  console.log(
    `[AUTH] 请使用 POST /api/auth 验证，body: {"token": "${newToken}"}`,
  );

  return newToken;
}

const API_TOKEN = getOrGenerateToken();

// 从请求中提取 Cookie 中的 token
function extractTokenFromCookie(req: Request): string | null {
  const cookieHeader = req.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((c: string) => c.trim());
  const tokenCookie = cookies.find((c: string) => c.startsWith("api_token="));

  if (!tokenCookie) return null;

  return tokenCookie.substring("api_token=".length);
}

// 从请求中提取 Authorization Header 中的 token
function extractTokenFromAuthHeader(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  // 支持 "Bearer token" 格式
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (match) return match[1] ?? null;

  // 直接使用 header 值
  return authHeader;
}

// 从请求中提取 token（支持 Cookie 和 Authorization Header）
function extractToken(req: Request): string | null {
  return extractTokenFromCookie(req) || extractTokenFromAuthHeader(req);
}

// 验证 token
function isValidToken(providedToken: string | null): boolean {
  if (!providedToken) return false;
  return providedToken === API_TOKEN;
}

// 设置 Cookie 的响应头
function createAuthCookieHeaders() {
  return {
    "Set-Cookie": `api_token=${API_TOKEN}; HttpOnly; Path=/; SameSite=Lax${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`,
    "Content-Type": "application/json",
    ...corsHeaders,
  };
}
// ==================== API Token 认证结束 ====================

const sessions = new Map<string, AgentSessionRuntime>();

async function getSessionMessages(id: string) {
  const sessionMeta = getSessionById(id) as any;
  if (!sessionMeta || !sessionMeta.file_path) {
    return null;
  }

  const filePath = sessionMeta.file_path;

  if (!existsSync(filePath)) {
    return null;
  }

  const fileContent = readFileSync(filePath, "utf-8");

  const messages: any[] = [];
  const lines = fileContent.split("\n").filter(Boolean);

  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      if (data.type === "message") {
        const msg = data.message;
        let content = "";

        if (msg.role === "user") {
          content = msg.content?.[0]?.text || "";
        } else if (msg.role === "assistant") {
          content =
            msg.content
              ?.map((c: any) => {
                if (c.type === "text") return c.text;
                if (c.type === "toolCall") return `[调用工具: ${c.name}]`;
                return "";
              })
              .join("") || "";
        } else if (msg.role === "toolResult") {
          content = msg.content?.[0]?.text || "";
        }

        if (content) {
          messages.push({
            role: msg.role === "toolResult" ? "tool" : msg.role,
            content,
            timestamp: msg.timestamp,
          });
        }
      }
    } catch (e) {
      // Skip invalid JSON lines
    }
  }

  return { sessionId: sessionMeta.session_id, messages };
}

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
    resourceLoader: {
      getExtensions: () => ({
        extensions: [],
        errors: [],
        runtime: createExtensionRuntime(),
      }),
      getSkills: () => ({
        skills: SKILLS.map((s) => ({
          ...s,
          sourceInfo: createSyntheticSourceInfo(s.filePath, {
            source: s.source,
            baseDir: s.baseDir,
          }),
        })),
        diagnostics: [],
      }),
      getPrompts: () => ({ prompts: [], diagnostics: [] }),
      getThemes: () => ({ themes: [], diagnostics: [] }),
      getAgentsFiles: () => ({ agentsFiles: [] }),
      getSystemPrompt: () => systemPrompt,
      getAppendSystemPrompt: () => [],
      extendResources: () => {},
      reload: async () => {},
    },
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

const PORT = process.env.PORT ? parseInt(process.env.PORT ?? "3000", 10) : 3000;

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

/**
 * 从 Session 文件中读取最后一条 assistant 消息的完整文本
 */
async function getLastAssistantMessageFromFile(
  sessionFilePath: string,
  logger?: { log: (msg: string) => void },
): Promise<string> {
  try {
    const file = Bun.file(sessionFilePath);
    const fileContent = await file.text();
    const lines = fileContent.split("\n").filter(Boolean);

    // 从后往前找最后一条 assistant 消息
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const line = lines[i];
        if (!line) continue;
        const data = JSON.parse(line);
        if (data.type === "message" && data.message?.role === "assistant") {
          // 提取所有 text 类型的 content
          const textParts =
            data.message.content
              ?.filter((c: any) => c.type === "text" || c.type === "thinking")
              .map((c: any) => (c.type === "thinking" ? c.thinking : c.text)) ||
            [];

          logger?.log(
            `[SESSION] 从文件读取最后一条 assistant 消息，长度: ${textParts.join("").length}`,
          );
          return textParts.join("");
        }
      } catch (e) {
        // Skip invalid JSON lines
      }
    }

    logger?.log("[SESSION] 未找到 assistant 消息");
    return "";
  } catch (e) {
    logger?.log(`[SESSION] 读取文件失败: ${e}`);
    return "";
  }
}

/**
 * 从 turn_end 事件的 message 中提取完整文本内容（基于内存，无文件 I/O）
 */
function extractCompleteContent(message: any): string {
  try {
    const textParts =
      message?.content
        ?.filter((c: any) => c.type === "text" || c.type === "thinking")
        .map((c: any) => (c.type === "thinking" ? c.thinking : c.text)) || [];
    return textParts.join("");
  } catch (e) {
    return "";
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function getContentType(filePath: string): string {
  const ext = filePath.split(".").pop();
  const types: Record<string, string> = {
    js: "application/javascript; charset=utf-8",
    ts: "application/javascript; charset=utf-8",
    tsx: "application/javascript; charset=utf-8",
    jsx: "application/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    html: "text/html; charset=utf-8",
    json: "application/json; charset=utf-8",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    ico: "image/x-icon",
  };
  return types[ext || ""] || "application/octet-stream";
}

async function handleApiMessage(req: Request): Promise<Response> {
  const startTime = Date.now();
  const logger = MonitorLogger.getInstance();
  let sessionId: string | undefined;
  let usedSessionId: string | undefined;

  try {
    const body = (await req.json()) as { message?: string; sessionId?: string };
    sessionId = body.sessionId;
    const { message } = body;

    logger.log(
      `[HTTP IN] Method: ${req.method} | Path: /api/messages | SessionID: ${sessionId || "(new)"} | Message: ${message?.substring(0, 100)}${message && message.length > 100 ? "..." : ""}`,
    );

    if (!message || typeof message !== "string") {
      logger.log(
        `[HTTP OUT] Status: 400 | Error: 缺少 'message' 字段 | Duration: ${Date.now() - startTime}ms`,
      );
      return Response.json(
        { error: "缺少 'message' 字段" },
        { status: 400, headers: corsHeaders },
      );
    }

    let session: AgentSession;

    if (sessionId) {
      const existing = getSession(sessionId);
      if (existing) {
        session = existing.session;
        usedSessionId = sessionId;
      } else {
        return Response.json(
          { error: "Session 不存在" },
          { status: 404, headers: corsHeaders },
        );
      }
    } else {
      usedSessionId = generateSessionId();
      const result = await createRuntime(usedSessionId);
      session = result.runtime.session;
      // 标记为临时会话，请求完成后清理 (P1-2 修复)
      (result.runtime as any).temporary = true;
    }

    // Get session file path from PI SDK (created when session is initialized)
    const sessionFilePath = session.sessionFile;

    await session.prompt(message);

    // 等待 session 完成（agent_end 事件或 isStreaming 为 false）
    let sessionMessages: any[] = [];
    try {
      const result = await waitForSessionComplete(session, logger);
      sessionMessages = result.messages;
    } catch (error: any) {
      if (error.message.includes("超时")) {
        logger.log(`[ERROR] Session 处理超时`);
        return Response.json(
          { error: "请求超时，请稍后重试" },
          { status: 408, headers: corsHeaders },
        );
      }
      throw error;
    }

    // Only save if this is a new session (no existing sessionId in request)
    if (!sessionId && sessionFilePath) {
      saveSessionMeta(usedSessionId, message, sessionFilePath);
    }

    // ✅ 从 agent_end 事件的 messages 字段提取最终内容
    const assistantMessages = sessionMessages.filter(
      (m) => m.role === "assistant",
    );
    const lastMessage = assistantMessages[assistantMessages.length - 1];

    let fullTextResponse = "";
    let generatedContent: string | undefined = "";

    if (lastMessage?.content) {
      const textParts =
        lastMessage.content
          .filter((c: any) => c.type === "text" || c.type === "thinking")
          .map((c: any) => (c.type === "thinking" ? c.thinking : c.text)) || [];
      fullTextResponse = textParts.join("");
    }

    // 从完整文本中提取最终内容
    generatedContent = extractFromSessionText(fullTextResponse, logger);

    // 如果事件中没有内容，尝试从文件读取（后备方案）
    if (!fullTextResponse && sessionFilePath) {
      fullTextResponse = await getLastAssistantMessageFromFile(
        sessionFilePath,
        logger,
      );
      generatedContent = extractFromSessionText(fullTextResponse, logger);
    }

    logger.log(
      `[HTTP OUT] Status: 200 | SessionID: ${usedSessionId} | ResponseLength: ${fullTextResponse.length} | HasGeneratedContent: ${!!generatedContent} | Duration: ${Date.now() - startTime}ms`,
    );

    // P1-2 修复: 清理临时会话（非 sessionId 参数创建的会话）
    const cleanupPromise = (!sessionId && usedSessionId)
      ? deleteSession(usedSessionId).catch((e) => {
          console.error(`[HTTP] 清理临时会话失败: ${usedSessionId}`, e);
        })
      : Promise.resolve();

    // 等待清理完成但不阻塞响应
    cleanupPromise.then(() => {
      if (!sessionId && usedSessionId) {
        console.log(`[HTTP] 已清理临时会话: ${usedSessionId}`);
      }
    });

    return Response.json(
      {
        sessionId: usedSessionId,
        response: fullTextResponse,
        generatedContent: generatedContent,
      },
      { headers: corsHeaders },
    );
  } catch (error: any) {
    // P1-2 修复: 错误时也要清理临时会话
    if (!sessionId && usedSessionId) {
      deleteSession(usedSessionId).catch((e) => {
        console.error(`[HTTP] 错误处理中清理临时会话失败: ${usedSessionId}`, e);
      });
    }

    logger.log(
      `[HTTP OUT] Status: 500 | Error: ${error.message} | Duration: ${Date.now() - startTime}ms`,
    );
    return Response.json(
      { error: error.message },
      { status: 500, headers: corsHeaders },
    );
  }
}

async function handleCreateSession(): Promise<Response> {
  const logger = MonitorLogger.getInstance();
  const startTime = Date.now();
  const sessionId = generateSessionId();
  await createRuntime(sessionId);
  logger.log(
    `[HTTP OUT] Method: POST | Path: /api/sessions | Status: 200 | SessionID: ${sessionId} | Duration: ${Date.now() - startTime}ms`,
  );
  return Response.json(
    { sessionId, message: "Session 已创建" },
    { headers: corsHeaders },
  );
}

function handleDeleteSession(sessionId: string): Response {
  const logger = MonitorLogger.getInstance();
  logger.log(`[HTTP IN] Method: DELETE | Path: /api/sessions/${sessionId}`);

  // Get session metadata to find file path
  const sessionMeta = getSessionById(sessionId);

  // Delete session file if it exists
  if (sessionMeta && sessionMeta.file_path) {
    try {
      unlinkSync(sessionMeta.file_path);
      console.log(`[DELETE] Deleted session file: ${sessionMeta.file_path}`);
    } catch (error: any) {
      console.error(`[DELETE] Failed to delete session file: ${error.message}`);
    }
  }

  // Delete from database
  const dbDeleted = deleteSessionFromDb(sessionId);
  if (dbDeleted) {
    console.log(`[DELETE] Deleted session from database: ${sessionId}`);
  }

  // Clean up in-memory session if it exists
  const session = getSession(sessionId);
  if (session) {
    deleteSession(sessionId);
  }

  logger.log(
    `[HTTP OUT] Method: DELETE | Path: /api/sessions/${sessionId} | Status: 200`,
  );
  return Response.json(
    { message: "Session 已完全删除" },
    { headers: corsHeaders },
  );
}

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 内部认证接口（本地前端自动认证）
    // 只设置 Cookie，不返回 token（前端通过 WebSocket 连接后自动认证）
    if (url.pathname === "/api/auth/internal") {
      return Response.json(
        { success: true, message: "自动认证成功" },
        { headers: createAuthCookieHeaders() },
      );
    }

    // 外部认证接口（需要手动传递 token）
    if (url.pathname === "/api/auth" && req.method === "POST") {
      try {
        const body = (await req.json()) as { token?: string };
        const providedToken = body.token;

        if (isValidToken(providedToken || null)) {
          return Response.json(
            { success: true, message: "认证成功" },
            { headers: createAuthCookieHeaders() },
          );
        } else {
          return Response.json(
            { success: false, message: "Token 无效" },
            { status: 401, headers: corsHeaders },
          );
        }
      } catch (e) {
        return Response.json(
          { success: false, message: "请求格式错误" },
          { status: 400, headers: corsHeaders },
        );
      }
    }

    if (url.pathname === "/ws") {
      // WebSocket 握手时不验证 Cookie（浏览器可能不携带）
      const upgraded = server.upgrade(req);
      if (upgraded) {
        return undefined;
      }
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // API 接口需要 Token 验证（除了认证接口）
    if (
      url.pathname.startsWith("/api/") &&
      !url.pathname.startsWith("/api/auth")
    ) {
      const token = extractToken(req);
      if (!isValidToken(token)) {
        return Response.json(
          {
            error: "未授权，请先认证",
            hint: "使用 POST /api/auth 并提供 token，或使用 Authorization: Bearer <token> header",
          },
          { status: 401, headers: corsHeaders },
        );
      }
    }

    if (url.pathname === "/api/messages" && req.method === "POST") {
      return handleApiMessage(req);
    }

    if (url.pathname === "/api/sessions" && req.method === "POST") {
      return handleCreateSession();
    }

    if (url.pathname === "/api/sessions/list" && req.method === "GET") {
      const allSessions = getAllSessions();
      return Response.json({ sessions: allSessions }, { headers: corsHeaders });
    }

    if (url.pathname.startsWith("/api/sessions/") && req.method === "GET") {
      const id = url.pathname.split("/").pop()!;
      const sessionMessages = await getSessionMessages(id);
      if (!sessionMessages) {
        return Response.json(
          { error: "Session 不存在" },
          { status: 404, headers: corsHeaders },
        );
      }
      return Response.json(sessionMessages, { headers: corsHeaders });
    }

    if (url.pathname.startsWith("/api/sessions/") && req.method === "DELETE") {
      const sessionId = url.pathname.split("/").pop()!;
      return handleDeleteSession(sessionId);
    }

    if (url.pathname === "/health" && req.method === "GET") {
      return Response.json(
        { status: "ok", sessions: sessions.size },
        { headers: corsHeaders },
      );
    }

    // Serve chat UI
    if (url.pathname === "/" && req.method === "GET") {
      return new Response(Bun.file("./frontend/chat.html"), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Serve frontend static files with Bun's transpiler
    if (url.pathname.startsWith("/frontend/")) {
      const filePath = "." + url.pathname;
      const file = Bun.file(filePath);

      // Check if file exists
      if (await file.exists()) {
        // For TSX/JSX files, transpile on the fly
        if (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) {
          const transpiled = await Bun.build({
            entrypoints: [filePath],
            target: "browser",
            minify: false,
            jsx: {
              runtime: "automatic",
              importSource: "react",
            },
          });

          return new Response(transpiled.outputs[0], {
            headers: {
              "Content-Type": "application/javascript; charset=utf-8",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        return new Response(file, {
          headers: {
            "Content-Type": getContentType(filePath),
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
  websocket: {
    open(ws: any) {
      // WebSocket 握手时不验证 Cookie（浏览器可能不携带）
      // 等待第一条消息，如果是认证请求则验证，否则假设已通过 Cookie 认证
      console.log("[WebSocket] 新连接已建立");
      const sessionId = generateSessionId();

      // Create logger instance
      const logger = MonitorLogger.createInstance();
      (ws as any).data = {
        sessionId,
        logger,
        authenticated: false, // 添加认证标志
      };

      logger.log(`[SESSION] Session ${sessionId} started, WebSocket opened`);

      createRuntime(sessionId)
        .then((result) => {
          const runtime = result.runtime;
          const session = runtime.session;
          (ws as any).data.runtime = runtime;
          (ws as any).data.session = session;
          (ws as any).data.firstMessageSaved = false;
          ws.send(
            JSON.stringify({
              type: "connected",
              sessionId,
              message: "WebSocket 连接已建立",
            }),
          );

          logger.log(`[SESSION] Session created successfully`);

          // Send response_start when AI starts responding
          let hasSentResponseStart = false;
          const textDeltas: string[] = [];
          // 防止 message_end 并发处理的标志位
          let isProcessingMessageEnd = false;
          let hasSentResponseEnd = false;

          // 保存 unsubscribe 函数以便在连接关闭时清理
          const unsubscribe = session.subscribe((event) => {
            logger.log(`[EVENT] Type: ${event.type}`);

            // 记录 message_start 时间，用于检测快速拒绝
            if (event.type === "message_start") {
              (ws as any).data.messageStartTime = Date.now();
              // 发送 message_start 给前端（用于控制停止按钮）
              ws.send(
                JSON.stringify({
                  type: "message_start",
                }),
              );
            }

            // 检测快速拒绝：如果 message_start 到 message_end < 300ms，认为是被模型过滤
            if (event.type === "message_end") {
              // 发送 message_end 给前端（用于控制停止按钮）
              ws.send(
                JSON.stringify({
                  type: "message_end",
                }),
              );

              const messageStartTime = (ws as any).data.messageStartTime;
              const elapsed = messageStartTime
                ? Date.now() - messageStartTime
                : 0;

              if (elapsed < 300 && !hasSentResponseStart) {
                logger.log(
                  `[SESSION] 检测到快速拒绝 (${elapsed}ms)，跳过并等待新消息`,
                );
                (ws as any).data.messageStartTime = null;
                return; // 跳过这个空的 message_end，等待后续
              }
            }

            if (event.type === "message_update") {
              if (!hasSentResponseStart) {
                hasSentResponseStart = true;
                ws.send(
                  JSON.stringify({
                    type: "response_start",
                  }),
                );
              }
              if (event.assistantMessageEvent.type === "text_delta") {
                const rawDelta = event.assistantMessageEvent.delta;
                textDeltas.push(rawDelta);

                // 解析 think 标签
                const { textDelta, thinkDelta } = parseThinkTagsFromDelta(rawDelta, ws);

                // 发送普通文本内容（如果有实质内容）
                if (textDelta && textDelta.trim().length > 0) {
                  ws.send(
                    JSON.stringify({
                      type: "text_delta",
                      delta: textDelta,
                    }),
                  );
                }

                // 发送 think 内容（如果有）
                if (thinkDelta) {
                  ws.send(
                    JSON.stringify({
                      type: "think_block",
                      content: thinkDelta,
                    }),
                  );
                }
              } else if (
                event.assistantMessageEvent.type === "thinking_start"
              ) {
                logger.log(
                  `[THINKING_START] ContentIndex: ${event.assistantMessageEvent.contentIndex}`,
                );
                ws.send(
                  JSON.stringify({
                    type: "thinking_start",
                    contentIndex: event.assistantMessageEvent.contentIndex,
                  }),
                );
              } else if (
                event.assistantMessageEvent.type === "thinking_delta"
              ) {
                ws.send(
                  JSON.stringify({
                    type: "thinking_delta",
                    delta: event.assistantMessageEvent.delta,
                  }),
                );
              } else if (event.assistantMessageEvent.type === "thinking_end") {
                logger.log(
                  `[THINKING_END] ContentIndex: ${event.assistantMessageEvent.contentIndex}`,
                );
                ws.send(
                  JSON.stringify({
                    type: "thinking_end",
                    contentIndex: event.assistantMessageEvent.contentIndex,
                    content: event.assistantMessageEvent.content,
                  }),
                );
              } else if (
                event.assistantMessageEvent.type === "toolcall_start"
              ) {
                // LLM started generating a tool call - show loading immediately
                const partial = event.assistantMessageEvent.partial;
                const toolCall =
                  partial.content?.[event.assistantMessageEvent.contentIndex];
                if (toolCall && toolCall.type === "toolCall") {
                  logger.log(
                    `[TOOLCALL_START] Tool: ${toolCall.name}, ContentIndex: ${event.assistantMessageEvent.contentIndex}`,
                  );
                  ws.send(
                    JSON.stringify({
                      type: "tool_call_start",
                      tool: toolCall.name,
                      contentIndex: event.assistantMessageEvent.contentIndex,
                    }),
                  );
                }
              } else if (event.assistantMessageEvent.type === "toolcall_end") {
                // LLM finished generating the tool call
                logger.log(
                  `[TOOLCALL_END] ContentIndex: ${event.assistantMessageEvent.contentIndex}`,
                );
              } else {
                logger.log(
                  `[MESSAGE_UPDATE] ${JSON.stringify(event.assistantMessageEvent).substring(0, 200)}...`,
                );
              }
            } else if (event.type === "tool_execution_start") {
              logger.log(
                `[TOOL_EXECUTION_START] Tool: ${event.toolName}, Args: ${JSON.stringify(event.args).substring(0, 100)}...`,
              );
              ws.send(
                JSON.stringify({
                  type: "tool_start",
                  tool: event.toolName,
                  args: event.args,
                }),
              );
            } else if (event.type === "tool_execution_end") {
              const result = event.result;
              const content = result?.content?.[0]?.text || "";
              logger.log(
                `[TOOL_EXECUTION_END] Tool: ${event.toolName}, Success: ${!event.isError}, Result length: ${content.length}`,
              );
              ws.send(
                JSON.stringify({
                  type: "tool_end",
                  tool: event.toolName,
                  success: !event.isError,
                  result: content,
                }),
              );
            } else if (event.type === "message_end") {
              // 防止并发处理 message_end 事件
              if (isProcessingMessageEnd) {
                logger.log("[SESSION] message_end 已在处理中，跳过重复事件");
                return;
              }

              // 只标记 message_end 已处理，不发送 response_end
              // 等待 turn_end 或 agent_end 再发送 response_end
              isProcessingMessageEnd = true;
              logger.log("[SESSION] message_end 收到，等待 turn_end");
              isProcessingMessageEnd = false;
            }

            // turn_end: 发送完整消息内容供前端重新渲染
            if (event.type === "turn_end") {
              logger.log("[SESSION] turn_end 收到，发送完整内容");
              const completeContent = extractCompleteContent((event as any).message);
              ws.send(
                JSON.stringify({
                  type: "turn_end",
                  content: completeContent,
                }),
              );
            }

            // agent_end: 整个 Agent 执行结束，发送 response_end
            if (event.type === "agent_end" && !hasSentResponseEnd) {
              logger.log("[SESSION] agent_end 收到，发送 response_end");
              hasSentResponseEnd = true;
              hasSentResponseStart = false;

              const sessionFilePath = session.sessionFile;
              if (!sessionFilePath) {
                ws.send(
                  JSON.stringify({
                    type: "response_end",
                    generatedContent: undefined,
                  }),
                );
              } else {
                void (async () => {
                  const fullTextResponse =
                    await getLastAssistantMessageFromFile(
                      sessionFilePath,
                      logger,
                    );
                  const generatedContent =
                    extractFromSessionText(fullTextResponse);
                  ws.send(
                    JSON.stringify({
                      type: "response_end",
                      generatedContent,
                    }),
                  );
                  textDeltas.length = 0;
                })();
              }
            }
          });

          // 保存 unsubscribe 函数以便在连接关闭时清理
          (ws as any).data.unsubscribe = unsubscribe;
        })
        .catch((error) => {
          // Session 创建失败处理
          console.error(`[WebSocket] Session 创建失败: ${error.message}`);
          logger.log(`[ERROR] Session 创建失败: ${error.message}`);

          // 通知客户端创建失败
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Session 创建失败，请重试",
            }),
          );

          // 清理可能已创建的 runtime (P0 修复)
          const tempSessionId = (ws as any).data?.sessionId;
          if (tempSessionId) {
            const tempRuntime = sessions.get(tempSessionId);
            if (tempRuntime) {
              try {
                tempRuntime.dispose();
                sessions.delete(tempSessionId);
                console.log(`[WebSocket] 已清理失败的 runtime: ${tempSessionId}`);
              } catch (e) {
                console.error(`[WebSocket] 清理失败 runtime 时出错:`, e);
              }
            }
          }

          // 关闭连接
          ws.close(1011, "Session creation failed");
        });
    },
    async message(ws: any, message: any) {
      try {
        const data = JSON.parse(message.toString()) as {
          type?: string;
          message?: string;
          sessionId?: string;
          token?: string;
        };

        // 认证消息处理（本地前端直接信任）
        if (data.type === "auth") {
          // 本地前端已经通过 /api/auth/internal 认证过
          // 直接认证成功，不验证 token
          (ws as any).data.authenticated = true;
          console.log("[WebSocket] 认证成功（本地前端）");
          ws.send(JSON.stringify({ type: "auth_success" }));
          return;
        }

        // 其他消息需要先认证
        if (!(ws as any).data?.authenticated) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "未认证，请先发送 auth 消息",
            }),
          );
          ws.close(1008, "Unauthorized");
          return;
        }

        const sessionId = (ws as any).data?.sessionId;
        const runtime = getSession(sessionId!);

        if (!runtime) {
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Session 不存在",
            }),
          );
          return;
        }

        const session = runtime.session;

        if (data.type === "stop") {
          console.log(`[WebSocket] 收到停止请求`);
          if (session.isStreaming) {
            await session.abort();
            console.log(`[WebSocket] 已停止 AI 回复`);
          }
          return;
        }

        if (data.type === "switch_session" && data.sessionId) {
          // 防止并发切换 session
          if ((ws as any).data.isSwitchingSession) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Session 切换中，请稍后",
              }),
            );
            return;
          }

          console.log(`[WebSocket] 切换 session 到: ${data.sessionId}`);

          const sessionMeta = getSessionById(data.sessionId);
          if (!sessionMeta || !sessionMeta.file_path) {
            ws.send(
              JSON.stringify({
                type: "error",
                message: "Session 不存在或文件路径无效",
              }),
            );
            return;
          }

          (ws as any).data.isSwitchingSession = true;

          try {
            // 使用 AgentSessionRuntime 的 switchSession 方法
            const runtime = (ws as any).data.runtime as AgentSessionRuntime;
            if (!runtime) {
              throw new Error("Runtime 不存在");
            }

            // 取消旧的事件订阅
            const oldUnsubscribe = (ws as any).data.unsubscribe;
            if (oldUnsubscribe) {
              try {
                oldUnsubscribe();
                console.log(`[WebSocket] 已取消旧 session 的事件订阅`);
              } catch (e) {
                console.error(`[WebSocket] 取消旧订阅失败:`, e);
              }
            }

            const result = await runtime.switchSession(sessionMeta.file_path);
            if (!result.cancelled) {
              // 更新 session 引用
              const newSession = runtime.session;

              // 为新 session 设置事件监听（复制原有的订阅逻辑）
              setupEventSubscriptionForSwitch(ws, newSession, (ws as any).data.logger);

              // P1-1 修复: 检查目标 sessionId 是否已存在，清理旧 runtime
              const existingRuntime = sessions.get(data.sessionId);
              if (existingRuntime && existingRuntime !== runtime) {
                try {
                  existingRuntime.dispose();
                  console.log(`[WebSocket] 已清理被覆盖的 runtime: ${data.sessionId}`);
                } catch (e) {
                  console.error(`[WebSocket] 清理旧 runtime 失败:`, e);
                }
              }

              // Update sessions Map mapping
              sessions.set(data.sessionId, runtime);

              // Remove old sessionId mapping if different
              if (sessionId && sessionId !== data.sessionId) {
                sessions.delete(sessionId);
              }

              // Update the sessionId in ws.data
              (ws as any).data.sessionId = data.sessionId;
              (ws as any).data.firstMessageSaved = true; // Existing session, don't save meta again
              (ws as any).data.session = newSession; // Update session reference

              ws.send(
                JSON.stringify({
                  type: "session_switched",
                  sessionId: data.sessionId,
                }),
              );
              console.log(`[WebSocket] Session 切换成功: ${data.sessionId}`);
            } else {
              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "切换 session 被取消",
                }),
              );
            }
          } catch (error: any) {
            console.error(`[WebSocket] 切换 session 出错:`, error);
            ws.send(
              JSON.stringify({
                type: "error",
                message: "切换 session 出错，请重试",
              }),
            );
          } finally {
            (ws as any).data.isSwitchingSession = false;
          }
        } else if (data.type === "prompt" && typeof data.message === "string") {
          console.log(`[WebSocket] 收到消息: ${data.message}`);

          const firstMessageSaved = (ws as any).data?.firstMessageSaved;
          if (!firstMessageSaved) {
            // Get session file path from PI SDK (created when session is initialized)
            const filePath = session.sessionFile;

            if (filePath) {
              saveSessionMeta(sessionId!, data.message, filePath);
              (ws as any).data.firstMessageSaved = true;
            }
          }

          // Check if session is currently streaming a response
          if (session.isStreaming) {
            // Queue the prompt to be processed after current response completes
            console.log(`[WebSocket] 会话正在响应中，将新消息加入队列`);

            // Notify frontend that question is queued
            ws.send(
              JSON.stringify({
                type: "question_queued",
                question: data.message,
              }),
            );

            session.followUp(data.message).catch((error) => {
              const errorMessage = error?.message || "未知错误";
              const wsLogger = (ws as any).data?.logger;
              if (wsLogger) {
                wsLogger.log(`[ERROR] followUp 失败: ${errorMessage}`);
              }
              console.error(`[WebSocket] followUp 失败:`, error);

              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "消息处理失败，请重试",
                }),
              );
            });
          } else {
            // Process immediately if no active streaming
            session.prompt(data.message).catch((error) => {
              const errorMessage = error?.message || "未知错误";
              const wsLogger = (ws as any).data?.logger;
              if (wsLogger) {
                wsLogger.log(`[ERROR] prompt 失败: ${errorMessage}`);
              }
              console.error(`[WebSocket] prompt 失败:`, error);

              ws.send(
                JSON.stringify({
                  type: "error",
                  message: "消息处理失败，请重试",
                }),
              );
            });
          }
        }
      } catch (error: any) {
        ws.send(
          JSON.stringify({
            type: "error",
            message: `解析消息失败: ${error.message}`,
          }),
        );
      }
    },
    close(ws: any) {
      const sessionId = (ws as any).data?.sessionId;
      const logger = (ws as any).data?.logger;
      console.log(`[WebSocket] 连接已关闭: ${sessionId}`);

      // 清理 think 解析器状态
      cleanupThinkParserState(ws);

      // 清理事件订阅，防止内存泄漏
      const unsubscribe = (ws as any).data?.unsubscribe;
      if (unsubscribe) {
        try {
          unsubscribe();
          console.log(`[WebSocket] 已清理事件订阅: ${sessionId}`);
        } catch (error) {
          console.error(`[WebSocket] 清理订阅失败: ${error}`);
        }
      }

      if (logger) {
        try {
          logger.log(`[SESSION] Session ${sessionId} WebSocket closed`);
          logger.close();
        } catch (error) {
          console.error(`[WebSocket] Logger 关闭失败:`, error);
        }
      }

      // 清理 runtime (P0 修复)
      if (sessionId) {
        deleteSession(sessionId);
      }

      // 清理 ws.data 引用
      (ws as any).data = null;
    },
  },
});

console.log("=".repeat(60));
console.log("🚀 MiniAgent Gateway 已启动！");
console.log("=".repeat(60));
console.log(`📡 HTTP: http://localhost:${server.port}`);
console.log(`🔌 WebSocket: ws://localhost:${server.port}/ws`);
console.log("=".repeat(60));
