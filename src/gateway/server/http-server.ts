/**
 * Gateway HTTP 服务器
 *
 * 架构改进：
 * - 使用 ChatService 接口进行聊天处理
 * - 使用 AgentManager 进行 Agent 管理
 * - 解耦 Gateway 和具体实现
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import multer from "multer";
import { createLogger } from "../../shared/logger.js";
import { apiKeyManager } from "../../shared/api-keys.js";
import type { AgentManager } from "@/agent/core/index.js";
import type { IChatService } from "../service/chat-service.js";
import type {
  RequestFrame,
  ResponseFrame,
  ChatSendParams,
  AgentCreateParams,
  SessionListParams,
  SessionCreateParams,
} from "../protocol/frames.js";

const execAsync = promisify(exec);

const log = createLogger("Gateway:HTTP");

export class GatewayHttpServer {
  private readonly app: express.Application;
  private readonly chatService: IChatService;
  private readonly agentManager: AgentManager;
  private readonly port: number;
  private readonly host: string;

  constructor(
    chatService: IChatService, // 使用 ChatService 接口
    port: number,
    host: string = "0.0.0.0",
    agentManager?: AgentManager, // 可选的 AgentManager（用于管理接口）
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
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Max-Age", "86400");
      next();
    });

    // 日志
    this.app.use((req, _, next) => {
      log.info(`${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // 健康检查
    this.app.get("/health", (_, res) => {
      res.json({ status: "ok", timestamp: Date.now() });
    });

    this.app.get("/api/health", (_, res) => {
      res.json({ status: "ok", timestamp: Date.now() });
    });

    // 静态文件服务 (UI)
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const uiDistPath = path.join(__dirname, "../../../ui/dist");

    this.app.use(express.static(uiDistPath));

    // SPA fallback - 所有其他路由返回 index.html
    this.app.get("/ui/*splat", (_, res) => {
      res.sendFile(path.join(uiDistPath, "index.html"));
    });

    // 工具列表
    this.app.get("/api/tools", async (_, res) => {
      try {
        const tools = await this.handleGetTools();
        res.json({ tools });
      } catch (error) {
        log.error("Get tools error:", error);
        res.status(500).json({ error: String(error) });
      }
    });

    // 接收前端发送的 API Keys
    this.app.post("/api/tools/keys", async (req, res) => {
      try {
        const { keys } = req.body;
        if (typeof keys === "object" && keys !== null) {
          // 存储 API keys 到全局管理器
          for (const [toolName, apiKey] of Object.entries(keys)) {
            if (typeof apiKey === "string" && apiKey.trim().length > 0) {
              apiKeyManager.setApiKey(toolName, apiKey.trim());
              log.info(`API Key received for tool: ${toolName}`);
            }
          }
          res.json({ success: true, message: "API keys stored successfully" });
        } else {
          res
            .status(400)
            .json({ success: false, error: "Invalid keys format" });
        }
      } catch (error) {
        log.error("Store API keys error:", error);
        res.status(500).json({ success: false, error: String(error) });
      }
    });

    // 获取已配置的 API Keys 状态
    this.app.get("/api/tools/keys", async (_, res) => {
      try {
        const configuredTools = apiKeyManager.getConfiguredTools();
        res.json({ configuredTools });
      } catch (error) {
        log.error("Get API keys error:", error);
        res.status(500).json({ error: String(error) });
      }
    });

    // 获取工具状态
    this.app.get("/api/tools/status", async (_, res) => {
      try {
        const toolRegistry = this.agentManager.getToolRegistry();
        const toolsStatus = await toolRegistry.getToolsStatus();
        res.json({ tools: toolsStatus });
      } catch (error) {
        log.error("Get tools status error:", error);
        res.status(500).json({ error: String(error) });
      }
    });

    // 技能列表
    this.app.get("/api/skills", async (_, res) => {
      try {
        const skills = await this.handleGetSkills();
        res.json({ skills });
      } catch (error) {
        log.error("Get skills error:", error);
        res.status(500).json({ error: String(error) });
      }
    });

    // 技能启用/禁用
    this.app.patch("/api/skills/:skillId", async (req, res) => {
      try {
        const { skillId } = req.params;
        const { enabled } = req.body;
        await this.handleToggleSkill(skillId, enabled);
        res.json({ success: true });
      } catch (error) {
        log.error("Toggle skill error:", error);
        res.status(500).json({ error: String(error) });
      }
    });

    // 技能上传 - 接收zip压缩包
    this.app.post("/api/skills/upload",
      multer({
        dest: path.join(process.cwd(), "temp"),
        limits: { fileSize: 50 * 1024 * 1024 } // 50MB
      }).single("skill"),
      async (req, res) => {
        try {
          await this.handleSkillUpload(req, res);
        } catch (error) {
          log.error("Skill upload error:", error);
          res.status(500).json({ error: String(error) });
        }
      }
    );

    // 聊天接口 (简化版，直接接受消息)
    this.app.post("/api/chat", async (req, res) => {
      try {
        const { message, sessionId, agentId } = req.body;
        const result = await this.chatService.process(
          agentId || "default",
          message,
          sessionId || "default",
        );
        res.json({
          content: result.response,
          payloads: result.payloads,
          usage: result.usage,
        });
      } catch (error) {
        log.error("Chat error:", error);
        res.status(500).json({ error: String(error) });
      }
    });

    // 聊天接口 (RequestFrame 格式，保持向后兼容)
    this.app.post("/api/chat", async (req, res) => {
      try {
        const frame: RequestFrame<ChatSendParams> = req.body;
        const response = await this.handleChatSend(frame.params!);
        res.json(this.successResponse(frame.id, response));
      } catch (error) {
        log.error("Chat error:", error);
        res.json(
          this.errorResponse(req.body?.id ?? "", {
            code: -1,
            message: String(error),
          }),
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
        log.error("Agent create error:", error);
        res.json(
          this.errorResponse(req.body?.id ?? "", {
            code: -1,
            message: String(error),
          }),
        );
      }
    });

    this.app.get("/api/agent/list", async (_, res) => {
      try {
        const response = await this.handleAgentList();
        res.json(this.successResponse("", response));
      } catch (error) {
        log.error("Agent list error:", error);
        res.json(
          this.errorResponse("", {
            code: -1,
            message: String(error),
          }),
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
        log.error("Session list error:", error);
        res.json(
          this.errorResponse("", {
            code: -1,
            message: String(error),
          }),
        );
      }
    });

    // 新建会话
    this.app.post("/api/session/create", async (req, res) => {
      try {
        const frame: RequestFrame<SessionCreateParams> = req.body;
        const response = await this.handleSessionCreate(frame.params!);
        res.json(this.successResponse(frame.id, response));
      } catch (error) {
        log.error("Session create error:", error);
        res.json(
          this.errorResponse(req.body?.id ?? "", {
            code: -1,
            message: String(error),
          }),
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
      params.sessionId,
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
    try {
      // 检查chatService是否是EnhancedChatService，有sessionStorage属性
      const chatService = this.chatService as any;
      if (chatService.sessionStorage && typeof chatService.sessionStorage.listSessions === 'function') {
        const sessions = await chatService.sessionStorage.listSessions();
        return {
          sessions: sessions.map((s: any) => ({
            sessionId: s.sessionKey || s.sessionId || s,
            updatedAt: s.entry?.updatedAt || Date.now(),
            messageCount: 0, // 可以从消息中计算，这里简化
          })),
        };
      }

      // 如果没有sessionStorage，尝试使用agentManager的storage
      const storage = (this.agentManager as any).deps?.storage;
      if (storage && typeof storage.listSessions === 'function') {
        const sessions = await storage.listSessions();
        return {
          sessions: sessions.map((s: any) => ({
            sessionId: s.sessionKey || s.sessionId || s,
            updatedAt: Date.now(),
            messageCount: 0,
          })),
        };
      }

      // 如果都不支持，返回空数组
      return {
        sessions: [],
      };
    } catch (error) {
      log.error("Failed to list sessions:", error);
      // 出错时返回空数组，避免影响前端
      return {
        sessions: [],
      };
    }
  }

  private async handleSessionCreate(params: SessionCreateParams) {
    // 生成唯一的sessionId
    const sessionId = `user:${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 创建空会话
    // 检查chatService是否是EnhancedChatService，有sessionStorage属性
    const chatService = this.chatService as any;
    if (chatService.sessionStorage && typeof chatService.sessionStorage.saveSession === 'function') {
      await chatService.sessionStorage.saveSession(sessionId, []);
    } else {
      // 如果没有sessionStorage，尝试使用agentManager的storage
      const storage = (this.agentManager as any).deps?.storage;
      if (storage && typeof storage.saveSession === 'function') {
        await storage.saveSession(sessionId, []);
      } else {
        throw new Error('No session storage available');
      }
    }

    // 设置初始元数据
    const metadata = params.metadata || {};
    const entry = {
      sessionId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...metadata,
    };

    // 尝试更新元数据
    const chatServiceWithStorage = this.chatService as any;
    if (chatServiceWithStorage.sessionStorage && typeof chatServiceWithStorage.sessionStorage.updateSessionMetadata === 'function') {
      await chatServiceWithStorage.sessionStorage.updateSessionMetadata(sessionId, entry);
    }

    return {
      sessionId,
      createdAt: Date.now(),
      entry,
    };
  }

  private async handleGetTools() {
    // 从 AgentManager 获取可用工具
    const tools = this.agentManager.getTools();
    return tools.map((tool: any) => ({
      name: tool.name,
      description: tool.description,
      category: tool.category || "general",
      requiresApiKey: tool.requiresApiKey || false, // 从工具定义中读取
      apiKeyName: tool.apiKeyName,
    }));
  }

  private async handleGetSkills() {
    // 优先从 SkillsManager 获取技能（新系统）
    const skillsManager = this.agentManager.getSkillsManager();

    if (skillsManager) {
      // 使用新系统 SkillsManager
      const skillEntries = skillsManager.getAllSkills();
      return skillEntries.map((entry: any) => {
        // 从 metadata 中提取信息
        const metadata = entry.metadata || {};
        return {
          id: entry.skill.name,
          name: entry.skill.name,
          description: entry.frontmatter?.description || entry.skill.description || "",
          enabled: entry.enabled !== false, // 默认启用
          category: metadata.category || "general",
          emoji: metadata.emoji || "⚡",
          tags: metadata.tags || [],
        };
      });
    } else {
      // 旧系统已移除，返回空数组
      return [];
    }
  }

  private async handleToggleSkill(skillId: string, enabled: boolean) {
    // 优先使用 SkillsManager（新系统）
    const skillsManager = this.agentManager.getSkillsManager();

    if (skillsManager) {
      // 使用新系统
      if (enabled) {
        return skillsManager.enableSkill(skillId);
      } else {
        return skillsManager.disableSkill(skillId);
      }
    } else {
      // 旧系统已移除，不支持切换
      log.warn(`Skill ${skillId} toggle failed: old system removed`);
      return false;
    }
  }

  private successResponse<T>(id: string, result: T): ResponseFrame<T> {
    return { id, result };
  }

  private errorResponse(
    id: string,
    error: {
      code: number;
      message: string;
    },
  ): ResponseFrame {
    return { id, error };
  }

  /**
   * 启动服务器
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.port, this.host, () => {
        log.info(`HTTP server listening on http://${this.host}:${this.port}`);
        resolve();
      });

      // 监听error事件，防止端口占用等问题导致进程崩溃
      server.on("error", (error: Error) => {
        if ((error as any).code === "EADDRINUSE") {
          log.error(`❌ 端口 ${this.port} 已被占用！`);
          log.error(`   请检查是否有其他服务正在使用该端口`);
          log.error(`   您可以使用以下命令查找占用端口的进程:`);
          log.error(`   lsof -i :${this.port}`);
          log.error(`   或`);
          log.error(
            `   kill -9 $(lsof -t -i :${this.port})  # 终止占用端口的进程`,
          );
          reject(error);
        } else {
          log.error("HTTP server error:", error);
          reject(error);
        }
      });
    });
  }

  /**
   * 停止服务器
   */
  async stop(): Promise<void> {
    // Express 不提供直接的关闭方法，这里简化处理
    log.info("HTTP server stopped");
  }

  /**
   * 处理技能上传
   */
  private async handleSkillUpload(req: any, res: any): Promise<void> {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    log.info(`Received skill upload: ${file.originalname}, size: ${file.size}`);

    try {
      // 确定目标目录 (bundled skills)
      const targetBaseDir = path.join(process.cwd(), "skills", "bundled");

      let tempDir: string | null = null;
      let skillName: string | null = null;
      let extractDir: string | null = null; // 移到外层作用域

      // 判断文件类型并解压
      if (file.originalname.endsWith(".tar.gz") || file.originalname.endsWith(".tgz") || file.originalname.endsWith(".zip")) {
        // tar.gz 或 zip 文件
        extractDir = path.join(targetBaseDir, "temp_extract_" + Date.now());
        await fs.mkdir(extractDir, { recursive: true });

        if (file.originalname.endsWith(".zip")) {
          // 使用 unzip 解压
          try {
            const { stderr } = await execAsync(`unzip -o "${file.path}" -d "${extractDir}"`);
            if (stderr) {
              log.warn(`Unzip extraction warning: ${stderr}`);
            }
            log.info(`Extracted zip to ${extractDir}`);
          } catch (error: any) {
            await fs.rm(file.path, { force: true });
            throw new Error(`Failed to extract zip file: ${error.message || error}`);
          }
        } else {
          // 使用 tar 解压
          try {
            const { stderr } = await execAsync(`tar -xzf "${file.path}" -C "${extractDir}"`);
            if (stderr && !stderr.includes("Removing leading")) {
              log.warn(`Tar extraction warning: ${stderr}`);
            }
            log.info(`Extracted tar.gz to ${extractDir}`);
          } catch (error: any) {
            await fs.rm(file.path, { force: true });
            throw new Error(`Failed to extract tar.gz file: ${error.message || error}`);
          }
        }

        // 查找技能目录 (包含 SKILL.md 的目录)
        // 递归查找，支持嵌套目录结构
        async function findSkillDir(dir: string): Promise<string | null> {
          const entries = await fs.readdir(dir, { withFileTypes: true });

          // 检查当前目录是否包含 SKILL.md
          const skillMdPath = path.join(dir, "SKILL.md");
          try {
            await fs.access(skillMdPath);
            return dir;
          } catch {
            // 不在当前目录，继续查找子目录
          }

          // 递归搜索子目录
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const subDir = path.join(dir, entry.name);
              const result = await findSkillDir(subDir);
              if (result) {
                return result;
              }
            }
          }

          return null;
        }

        const skillDir = await findSkillDir(extractDir);

        if (!skillDir) {
          await fs.rm(file.path, { force: true });
          await fs.rm(extractDir, { recursive: true, force: true });
          throw new Error("No valid skill directory found (missing SKILL.md)");
        }

        tempDir = skillDir;
      } else {
        throw new Error("Unsupported file format. Please upload .zip or .tar.gz file");
      }

      // 删除临时上传文件
      await fs.rm(file.path, { force: true });

      // 验证技能
      const validation = await this.validateSkillDir(tempDir);
      if (!validation.valid) {
        // 清理临时目录 (只删除extractDir及其子目录)
        await fs.rm(extractDir, { recursive: true, force: true });
        res.status(400).json({
          error: "Skill validation failed",
          details: validation.errors
        });
        return;
      }

      // 获取技能名称
      skillName = await this.getSkillName(tempDir);
      if (!skillName) {
        await fs.rm(extractDir, { recursive: true, force: true });
        res.status(400).json({ error: "Cannot determine skill name" });
        return;
      }

      // 确定最终目标路径
      const finalTargetDir = path.join(targetBaseDir, skillName);

      // 检查是否已存在
      const exists = await fs.access(finalTargetDir).then(() => true).catch(() => false);
      if (exists) {
        await fs.rm(extractDir, { recursive: true, force: true });
        res.status(409).json({ error: `Skill '${skillName}' already exists` });
        return;
      }

      // 移动技能到目标位置
      await fs.rename(tempDir, finalTargetDir);

      // 清理临时目录
      await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {});

      // 重新加载技能
      const skillsManager = this.agentManager.getSkillsManager();
      if (skillsManager) {
        await skillsManager.reloadSkills();
        log.info(`Reloaded skills after upload`);
      }

      log.info(`✅ Skill '${skillName}' uploaded successfully`);

      res.json({
        success: true,
        message: `Skill '${skillName}' uploaded successfully`,
        skillName,
        path: finalTargetDir
      });
    } catch (error: any) {
      log.error("Skill upload failed:", error);
      res.status(500).json({
        error: "Failed to upload skill",
        details: error.message || String(error)
      });
    }
  }

  /**
   * 验证技能目录
   */
  private async validateSkillDir(skillDir: string): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const skillMdPath = path.join(skillDir, "SKILL.md");
      await fs.access(skillMdPath);

      // 读取并解析 frontmatter
      const content = await fs.readFile(skillMdPath, "utf-8");
      const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);

      if (!frontmatterMatch) {
        errors.push("Missing YAML frontmatter");
      } else {
        const frontmatter = frontmatterMatch[1];

        if (!frontmatter.includes("name:")) {
          errors.push("Missing 'name' field in frontmatter");
        }

        if (!frontmatter.includes("description:")) {
          errors.push("Missing 'description' field in frontmatter");
        }
      }
    } catch (error: any) {
      errors.push(`Validation error: ${error.message || error}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get skill name from SKILL.md
   */
  private async getSkillName(skillDir: string): Promise<string | null> {
    try {
      const skillMdPath = path.join(skillDir, "SKILL.md");
      const content = await fs.readFile(skillMdPath, "utf-8");
      const nameMatch = content.match(/^name:\s*(.+)$/m);

      if (!nameMatch) {
        return null;
      }

      // Remove quotes (single or double) and extra whitespace
      let name = nameMatch[1].trim();

      // Remove outer quotes if present
      if ((name.startsWith('"') && name.endsWith('"')) ||
          (name.startsWith("'") && name.endsWith("'"))) {
        name = name.slice(1, -1);
      }

      return name;
    } catch {
      return null;
    }
  }
}
