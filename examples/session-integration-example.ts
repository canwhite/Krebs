/**
 * Session 模块集成示例
 *
 * 演示如何在实际项目中使用新的 Session 模块
 */

import { createEnhancedSessionStorage, SessionStorageManager } from "@/storage/session/index.js";
import { AgentManager } from "@/agent/core/index.js";
import { AnthropicProvider } from "@/provider/index.js";
import type { Message } from "@/types/index.js";

// ============================================================================
// 示例 1: 基础集成
// ============================================================================

async function basicIntegrationExample() {
  console.log("=== 示例 1: 基础集成 ===\n");

  // 1. 创建 Provider
  const provider = new AnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  // 2. 创建 Session Storage
  const sessionStorage = createEnhancedSessionStorage({
    baseDir: "./data/sessions",
    enableCache: true,
    cacheTtl: 45000,
  });

  // 3. 创建 AgentManager
  const agentManager = new AgentManager(
    {
      enableSkills: true,
      skillTimeout: 30000,
    },
    {
      provider,
      storage: sessionStorage, // 注入 Session Storage
    }
  );

  // 4. 创建 Agent
  const agent = agentManager.createAgent({
    id: "assistant",
    name: "AI Assistant",
    systemPrompt: "You are a helpful assistant.",
  });

  // 5. 处理消息
  const result = await agent.chat("Hello! How are you?", {
    sessionId: "user:123",
  });

  console.log("Agent 回复:", result.response);

  // 6. 加载会话历史
  const storage = sessionStorage.getStore();
  const session = await storage.loadSession("user:123");

  console.log("\n会话历史:");
  session?.messages.forEach((msg) => {
    console.log(`  ${msg.role}: ${msg.content}`);
  });

  console.log("\n会话元数据:", session?.entry);
}

// ============================================================================
// 示例 2: 多 Agent 支持
// ============================================================================

async function multiAgentExample() {
  console.log("\n=== 示例 2: 多 Agent 支持 ===\n");

  // 创建 Session Storage
  const sessionStorage = createEnhancedSessionStorage();

  // 创建多个 Agent
  const agentManager = new AgentManager(
    { enableSkills: true },
    {
      provider: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY! }),
      storage: sessionStorage,
    }
  );

  const mainAgent = agentManager.createAgent({
    id: "main",
    name: "Main Agent",
    systemPrompt: "You are a general-purpose assistant.",
  });

  const codeAgent = agentManager.createAgent({
    id: "coder",
    name: "Code Expert",
    systemPrompt: "You are a coding expert.",
  });

  // 为同一个用户创建不同 agent 的会话
  const userKey = "user:123";

  await mainAgent.chat("Help me write a Python function", {
    sessionId: `agent:main:${userKey}`,
  });

  await codeAgent.chat("Write a Python function to sort a list", {
    sessionId: `agent:coder:${userKey}`,
  });

  // 列出所有会话
  const store = sessionStorage.getStore();
  const allSessions = await store.listSessions();

  console.log("所有会话:");
  for (const session of allSessions) {
    console.log(`  ${session.sessionKey}: ${session.entry.agentId}`);
  }
}

// ============================================================================
// 示例 3: 会话管理
// ============================================================================

async function sessionManagementExample() {
  console.log("\n=== 示例 3: 会话管理 ===\n");

  const sessionStorage = createEnhancedSessionStorage();
  const store = sessionStorage.getStore();

  // 创建多个会话
  await store.saveSession("session1", [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there!" },
  ]);

  await store.saveSession("session2", [
    { role: "user", content: "How are you?" },
    { role: "assistant", content: "I'm doing well!" },
  ], {
    model: "gpt-4",
    inputTokens: 10,
    outputTokens: 20,
  });

  // 列出所有会话
  const sessions = await store.listSessions();
  console.log("会话列表:");
  sessions.forEach((s) => {
    console.log(`  ${s.sessionKey}: ${s.entry.updatedAt}`);
  });

  // 更新会话元数据
  await store.updateSessionMetadata("session1", {
    model: "gpt-4-turbo",
    totalTokens: 100,
  });

  // 删除会话
  await store.deleteSession("session2");

  console.log("\n删除后的会话列表:");
  const remainingSessions = await store.listSessions();
  remainingSessions.forEach((s) => {
    console.log(`  ${s.sessionKey}`);
  });
}

// ============================================================================
// 示例 4: 使用单例模式
// ============================================================================

async function singletonExample() {
  console.log("\n=== 示例 4: 使用单例模式 ===\n");

  // 获取全局 Session Storage 实例
  const storage1 = SessionStorageManager.getInstance();
  const storage2 = SessionStorageManager.getInstance();

  console.log("两次获取的是同一个实例:", storage1 === storage2);

  // 重置实例（用于测试）
  SessionStorageManager.reset();

  // 设置自定义实例
  const customStorage = createEnhancedSessionStorage({
    baseDir: "./custom/path",
  });
  SessionStorageManager.setInstance(customStorage);
}

// ============================================================================
// 示例 5: 环境变量配置
// ============================================================================

async function envConfigExample() {
  console.log("\n=== 示例 5: 环境变量配置 ===\n");

  // 设置环境变量
  process.env.SESSION_STORAGE_DIR = "./data/sessions";
  process.env.SESSION_STORAGE_TYPE = "enhanced";
  process.env.SESSION_CACHE_ENABLED = "true";
  process.env.SESSION_CACHE_TTL = "60000";

  // 从环境变量创建
  const { createSessionStorageFromEnv } = await import("@/storage/session/index.js");
  const storage = createSessionStorageFromEnv();

  console.log("从环境变量创建的 Session Storage:", storage.constructor.name);
}

// ============================================================================
// 示例 6: 完整的应用流程
// ============================================================================

async function fullApplicationExample() {
  console.log("\n=== 示例 6: 完整的应用流程 ===\n");

  // 1. 初始化
  const sessionStorage = createEnhancedSessionStorage({
    baseDir: "./data/sessions",
  });

  const provider = new AnthropicProvider({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  const agentManager = new AgentManager(
    { enableSkills: true },
    { provider, storage: sessionStorage }
  );

  // 2. 创建 Agent
  const agent = agentManager.createAgent({
    id: "bot",
    name: "Helpful Bot",
    systemPrompt: "You are a helpful bot.",
  });

  // 3. 处理对话
  const sessionId = "user:alice";

  console.log("第一轮对话:");
  let result1 = await agent.chat("What is 2+2?", { sessionId });
  console.log("回复:", result1.response);

  console.log("\n第二轮对话:");
  let result2 = await agent.chat("What about 3+3?", { sessionId });
  console.log("回复:", result2.response);

  // 4. 查看会话历史
  const store = sessionStorage.getStore();
  const session = await store.loadSession(sessionId);

  console.log("\n完整对话历史:");
  session?.messages.forEach((msg, i) => {
    console.log(`  ${i + 1}. [${msg.role}]: ${msg.content}`);
  });

  // 5. 查看会话统计
  const entry = session?.entry;
  console.log("\n会话统计:");
  console.log(`  消息数: ${session?.messages.length}`);
  console.log(`  输入 tokens: ${entry?.inputTokens || 0}`);
  console.log(`  输出 tokens: ${entry?.outputTokens || 0}`);
  console.log(`  总 tokens: ${entry?.totalTokens || 0}`);

  // 6. 列出所有用户会话
  const allSessions = await store.listSessions();
  console.log("\n所有会话:");
  allSessions.forEach((s) => {
    console.log(`  ${s.sessionKey}: ${s.entry.updatedAt}`);
  });
}

// ============================================================================
// 运行所有示例
// ============================================================================

async function runAllExamples() {
  try {
    await basicIntegrationExample();
    await multiAgentExample();
    await sessionManagementExample();
    await singletonExample();
    await envConfigExample();
    await fullApplicationExample();
  } catch (error) {
    console.error("示例运行出错:", error);
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples();
}

export {
  basicIntegrationExample,
  multiAgentExample,
  sessionManagementExample,
  singletonExample,
  envConfigExample,
  fullApplicationExample,
};
