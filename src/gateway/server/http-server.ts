/**
 * Gateway HTTP 服务器
 *
 * 架构改进：
 * - 使用 ChatService 接口进行聊天处理
 * - 使用 AgentManager 进行 Agent 管理
 * - 解耦 Gateway 和具体实现
 */

import express from "express";
import type { AgentManager } from "@/agent/core/index.js";
import type { IChatService } from "../service/chat-service.js";
import type {
  RequestFrame,
  ResponseFrame,
  ChatSendParams,
  AgentCreateParams,
  SessionListParams,
} from "../protocol/frames.js";

export class GatewayHttpServer {
  private readonly app: express.Application;
  private readonly chatService: IChatService;
  private readonly agentManager: AgentManager;
  private readonly port: number;
  private readonly host: string;

  constructor(
    chatService: IChatService,  // 使用 ChatService 接口
    port: number,
    host: string = "0.0.0.0",
    agentManager?: AgentManager  // 可选的 AgentManager（用于管理接口）
  ) {
    this.app = express();
    this.chatService = chatService;
    this.agentManager = agentManager!;
    this.port = port;
    this.host = host;

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    this.app.use((_, res, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Max-Age", "86400");
      next();
    });

    // 日志
    this.app.use((req, _, next) => {
      console.log(`[HTTP] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // 健康检查
    this.app.get("/health", (_, res) => {
      res.json({ status: "ok", timestamp: Date.now() });
    });

    // 聊天接口
    this.app.post("/api/chat", async (req, res) => {
      try {
        const frame: RequestFrame<ChatSendParams> = req.body;
        const response = await this.handleChatSend(frame.params!);
        res.json(this.successResponse(frame.id, response));
      } catch (error) {
        console.error("[HTTP] Chat error:", error);
        res.json(
          this.errorResponse(req.body?.id ?? "", {
            code: -1,
            message: String(error),
          })
        );
      }
    });

    // Agent 管理
    this.app.post("/api/agent/create", async (req, res) => {
      try {
        const frame: RequestFrame<AgentCreateParams> = req.body;
        const response = await this.handleAgentCreate(frame.params!);
        res.json(this.successResponse(frame.id, response));
      } catch (error) {
        console.error("[HTTP] Agent create error:", error);
        res.json(
          this.errorResponse(req.body?.id ?? "", {
            code: -1,
            message: String(error),
          })
        );
      }
    });

    this.app.get("/api/agent/list", async (_, res) => {
      try {
        const response = await this.handleAgentList();
        res.json(this.successResponse("", response));
      } catch (error) {
        console.error("[HTTP] Agent list error:", error);
        res.json(
          this.errorResponse("", {
            code: -1,
            message: String(error),
          })
        );
      }
    });

    // Session 管理
    this.app.get("/api/session/list", async (req, res) => {
      try {
        const params: SessionListParams = {
          agentId: req.query.agentId as string,
        };
        const response = await this.handleSessionList(params);
        res.json(this.successResponse("", response));
      } catch (error) {
        console.error("[HTTP] Session list error:", error);
        res.json(
          this.errorResponse("", {
            code: -1,
            message: String(error),
          })
        );
      }
    });

    // 404
    this.app.use((req, res) => {
      res.status(404).json({
        error: "Not Found",
        path: req.path,
      });
    });
  }

  private async handleChatSend(params: ChatSendParams) {
    // 使用 ChatService 接口进行聊天处理
    const result = await this.chatService.process(
      params.agentId,
      params.message,
      params.sessionId
    );

    return {
      response: result.response,
      usage: result.usage,
    };
  }

  private async handleAgentCreate(params: AgentCreateParams) {
    const agent = this.agentManager.createAgent({
      id: params.id,
      name: params.name,
      systemPrompt: params.systemPrompt,
      model: params.model,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
    });

    return {
      agentId: agent.getConfig().id,
      name: agent.getConfig().name,
    };
  }

  private async handleAgentList() {
    const agents = this.agentManager.listAgents();
    return {
      agents: agents.map((a) => ({
        id: a.id,
        name: a.name,
        model: a.model,
      })),
    };
  }

  private async handleSessionList(_params: SessionListParams) {
    // 这里简化实现，实际应该从存储中读取
    return {
      sessions: [],
    };
  }

  private successResponse<T>(id: string, result: T): ResponseFrame<T> {
    return { id, result };
  }

  private errorResponse(id: string, error: {
    code: number;
    message: string;
  }): ResponseFrame {
    return { id, error };
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.app.listen(this.port, this.host, () => {
        console.log(`[Gateway] HTTP server listening on http://${this.host}:${this.port}`);
        resolve();
      });
    });
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    // Express 不提供直接的关闭方法，这里简化处理
    console.log("[Gateway] HTTP server stopped");
  }
}
