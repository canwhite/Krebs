import { getSessionById, deleteSessionFromDb } from "../../db/index.js";
import {
  generateSessionId,
  createRuntime,
  getSession,
  deleteSession,
} from "../session-service.js";
import { corsHeaders } from "./index.js";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { MonitorLogger } from "../../lib/logger.js";

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

export { getSessionMessages, handleCreateSession, handleDeleteSession };
