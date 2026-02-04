# Memory Storage 使用指南

> **Memory Storage** 是 Krebs 的长期记忆管理系统，通过 SQLite 索引 + 向量搜索实现智能记忆管理。

---

## 核心功能

- 🗄️ **SQLite 索引**：文件级哈希校验，支持增量更新
- 🔍 **向量搜索**：使用本地 Embedding Provider（Ollama）
- 📝 **Markdown 长期记忆**：自动管理 `workspace/memory/` 目录
- 🔨 **智能分块**：按 token 数分割，支持 overlap
- 👀 **实时监听**：文件变化自动更新索引

---

## 快速开始

### 1. 前置条件

确保已安装 [Ollama](https://ollama.ai/) 并运行：

```bash
# 安装 Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# 启动 Ollama 服务
ollama serve

# 拉取 embedding 模型
ollama pull nomic-embed-text
```

### 2. 创建 Memory 文件

在 `workspace/memory/` 目录下创建 Markdown 文件：

```
workspace/
├── MEMORY.md          # 主记忆文件
└── memory/            # 记忆目录
    ├── project.md     # 项目相关记忆
    ├── notes.md       # 笔记
    └── knowledge/     # 子目录
        └── ai.md      # AI 相关知识
```

### 3. 使用 Memory Storage

```typescript
import { MemoryIndexManager, OllamaEmbeddingProvider } from "@/storage/memory/index.js";

// 创建 Embedding Provider（本地 Ollama）
const embeddingProvider = new OllamaEmbeddingProvider({
  baseUrl: "http://localhost:11434",
  model: "nomic-embed-text",
});

// 创建管理器
const manager = new MemoryIndexManager({
  dbPath: "./memory.db",
  workspaceDir: "./workspace",
  embeddingProvider,
  chunkConfig: {
    tokens: 500,    // 每 chunk 约 500 tokens
    overlap: 50,    // chunk 之间重叠 50 tokens
  },
});

// 启动管理器（自动索引 + 启动监听）
await manager.start();

// 搜索记忆
const results = await manager.search("What is the project about?", 5);

// 打印结果
for (const result of results) {
  console.log(`[${result.path}:${result.startLine}-${result.endLine}] (${result.score.toFixed(2)})`);
  console.log(result.snippet);
  console.log("---");
}

// 获取统计信息
const stats = manager.getStats();
console.log(`Files: ${stats.fileCount}, Chunks: ${stats.chunkCount}, Size: ${stats.totalSize} bytes`);

// 停止管理器
await manager.stop();
```

---

## 配置选项

### Embedding Provider

#### Ollama（本地，推荐）

```typescript
import { OllamaEmbeddingProvider } from "@/storage/memory/index.js";

const provider = new OllamaEmbeddingProvider({
  baseUrl: "http://localhost:11434",  // Ollama 服务地址
  model: "nomic-embed-text",          // 模型名称
  timeout: 60000,                      // 请求超时（毫秒）
});
```

支持的 Ollama 模型：
- `nomic-embed-text` (默认)
- `mxbai-embed-large`
- `llama2` 等

#### OpenAI（远程备用）

```typescript
import { OpenAIEmbeddingProvider } from "@/storage/memory/index.js";

const provider = new OpenAIEmbeddingProvider({
  apiKey: process.env.OPENAI_API_KEY!,
  model: "text-embedding-3-small",
  baseUrl: "https://api.openai.com/v1",
});
```

### Chunk 配置

```typescript
const chunkConfig = {
  tokens: 500,   // 每个 chunk 的 token 数（近似）
  overlap: 50,   // chunk 之间的 overlap（token 数）
};

// 较小的 chunks（适合精细搜索）
{ tokens: 200, overlap: 20 }

// 较大的 chunks（适合宏观理解）
{ tokens: 1000, overlap: 100 }
```

### 索引策略

```typescript
const manager = new MemoryIndexManager({
  // ... 其他配置
  options: {
    ftsEnabled: true,          // 启用全文搜索（FTS5）
    watchEnabled: true,        // 启用实时监听（chokidar）
    watchDebounceMs: 5000,     // 监听去抖（毫秒）
    embeddingCache: true,      // 启用 Embedding 缓存
  },
});
```

---

## API 参考

### MemoryIndexManager

#### 构造函数

```typescript
new MemoryIndexManager({
  dbPath: string,                  // 数据库文件路径
  workspaceDir: string,            // workspace 目录路径
  embeddingProvider: IEmbeddingProvider,  // Embedding Provider
  chunkConfig?: ChunkConfig,       // 分块配置（可选）
})
```

#### 方法

##### start()

启动管理器（初始同步 + 启动监听）

```typescript
await manager.start();
```

##### stop()

停止管理器（停止监听 + 关闭数据库）

```typescript
await manager.stop();
```

##### search()

搜索记忆

```typescript
const results = await manager.search(
  query: string,    // 搜索查询
  topK?: number     // 返回结果数量（默认 5）
): Promise<MemorySearchResult[]>
```

返回结果格式：

```typescript
interface MemorySearchResult {
  path: string;          // 文件路径（相对）
  startLine: number;     // 起始行号
  endLine: number;       // 结束行号
  score: number;         // 相关性分数（0-1）
  snippet: string;       // 文本片段
  source: MemorySource;  // 来源（"memory" | "sessions"）
}
```

##### sync()

增量同步文件

```typescript
await manager.sync();
```

##### reindex()

全量重建索引

```typescript
await manager.reindex();
```

##### getStats()

获取统计信息

```typescript
const stats = manager.getStats();
// { fileCount: number, chunkCount: number, totalSize: number }
```

##### enableWatch() / disableWatch()

手动启用/禁用文件监听

```typescript
await manager.enableWatch();
await manager.disableWatch();
```

---

## 工具函数

### hashText()

计算文本的 SHA256 哈希

```typescript
import { hashText } from "@/storage/memory/index.js";

const hash = hashText("Hello, world!");
console.log(hash); // "dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f"
```

### chunkMarkdown()

将 Markdown 内容分块

```typescript
import { chunkMarkdown } from "@/storage/memory/index.js";

const chunks = chunkMarkdown(content, {
  tokens: 500,
  overlap: 50,
});

console.log(chunks);
// [
//   { startLine: 1, endLine: 50, text: "...", hash: "..." },
//   { startLine: 45, endLine: 95, text: "...", hash: "..." },
//   ...
// ]
```

### listMemoryFiles()

列出所有记忆文件

```typescript
import { listMemoryFiles } from "@/storage/memory/index.js";

const files = await listMemoryFiles("./workspace");
// [
//   "/path/to/workspace/MEMORY.md",
//   "/path/to/workspace/memory/notes.md",
//   ...
// ]
```

---

## 数据库结构

### files 表

文件元信息

| 列名 | 类型 | 说明 |
|------|------|------|
| path | TEXT | 文件路径（主键） |
| source | TEXT | 来源（"memory" | "sessions"） |
| hash | TEXT | 内容哈希（SHA256） |
| mtime | INTEGER | 修改时间（毫秒） |
| size | INTEGER | 文件大小（字节） |

### chunks 表

文本分块

| 列名 | 类型 | 说明 |
|------|------|------|
| id | TEXT | Chunk ID（主键） |
| path | TEXT | 文件路径 |
| source | TEXT | 来源 |
| start_line | INTEGER | 起始行号 |
| end_line | INTEGER | 结束行号 |
| hash | TEXT | 内容哈希 |
| model | TEXT | Embedding 模型 |
| text | TEXT | 文本内容 |
| embedding | TEXT | 向量（JSON） |
| updated_at | INTEGER | 更新时间 |

### embedding_cache 表

Embedding 缓存

| 列名 | 类型 | 说明 |
|------|------|------|
| provider | TEXT | Provider 名称 |
| model | TEXT | 模型名称 |
| provider_key | TEXT | Provider Key |
| hash | TEXT | 文本哈希 |
| embedding | TEXT | 向量（JSON） |
| dims | INTEGER | 向量维度 |
| updated_at | INTEGER | 更新时间 |

---

## 最佳实践

### 1. 文件组织

```
workspace/
├── MEMORY.md              # 项目主文档（概览）
└── memory/                # 详细记忆
    ├── project/           # 项目相关
    │   ├── goals.md       # 目标
    │   ├── progress.md    # 进度
    │   └── decisions.md   # 决策记录
    ├── knowledge/         # 知识库
    │   ├── ai.md          # AI 概念
    │   └── tools.md       # 工具使用
    └── conversations/     # 对话记录
        └── user-001.md    # 用户对话
```

### 2. 文件命名

- 使用小写字母和连字符：`project-goals.md`
- 使用语义化名称：`2024-02-04-decision.md`
- 避免特殊字符和空格

### 3. Markdown 格式

```markdown
---
title: Project Goals
tags: [project, goals]
created: 2024-02-04
---

# Project Goals

## Primary Goal

Build a lightweight AI Agent framework.

## Secondary Goals

- Support multiple LLM providers
- Modular architecture
- Easy to extend
```

### 4. 性能优化

- **批量索引**：首次启动时会有大量索引操作，建议在低峰期进行
- **增量更新**：实时监听会自动更新变更文件，无需手动同步
- **Embedding 缓存**：相同内容的 embedding 会被缓存，避免重复计算

### 5. 搜索技巧

- **自然语言查询**：使用完整的句子而非关键词
- **上下文查询**：提供足够的上下文信息
- **调整 topK**：根据需求调整返回结果数量

---

## 常见问题

### Q: 如何重置索引？

```typescript
await manager.reindex();
```

### Q: 如何禁用实时监听？

```typescript
await manager.disableWatch();
// 或
const manager = new MemoryIndexManager({
  // ...
  options: { watchEnabled: false },
});
```

### Q: 支持哪些 Embedding 模型？

**Ollama**（本地）：
- `nomic-embed-text` (默认，推荐)
- `mxbai-embed-large`
- `llama2`

**OpenAI**（远程）：
- `text-embedding-3-small`
- `text-embedding-3-large`
- `text-embedding-ada-002`

### Q: 如何处理大量文件？

- 启动时会自动增量同步，只更新变更文件
- 可调整 `chunkConfig` 优化性能
- 考虑使用更快的硬件（SSD、更多 RAM）

### Q: 索引速度慢怎么办？

- 使用本地 Embedding Provider（Ollama）
- 减少 `chunkConfig.tokens`（更小的 chunks）
- 禁用实时监听，手动定期同步

---

## 示例项目

完整示例请参考：

```bash
# 克隆项目
git clone https://github.com/your-repo/krebs.git
cd krebs

# 安装依赖
npm install

# 运行示例
npm run memory-example
```

---

## 参考资源

- [Ollama 官方文档](https://ollama.ai/)
- [better-sqlite3 文档](https://github.com/WiseLibs/better-sqlite3)
- [sqlite-vec 文档](https://github.com/asg017/sqlite-vec)
- [chokidar 文档](https://github.com/paulmillr/chokidar)
