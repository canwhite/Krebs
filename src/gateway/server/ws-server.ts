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

    this.wss = new WebSocketServer({
      port: this.port,
      host: this.host,
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
    try {
      await this.chatService.processStream(
        params.agentId,
        params.message,
        params.sessionId,
        (chunk: string) => {
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
        }
      );

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
    } catch (error) {
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
