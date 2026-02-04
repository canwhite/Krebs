/**
 * Memory Storage 使用示例
 *
 * 展示如何在 Krebs 中使用长期记忆功能
 */

import { MemoryService, createMemorySearchTool } from "@/storage/memory/index.js";
import type { Message } from "@/types/index.js";

// ============================================================
// 示例 1: 基本使用
// ============================================================

async function basicUsage() {
  // 1. 创建记忆服务
  const memoryService = new MemoryService({
    dataDir: "./data", // 记忆存储在 ./data/memory/
    searchEnabled: true,
    autoSaveEnabled: true,
    maxSearchResults: 6,
    minScore: 0.35,
  });

  // 2. 启动服务（会自动索引 data/memory/ 下的文件）
  await memoryService.start();

  // 3. 搜索记忆
  const results = await memoryService.searchMemories("项目的目标是什么？");
  console.log(`找到 ${results.length} 条相关记忆`);

  // 4. 为对话注入相关记忆
  const messages: Message[] = [
    { role: "user", content: "我想了解项目的情况" },
  ];
  const enhancedMessages = await memoryService.injectRelevantMemories(
    messages,
    messages
  );

  // 5. 停止服务
  await memoryService.stop();
}

// ============================================================
// 示例 2: 集成到 Agent
// ============================================================

async function agentWithMemory() {
  // 创建记忆服务
  const memoryService = new MemoryService({
    dataDir: "./data",
  });

  await memoryService.start();

  // 创建记忆工具
  const memorySearchTool = createMemorySearchTool(memoryService);

  // 注册到 Agent 的技能系统
  // const agent = new Agent({
  //   skills: [memorySearchTool],
  // });

  // Agent 会话中，工具会被自动调用
  // const response = await agent.chat("我的项目目标是什么？");

  await memoryService.stop();
}

// ============================================================
// 示例 3: 记忆文件结构
// ============================================================

/*
创建记忆文件：

./data/memory/
├── MEMORY.md           # 核心长期记忆
├── 2026-02-04.md      # 每日对话日志
└── project/           # 分类记忆
    ├── goals.md
    └── decisions.md
*/

// ============================================================
// 示例 4: 记忆文件内容示例
// ============================================================

/*
./data/memory/MEMORY.md:

---
title: 项目核心记忆
tags: [project, core]
created: 2026-02-04
---

# 项目目标

Krebs 是一个轻量级、模块化的 AI Agent 框架。

# 用户偏好

- 喜欢简洁的代码
- 优先使用 TypeScript
- 重视测试覆盖率

# 重要决策

- 使用 SQLite 作为存储引擎
- 采用模块化架构设计
*/

/*
./data/memory/2026-02-04.md:

---
title: 2026-02-04 对话记录
tags: [log, daily]
---

# 上午

**用户**: 请帮我实现 Memory Storage
**AI**: 好的，我来实现...

# 下午

**用户**: 如何触发记忆保存？
**AI: 可以参考 openclaw-cn-ds 的设计...
*/

// ============================================================
// 示例 5: 自动触发机制
// ============================================================

async function autoFlushExample() {
  const memoryService = new MemoryService({
    dataDir: "./data",
    autoSaveEnabled: true,
  });

  await memoryService.start();

  const messages: Message[] = [
    // ... 对话消息
  ];

  // 假设当前使用了 18000 tokens
  const currentTokens = 18000;
  const maxTokens = 200000;

  // 检查是否需要触发记忆刷新
  await memoryService.maybeFlushMemory(currentTokens, maxTokens, messages);

  await memoryService.stop();
}

// ============================================================
// 示例 6: 手动管理索引
// ============================================================

async function manualIndexManagement() {
  const memoryService = new MemoryService({
    dataDir: "./data",
  });

  await memoryService.start();

  // 手动触发索引同步（增量）
  await memoryService.syncIndex();

  // 或者重建全部索引
  await memoryService.reindex();

  // 获取统计信息
  const stats = memoryService.getStats();
  console.log(`文件数: ${stats.fileCount}`);
  console.log(`分块数: ${stats.chunkCount}`);
  console.log(`总大小: ${stats.totalSize} bytes`);

  await memoryService.stop();
}

// ============================================================
// 示例 7: 创建初始记忆文件
// ============================================================

import { promises as fs } from "node:fs";

async function createInitialMemory() {
  const memoryContent = `---
title: Krebs 项目记忆
tags: [project, core]
created: ${new Date().toISOString().split("T")[0]}
---

# 项目目标

Krebs 是一个轻量级、模块化的 AI Agent 框架，专注于提供清晰、可扩展的智能体运行时。

## 核心特性

- 🎯 简洁架构：清晰的模块分层，易于理解和扩展
- 🔌 可插拔设计：Provider 层支持多种 AI 模型提供商
- 💾 灵活存储：Storage 层支持多种存储实现
- 🚦 智能调度：Lane 队列系统实现并发控制

## 技术栈

- 语言: TypeScript
- 运行时: Node.js
- 主要依赖: Anthropic SDK, OpenAI SDK, better-sqlite3
`;

  await fs.writeFile("./data/memory/MEMORY.md", memoryContent, "utf-8");
  console.log("初始记忆文件已创建：./data/memory/MEMORY.md");
}

// 导出示例函数
export {
  basicUsage,
  agentWithMemory,
  autoFlushExample,
  manualIndexManagement,
  createInitialMemory,
};
