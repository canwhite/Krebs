/// <reference types="bun-types" />
import { MonitorLogger } from "../lib/logger.js";
import { extractFromSessionText } from "../lib/session-content-extractor.js";
import {
  saveSessionMeta,
  getAllSessions,
  getSessionById,
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

// ==================== Constants ====================
const PORT = process.env.PORT ? parseInt(process.env.PORT ?? "3000", 10) : 3000;

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
      (ws as any).data = {
        sessionId,
        logger,
        authenticated: false,
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
            const runtime = (ws as any).data.runtime as any;
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

              // 使用共享的事件订阅工厂
              const unsubscribe = subscribeToSessionEvents(
                ws,
                newSession,
                (ws as any).data.logger,
              );
              (ws as any).data.unsubscribe = unsubscribe;

              // P1-1 修复: 检查目标 sessionId 是否已存在，清理旧 runtime
              const existingRuntime = sessions.get(data.sessionId);
              if (existingRuntime && existingRuntime !== runtime) {
                try {
                  existingRuntime.dispose();
                  console.log(
                    `[WebSocket] 已清理被覆盖的 runtime: ${data.sessionId}`,
                  );
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
              (ws as any).data.firstMessageSaved = true;
              (ws as any).data.session = newSession;

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
            const filePath = session.sessionFile;

            if (filePath) {
              saveSessionMeta(sessionId!, data.message, filePath);
              (ws as any).data.firstMessageSaved = true;
            }
          }

          if (session.isStreaming) {
            console.log(`[WebSocket] 会话正在响应中，将新消息加入队列`);

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
console.log("🚀 Krebs Gateway 已启动！");
console.log("=".repeat(60));
console.log(`📡 HTTP: http://localhost:${server.port}`);
console.log(`🔌 WebSocket: ws://localhost:${server.port}/ws`);
console.log("=".repeat(60));
