#!/usr/bin/env node
/**
 * krebs CN 主入口
 */

import { loadConfig, logger } from "@/shared/index.js";
import {
  createAnthropicProvider,
  createOpenAIProvider,
  createDeepSeekProvider,
} from "@/provider/index.js";
import { AgentManager } from "@/agent/index.js";
import { GatewayHttpServer, GatewayWsServer } from "@/gateway/index.js";
import { registerBuiltinTools, registerBuiltinSkills } from "@/agent/index.js";
import { CommandLane, setConcurrency } from "@/scheduler/lanes.js";
import fs from "node:fs/promises";

/**
 * 主函数
 */
async function main() {
  console.log(`
  ██████╗██╗   ██╗██████╗ ███████╗██████╗
 ██╔════╝██║   ██║██╔══██╗██╔════╝██╔══██╗
 ██║     ██║   ██║██║  ██║█████╗  ██████╔╝
 ██║     ██║   ██║██║  ██║██╔══╝  ██╔══██╗
 ╚██████╗╚██████╔╝██████╔╝███████╗██║  ██║
  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
  中文版 AI Agent 框架 v1.0.0
`);

  // 加载配置
  const config = loadConfig();
  logger.setLevel(config.logging.level);
  logger.info("配置加载完成", config);

  // 确保 data 目录存在
  await fs.mkdir(config.storage.dataDir, { recursive: true });
  await fs.mkdir(config.storage.memoryDir, { recursive: true });

  // 设置 Lane 并发
  setConcurrency(CommandLane.Agent, config.agent.maxConcurrent);
  setConcurrency(CommandLane.Main, 1);
  setConcurrency(CommandLane.Cron, 1);

  // 初始化 Provider（优先级：DeepSeek > Anthropic > OpenAI）
  let provider;
  const defaultProvider = config.agent.defaultProvider ?? "deepseek";

  if (defaultProvider === "deepseek" && config.providers.deepseek?.apiKey) {
    logger.info("使用 DeepSeek Provider");
    provider = createDeepSeekProvider({
      apiKey: config.providers.deepseek.apiKey,
      baseUrl: config.providers.deepseek.baseUrl,
    });
  } else if (
    defaultProvider === "anthropic" &&
    config.providers.anthropic?.apiKey
  ) {
    logger.info("使用 Anthropic Provider");
    provider = createAnthropicProvider({
      apiKey: config.providers.anthropic.apiKey,
      baseUrl: config.providers.anthropic.baseUrl,
    });
  } else if (defaultProvider === "openai" && config.providers.openai?.apiKey) {
    logger.info("使用 OpenAI Provider");
    provider = createOpenAIProvider({
      apiKey: config.providers.openai.apiKey,
      baseUrl: config.providers.openai.baseUrl,
    });
  } else {
    // Fallback：尝试其他可用的 Provider
    if (config.providers.deepseek?.apiKey) {
      logger.info("Fallback: 使用 DeepSeek Provider");
      provider = createDeepSeekProvider({
        apiKey: config.providers.deepseek.apiKey,
        baseUrl: config.providers.deepseek.baseUrl,
      });
    } else if (config.providers.anthropic?.apiKey) {
      logger.info("Fallback: 使用 Anthropic Provider");
      provider = createAnthropicProvider({
        apiKey: config.providers.anthropic.apiKey,
        baseUrl: config.providers.anthropic.baseUrl,
      });
    } else if (config.providers.openai?.apiKey) {
      logger.info("Fallback: 使用 OpenAI Provider");
      provider = createOpenAIProvider({
        apiKey: config.providers.openai.apiKey,
        baseUrl: config.providers.openai.baseUrl,
      });
    } else {
      logger.warn("未配置任何 API Key，某些功能将不可用");
    }
  }

  // 初始化 Agent Manager
  const agentManager = new AgentManager(provider!, config.storage.dataDir);

  // 注册内置 Tools 和 Skills
  registerBuiltinTools();
  registerBuiltinSkills();
  logger.info("已注册内置工具和技能");

  // 创建默认 Agent
  if (provider) {
    const defaultAgent = agentManager.createAgent({
      id: "default",
      name: "默认助手",
      systemPrompt: "你是一个有用的 AI 助手，可以帮助用户解答问题、完成任务。",
      model: config.agent.defaultModel ?? "deepseek-chat",
      temperature: 0.7,
      maxTokens: 4096,
    });
    logger.info("已创建默认 Agent:", defaultAgent.getConfig());
  }

  // 启动 Gateway 服务器
  const httpServer = new GatewayHttpServer(
    agentManager,
    config.server.port,
    config.server.host,
  );
  await httpServer.start();

  const wsServer = new GatewayWsServer(
    agentManager,
    config.server.port,
    config.server.host,
  );

  logger.info(`✅ krebs CN 启动成功！`);
  logger.info(`   HTTP: http://${config.server.host}:${config.server.port}`);
  logger.info(
    `   WebSocket: ws://${config.server.host}:${config.server.port + 1}`,
  );
  logger.info(`   按 Ctrl+C 停止服务`);

  // 处理退出信号
  process.on("SIGINT", async () => {
    logger.info("正在关闭服务...");
    await wsServer.stop();
    await httpServer.stop();
    logger.info("服务已关闭");
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("正在关闭服务...");
    await wsServer.stop();
    await httpServer.stop();
    logger.info("服务已关闭");
    process.exit(0);
  });
}

// 启动应用
main().catch((error) => {
  logger.error("启动失败:", error);
  process.exit(1);
});
