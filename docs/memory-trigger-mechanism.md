# Krebs 长期记忆触发机制说明

> **版本**: v1.0
> **更新时间**: 2026-02-04

---

## 📋 目录

1. [触发机制概览](#触发机制概览)
2. [自动触发方式](#自动触发方式)
3. [手动触发方式](#手动触发方式)
4. [当前实现状态](#当前实现状态)
5. [使用示例](#使用示例)
6. [配置说明](#配置说明)

---

## 触发机制概览

Krebs 的长期记忆系统采用**多层次触发机制**，参考了 openclaw-cn-ds 的设计：

```
┌─────────────────────────────────────────┐
│         对话进行中                      │
│  (用户输入 + AI 回复)                  │
└───────────┬─────────────────────────────┘
            │
            ▼
    ┌───────────────┐
    │ Token 计数    │
    │ 当前 tokens   │
    └───────┬───────┘
            │
            ▼
    ┌───────────────┐
    │ 检查阈值       │
    │ 当前 >= 软阈值? │
    └───────┬───────┘
            │
     ┌──────┴──────┐
     │             │
    是            否
     │             │
     ▼             ▼
┌─────────┐   ┌─────────┐
│ 保存    │   │  继续对话 │
│ 记忆    │   └─────────┘
└─────────┘
```

---

## 自动触发方式

### 1. 上下文阈值触发（⚠️ 已实现框架）

**触发条件**：对话 token 数接近上下文窗口限制

**实现位置**：`src/storage/memory/service.ts`

```typescript
/**
 * 检查并触发记忆保存
 */
async maybeFlushMemory(
  currentTokens: number,
  maxTokens: number
): Promise<void> {
  // 软阈值：最大 token 数 - 20000
  const softThreshold = maxTokens - 20000;

  if (currentTokens >= softThreshold) {
    // TODO: 触发记忆保存
    console.log("[Memory Service] 触发记忆刷新");
  }
}
```

**默认配置**：
```typescript
softThreshold = maxTokens - 20000

// 例如：DeepSeek 的上下文窗口是 128K
// 软阈值 = 128000 - 20000 = 108000 tokens
```

**如何使用**：
```typescript
// 在 Agent 对话中调用
await memory.maybeFlushMemory(
  currentTokens,  // 当前使用的 token 数
  128000         // 最大 token 数
);
```

**当前状态**：✅ 框架已实现，保存逻辑待完善（TODO）

---

### 2. 文件变化监听（✅ 已实现）

**触发条件**：`data/memory/` 目录下的文件发生变化

**实现位置**：`src/storage/memory/manager.ts`

```typescript
/**
 * 启用文件监听
 */
private enableWatch(): void {
  this.watcher = chokidar.watch("data/memory/**", {
    ignored: /(^|[\/\\])\../,  // 忽略隐藏文件
    persistent: true,
  });

  // 监听事件
  this.watcher
    .on("add", (path) => {
      console.log(`[文件新增] ${path}`);
      this.scheduleSync();  // 5秒后同步
    })
    .on("change", (path) => {
      console.log(`[文件修改] ${path}`);
      this.scheduleSync();
    })
    .on("unlink", (path) => {
      console.log(`[文件删除] ${path}`);
      this.scheduleSync();
    });
}
```

**Debounce 机制**：
```typescript
// 5秒防抖，避免频繁触发
private scheduleSync(): void {
  if (this.watchDebounceTimer) {
    clearTimeout(this.watchDebounceTimer);
  }

  this.watchDebounceTimer = setTimeout(async () => {
    await this.sync();  // 增量同步索引
  }, 5000);
}
```

**当前状态**：✅ 完全实现，自动运行

---

### 3. 会话启动时索引（✅ 已实现）

**触发条件**：MemoryService 启动时

**实现位置**：`src/storage/memory/manager.ts`

```typescript
/**
 * 启动管理器
 */
async start(): Promise<void> {
  // 1. 初始化数据库
  this.db = new Database(this.dbPath);

  // 2. 确保架构
  ensureMemoryIndexSchema(...);

  // 3. 初始同步（扫描 data/memory/）
  await this.sync();

  // 4. 启动文件监听
  if (this.options.watchEnabled) {
    this.enableWatch();
  }
}
```

**同步过程**：
```typescript
async sync(): Promise<void> {
  // 1. 扫描 data/memory/ 目录
  const files = await listMemoryFiles(this.workspaceDir);

  // 2. 检查文件哈希
  for (const file of files) {
    const entry = await buildFileEntry(file);
    const record = db.prepare("SELECT hash FROM files WHERE path = ?").get(entry.path);

    // 3. 只索引变更的文件
    if (record?.hash !== entry.hash) {
      await this.indexFile(entry);
    }
  }

  // 4. 删除已移除文件的索引
  // ...
}
```

**当前状态**：✅ 完全实现

---

## 手动触发方式

### 1. Agent 工具调用（✅ 已实现）

**可用工具**：

#### `memory_search` - 搜索记忆
```typescript
// Agent 可以主动调用
{
  "name": "memory_search",
  "arguments": {
    "query": "项目的目标是什么？",
    "max_results": 6
  }
}
```

**使用场景**：
- 用户询问历史信息
- 需要查找相关上下文
- 回忆用户偏好

#### `memory_save` - 保存记忆
```typescript
{
  "name": "memory_save",
  "arguments": {
    "content": "用户喜欢使用 TypeScript 开发",
    "title": "用户偏好",
    "tags": ["preference", "tech"]
  }
}
```

**使用场景**：
- 用户明确说"记住这个"
- 识别到重要信息
- 需要持久化知识

#### `memory_stats` - 记忆统计
```typescript
{
  "name": "memory_stats",
  "arguments": {}
}
```

**返回**：
```json
{
  "file_count": 5,
  "chunk_count": 123,
  "total_size": 45678
}
```

**当前状态**：✅ 工具已实现，待集成到 Agent

---

### 2. 手动索引管理（✅ 已实现）

```typescript
// 增量同步（只索引变更文件）
await memory.syncIndex();

// 重建索引（删除并重建所有索引）
await memory.reindex();

// 获取统计信息
const stats = memory.getStats();
```

**当前状态**：✅ 已实现

---

### 3. CLI 命令（⚠️ 待实现）

**计划中的命令**：
```bash
# 手动触发索引同步
npm run memory:sync

# 重建全部索引
npm run memory:reindex

# 查看统计信息
npm run memory:stats

# 搜索记忆
npm run memory:search "查询内容"
```

**当前状态**：⚠️ 待实现

---

## 当前实现状态

### ✅ 已完成

| 功能 | 状态 | 说明 |
|------|------|------|
| 文件变化监听 | ✅ 完成 | chokidar 自动监听，5秒 debounce |
| 会话启动索引 | ✅ 完成 | 启动时自动扫描并索引 |
| 上下文阈值触发 | ✅ 框架 | `maybeFlushMemory` 已实现，保存逻辑待完善 |
| 搜索工具 | ✅ 完成 | `memory_search` 工具已实现 |
| 保存工具 | ⚠️ 部分 | `memory_save` 框架已有，内容保存逻辑待实现 |
| 统计工具 | ✅ 完成 | `memory_stats` 已实现 |
| 手动索引管理 | ✅ 完成 | `syncIndex()`, `reindex()` 已实现 |

### ⚠️ 待完善

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 记忆保存逻辑 | 高 | 实现 `saveConversationMemory()` 完整逻辑 |
| Agent 集成 | 高 | 在 Agent 对话中自动调用搜索和保存 |
| CLI 命令 | 中 | 实现 npm scripts |
| 向量搜索 | 中 | 集成 sqlite-vec 实现真正的向量搜索 |
| 智能提取 | 低 | 自动识别重要内容并保存 |

---

## 使用示例

### 示例 1：基本使用

```typescript
import { MemoryService } from "@/storage/memory/index.js";

// 1. 创建服务
const memory = new MemoryService({
  dataDir: "./data",
  searchEnabled: true,
  autoSaveEnabled: true,
});

// 2. 启动（自动索引）
await memory.start();

// 3. 搜索记忆
const results = await memory.searchMemories("项目使用的技术栈");

// 4. 停止服务
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
  messages  // 用于提取查询
);

// enhanced 现在包含记忆上下文
```

### 示例 3：Agent 工具调用

```typescript
import { createMemorySearchTool } from "@/storage/memory/tools.js";

// 1. 创建工具
const searchTool = createMemorySearchTool(memoryService);

// 2. 注册到 Agent
agent.registerSkill(searchTool);

// 3. Agent 会自动调用
// User: "我的项目偏好是什么？"
// Agent: [自动调用 memory_search]
//      [找到记忆：偏好使用 TypeScript]
//      "根据记忆，你偏好使用 TypeScript..."
```

---

## 配置说明

### MemoryService 配置

```typescript
const memory = new MemoryService({
  // 数据目录（记忆存储在 data/memory/）
  dataDir: "./data",

  // Embedding Provider（默认使用本地 Ollama）
  embeddingProvider: new OllamaEmbeddingProvider(),

  // 是否启用搜索
  searchEnabled: true,  // 默认: true

  // 是否启用自动保存
  autoSaveEnabled: true, // 默认: true

  // 搜索配置
  maxSearchResults: 6,   // 默认: 6
  minScore: 0.35,        // 默认: 0.35（相关度阈值）
});
```

### 环境变量

```bash
# .env 文件
MEMORY_DIR=./data/memory       # 记忆目录
STORAGE_DIR=./data            # 数据根目录
OLLAMA_BASE_URL=http://localhost:11434  # Ollama 服务
```

---

## 触发流程图

### 完整的记忆生命周期

```
┌──────────────────────────────────────────────┐
│ 1. 会话启动                                  │
│    MemoryService.start()                    │
│    → 扫描 data/memory/                      │
│    → 建立索引                                │
│    → 启动文件监听                            │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ 2. 对话进行中                                │
│    - 用户输入                               │
│    - AI 回复                                │
│    - Token 计数增加                         │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ 3. 检查触发条件                              │
│    a) Token >= 软阈值? → maybeFlushMemory() │
│    b) 文件变化? → 自动同步索引               │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ 4. Agent 工具调用（手动）                   │
│    - memory_search: 搜索记忆               │
│    - memory_save: 保存记忆                 │
│    - memory_stats: 统计信息                │
└──────────┬───────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ 5. 记忆存储到 data/memory/                  │
│    - MEMORY.md (核心记忆)                  │
│    - 2026-02-04.md (每日日志)              │
│    - [分类]/item.md                         │
└──────────────────────────────────────────────┘
```

---

## 关键代码位置

### 触发机制实现

| 功能 | 文件 | 行号/函数 |
|------|------|----------|
| 上下文阈值触发 | `src/storage/memory/service.ts` | `maybeFlushMemory()` |
| 文件变化监听 | `src/storage/memory/manager.ts` | `enableWatch()` |
| 会话启动索引 | `src/storage/memory/manager.ts` | `start()` |
| 增量同步 | `src/storage/memory/manager.ts` | `sync()` |
| 搜索工具 | `src/storage/memory/tools.ts` | `createMemorySearchTool()` |
| 保存工具 | `src/storage/memory/tools.ts` | `createMemorySaveTool()` |

### 数据流

```
用户输入
  ↓
Agent 处理
  ↓
MemoryService.searchMemories()  [搜索记忆]
  ↓
返回相关记忆
  ↓
注入到上下文
  ↓
生成回复
  ↓
MemoryService.maybeFlushMemory()  [检查阈值]
  ↓
可能触发保存
```

---

## 最佳实践

### 1. 记忆文件组织

```
data/memory/
├── MEMORY.md          # 核心事实（项目、用户偏好）
├── 2026-02-04.md      # 每日日志（重要对话）
└── project/           # 分类记忆（可选）
    ├── goals.md
    └── decisions.md
```

### 2. 何时保存记忆

**应该保存**：
- ✅ 用户明确说"记住这个"
- ✅ 重要决策或偏好
- ✅ 项目关键信息
- ✅ 对话接近上下文限制

**不需要保存**：
- ❌ 临时对话
- ❌ 已有的信息
- ❌ 不重要的闲聊

### 3. 搜索优化

```typescript
// 调整相关度阈值
const memory = new MemoryService({
  minScore: 0.5,  // 提高阈值，只返回高度相关的结果
});

// 调整返回数量
const memory = new MemoryService({
  maxSearchResults: 3,  // 只返回最相关的 3 条
});
```

---

## FAQ

### Q: 记忆什么时候被触发保存？

A: 目前有**两种触发方式**：
1. **自动触发**：当对话 token 数达到软阈值时（`maxTokens - 20000`）
2. **手动触发**：通过 Agent 工具 `memory_save` 调用

**注意**：自动保存的逻辑框架已实现，但内容保存部分还待完善（TODO）。

### Q: 文件修改后会自动更新索引吗？

A: **是的！**文件监听（chokidar）会自动检测 `data/memory/` 下的文件变化，并在 5 秒后自动更新索引。

### Q: 如何手动触发索引更新？

A: 有三种方式：
```typescript
// 1. 增量同步（只索引变更的文件）
await memory.syncIndex();

// 2. 重建索引（删除并重建所有索引）
await memory.reindex();

// 3. CLI 命令（待实现）
npm run memory:sync
```

### Q: 记忆保存在哪里？

A: 所有记忆保存在 `data/memory/` 目录下：
- `MEMORY.md` - 核心长期记忆
- `YYYY-MM-DD.md` - 每日对话日志
- `[分类]/item.md` - 分类记忆（可选）

### Q: 如何查看记忆统计？

A:
```typescript
const stats = memory.getStats();
console.log(`文件数: ${stats.fileCount}`);
console.log(`分块数: ${stats.chunkCount}`);
console.log(`总大小: ${stats.totalSize} bytes`);
```

---

## 下一步

### 即将实现

1. ✅ 完善记忆保存逻辑
2. ✅ 集成到 Agent 对话流程
3. ⚠️ 实现 CLI 命令
4. ⚠️ 实现真正的向量搜索（sqlite-vec）
PS：
- ⚠️ 自动保存对话内容（框架已有，逻辑待实现）
 - ⚠️ Agent 自动调用搜索工具（需要注册工具）

### 长期规划

1. 智能提取重要内容
2. 自动遗忘机制
3. 记忆可视化 UI

---

**文档维护**: 本文档应随着功能实现同步更新。

**参考**:
- openclaw-cn-ds: `/Users/zack/Desktop/openclaw-cn-ds`
- 源码: `src/storage/memory/`
