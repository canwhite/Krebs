import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { parseThinkTagsFromDelta } from "./think-parser.js";
import {
  extractFromTurnEvent,
  extractFromSessionFile,
  extractFromMessages,
} from "../lib/session-transcript.js";

// ==================== Shared State ====================

interface SharedState {
  hasSentResponseStart: boolean;
  hasSentResponseEnd: boolean;
  messageStartTime: number | null;
  textDeltas: string[];
  isProcessingMessageEnd: boolean;
}

// ==================== Message Event Handler ====================

class MessageEventHandler {
  constructor(
    private ws: any,
    private logger: { log: (msg: string) => void },
    private state: SharedState,
  ) {}

  onMessageStart(event: { type: string }) {
    this.state.messageStartTime = Date.now();
    this.ws.send(JSON.stringify({ type: "message_start" }));
  }

  onMessageEnd(event: { type: string }) {
    this.ws.send(JSON.stringify({ type: "message_end" }));

    const elapsed = this.state.messageStartTime
      ? Date.now() - this.state.messageStartTime
      : 0;

    if (elapsed < 300 && !this.state.hasSentResponseStart) {
      this.logger.log(
        `[SESSION] 检测到快速拒绝 (${elapsed}ms)，跳过并等待新消息`,
      );
      this.state.messageStartTime = null;
      return;
    }

    // Guard against concurrent message_end events
    if (this.state.isProcessingMessageEnd) {
      this.logger.log("[SESSION] message_end 已在处理中，跳过重复事件");
      return;
    }
    this.state.isProcessingMessageEnd = true;
    this.logger.log("[SESSION] message_end 收到，等待 turn_end");
  }

  onMessageUpdate(event: any) {
    if (!this.state.hasSentResponseStart) {
      this.state.hasSentResponseStart = true;
      this.ws.send(JSON.stringify({ type: "response_start" }));
    }

    const ev = event.assistantMessageEvent;

    if (ev.type === "text_delta") {
      const rawDelta = ev.delta;
      this.state.textDeltas.push(rawDelta);

      const { textDelta, thinkDelta } = parseThinkTagsFromDelta(rawDelta, this.ws);

      if (textDelta && textDelta.trim().length > 0) {
        this.ws.send(JSON.stringify({ type: "text_delta", delta: textDelta }));
      }

      if (thinkDelta) {
        this.ws.send(JSON.stringify({ type: "think_block", content: thinkDelta }));
      }
    } else if (ev.type === "thinking_start") {
      this.logger.log(`[THINKING_START] ContentIndex: ${ev.contentIndex}`);
      this.ws.send(
        JSON.stringify({ type: "thinking_start", contentIndex: ev.contentIndex }),
      );
    } else if (ev.type === "thinking_delta") {
      this.ws.send(JSON.stringify({ type: "thinking_delta", delta: ev.delta }));
    } else if (ev.type === "thinking_end") {
      this.logger.log(`[THINKING_END] ContentIndex: ${ev.contentIndex}`);
      this.ws.send(
        JSON.stringify({
          type: "thinking_end",
          contentIndex: ev.contentIndex,
          content: ev.content,
        }),
      );
    } else if (ev.type === "toolcall_start") {
      const partial = ev.partial;
      const toolCall = partial.content?.[ev.contentIndex];
      if (toolCall && toolCall.type === "toolCall") {
        this.logger.log(
          `[TOOLCALL_START] Tool: ${toolCall.name}, ContentIndex: ${ev.contentIndex}`,
        );
        this.ws.send(
          JSON.stringify({
            type: "tool_call_start",
            tool: toolCall.name,
            contentIndex: ev.contentIndex,
          }),
        );
      }
    } else if (ev.type === "toolcall_end") {
      this.logger.log(`[TOOLCALL_END] ContentIndex: ${ev.contentIndex}`);
    } else {
      this.logger.log(
        `[MESSAGE_UPDATE] ${JSON.stringify(ev).substring(0, 200)}...`,
      );
    }
  }
}

// ==================== Tool Event Handler ====================

class ToolEventHandler {
  constructor(
    private ws: any,
    private logger: { log: (msg: string) => void },
  ) {}

  onExecutionStart(event: { toolName: string; args: any }) {
    this.logger.log(
      `[TOOL_EXECUTION_START] Tool: ${event.toolName}, Args: ${JSON.stringify(event.args).substring(0, 100)}...`,
    );
    this.ws.send(
      JSON.stringify({
        type: "tool_start",
        tool: event.toolName,
        args: event.args,
      }),
    );
  }

  onExecutionEnd(event: { toolName: string; result: any; isError: boolean }) {
    let content = "";
    if (event.result?.content) {
      for (const item of event.result.content) {
        if (item.type === "text") content += item.text;
      }
    }
    this.logger.log(
      `[TOOL_EXECUTION_END] Tool: ${event.toolName}, Success: ${!event.isError}`,
    );
    this.ws.send(
      JSON.stringify({
        type: "tool_end",
        tool: event.toolName,
        success: !event.isError,
        result: content,
      }),
    );
  }
}

// ==================== Session End Handler ====================

class SessionEndHandler {
  constructor(
    private ws: any,
    private logger: { log: (msg: string) => void },
    private state: SharedState,
    private session: AgentSession,
  ) {}

  onTurnEnd(event: any) {
    // Clear message_end guard
    this.state.isProcessingMessageEnd = false;

    this.logger.log("[SESSION] turn_end 收到，发送完整内容");
    const completeContent = extractFromTurnEvent(event.message);
    this.ws.send(
      JSON.stringify({ type: "turn_end", content: completeContent }),
    );
  }

  onAgentEnd() {
    if (this.state.hasSentResponseEnd) return;
    this.state.hasSentResponseEnd = true;
    this.state.hasSentResponseStart = false;

    this.logger.log("[SESSION] agent_end 收到，发送 response_end");

    const sessionFilePath = this.session.sessionFile;
    if (!sessionFilePath) {
      this.ws.send(
        JSON.stringify({ type: "response_end", generatedContent: undefined }),
      );
      return;
    }

    void (async () => {
      const fullTextResponse = await extractFromSessionFile(
        sessionFilePath,
        this.logger,
      );
      const generatedContent = extractFromMessages(fullTextResponse);
      this.ws.send(
        JSON.stringify({ type: "response_end", generatedContent }),
      );
      this.state.textDeltas.length = 0;
    })();
  }
}

// ==================== Main Subscribe ====================

export function subscribeToSessionEvents(
  ws: any,
  session: AgentSession,
  logger: { log: (msg: string) => void },
  options: { hasSentResponseStart?: boolean; textDeltas?: string[] } = {},
): () => void {
  const state: SharedState = {
    hasSentResponseStart: options.hasSentResponseStart ?? false,
    hasSentResponseEnd: false,
    messageStartTime: null,
    textDeltas: options.textDeltas ?? [],
    isProcessingMessageEnd: false,
  };

  const messageHandler = new MessageEventHandler(ws, logger, state);
  const toolHandler = new ToolEventHandler(ws, logger);
  const sessionEndHandler = new SessionEndHandler(ws, logger, state, session);

  const unsubscribe = session.subscribe((event) => {
    logger.log(`[EVENT] Type: ${event.type}`);

    // NOTE: event order must be preserved — handlers are dispatched by type only
    if (event.type === "message_start") {
      messageHandler.onMessageStart(event);
    } else if (event.type === "message_end") {
      messageHandler.onMessageEnd(event);
    } else if (event.type === "message_update") {
      messageHandler.onMessageUpdate(event);
    } else if (event.type === "tool_execution_start") {
      toolHandler.onExecutionStart(event);
    } else if (event.type === "tool_execution_end") {
      toolHandler.onExecutionEnd(event);
    } else if (event.type === "turn_end") {
      sessionEndHandler.onTurnEnd(event);
    } else if (event.type === "agent_end") {
      sessionEndHandler.onAgentEnd();
    }
  });

  return unsubscribe;
}
