/**
 * Gateway WebSocket 服务器
 */

import { WebSocketServer, WebSocket } from "ws";
import type { AgentManager } from "@/agent/index.js";
import type {
  RequestFrame,
  ResponseFrame,
  ChatSendParams,
  ChatChunkEvent,
} from "../protocol/frames.js";

export class GatewayWsServer {
  private readonly wss: WebSocketServer;
  private readonly agentManager: AgentManager;
  private readonly port: number;
  private readonly host: string;

  constructor(
    agentManager: AgentManager,
    port: number,
    host: string = "0.0.0.0"
  ) {
    this.agentManager = agentManager;
    this.port = port;
    this.host = host;

    this.wss = new WebSocketServer({
      port: this.port + 1, // WS port = HTTP port + 1
      host: this.host,
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.wss.on("connection", (ws, req) => {
      const clientId = this.generateClientId();
      console.log(`[WS] Client connected: ${clientId} from ${req.socket.remoteAddress}`);

      ws.on("message", async (data: Buffer) => {
        try {
          const frame: RequestFrame = JSON.parse(data.toString());
          console.log(`[WS] ${clientId} -> ${frame.method}`);

          const response = await this.handleRequest(frame, ws);
          if (response) {
            ws.send(JSON.stringify(response));
          }
        } catch (error) {
          console.error(`[WS] ${clientId} error:`, error);
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
        console.log(`[WS] Client disconnected: ${clientId}`);
      });

      ws.on("error", (error) => {
        console.error(`[WS] ${clientId} socket error:`, error);
      });

      // 发送欢迎消息
      ws.send(
        JSON.stringify({
          type: "connected",
          data: { clientId },
        })
      );
    });

    console.log(`[Gateway] WebSocket server listening on ws://${this.host}:${this.port + 1}`);
  }

  private async handleRequest(
    frame: RequestFrame,
    ws: WebSocket
  ): Promise<ResponseFrame | null> {
    switch (frame.method) {
      case "chat.send": {
        const params = frame.params as ChatSendParams;
        const agent = this.agentManager.getAgent(params.agentId);
        if (!agent) {
          return {
            id: frame.id,
            error: {
              code: 2,
              message: `Agent not found: ${params.agentId}`,
            },
          };
        }

        if (params.stream) {
          // 流式响应
          void this.handleStreamChat(agent, params, ws);
          return {
            id: frame.id,
            result: { streaming: true },
          };
        } else {
          // 普通响应
          const result = await agent.process(
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
    agent: any,
    params: ChatSendParams,
    ws: WebSocket
  ): Promise<void> {
    try {
      await agent.processStream(
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
          console.error("[Gateway] WebSocket close error:", err);
        }
        console.log("[Gateway] WebSocket server stopped");
        resolve();
      });
    });
  }
}
