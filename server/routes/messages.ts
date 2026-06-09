import { MonitorLogger } from "../../lib/logger.js";
import {
  extractWithFallback,
} from "../../lib/session-transcript.js";
import {
  getSession,
  generateSessionId,
  createRuntime,
  waitForSessionComplete,
  deleteSession,
} from "../session-service.js";
import { saveSessionMeta } from "../../db/index.js";
import { corsHeaders } from "./index.js";

async function handleApiMessage(req: Request): Promise<Response> {
  const startTime = Date.now();
  const logger = MonitorLogger.createInstance("http");
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

    let session: any;

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
      const result = await createRuntime(usedSessionId, undefined, true);
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

    if (lastMessage?.content) {
      const textParts =
        lastMessage.content
          .filter((c: any) => c.type === "text" || c.type === "thinking")
          .map((c: any) => (c.type === "thinking" ? c.thinking : c.text)) || [];
      fullTextResponse = textParts.join("");
    }

    // 使用统一的提取函数（带后备方案）
    const generatedContent = await extractWithFallback(
      sessionMessages,
      sessionFilePath,
      logger,
    );

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

export { handleApiMessage };
