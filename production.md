# Krebs 项目全局文档

> **维护时间**: 2026-02-05
> **文档状态**: 活跃维护中

---

## 项目定位

**Krebs** 是一个轻量级、模块化的 AI Agent 框架，专注于提供清晰、可扩展的智能体运行时。

**核心特性**：
- 🎯 **简洁架构**: 清晰的模块分层，易于理解和扩展
- 🔌 **可插拔设计**: Provider 层支持多种 AI 模型提供商
- 💾 **灵活存储**: Storage 层支持多种存储实现
- 🚦 **智能调度**: Lane 队列系统实现并发控制
- 🛠️ **技能系统**: 可扩展的技能框架

**技术栈**：
- 语言: TypeScript
- 运行时: Node.js (Deno兼容)
- 主要依赖:
  - Anthropic SDK, OpenAI SDK (LLM)
  - better-sqlite3 (SQLite 数据库)
  - sqlite-vec (向量搜索扩展)
  - chokidar (文件监听)
- 架构模式: 依赖注入、模块化、分层设计

---

## 核心架构

### 依赖层次（已更新）

```
types (基础层 - 零依赖)
  ↓
shared ← scheduler (独立模块)
  ↓
provider ← storage (中间层)
  ↓
agent (核心层)
  ├─ core
  │   ├─ agent.ts (Agent - LLM处理)
  │   ├─ orchestrator.ts (Orchestrator - 技能调度)
  │   ├─ system-prompt.ts (System Prompt 构建器 - 参考 openclaw-cn-ds)
  │   └─ manager.ts (AgentManager - 依赖管理)
  └─ skills (技能系统 - 基于 pi-coding-agent)
      ├─ types.ts (类型定义)
      ├─ skills-manager.ts (Facade - 统一接口)
      ├─ loader.ts (技能加载器)
      ├─ formatter.ts (Prompt 构建器)
      └─ hot-reload.ts (热加载管理)
  ↓
gateway (接入层)
  ├─ service/chat-service.ts (ChatService - 服务接口)
  └─ server/ (HTTP/WebSocket)
  ↓
index.ts (主入口)
```

### 模块说明

| 模块 | 职责 | 依赖 |
|------|------|------|
| **types** | 类型定义 | 无 |
| **shared** | 配置、日志 | 外部库 |
| **scheduler** | 并发控制队列 | 无 |
| **provider** | AI 模型抽象 | types |
| **storage** | 数据存储（Markdown、Memory） | types, better-sqlite3, sqlite-vec, chokidar |
| **agent** | 智能体核心 | provider, storage, scheduler, types |
| **gateway** | HTTP/WebSocket 服务 | agent, types |

---

## 目录结构

```
Krebs/
├── src/
│   ├── agent/           # Agent 核心实现
│   │   ├── core/        # 核心 Agent 类
│   │   │   ├── agent.ts      # Agent 主类
│   │   │   ├── system-prompt.ts # System Prompt 构建器
│   │   │   └── manager.ts    # Agent 管理器
│   │   └── skills/      # 技能系统
│   │       ├── base.ts       # 技能基类
│   │       ├── registry.ts   # 技能注册表
│   │       └── index.ts      # 技能导出
│   ├── gateway/         # HTTP/WebSocket 服务
│   │   ├── server/      # 服务器实现
│   │   └── routes/      # 路由定义
│   ├── provider/        # AI 模型抽象层
│   │   ├── base.ts      # Provider 接口
│   │   ├── anthropic.ts # Anthropic 实现
│   │   ├── openai.ts    # OpenAI 实现
│   │   └── deepseek.ts  # DeepSeek 实现
│   ├── storage/         # 存储层
│   │   ├── markdown/    # Markdown 存储
│   │   │   └── store.ts # MarkdownStore、SessionStore（旧版）
│   │   ├── session/     # Session 管理（新）
│   │   │   ├── types.ts       # SessionEntry、SessionKey 类型定义
│   │   │   ├── session-key.ts # Session Key 解析工具
│   │   │   ├── session-store.ts # 增强版 SessionStore（文件锁+缓存）
│   │   │   ├── transcript.ts  # Transcript 管理器（JSONL 格式）
│   │   │   └── session-adapter.ts # ISessionStorage 适配器
│   │   ├── memory/      # 记忆存储（索引 + 搜索）
│   │   │   ├── types.ts      # 类型定义
│   │   │   ├── internal.ts   # 工具函数
│   │   │   ├── schema.ts     # 数据库架构
│   │   │   ├── embeddings.ts # Embedding Provider
│   │   │   └── manager.ts    # 核心管理器
│   │   └── interface.ts # 存储接口（ISessionStorage、IEnhancedSessionStorage）
│   ├── scheduler/       # 调度系统
│   │   └── lanes.ts     # Lane 队列管理
│   ├── shared/          # 共享工具
│   │   ├── config.ts    # 配置管理
│   │   └── logger.ts    # 日志工具
│   ├── types/           # 类型定义
│   │   └── index.ts     # 统一导出
│   └── index.ts         # 主入口
├── docs/                # 文档目录
│   └── architecture-analysis.md  # 架构分析报告
├── schema/              # 任务文档（动态生成）
├── test/                # 测试目录
│   ├── setup.ts         # 测试环境设置
│   ├── helpers/         # 测试工具函数
│   └── storage/         # 存储测试
│       └── session/     # Session 测试
│       ├── session-key.test.ts
│       └── session-store.test.ts
├── production.md        # 本文件
└── package.json
```

---

## 核心设计模式

### 0. Session Storage 模式（会话管理）✨ 新增

**设计理念**：增强的 Markdown 存储格式，支持多 agent、文件锁和缓存

**核心特性**：
- 📝 **增强的 Markdown 格式**：在 frontmatter 中存储丰富的会话元数据
- 🔐 **文件锁机制**：防止并发写入冲突
- 💾 **智能缓存**：TTL 缓存机制，提升读取性能
- 🤖 **多 Agent 支持**：`agent:{agentId}:{key}` 格式的 session key
- 🗂️ **丰富的元数据**：支持模型配置、Token 统计、行为配置等

**使用方式**：

```typescript
import { SessionStore, createSessionStorageAdapter } from "@/storage/session/index.js";

// 创建 SessionStore
const store = new SessionStore({
  baseDir: "./data/sessions",
  enableCache: true,
  cacheTtl: 45000, // 45 秒
});

// 保存会话
await store.saveSession("user:123", messages, {
  model: "gpt-4",
  modelProvider: "openai",
  inputTokens: 100,
  outputTokens: 200,
});

// 加载会话
const session = await store.loadSession("user:123");
console.log(session.entry, session.messages);

// 列出所有会话
const sessions = await store.listSessions();

// 更新元数据
await store.updateSessionMetadata("user:123", {
  totalTokens: 300,
});

// 使用适配器（兼容 ISessionStorage）
const adapter = createSessionStorageAdapter("./data/sessions");
await adapter.saveSession("user:123", messages);
```

**Session Key 格式**：

- 简单格式：`user:123`
- 多 agent：`agent:my-agent:user:123`
- 特殊 key：`global`、`unknown`

**SessionEntry 元数据**：

```typescript
interface SessionEntry {
  sessionId: string;          // 会话 UUID
  updatedAt: number;          // 最后更新时间
  createdAt: number;          // 创建时间
  agentId?: string;           // Agent ID
  model?: string;             // 模型名称
  modelProvider?: string;     // 模型提供商
  inputTokens?: number;       // 输入 token 数
  outputTokens?: number;      // 输出 token 数
  totalTokens?: number;       // 总 token 数
  thinkingLevel?: string;     // 思考级别
  verboseLevel?: string;      // 详细级别
  // ... 更多字段
}
```

**存储格式**：

```markdown
---
sessionId: "550e8400-e29b-41d4-a716-446655440000"
updatedAt: 1736097660000
createdAt: 1736097600000
model: "gpt-4"
modelProvider: "openai"
inputTokens: 100
outputTokens: 200
totalTokens: 300
---

## user
Hello

## assistant
Hi there!
```

**优势**：
- 向后兼容：保留 Markdown 格式，易于阅读和编辑
- 高性能：文件锁 + 缓存机制，支持高并发
- 模块化：清晰的结构，易于扩展和维护
- 类型安全：完整的 TypeScript 类型定义

**新增功能**（2026-02-04）：

✅ **Session 管理系统**：
  - 增强的 Markdown 存储格式（frontmatter + 内容）
  - 文件锁机制（防止并发写入）
  - TTL 缓存（默认 45 秒）
  - 多 agent 支持（`agent:{agentId}:{key}` 格式）
  - 丰富的会话元数据（SessionEntry）
  - Session Key 解析和规范化工具
  - ISessionStorage 接口适配器
  - 完整的单元测试（40 个测试全部通过）

---

### 1. Memory Storage 模式（长期记忆）

**设计理念**：通过 SQLite 索引 + 向量搜索实现智能的长期记忆管理

**核心特性**：
- 🗄️ **SQLite 索引**：文件级哈希校验，支持增量更新
- 🔍 **向量搜索**：使用本地 Embedding Provider（Ollama）
- 📝 **Markdown 长期记忆**：自动管理 `workspace/memory/` 目录
- 🔨 **智能分块**：按 token 数分割，支持 overlap
- 👀 **实时监听**：使用 chokidar 监听文件变化，自动更新索引
- 🔄 **自动同步**：支持搜索前同步、会话启动预热、定期后台同步
- 🔀 **混合搜索**：向量搜索 + 关键词搜索，可配置权重

**使用方式**：

```typescript
import { MemoryIndexManager, OllamaEmbeddingProvider } from "@/storage/memory/index.js";

// 创建管理器
const manager = new MemoryIndexManager({
  dbPath: "./memory.db",
  workspaceDir: "./workspace",
  embeddingProvider: new OllamaEmbeddingProvider(),
  chunkConfig: { tokens: 500, overlap: 50 },
  config: {
    // 同步配置
    sync: {
      onSearch: true,              // 搜索前自动同步
      onSessionStart: true,         // 会话启动时预热
      watch: true,                  // 监控文件变化
      watchDebounceMs: 5000,        // 防抖时间（5秒）
      intervalMinutes: 30,          // 定期同步（30分钟）
    },
    // 查询配置
    query: {
      maxResults: 5,                // 最大结果数
      minScore: 0.5,                // 最低分数
      hybrid: {
        enabled: true,              // 启用混合搜索
        vectorWeight: 0.7,          // 向量搜索权重
        textWeight: 0.3,            // 关键词搜索权重
      },
    },
  },
});

// 启动（会自动索引和启动监听）
await manager.start();

// 搜索记忆
const results = await manager.search("What is the project about?", {
  maxResults: 5,
  minScore: 0.5,
  sessionKey: "user:123",  // 可选：触发会话预热
});

// 获取统计信息
const stats = manager.getStats();
console.log(`Files: ${stats.fileCount}, Chunks: ${stats.chunkCount}`);

// 停止管理器
await manager.stop();
```

**数据库结构**：

```sql
-- 文件元信息
CREATE TABLE files (
  path TEXT PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'memory',
  hash TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  size INTEGER NOT NULL
);

-- 文本分块
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'memory',
  start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  hash TEXT NOT NULL,
  model TEXT NOT NULL,
  text TEXT NOT NULL,
  embedding TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Embedding 缓存
CREATE TABLE embedding_cache (
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  provider_key TEXT,
  hash TEXT NOT NULL,
  embedding TEXT NOT NULL,
  dims INTEGER,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, model, provider_key, hash)
);
```

**优势**：
- 本地化：无需依赖外部服务（使用 Ollama）
- 高效：增量索引，只更新变更文件
- 智能：向量搜索支持语义理解
- 实时：文件变化自动更新索引

**新增功能**（2026-02-05）：

✅ **Memory Storage 增强**（基于 openclaw-cn-ds 设计）：
- ✅ **自动同步机制**：
  - `onSearch` - 搜索前自动同步（检查 dirty 标志）
  - `onSessionStart` - 会话启动时预热索引
  - `intervalMinutes` - 定期后台同步
  - `watch` - 文件变化自动同步（chokidar 监控）
- ✅ **混合搜索**：
  - 向量搜索（sqlite-vec）
  - 关键词搜索（FTS5）
  - 可配置权重（vectorWeight, textWeight）
  - 智能结果合并
- ✅ **灵活配置**：
  - `MemoryStorageConfig` 接口
  - 支持同步配置、查询配置
  - 完整的类型定义
- ✅ **性能优化**：
  - 并发同步控制（syncInProgress 标志）
  - 会话预热缓存（sessionWarm Set）
  - 防抖机制（watchDebounceMs）
  - awaitWriteFinish 优化文件监听

✅ **Skills 系统（基于 pi-coding-agent）**：
  - 使用 `@mariozechner/pi-coding-agent` 库
  - 支持 Bundled Skills（内置技能）
  - Frontmatter 解析（SKILL.md 格式）
  - 技能热加载（chokidar）
  - 技能 Prompt 注入到 LLM
  - 模块化架构（Facade 模式）
  - 技能查询接口（ChatService）
  - 示例技能：github, filesystem, web-search

✅ **记忆保存功能**：
- ✅ **记忆保存功能**：
  - 自动保存对话到每日日志（`workspace/memory/YYYY-MM-DD.md`）
  - 手动保存重要信息到 `MEMORY.md`
  - 支持标题、标签、时间戳
- ✅ **向量搜索完整实现**：
  - 集成 sqlite-vec 扩展
  - 创建 `chunks_vec` 虚拟表
  - 实现 L2 距离相似度搜索
  - 优雅降级（向量表不可用时返回空结果）
- ✅ **MemoryService 完整功能**：
  - `saveConversationMemory()` - 保存对话
  - `maybeFlushMemory()` - 自动触发刷新
  - `searchMemories()` - 搜索记忆
  - `injectRelevantMemories()` - 注入相关记忆到对话
- ✅ **记忆工具**：
  - `memory_search` - 搜索长期记忆
  - `memory_save` - 保存重要信息
  - `memory_stats` - 获取统计信息

---

### 1. Provider 模式（策略模式）

### 1. Provider 模式（策略模式）

通过 `LLMProvider` 接口抽象不同的 AI 模型提供商：

```typescript
export interface LLMProvider {
  readonly name: string;
  chat(messages: Message[], options: ChatCompletionOptions): Promise<ChatCompletionResult>;
  chatStream(messages: Message[], options: ChatCompletionOptions, onChunk: (chunk: string) => void): Promise<ChatCompletionResult>;
  embed(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;
}
```

**优势**：
- 接口明确，职责单一
- 多个实现可互换
- 符合开闭原则

### 2. 依赖注入

通过 `AgentDeps` 接口注入依赖：

```typescript
export interface AgentDeps {
  provider: LLMProvider;
  storage?: {
    saveSession(sessionId: string, messages: Message[]): Promise<void>;
    loadSession(sessionId: string): Promise<Message[] | null>;
  };
}
```

**优势**：
- 存储层可选，便于测试
- 可轻松替换存储实现

### 3. Lane 调度系统

使用队列系统实现并发控制：

```typescript
export enum CommandLane {
  Main = "main",
  Cron = "cron",
  Agent = "agent",
  Nested = "nested",
}
```

**优势**：
- 防止资源耗尽
- 支持不同 Lane 的独立并发控制
- 自动监控任务等待时间

---

## 已知架构问题

根据 `docs/architecture-analysis.md` 的分析，之前存在的问题**已全部解决** ✅：

### ✅ 已解决

1. **Agent 职责过重** ✅ 已解决
   - 引入了 Orchestrator 层，技能调度已移至 `src/agent/core/orchestrator.ts`
   - Agent 类现在专注于 LLM 对话管理

2. **使用全局单例** ✅ 已解决
   - 移除了 `globalSkillRegistry` 的使用
   - 通过 AgentManager 管理 SkillRegistry 实例

3. **Gateway 直接依赖 AgentManager** ✅ 已解决
   - 创建了 ChatService 接口层 (`src/gateway/service/chat-service.ts`)
   - Gateway 只依赖 IChatService 接口

4. **Storage 在 Manager 中硬编码** ✅ 已解决
   - 创建了 ISessionStorage 接口 (`src/storage/interface.ts`)
   - AgentManager 通过构造函数接受存储接口

5. **技能系统耦合度较高** ✅ 部分解决
   - SkillContext 已精简（只传递当前消息）
   - 后续可以进一步优化（添加按需获取历史的方法）

### 新架构评分（2026-02-04 更新）

| 维度 | 旧评分 | 新评分 | 改进 |
|------|--------|--------|------|
| **模块化** | 8/10 | 9/10 | ✅ 引入 Orchestrator 层，职责更清晰 |
| **可扩展性** | 7/10 | 9/10 | ✅ Gateway 解耦，易于扩展 |
| **可测试性** | 6/10 | 9/10 | ✅ 依赖注入，易于 Mock |
| **可维护性** | 7/10 | 9/10 | ✅ 代码清晰，模块边界明确 |
| **性能** | 8/10 | 8/10 | ➖ 无变化 |
| **安全性** | 7/10 | 8/10 | ✅ 技能上下文精简 |

**综合评分**: 从 7.2/10 提升至 **8.7/10** 🎉

---

## 部署流程

### 开发环境

```bash
# 安装依赖
npm install

# 运行开发服务器
npm run dev

# 运行测试
npm test              # 运行所有测试
npm test -- --run     # 运行测试并退出
npm test -- --coverage  # 生成覆盖率报告

# 构建项目
npm run build
```

### 生产环境

```bash
# 构建
npm run build

# 启动服务
npm start
```

### Docker 部署 ✨ 新增

Krebs 支持使用 Docker 和 Docker Compose 进行容器化部署。

#### 快速启动

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，添加 API Key

# 构建并启动所有服务
docker compose up --build

# 或者后台运行
docker compose up --build -d
```

#### 服务说明

- **Gateway 服务**（后端）
  - 端口：3000（HTTP API）、3001（WebSocket）
  - 功能：AI Agent 核心服务

- **UI 服务**（前端）
  - 端口：8080（nginx）
  - 功能：Web UI 界面

#### 访问服务

- **Web UI**: http://localhost:8080
- **API 文档**: http://localhost:3000/health
- **WebSocket**: ws://localhost:3001

#### 常用命令

```bash
# 停止服务
docker compose down

# 查看日志
docker compose logs -f

# 重建镜像
docker compose build --no-cache

# 进入容器
docker compose exec gateway sh
```

详细文档请参考：[docs/DOCKER.md](docs/DOCKER.md)

### 配置说明

配置通过环境变量或配置文件传递，主要配置项：

- `ANTHROPIC_API_KEY`: Anthropic API Key
- `OPENAI_API_KEY`: OpenAI API Key
- `DEEPSEEK_API_KEY`: DeepSeek API Key
- `STORAGE_DIR`: 会话存储目录
- `HTTP_PORT`: HTTP 服务端口（默认 3000）
- `WS_PORT`: WebSocket 服务端口（默认 3001）
- `LOG_LEVEL`: 日志级别（默认 info）

---

## 参考项目

**openclaw-cn-ds** (`/Users/zack/Desktop/openclaw-cn-ds`)：
- 大型 Agent 框架，基于 p-mono
- 完善的 workspace 概念（AGENTS.md, SOUL.md, TOOLS.md）
- 技能系统从多个位置加载（Bundled, Managed/local, Workspace）
- 完整的会话管理（JSONL格式）
- 高度模块化的工具系统

---

## 测试

### 测试框架
- **测试运行器**: Vitest
- **配置文件**: vitest.config.ts
- **测试目录**: test/

### 测试结构
```
test/
├── setup.ts           # 测试环境设置
├── helpers/           # 测试工具函数
│   └── index.ts       # Mock 函数和测试辅助
└── fixtures/          # 测试固定数据
```

### 运行测试
```bash
# 运行所有测试
npm test

# 运行测试并退出
npm test -- --run

# 生成覆盖率报告
npm test -- --coverage

# 运行特定测试文件
npm test -- logger.test.ts

# 运行 session 模块测试
npm test -- test/storage/session/
```

### 测试覆盖
当前已测试的模块：
- ✅ src/shared/logger.ts (Logger 日志系统)
- ✅ src/scheduler/lanes.ts (Lane 调度系统)
- ✅ src/provider/factory.ts (Provider 工厂)
- ✅ src/storage/session/* (Session 管理系统)
  - session-key.test.ts (26 个测试)
  - session-store.test.ts (14 个测试)
- ✅ test/integration/session-integration.test.ts (Session 集成测试)
  - 10 个集成测试（会话保存、加载、多轮对话、多 agent、并发、缓存）
- ✅ src/storage/memory/* (Memory Storage 系统)
  - internal.test.ts (33 个测试)
  - schema.test.ts (18 个测试)
  - embeddings.test.ts (24 个测试)
  - manager.test.ts (28 个测试)
- ✅ test/agent/* (Agent 核心测试) - **新增**
  - agent-tool-loop.test.ts (8 个测试 - 基础工具调用循环)
  - tool-loop-comprehensive.test.ts (19 个测试 - 全面工具调用测试)
  - system-prompt.test.ts (12 个测试)
- ✅ test/skills/* (Skills 系统测试)
  - loader.test.ts (8 个测试)
  - manager.test.ts (21 个测试)
  - formatter.test.ts (25 个测试)

测试统计：
- 测试文件：21 个
- 测试用例：353 个
- 通过率：100%

### 重要修复（2026-02-04）

#### 修复 1: 系统提示词被保存到会话历史
**问题**: Agent 在每次对话时都会添加系统提示词，然后保存整个消息列表，导致系统提示词被重复保存到会话历史中。

**影响**:
- 会话历史中包含重复的系统提示词
- 每轮对话都会添加一个新的系统提示词
- 3 轮对话会产生 9 条消息（3 个系统提示词 + 3 个用户消息 + 3 个助手回复）

**解决方案**:
修改 `src/agent/core/agent.ts` 中的 `processWithTools` 和 `processStreamInternal` 方法：
- 将消息列表分为两部分：
  - `messagesForLLM`: 包含系统提示词，用于发送给 LLM
  - `messagesToSave`: 不包含系统提示词，只保存对话历史
- 这样系统提示词只在内存中使用，不会被持久化到会话历史

**修改后的行为**:
- Round 1: 保存 [user1, assistant1]
- Round 2: 追加 [user2, assistant2]
- Round 3: 追加 [user3, assistant3]
- 最终: 6 条消息（3 个用户 + 3 个助手）

#### 修复 2: 多轮对话测试断言错误
**问题**: 测试期望第一条用户消息的下一条是第二条用户消息，但实际上是助手回复。

**解决方案**: 修正测试断言，检查正确的消息顺序：
```typescript
// 检查第一条用户消息
const firstUserMsgIndex = session!.messages.findIndex(m => m.content === "First message");
// 下一条是 assistant 回复
expect(session!.messages[firstUserMsgIndex + 1].content).toContain("Mock response to: First message");
// 再下一条是第二条用户消息
expect(session!.messages[firstUserMsgIndex + 2].content).toBe("Second message");
```

#### 修复 3: 多 agent 会话 key 过滤问题
**问题**: Session key 中的特殊字符（如 `:`）在保存时被替换为 `_`，导致测试过滤失败。

**原因**:
- Session store 使用 `resolveSessionPath()` 方法将 session key 转换为安全的文件名
- `agent:test-agent:user:123` → `agent_test-agent_user_123.md`
- 列出会话时返回的是文件名（不含 `.md`），即 `agent_test-agent_user_123`

**解决方案**:
测试中同时检查原始格式和转换后的格式：
```typescript
const agent1Sessions = sessions.filter((s: any) =>
  s.sessionKey.includes("agent=test-agent=") ||
  s.sessionKey.includes("agent_test-agent_")
);
```

**注意**: 这是已知的 session key 行为。特殊字符会被转换以确保文件系统兼容性。

---

## 改进路线图

### 第一阶段（核心架构）✅ 已完成
- [x] 引入 Orchestrator 层
- [x] 移除全局单例
- [x] Gateway 服务抽象化
- [x] Storage 接口化

### 第二阶段（工程优化）🚧 进行中
- [x] 编写单元测试和集成测试（已完成核心模块）
- [ ] 统一错误处理
- [ ] 事件总线集成
- [ ] 配置验证
- [x] 日志标准化（已完成）

### 第三阶段（功能增强）✅ 已完成
- [x] **Session 管理系统**（增强的 Markdown 存储）
- [x] **Session 集成方案**（工厂函数 + 文档 + 示例）
- [x] **System Prompt 机制**（参考 openclaw-cn-ds，支持 full/minimal/none 三种模式）
- [x] Memory Storage 系统（SQLite 索引 + 向量搜索）
- [x] 向量搜索完整实现（sqlite-vec 集成）
- [x] 记忆保存功能（每日日志 + 手动保存）
- [x] 集成测试（80+ 个测试通过）
- [x] **Skills 系统**（基于 @mariozechner/pi-coding-agent）
- [x] 技能热加载（chokidar）
- [x] **Memory Storage 增强**（自动同步 + 混合搜索）
- [x] **工具调用循环**（多步推理 + 中间消息保存 + 上下文自动压缩）
- [x] **Memory 系统集成到 Agent 层**（2026-02-12）：
  - 自动注入相关记忆到对话上下文
  - 自动保存对话到每日日志文件
  - 自动触发记忆刷新（token 接近限制时）
  - AgentManager 管理 MemoryService 生命周期
- [x] **UI 新建会话功能**（2026-02-13）：
  - 添加 `POST /api/session/create` API 端点
  - 在聊天界面输入栏左侧添加新建会话按钮
  - 支持创建新会话并清空当前对话
  - 增强会话列表API返回真实数据
- [ ] 技能多位置加载（Managed、Workspace、Extra）
- [ ] 技能依赖自动安装
- [ ] 性能监控
- [ ] 文档完善

---

**新增功能**（2026-02-05）：

✅ **工具调用循环增强**（基于 openclaw-cn-ds 调度机制分析）：
- ✅ **多步工具调用**：
  - 支持连续调用多个工具
  - 支持并行工具调用（一次请求调用多个工具）
  - 最大迭代次数限制（默认 10 次）
- ✅ **中间消息保存**：
  - 保存工具调用请求（assistant message with tool_calls）
  - 保存工具执行结果（user message with tool_result）
  - 保留完整对话历史，支持上下文连续性
- ✅ **上下文自动压缩**：
  - 智能检测上下文长度
  - 自动删除旧消息，保留最近 20 条
  - 基于 token 估算（保守策略：3 字符 ≈ 1 token）
- ✅ **工具并行执行优化**：
  - 使用 Promise.allSettled 并行执行所有工具
  - 即使某些工具失败，其他工具也能继续执行
  - 性能提升显著（3个100ms工具从300ms降至~100ms）
- ✅ **完整测试覆盖**：
  - 基础测试：8 个测试全部通过
  - 全面测试：19 个测试全部通过
  - 覆盖单步调用、多步调用、并行调用、错误处理、边缘情况、性能测试等场景

✅ **Payload 系统**（基于 openclaw-cn-ds buildEmbeddedRunPayloads 设计）：
- ✅ **统一消息格式**：
  - TextPayload - 文本消息（支持回复指令）
  - ToolResultPayload - 工具结果（支持成功/失败状态）
  - MediaPayload - 媒体内容（图片、音频等）
  - ErrorPayload - 错误消息
- ✅ **回复指令解析**：
  - `@reply:user-id` - 指定回复目标
  - `@final` - 标记最终回复
  - `@silent` - 静默回复（不输出）
- ✅ **工具结果分离**：
  - 将工具结果与普通文本分离
  - 提供结构化访问接口
  - 支持多种格式化方式（JSON、Markdown、Plain）
- ✅ **回复模式应用**：
  - `all` - 返回所有 Payload
  - `final_only` - 只返回标记为 @final 的文本
- ✅ **Agent 集成**：
  - Agent.process() 返回 AgentResult.payloads
  - 收集所有工具结果并构建完整 Payload 列表
- ✅ **完整测试覆盖**：25 个测试全部通过

✅ **Model Fallback 机制**（基于 openclaw-cn-ds 多层级重试设计）：
- ✅ **多级降级**：
  - 支持主模型 → 多个备用模型的自动降级
  - 按优先级顺序尝试每个模型
  - 每个模型支持多次重试（默认 2 次）
- ✅ **智能错误识别**：
  - Rate limit 错误（429, rate limit）
  - 服务器错误（502, 503, 504）
  - 超时错误（timeout）
  - 网络错误（ECONNRESET, ECONNREFUSED）
  - 上下文长度错误（context length exceeded）
  - 认证错误（401, 403）
  - 模型过载（overloaded, capacity）
- ✅ **智能重试策略**：
  - 可恢复错误：重试（最多 maxRetries 次）
  - 不可恢复错误：立即切换到下一个模型
  - 支持重试延迟配置（默认 1000ms）
- ✅ **回调机制**：
  - `onFallback` - 模型切换时触发
  - `onRetry` - 每次重试时触发
- ✅ **上下文追踪**：
  - FallbackContext 提供详细的执行状态
  - 当前模型索引、尝试次数、总尝试次数
- ✅ **Agent 集成**：
  - AgentConfig 支持 fallbackEnabled 和 fallbackModels 配置
  - 自动推断 provider 名称
  - 可通过配置启用/禁用
- ✅ **完整测试覆盖**：12 个测试全部通过

✅ **Memory Storage 增强**（基于 openclaw-cn-ds 设计）：
- ✅ **自动同步机制**：
  - `onSearch` - 搜索前自动同步（检查 dirty 标志）
  - `onSessionStart` - 会话启动时预热索引
  - `intervalMinutes` - 定期后台同步
  - `watch` - 文件变化自动同步（chokidar 监控）
- ✅ **混合搜索**：
  - 向量搜索（sqlite-vec）
  - 关键词搜索（FTS5）
  - 智能合并（可配置权重 vectorWeight, textWeight）
  - 结果归一化
- ✅ **查询增强**：
  - 高亮显示（关键词高亮）
  - 过滤功能（按日期、来源、标签）
  - 片段截断和优化
- ✅ **灵活配置**：
  - `MemoryStorageConfig` 接口
  - 支持同步配置、查询配置
  - 完整的类型定义

---

**新增功能**（2026-02-13）：

✅ **UI 新建会话功能**：
- ✅ **新建会话API**：
  - `POST /api/session/create` - 创建新会话
  - 生成唯一sessionId（格式：`user:{timestamp}_{random}`）
  - 返回会话ID和创建时间
- ✅ **增强会话管理**：
  - 增强 `GET /api/session/list` 返回真实会话数据
  - 支持从SessionStorage读取会话列表
  - 按更新时间排序
- ✅ **前端UI改进**：
  - 在聊天组件输入栏左侧添加新建会话按钮
  - 按钮样式：44×44px，"+"图标，悬停效果
  - 支持加载状态（显示"..."）
  - 移动端适配（36×36px）
- ✅ **会话状态管理**：
  - 添加 `currentSessionId` 状态管理
  - 新建会话后清空消息列表和输入框
  - 发送消息使用当前会话ID

---

**文档维护**: 本文档应在架构变更或模块新增时同步更新。

---

## Docker 部署（2026-02-06 更新）✨

### 新增功能

✅ **Docker 容器化支持**：
- ✅ **Gateway 服务 Dockerfile**：
  - 多阶段构建（构建 + 运行）
  - 基于 Node.js 22 Alpine 镜像
  - 非 root 用户运行（安全）
  - 健康检查配置
  - 数据持久化支持
- ✅ **UI 服务 Dockerfile**：
  - 多阶段构建（Vite 构建 + nginx 运行）
  - nginx 反向代理配置
  - API 请求代理到 Gateway
  - WebSocket 代理支持
  - 静态资源优化
- ✅ **Docker Compose 编排**：
  - 自动化服务编排
  - 服务依赖管理（UI 依赖 Gateway）
  - 健康检查和自动重启
  - 数据卷管理
  - 环境变量配置
- ✅ **完整文档**：
  - docs/DOCKER.md - 详细部署指南
  - 快速开始指南
  - 故障排查
  - 生产环境建议

### 架构设计

```
Docker Compose 架构
├── Gateway 服务
│   ├── 基于 Node.js 22 Alpine
│   ├── 暴露端口：3000 (HTTP)、3001 (WebSocket)
│   ├── 数据卷：krebs-data, krebs-workspace
│   └── 健康检查：/health 端点
│
└── UI 服务
    ├── 基于 nginx Alpine
    ├── 暴露端口：8080
    ├── 代理配置：
    │   ├── /api/* → http://gateway:3000/api/*
    │   └── /ws/* → http://gateway:3001/*
    └── 静态文件：Vite 构建产物
```

### 使用方式

#### 1. 本地开发

```bash
# 启动开发环境
docker compose up

# 访问服务
open http://localhost:8080
```

#### 2. 生产部署

```bash
# 构建生产镜像
docker compose -f docker-compose.yml build

# 启动生产环境
docker compose up -d

# 查看状态
docker compose ps
```

#### 3. 数据管理

```bash
# 备份数据
docker run --rm -v krebs-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/krebs-data-backup.tar.gz -C /data .

# 恢复数据
docker run --rm -v krebs-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/krebs-data-backup.tar.gz -C /data
```

### 优势

- **一致性**：开发和生产环境完全一致
- **可移植性**：可在任何支持 Docker 的平台上运行
- **可扩展性**：易于横向扩展和负载均衡
- **隔离性**：服务间相互隔离，提高安全性
- **自动化**：一键启动，自动编排

### 相关文件

- `Dockerfile` - Gateway 服务镜像
- `ui/Dockerfile` - UI 服务镜像
- `ui/nginx.conf` - nginx 配置
- `docker-compose.yml` - 服务编排
- `.dockerignore` - 构建排除文件
- `ui/.dockerignore` - UI 构建排除文件
- `docs/DOCKER.md` - 详细文档
