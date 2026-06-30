# Session History RAG 实现总结

## 1. 解决的问题

在 Agent 对话过程中，用户经常问一些之前已经回答过的问题。Session History RAG 在每次 `before_agent_start` 阶段（感知阶段）自动检索相关的历史会话，将相关内容注入到 system prompt 中，让 Agent 能够基于历史上下文作答，避免重复回答。

## 2. 架构设计

```
┌─────────────────────────────────────────────────────────┐
│  pi-coding-agent  Extension API                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  before_agent_start hook (Extension Entry)         │  │
│  │  .pi/extensions/session-history-rag/index.ts      │  │
│  └────────────────────┬──────────────────────────────┘  │
│                      │  imports                         │
│                      ▼                                  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Server Services (工具层)                          │  │
│  │  server/services/session-history/                  │  │
│  │    ├── indexer.ts   — 索引构建与缓存               │  │
│  │    ├── bm25.ts     — BM25 检索算法 + 分词器       │  │
│  │    ├── storage.ts  — 会话文件内容提取              │  │
│  │    └── types.ts    — 类型定义                      │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**分层原则**：
- **Extension 层**（`.pi/extensions/session-history-rag/index.ts`）：仅负责 Hook 逻辑和业务编排，调用下层工具，不包含检索算法的具体实现。
- **工具层**（`server/services/session-history/`）：纯函数实现，可独立测试，不依赖 Extension 框架。

Extension 通过相对路径导入工具层：
```typescript
import { bm25Search, preprocessForQuery } from '../../../server/services/session-history/bm25.js';
```

## 3. 核心流程

```
用户消息
    │
    ▼
before_agent_start hook 触发
    │
    ├──① markRetrieved(currentSid) ── 每 session 只执行一次
    │                                  (同一 session 多次轮询不重复检索)
    │
    ├──② contextUsage.percent > 80% ? ─── 上下文已满，跳过
    │
    ├──③ 用户消息匹配 /重新|不管之前|clear/ ? ─── 用户要求重新开始，跳过
    │
    ├──④ getOrBuildIndex() ──────────── 获取/构建搜索索引
    │     ├── 命中缓存 → 直接返回
    │     └── 未命中 → 构建索引（异步，Promise 并发保护）
    │
    ├──⑤ preprocessForQuery(prompt)
    │     ├── NFC 标准化
    │     ├── 过滤特殊字符
    │     ├── 英文分词 / 中文 charNgram
    │     └── 停用词过滤
    │
    ├──⑥ bm25Search(index, tokens, excludeSid, TOP_K=5)
    │     ├── 计算每个 query token 的 IDF
    │     ├── 遍历所有 session 计算 BM25 score
    │     ├── 按 score 降序 + createdAt tiebreaker
    │     └── 取 top-5
    │
    ├──⑦ extractAssistantContent(filePath, MAX=1000) × top-2
    │     ├── 读取 session JSONL 文件
    │     ├── 只提取 role=assistant 的 text 内容
    │     ├── 跳过 tool_call
    │     └── 句子边界截断
    │
    ├──⑧ deduplicateByScore(threshold=0.1)
    │     └── score 差值 < 0.1 的视为重复，只保留高分
    │
    ├──⑨ calculateMaxRAGLength(usage)
    │     └── 预留 30% headroom，返回可用字符数
    │
    ├──⑩ truncateRAGContent(truncated, maxLength)
    │     └── 按顺序放入，不超出 maxLength
    │
    ├──⑪ formatSessionContext()
    │     └── 格式化为 markdown 输出
    │
    ▼
返回 { systemPrompt: context } 注入到 Agent
```

## 4. 关键实现细节

### 4.1 每 Session 只检索一次

使用 `retrievedSessions: Map<string, number>` 记录已检索的 sessionId。

```typescript
function markRetrieved(sessionId: string): boolean {
  if (retrievedSessions.has(sessionId)) return false; // 已检索过
  retrievedSessions.set(sessionId, Date.now());
  return true;
}
```

**为什么不用 Set？** Set 只存 key，Map 额外存储 timestamp，用于 TTL 清理。每 100 次调用清理一次 10 分钟前的过期 entry：

```typescript
if (retrievedSessions.size % 100 === 0) {
  const cutoff = now - 10 * 60 * 1000;
  for (const [sid, ts] of retrievedSessions) {
    if (ts < cutoff) retrievedSessions.delete(sid);
  }
}
```

### 4.2 BM25 算法

BM25 是信息检索领域的经典公式，结合了词频（TF）和逆文档频率（IDF）：

**IDF（Inverse Document Frequency）**：
```
IDF = log((N - d + 0.5) / (d + 0.5) + 1)
```
- `N` = 总文档数
- `d` = 包含该 term 的文档数
- `+0.5` 平滑避免除零
- `+1` 避免 log(0)

**TF Normalization**：
```
TF_norm = (tf × (k1 + 1)) / (tf + k1 × (1 - b + b × docLen / avgDocLen))
```
- `k1 = 1.5`：词频饱和参数，控制词频增长的速率
- `b = 0.75`：文档长度归一化参数

**Final Score**：
```
score = Σ IDF(token) × TF_norm(token)
```

**Tiebreaker**：当 score 相同时，用 `createdAt / 1e15` 作为极小权重，确保新会话排在前面。

### 4.3 中文分词

两种策略并存：

| 场景 | 策略 |
|------|------|
| 有 nodejieba | jieba 智能分词（首选） |
| 无 nodejieba | charNgram fallback（2-4 字n-gram） |

```typescript
export function charNgram(text: string, min = 2, max = 4): string[] {
  const tokens: string[] = [];
  for (let i = 0; i < text.length; i++) {
    for (let len = min; len <= max && i + len <= text.length; len++) {
      tokens.push(text.slice(i, i + len));
    }
  }
  return [...new Set(tokens)];
}
```

`tokenizeForQuery` 是同步的，使用 charNgram fallback（因为 jieba 是异步的）。`tokenizeForIndex` 是异步的，优先使用 jieba。

### 4.4 索引缓存

索引缓存在模块级别 `indexCache` 变量中，24 小时过期：

```typescript
function isCacheValid(index: SearchIndex | null): boolean {
  if (!index) return false;
  if (index.version !== INDEX_VERSION) return false;        // 版本变化 → 失效
  if (index.sessionCount !== getAllSessions().length) return false; // session 数量变化 → 失效
  if (Date.now() - index.builtAt > CACHE_TTL_MS) return false;     // TTL 过期 → 失效
  return true;
}
```

`INDEX_VERSION = 1` 用于未来 schema 变化时强制刷新。

### 4.5 内容提取

从 session JSONL 文件中提取助手回答：

```typescript
// 过滤条件
entry.type === 'message'          // 必须是消息类型
entry.message.role === 'assistant' // 必须是助手角色
entry.message.content            // 必须有内容

// 跳过：tool_call、user message、system message
```

Content 可能是字符串或数组（多模态消息），数组情况下只提取 `type === 'text'` 的部分。

### 4.6 截断策略

两步截断：

1. **内容提取阶段**：`extractAssistantContent` 用 `truncateToSentence` 按句子边界截断到 maxChars
2. **格式化阶段**：`truncateRAGContent` 按"每条记录需要的总字符数"从前往后截断

```typescript
const needed = r.firstQuestion.length + r.content.length + 100; // 100 = header overhead
if (remaining - needed < 0) {
  // 最后一个放不下的 entry，部分截断 content
}
```

### 4.7 安全保护

| 保护层级 | 机制 |
|----------|------|
| P0 | 所有错误被 try-catch 包裹，永不 throw |
| P0 | `usage.percent > 80%` 时跳过，避免 overflow |
| P0 | 每 session 只检索一次 |
| P1 | `getOrBuildIndex` 有 3s timeout |
| P1 | 用户消息匹配意图跳过 |
| P1 | 按 score 相似度去重 |

## 5. 文件结构

```
.pi/extensions/session-history-rag/
└── index.ts          # Extension 入口，hook 实现

server/services/session-history/
├── types.ts          # SessionMeta, SessionIndexEntry, SearchIndex, RAGResult
├── bm25.ts           # BM25 算法、tokenizer、preprocess
├── indexer.ts        # 索引构建、缓存管理
├── storage.ts        # 文件读取、内容提取、句子截断
└── nodejieba.d.ts    # nodejieba 类型声明（可选依赖）
```

## 6. 注册方式

在 `server/session-service.ts` 中注册为 Extension Factory：

```typescript
import sessionHistoryExtension from "../.pi/extensions/session-history-rag/index.js";

// ...
extensionFactories: [
  subagents, tasks,
  memoryExtension,
  contextExtension,
  memoryContextExtension,
  sessionHistoryExtension  // 新增
],
```

## 7. 输出格式示例

```
【相关历史会话】
参考以下过去会话中的相关内容：

## 会话: abc123 | 3 天前
**问题**: 如何配置 WASM sandbox？

### 助手回答
WASM sandbox 通过...

---
```

## 8. 限制与已知行为

1. **检索范围**：只检索 `firstQuestion`（会话的第一个问题），不检索完整对话内容。理由：firstQuestion 通常最能代表会话主题，且索引体积小、检索快。
2. **中文依赖**：中文分词依赖 nodejieba（如未安装则降级为 charNgram，准确率降低但功能可用）。
3. **内容长度**：每个 session 最多提取 1000 字符，由 `MAX_CHARS_PER_SESSION` 控制。
4. **缓存失效**：新增 session 不会立即被索引，需等待下次缓存失效（24h）或手动调用 `rebuildIndex()`。
