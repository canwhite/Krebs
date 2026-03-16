/**
 * Gateway WebSocket 服务器
 *
 * 架构改进：
 * - 使用 ChatService 接口进行聊天处理
 * - 解耦 Gateway 和具体实现
 */

import { WebSocketServer, WebSocket } from "ws";
import { createLogger } from "../../shared/logger.js";
import type { IChatService } from "../service/chat-service.js";
import type {
  RequestFrame,
  ResponseFrame,
  ChatSendParams,
  ChatChunkEvent,
} from "../protocol/frames.js";
import type { ToolCallEvent } from "@/agent/core/agent.js";

const log = createLogger("Gateway:WS");

export class GatewayWsServer {
  private readonly wss: WebSocketServer;
  private readonly chatService: IChatService;
  private readonly port: number;
  private readonly host: string;

  constructor(
    chatService: IChatService,
    port: number,
    host: string = "0.0.0.0"
    // agentManager 参数已移除，如需要可在未来添加
  ) {
    this.chatService = chatService;
    this.port = port;
    this.host = host;

    // 创建WebSocketServer，并在监听error事件
    this.wss = new WebSocketServer({
      port: this.port,
      host: this.host,
    });

    // 监听error事件，防止未捕获的错误导致进程崩溃
    this.wss.on("error", (error: Error) => {
      if ((error as any).code === "EADDRINUSE") {
        log.error(`❌ 端口 ${this.port} 已被占用！`);
        log.error(`   请检查是否有其他服务正在使用该端口`);
        log.error(`   您可以使用以下命令查找占用端口的进程:`);
        log.error(`   lsof -i :${this.port}`);
        log.error(`   或`);
        log.error(`   kill -9 $(lsof -t -i :${this.port})  # 终止占用端口的进程`);
        process.exit(1);
      } else {
        log.error("WebSocket server error:", error);
      }
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.wss.on("connection", (ws, req) => {
      const clientId = this.generateClientId();
      log.info(`Client connected: ${clientId} from ${req.socket.remoteAddress}`);

      ws.on("message", async (data: Buffer) => {
        try {
          const frame: RequestFrame = JSON.parse(data.toString());
          log.debug(`${clientId} -> ${frame.method}`);

          const response = await this.handleRequest(frame, ws);
          if (response) {
            ws.send(JSON.stringify(response));
          }
        } catch (error) {
          log.error(`${clientId} error:`, error);
          ws.send(
            JSON.stringify({
              id: "",
              error: {
                code: -1,
                message: String(error),
              },
            })
          );
        }
      });

      ws.on("close", () => {
        log.debug(`Client disconnected: ${clientId}`);
      });

      ws.on("error", (error) => {
        log.error(`${clientId} socket error:`, error);
      });

      // 发送欢迎消息
      ws.send(
        JSON.stringify({
          type: "connected",
          data: { clientId },
        })
      );
    });

    log.info(`WebSocket server listening on ws://${this.host}:${this.port}`);
  }

  private async handleRequest(
    frame: RequestFrame,
    ws: WebSocket
  ): Promise<ResponseFrame | null> {
    switch (frame.method) {
      case "chat.send": {
        const params = frame.params as ChatSendParams;

        if (params.stream) {
          // 流式响应
          void this.handleStreamChat(params, ws);
          return {
            id: frame.id,
            result: { streaming: true },
          };
        } else {
          // 普通响应（使用 ChatService）
          const result = await this.chatService.process(
            params.agentId,
            params.message,
            params.sessionId
          );
          return {
            id: frame.id,
            result: {
              response: result.response,
              usage: result.usage,
            },
          };
        }
      }

      default:
        return {
          id: frame.id,
          error: {
            code: 1,
            message: `Unknown method: ${frame.method}`,
          },
        };
    }
  }

  private async handleStreamChat(
    params: ChatSendParams,
    ws: WebSocket
  ): Promise<void> {
    console.log(`[WS] ============ handleStreamChat START ============`);
    console.log(`[WS] agentId: ${params.agentId}`);
    console.log(`[WS] sessionId: ${params.sessionId}`);
    console.log(`[WS] message: "${params.message.substring(0, 100)}..."`);

    let chunkCount = 0;
    let totalContent = "";
    let toolStartCount = 0;
    let toolStatusCount = 0;
    let toolResultCount = 0;

    try {
      const result = await this.chatService.processStream(
        params.agentId,
        params.message,
        params.sessionId,
        // 文本块回调
        (chunk: string) => {
          chunkCount++;
          totalContent += chunk;
          if (chunkCount % 10 === 0) {
            console.log(`[WS] 📦 Sent ${chunkCount} chunks, total length: ${totalContent.length}`);
          }
          const event: ChatChunkEvent = {
            agentId: params.agentId,
            sessionId: params.sessionId,
            chunk,
          };
          ws.send(
            JSON.stringify({
              type: "chat.chunk",
              data: event,
            })
          );
        },
        // 工具调用事件回调（新增）
        (toolEvent: ToolCallEvent) => {
          // 根据事件类型发送不同的事件
          let eventType: string;
          const baseData = {
            agentId: params.agentId,
            sessionId: params.sessionId,
            toolCallId: toolEvent.toolCallId,
          };

          switch (toolEvent.type) {
            case "start":
              toolStartCount++;
              console.log(`[WS] 🔧 Sending tool.start event #${toolStartCount}: ${toolEvent.toolName}`);
              eventType = "tool.start";
              ws.send(
                JSON.stringify({
                  type: eventType,
                  data: {
                    ...baseData,
                    toolName: toolEvent.toolName || "",
                    args: toolEvent.args || {},
                  },
                })
              );
              break;
            case "status":
              toolStatusCount++;
              console.log(`[WS] 📊 Sending tool.status event #${toolStatusCount}: ${toolEvent.status}`);
              eventType = "tool.status";
              ws.send(
                JSON.stringify({
                  type: eventType,
                  data: {
                    ...baseData,
                    status: toolEvent.status || "pending",
                  },
                })
              );
              break;
            case "result":
              toolResultCount++;
              console.log(`[WS] ✅ Sending tool.result event #${toolResultCount}`);
              console.log(`[WS]     Result type: ${typeof toolEvent.result}`);
              console.log(`[WS]     Result preview: ${JSON.stringify(toolEvent.result).substring(0, 150)}...`);
              eventType = "tool.result";
              ws.send(
                JSON.stringify({
                  type: eventType,
                  data: {
                    ...baseData,
                    result: toolEvent.result,
                  },
                })
              );
              break;
            default:
              console.warn(`[WS] Unknown tool event type: ${(toolEvent as any).type}`);
          }
        }
      );

      console.log(`[WS] ============ Stream processing completed ============`);
      console.log(`[WS] Total chunks sent: ${chunkCount}`);
      console.log(`[WS] Total content length: ${totalContent.length}`);
      console.log(`[WS] Tool start events: ${toolStartCount}`);
      console.log(`[WS] Tool status events: ${toolStatusCount}`);
      console.log(`[WS] Tool result events: ${toolResultCount}`);
      console.log(`[WS] Final result from processStream:`);
      console.log(`[WS]   response length: ${result.response?.length || 0}`);
      console.log(`[WS]   response preview: "${result.response?.substring(0, 200)}..."`);
      console.log(`[WS]   payloads count: ${result.payloads?.length || 0}`);
      console.log(`[WS]   usage:`, result.usage);

      // 发送完成事件
      ws.send(
        JSON.stringify({
          type: "chat.complete",
          data: {
            agentId: params.agentId,
            sessionId: params.sessionId,
          },
        })
      );
      console.log(`[WS] ✅ Sent chat.complete event`);
    } catch (error) {
      console.error(`[WS] ❌ Error in handleStreamChat:`, error);
      ws.send(
        JSON.stringify({
          type: "chat.error",
          data: {
            agentId: params.agentId,
            sessionId: params.sessionId,
            error: String(error),
          },
        })
      );
    }
  }

  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * 广播消息给所有客户端
   */
  broadcast(type: string, data?: unknown): void {
    const message = JSON.stringify({ type, data });
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wss.close((err) => {
        if (err) {
          log.error("WebSocket close error:", err);
        }
        log.info("WebSocket server stopped");
        resolve();
      });
    });
  }
}
