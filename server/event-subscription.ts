import type { AgentSession } from "@mariozechner/pi-coding-agent";
import { parseThinkTagsFromDelta } from "./think-parser.js";
import {
  extractFromTurnEvent,
  extractFromSessionFile,
  extractFromMessages,
} from "../lib/session-transcript.js";

/**
 * Subscribe to session events and forward them to the WebSocket client.
 * Returns an unsubscribe function.
 */
export function subscribeToSessionEvents(
  ws: any,
  session: AgentSession,
  logger: { log: (msg: string) => void },
  options: {
    hasSentResponseStart?: boolean;
    textDeltas?: string[];
  } = {},
): () => void {
  let hasSentResponseStart = options.hasSentResponseStart ?? false;
  const textDeltas = options.textDeltas ?? [];
  let isProcessingMessageEnd = false;
  let hasSentResponseEnd = false;

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
      const completeContent = extractFromTurnEvent((event as any).message);
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
            await extractFromSessionFile(
              sessionFilePath,
              logger,
            );
          const generatedContent =
            extractFromMessages(fullTextResponse);
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

  return unsubscribe;
}
