/// <reference types="bun-types" />
import { MonitorLogger } from "../lib/logger.js";
import {
  saveSessionMeta,
  getAllSessions,
} from "../db/index.js";
import {
  createRuntime,
  getSession,
  deleteSession,
  generateSessionId,
  sessions,
  MODEL_CONFIG,
} from "./session-service.js";
import { subscribeToSessionEvents } from "./event-subscription.js";
import { cleanupThinkParserState } from "./think-parser.js";
import { extractToken, isValidToken, initToken } from "./auth.js";
import { corsHeaders } from "./routes/index.js";
import { handleApiMessage } from "./routes/messages.js";
import {
  handleCreateSession,
  handleDeleteSession,
  getSessionMessages,
} from "./routes/sessions.js";
import { handleInternalAuth, handleExternalAuth } from "./routes/auth.js";
import { createWsRouter, type WsRouter } from "./ws-router.js";
import { luaRuntime } from "../tools/lua-runtime.js";
import { loadLuaToolDefinitions } from "../tools/lua-tools-registry.js";
import { registerTool } from "../tools/index.js";
import { join } from "node:path";
import {
  createAuthHandler,
  createStopHandler,
  createSwitchSessionHandler,
  createPromptHandler,
} from "./handlers/index.js";

// ==================== Init ====================
if (!MODEL_CONFIG.apiKey) {
  console.error("错误：未设置 API Key 环境变量");
  console.error("请设置以下之一：");
  console.error("  API_KEY=your_key_here           # 推荐，通用配置");
  console.error("  DEEPSEEK_API_KEY=your_key_here  # 兼容旧配置");
  console.error("  ANTHROPIC_API_KEY=your_key_here # 使用 Claude");
  process.exit(1);
}

initToken();

// ==================== Lua Tools Init ====================
const luaToolsPath = join(process.cwd(), "lua-tools");

async function initLuaTools() {
  try {
    await luaRuntime.initialize();
    const definitions = await loadLuaToolDefinitions(luaToolsPath);
    for (const def of definitions) {
      registerTool(def);
    }
    console.log(`[Lua] 已加载 ${definitions.length} 个工具`);
  } catch (error: any) {
    console.warn(`[Lua] 初始化失败: ${error.message}`);
  }
}

// ==================== Constants ====================
const PORT = process.env.PORT ? parseInt(process.env.PORT ?? "3333", 10) : 3333;

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

// ==================== Server ====================
(async () => {
  // 等待 Lua 工具初始化完成
  await initLuaTools();

  const server = Bun.serve({
    port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 内部认证接口（本地前端自动认证）
    if (url.pathname === "/api/auth/internal") {
      return handleInternalAuth();
    }

    // 外部认证接口（需要手动传递 token）
    if (url.pathname === "/api/auth" && req.method === "POST") {
      return handleExternalAuth(req);
    }

    if (url.pathname === "/ws") {
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
      console.log("[WebSocket] 新连接已建立");
      const sessionId = generateSessionId();

      // Create logger instance
      const logger = MonitorLogger.createInstance();

      // 创建路由器（每个连接一个实例）
      const router: WsRouter = createWsRouter({
        authHandler: createAuthHandler(),
        stopHandler: createStopHandler(),
        switchSessionHandler: createSwitchSessionHandler(),
        promptHandler: createPromptHandler(),
      });

      (ws as any).data = {
        sessionId,
        logger,
        authenticated: false,
        router,
      };

      logger.log(`[SESSION] Session ${sessionId} started, WebSocket opened`);

      createRuntime(sessionId, undefined, true)
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

          // 使用共享的事件订阅工厂
          const unsubscribe = subscribeToSessionEvents(ws, session, logger);
          (ws as any).data.unsubscribe = unsubscribe;
        })
        .catch((error) => {
          console.error(`[WebSocket] Session 创建失败: ${error.message}`);
          logger.log(`[ERROR] Session 创建失败: ${error.message}`);

          ws.send(
            JSON.stringify({
              type: "error",
              message: "Session 创建失败，请重试",
            }),
          );

          const tempSessionId = (ws as any).data?.sessionId;
          if (tempSessionId) {
            const tempRuntime = sessions.get(tempSessionId);
            if (tempRuntime) {
              try {
                tempRuntime.dispose();
                sessions.delete(tempSessionId);
                console.log(
                  `[WebSocket] 已清理失败的 runtime: ${tempSessionId}`,
                );
              } catch (e) {
                console.error(`[WebSocket] 清理失败 runtime 时出错:`, e);
              }
            }
          }

          ws.close(1011, "Session creation failed");
        });
    },
    message(ws: any, message: any) {
      const router: WsRouter = (ws as any).data?.router;
      if (!router) {
        ws.send(JSON.stringify({ type: "error", message: "Router 未初始化" }));
        return;
      }

      // 认证检查（auth 消息在路由器内部处理）
      const data = JSON.parse(message.toString()) as { type?: string };
      if (data.type !== "auth") {
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

        // 检查 session 是否存在
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
      }

      // 路由消息
      router.handleMessage(ws, message);
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
console.log("🚀 Krebs Gateway 已启动！");
console.log("=".repeat(60));
console.log(`📡 HTTP: http://localhost:${server.port}`);
console.log(`🔌 WebSocket: ws://localhost:${server.port}/ws`);
console.log("=".repeat(60));
})();
