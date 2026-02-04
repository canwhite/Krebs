# Krebs 长期记忆系统 - 完整指南

> **基于 openclaw-cn-ds 设计的长期记忆管理方案**

---

## 📚 目录

1. [核心概念](#核心概念)
2. [快速开始](#快速开始)
3. [记忆文件结构](#记忆文件结构)
4. [触发机制](#触发机制)
5. [使用示例](#使用示例)
6. [API 参考](#api-参考)
7. [最佳实践](#最佳实践)

---

## 核心概念

### 什么是长期记忆？

长期记忆是 AI 助手的"大脑"，用于存储：
- 📝 **对话历史**：重要的对话内容
- 👤 **用户偏好**：用户的习惯和偏好
- 🎯 **项目知识**：项目相关的信息
- 💡 **重要决策**：关键决策记录

### 如何工作？

```
┌─────────────┐
│ 对话消息    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ Memory Service  │
│ - 搜索相关记忆   │
│ - 注入上下文     │
│ - 触发保存      │
└──────┬──────────┘
       │
       ▼
┌─────────────────┐
│ data/memory/    │
│ ├── MEMORY.md   │
│ └── *.md        │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│ SQLite Index    │
│ - 向量搜索      │
│ - 全文搜索      │
└─────────────────┘
```

---

## 快速开始

### 1. 创建记忆文件

```bash
# data/memory/ 目录会自动创建
# 可以手动创建 MEMORY.md 和其他记忆文件
```

### 2. 使用记忆服务

```typescript
import { MemoryService } from "@/storage/memory/index.js";

// 创建服务
const memory = new MemoryService({
  dataDir: "./data",
  searchEnabled: true,
  autoSaveEnabled: true,
});

// 启动（自动索引 data/memory/ 下的文件）
await memory.start();

// 搜索记忆
const results = await memory.searchMemories("项目的目标是什么？");

// 停止服务
await memory.stop();
```

### 3. 集成到 Agent

```typescript
import { createMemorySearchTool } from "@/storage/memory/index.js";

// 创建工具
const memoryTool = createMemorySearchTool(memoryService);

// 注册到 Agent
agent.registerSkill(memoryTool);

// Agent 会自动调用工具搜索记忆
```

---

## 记忆文件结构

### 目录结构

```
data/memory/
├── MEMORY.md           # 核心长期记忆（重要事实、用户偏好）
├── 2026-02-04.md      # 每日对话日志
├── project/           # 分类记忆（可选）
│   ├── goals.md
│   └── decisions.md
└── README.md          # 使用说明
```

### MEMORY.md 示例

```markdown
---
title: Krebs 项目核心记忆
tags: [project, core]
created: 2026-02-04
---

# 项目目标

Krebs 是一个轻量级、模块化的 AI Agent 框架。

## 核心特性

- 🎯 简洁架构
- 🔌 可插拔设计
- 💾 灵活存储

## 用户偏好

- 优先使用 TypeScript
- 重视测试覆盖率
```

### 每日日志示例

```markdown
---
title: 2026-02-04 对话记录
tags: [log, daily]
---

# 上午

**用户**: 请帮我实现 Memory Storage
**AI**: 好的，我来实现...

# 下午

**用户**: 如何触发记忆保存？
**AI**: 可以参考 openclaw-cn-ds 的设计...
```

---

## 触发机制

### 自动触发

#### 1. **上下文接近限制时**

```typescript
// 对话达到软阈值时自动触发
await memory.maybeFlushMemory(
  currentTokens,  // 当前 token 数
  maxTokens,      // 最大 token 数
  messages        // 对话消息
);
```

**默认配置**：
- 软阈值：`maxTokens - 20000`
- 当对话接近上下文限制时，自动保存重要内容

#### 2. **文件变化监听**

```
data/memory/ 下的文件变化
    ↓
chokidar 监听到（debounce 5秒）
    ↓
自动更新索引
```

#### 3. **会话启动时**

```
Agent 启动
    ↓
MemoryService.start()
    ↓
自动扫描并索引记忆文件
```

### 手动触发

#### 1. **Agent 调用工具**

```typescript
// Agent 可以主动调用记忆工具
agent.callTool("memory_search", {
  query: "用户的项目偏好是什么？"
});
```

#### 2. **CLI 命令**

```bash
# 手动同步索引
npm run memory:sync

# 重建索引
npm run memory:reindex
```

---

## 使用示例

### 示例 1：基本搜索

```typescript
import { MemoryService } from "@/storage/memory/index.js";

const memory = new MemoryService({ dataDir: "./data" });
await memory.start();

// 搜索记忆
const results = await memory.searchMemories("项目使用的技术栈");

results.forEach(r => {
  console.log(`[${r.path}:${r.startLine}-${r.endLine}]`);
  console.log(`相关度: ${r.score.toFixed(2)}`);
  console.log(r.snippet);
});

await memory.stop();
```

### 示例 2：为对话注入记忆

```typescript
// 当前对话
const messages = [
  { role: "user", content: "我想了解项目情况" }
];

// 自动搜索并注入相关记忆
const enhanced = await memory.injectRelevantMemories(
  messages,
  messages
);

// enhanced 现在包含记忆上下文
// [
//   { role: "system", content: "[相关记忆]..." },
//   { role: "user", content: "我想了解项目情况" }
// ]
```

### 示例 3：Agent 工具调用

```typescript
import { createMemorySearchTool, createMemorySaveTool } from "@/storage/memory/tools.js";

// 创建工具
const searchTool = createMemorySearchTool(memoryService);
const saveTool = createMemorySaveTool(memoryService);

// 注册到 Agent
agent.registerSkill(searchTool);
agent.registerSkill(saveTool);

// Agent 对话中自动调用
// User: "记住我喜欢 TypeScript"
// AI: [调用 memory_save 工具]
```

---

## API 参考

### MemoryService

#### 构造函数

```typescript
new MemoryService(config: MemoryServiceConfig)
```

**配置选项**：

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| dataDir | string | - | 数据目录路径 |
| embeddingProvider | IEmbeddingProvider | OllamaEmbeddingProvider | 向量嵌入服务 |
| searchEnabled | boolean | true | 是否启用搜索 |
| autoSaveEnabled | boolean | true | 是否自动保存 |
| maxSearchResults | number | 6 | 最大搜索结果数 |
| minScore | number | 0.35 | 最小相关度分数 |

#### 方法

##### start()

启动记忆服务，初始化索引和文件监听。

```typescript
await memory.start();
```

##### stop()

停止记忆服务，关闭索引和监听。

```typescript
await memory.stop();
```

##### searchMemories(query)

搜索相关记忆。

```typescript
const results = await memory.searchMemories(query: string);
```

**返回**：`Promise<MemorySearchResult[]>`

##### injectRelevantMemories(messages, lastMessages)

为对话注入相关记忆。

```typescript
const enhanced = await memory.injectRelevantMemories(
  messages: Message[],
  lastMessages: Message[]
);
```

**返回**：`Promise<Message[]>` - 增强后的消息列表

##### maybeFlushMemory(currentTokens, maxTokens, messages)

检查并触发记忆刷新。

```typescript
await memory.maybeFlushMemory(
  currentTokens: number,
  maxTokens: number,
  messages: Message[]
);
```

##### getStats()

获取记忆统计信息。

```typescript
const stats = await memory.getStats();
// { fileCount, chunkCount, totalSize }
```

##### syncIndex()

手动触发索引同步（增量）。

```typescript
await memory.syncIndex();
```

##### reindex()

重建全部索引。

```typescript
await memory.reindex();
```

---

## 最佳实践

### 1. 文件组织

```
data/memory/
├── MEMORY.md           # 核心事实（项目、用户偏好）
├── YYYY-MM-DD.md      # 每日日志（对话记录）
└── [分类]/            # 可选分类
    ├── project/
    ├── personal/
    └── decisions/
```

### 2. 文件命名

- 核心记忆：`MEMORY.md`
- 每日日志：`YYYY-MM-DD.md`
- 分类记忆：`category/item.md`

### 3. 内容格式

```markdown
---
title: 标题
tags: [tag1, tag2]
created: YYYY-MM-DD
---

# 标题

内容...
```

### 4. 写作建议

- **MEMROY.md**：存储持久性事实（项目目标、用户偏好）
- **每日日志**：记录重要的对话片段
- **定期清理**：删除过时或不重要的内容

### 5. 性能优化

- ✅ 使用 `data/memory/` 而非 `workspace/memory/`
- ✅ 启用文件监听（自动更新索引）
- ✅ 合理设置 `minScore`（过滤低相关结果）
- ✅ 定期运行 `reindex()` 重建索引

---

## 与 openclaw-cn-ds 的对比

| 特性 | Krebs | openclaw-cn-ds |
|------|-------|----------------|
| 存储位置 | `data/memory/` | `~/clawd/memory/` |
| 核心文件 | `MEMORY.md` | `memory.md` |
| 数据库 | SQLite | SQLite |
| 向量搜索 | sqlite-vec | sqlite-vec |
| 文件监听 | chokidar | chokidar |
| 触发机制 | 上下文阈值 | 预压缩刷新 |
| 工具集成 | Skills 系统 | Tools 系统 |

---

## 常见问题

### Q: 如何修改存储路径？

```typescript
const memory = new MemoryService({
  dataDir: "./custom/path"  // 修改这里
});
```

### Q: 如何禁用搜索功能？

```typescript
const memory = new MemoryService({
  searchEnabled: false  // 禁用搜索
});
```

### Q: 如何手动添加记忆？

直接编辑 `data/memory/MEMORY.md` 或其他 .md 文件，索引会自动更新。

### Q: 记忆会被自动保存吗？

是的，当对话接近上下文限制时会自动触发。也可以手动调用工具保存。

### Q: 如何删除记忆？

1. 删除对应的 .md 文件
2. 运行 `memory.syncIndex()` 更新索引

---

## 下一步

- [ ] 实现完整的记忆保存逻辑
- [ ] 集成到 Agent 的对话流程
- [ ] 添加更多记忆工具（如 `memory_get`）
- [ ] 实现记忆可视化 UI

---

**参考**：
- openclaw-cn-ds: `/Users/zack/Desktop/openclaw-cn-ds`
- 源码：`src/storage/memory/`
- 示例：`examples/memory-usage.ts`
