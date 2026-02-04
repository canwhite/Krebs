#!/usr/bin/env node
/**
 * Session Storage 示例
 *
 * 演示如何使用 SessionStorage 保存和加载会话
 * 生成的 markdown 文件保存在 ./examples/sessions/ 目录
 */

import { createEnhancedSessionStorage } from "../src/storage/session/index.js";
import type { Message } from "../src/types/index.js";

async function main() {
  console.log("🚀 Session Storage 示例\n");

  // 1. 创建 SessionStorage（使用 ./examples/sessions 目录）
  const sessionStorage = createEnhancedSessionStorage({
    baseDir: "./examples/sessions",
    enableCache: true,
    cacheTtl: 45000,
  });

  console.log("✅ SessionStorage 已创建\n");

  // 2. 准备测试消息
  const messages: Message[] = [
    {
      role: "user",
      content: "你好，我是张三",
      timestamp: Date.now() - 3000,
    },
    {
      role: "assistant",
      content: "你好张三！很高兴认识你。有什么我可以帮助你的吗？",
      timestamp: Date.now() - 2000,
    },
    {
      role: "user",
      content: "请介绍一下你自己",
      timestamp: Date.now() - 1000,
    },
    {
      role: "assistant",
      content: "我是一个 AI 助手，基于 Krebs 框架构建。我可以帮助你解答问题、编写代码、分析文本等。",
      timestamp: Date.now(),
    },
  ];

  // 3. 保存会话
  const sessionId1 = "user:zhang-san";
  const sessionId2 = "agent:default:user:123";
  const sessionId3 = "test-session-456";

  console.log("💾 保存会话...");

  await sessionStorage.saveSession(sessionId1, messages, {
    agentId: "default",
    model: "gpt-4",
    modelProvider: "openai",
    inputTokens: 50,
    outputTokens: 100,
    totalTokens: 150,
  });

  await sessionStorage.saveSession(sessionId2, messages, {
    agentId: "default",
    model: "claude-3-5-sonnet-20241022",
    modelProvider: "anthropic",
    inputTokens: 60,
    outputTokens: 120,
    totalTokens: 180,
  });

  await sessionStorage.saveSession(sessionId3, messages, {
    agentId: "test-agent",
    model: "deepseek-chat",
    modelProvider: "deepseek",
    inputTokens: 40,
    outputTokens: 80,
    totalTokens: 120,
  });

  console.log(`   ✅ 已保存 3 个会话`);
  console.log(`   - ${sessionId1}`);
  console.log(`   - ${sessionId2}`);
  console.log(`   - ${sessionId3}\n`);

  // 4. 列出所有会话
  console.log("📋 列出所有会话：");
  const store = sessionStorage.getStore();
  const sessions = await store.listSessions();

  sessions.forEach((session: any) => {
    console.log(`   - ${session.sessionKey}`);
    console.log(`     模型: ${session.entry.model}`);
    console.log(`     Tokens: ${session.entry.totalTokens}`);
    console.log(`     更新时间: ${new Date(session.entry.updatedAt).toLocaleString()}`);
  });
  console.log();

  // 5. 加载会话
  console.log("📖 加载会话详情：");
  const loadedSession = await store.loadSession(sessionId1);
  if (loadedSession) {
    console.log(`   会话 ID: ${loadedSession.entry.sessionId}`);
    console.log(`   消息数量: ${loadedSession.messages.length}`);
    console.log(`   第一条消息: ${loadedSession.messages[0].role} - ${loadedSession.messages[0].content}`);
  }
  console.log();

  // 6. 更新会话元数据
  console.log("✏️  更新会话元数据...");
  const updated = await store.updateSessionMetadata(sessionId1, {
    totalTokens: 999,
    model: "gpt-4-turbo",
  });
  console.log(`   ✅ 已更新: totalTokens = ${updated?.totalTokens}, model = ${updated?.model}\n`);

  // 7. 显示生成的 markdown 文件路径
  console.log("📁 生成的 Markdown 文件：");
  console.log(`   📂 ./examples/sessions/`);
  console.log(`   ├─ user=zhang-san.md`);
  console.log(`   ├─ agent=default=user=123.md`);
  console.log(`   └─ test-session-456.md`);
  console.log();
  console.log("💡 提示：你可以打开这些 .md 文件查看存储格式！");
  console.log("   格式：frontmatter (元数据) + markdown (消息内容)\n");
}

main().catch(console.error);
