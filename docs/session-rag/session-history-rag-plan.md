# Plan: Session History RAG

## Context

When a user asks a question, Krebs should retrieve relevant content from past sessions — similar to a RAG system. This happens at the **Perception phase** (before_agent_start hook), alongside MEMORY.md injection. The goal: avoid duplicate answers, maintain context continuity across sessions.

No vector/embedding services exist; implementation must use text-based retrieval.

---

## Approach

**BM25 Keyword Search with Lazy Indexing**

BM25 is a probabilistic text ranking algorithm — the standard baseline for text retrieval before neural embeddings. It handles term frequency saturation and document length normalization naturally.

### Why not other approaches?
- **Metadata-only matching**: `first_question` alone is insufficient for relevance
- **LLM relevance scoring**: Too slow/expensive per query
- **Full session scan**: O(n) with growing sessions, too slow

---

## File Structure

```
.pi/extensions/session-history-rag/
├── index.ts      # Extension entry + all helper functions
├── bm25.ts      # BM25 algorithm + tokenizer + STOP_WORDS
├── indexer.ts   # Index building + cache management
├── storage.ts   # Session JSONL reading + content extraction
└── types.ts     # Type definitions

lib/session-history/
├── index.ts     # Public API exports
└── storage.ts  # Shared session content extraction
```

> **Note**: `config.ts` 被省略 — 常量直接定义在 `index.ts` 中。如需外部化配置，后续可拆出。

---

## Detailed Implementation

### 1. Text Preprocessing Pipeline

```typescript
/** Sync preprocessing: NFC → filter → case fold → stop words (no tokenization) */
function preprocessSync(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase();
}

/** Tokenize a pre-normalized string */
async function tokenizeForIndex(text: string): Promise<string[]> {
  if (hasChinese(text)) {
    const jiebaResult = await tryJieba(text);
    return (jiebaResult ?? charNgram(text, 2, 4))
      .filter(t => !STOP_WORDS.has(t) && t.length > 1);
  }
  return text.split(/\s+/).filter(t => !STOP_WORDS.has(t) && t.length > 1);
}

/** Fast sync tokenize for query-time (no async jieba) */
function tokenizeForQuery(text: string): string[] {
  if (hasChinese(text)) {
    return charNgram(text, 2, 4)
      .filter(t => !STOP_WORDS.has(t) && t.length > 1);
  }
  return text.split(/\s+/).filter(t => !STOP_WORDS.has(t) && t.length > 1);
}

/** Full pipeline for index building (async tokenization) */
async function preprocessForIndex(text: string): Promise<string[]> {
  const normalized = preprocessSync(text);
  return tokenizeForIndex(normalized);
}

/** Full pipeline for query (sync tokenization) */
function preprocessForQuery(text: string): string[] {
  const normalized = preprocessSync(text);
  return tokenizeForQuery(normalized);
}
```

> **Note**: `preprocessForIndex` is async (for build-time with jieba); `preprocessForQuery` is sync (for retrieval-time, uses fast char n-gram fallback).


---

### 2. Tokenizer

```typescript
/** 检测是否包含中文字符 */
function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/** 尝试使用 nodejieba，中文分词，失败返回 undefined */
async function tryJieba(text: string): Promise<string[] | undefined> {
  try {
    // dynamic import，避免在无 jieba 环境崩溃
    const jieba = (await import('nodejieba')).default;
    return jieba.cut(text, true).filter(t => t.trim().length > 0);
  } catch {
    return undefined;
  }
}

/** 字符级 n-gram 分词（jieba 不可用时的 fallback） */
function charNgram(text: string, min: number = 2, max: number = 4): string[] {
  const tokens: string[] = [];
  for (let i = 0; i < text.length; i++) {
    for (let len = min; len <= max && i + len <= text.length; len++) {
      tokens.push(text.slice(i, i + len));
    }
  }
  return [...new Set(tokens)];
}

/** 主分词函数 */
async function tokenize(text: string): Promise<string[]> {
  if (hasChinese(text)) {
    // Try nodejieba first, fallback to character n-gram
    const jiebaResult = await tryJieba(text);
    return jiebaResult ?? charNgram(text, 2, 4);
  }
  return text.split(/\s+/).filter(Boolean);
}

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人',
  '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去',
  '你', '会', '着', '没有', '看', '好', '自己', '这', '怎么',
  '什么', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
]);
```

---

### 3. Index Structure

```typescript
interface SessionIndexEntry {
  sessionId: string;
  filePath: string;
  firstQuestion: string;
  firstQuestionTokens: string[];  // pre-tokenized
  tokenCount: number;             // doc length for BM25 normalization
  createdAt: number;              // for tiebreaker + time-based sort
}

interface SearchIndex {
  version: number;                 // cache version, bump on code change
  builtAt: number;                // for 24h expiry check
  sessionCount: number;           // invalidation: must match getAllSessions().length
  avgTokenCount: number;          // for BM25 docLen normalization
  entries: Map<string, SessionIndexEntry>;  // sessionId → entry
}
```

**Cache invalidation**:
1. `sessionCount !== getAllSessions().length` → rebuild
2. `Date.now() - builtAt > 24 * 60 * 60 * 1000` → rebuild
3. `INDEX_VERSION` changed → rebuild

**Persistence**: Index saved to `~/.cache/krebs-session-index.json`. On startup, load and validate. Write uses temp file + rename (atomic).

---

### 4. Index Builder

```typescript
async function buildIndex(
  getAllSessions: () => SessionMeta[]
): Promise<SearchIndex> {
  const entries = new Map<string, SessionIndexEntry>();
  const metas = getAllSessions();  // 一次查询，不重复调用

  let totalTokens = 0;

  for (const meta of metas) {
    try {
      // Skip non-.jsonl files
      if (!meta.file_path.endsWith('.jsonl')) continue;

      // first_question: truncate to 500 chars max
      const truncatedQuestion = meta.first_question.slice(0, 500);
      const tokens = await preprocessForIndex(truncatedQuestion);

      entries.set(meta.session_id, {
        sessionId: meta.session_id,
        filePath: meta.file_path,
        firstQuestion: truncatedQuestion,
        firstQuestionTokens: tokens,
        tokenCount: tokens.length,  // for BM25 docLen normalization
        createdAt: meta.created_at,
      });

      totalTokens += tokens.length;
    } catch {
      // Skip failed entries silently (#2 file read tolerance)
    }
  }

  const sessionCount = entries.size;
  const avgTokenCount = sessionCount > 0 ? totalTokens / sessionCount : 0;

  return {
    version: INDEX_VERSION,
    builtAt: Date.now(),
    sessionCount,           // 用于缓存失效检测: entries.size === getAllSessions().length
    avgTokenCount,          // 用于 BM25 归一化
    entries,
  };
}
```

**Concurrency guard**: Use a module-level `Promise | null` as lock. First caller starts build; subsequent callers `await` the same Promise.

**Note**: Active session (正在进行的 session) 无法在 indexer 中判断，但 RAG 检索结果会在 hook 中通过 `excludeSessionId` 过滤掉当前 session，所以不影响。

**Cache invalidation check** (在 `getOrBuildIndex` 中):
```typescript
const metas = getAllSessions();
const needsRebuild =
  !index ||
  index.version !== INDEX_VERSION ||
  index.sessionCount !== metas.length ||
  Date.now() - index.builtAt > 24 * 60 * 60 * 1000;
```

---

### 5. BM25 Retrieval

```typescript
const K1 = 1.5;
const B = 0.75;

function bm25Search(
  index: SearchIndex,
  queryTokens: string[],
  excludeSessionId: string,
  topK: number = 5
): SessionIndexEntry[] {
  // Short query fallback: < 2 meaningful tokens
  if (queryTokens.length < 2) {
    return [...index.entries.values()]
      .filter(e => e.sessionId !== excludeSessionId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 2);
  }

  const N = index.sessionCount;
  if (N === 0) return [];

  // Compute document frequency for each query term
  const df = new Map<string, number>();
  for (const qt of queryTokens) {
    let count = 0;
    for (const entry of index.entries.values()) {
      if (entry.firstQuestionTokens.includes(qt)) count++;
    }
    df.set(qt, count);
  }

  const scores = new Map<string, number>();

  for (const [sessionId, entry] of index.entries) {
    if (sessionId === excludeSessionId) continue;

    let score = 0;

    for (const qt of queryTokens) {
      const tf = entry.firstQuestionTokens.filter(t => t === qt).length;
      if (tf === 0) continue;

      // IDF: log((N - df + 0.5) / (df + 0.5))
      const d = df.get(qt) ?? 0;
      const idf = Math.log((N - d + 0.5) / (d + 0.5) + 1);

      // TF normalization by document length
      // BM25: tf * (k1 + 1) / (tf + k1 * (1 - b + b * docLen / avgDocLen))
      const docLen = entry.tokenCount;
      const avgDocLen = index.avgTokenCount || 1;
      const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * docLen / avgDocLen));

      score += idf * tfNorm;
    }

    // Tiebreaker: createdAt descending (small weight to avoid instability)
    scores.set(sessionId, score + entry.createdAt / 1e15);
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([sid]) => index.entries.get(sid)!);
}
```

---

### 6. Content Extraction (from JSONL)

```typescript
async function extractAssistantContent(
  filePath: string,
  maxChars: number = 1000
): Promise<string> {
  const lines = await readFileLineByLine(filePath);
  const contents: string[] = [];

  for (const line of lines) {
    const entry = JSON.parse(line);
    if (entry.type !== 'message') continue;
    if (entry.message?.role !== 'assistant') continue;

    // Extract text content only, skip tool_call
    const content = entry.message.content;
    if (typeof content === 'string') {
      contents.push(content);
    } else if (Array.isArray(content)) {
      const text = content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
      if (text) contents.push(text);
    }
  }

  // Join and truncate to sentence boundary
  const full = contents.join('\n\n');
  return truncateToSentence(full, maxChars);
}
```

---

### 7. Truncate to Sentence Boundary

```typescript
function truncateToSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  // Find the last sentence boundary before maxChars
  const truncated = text.slice(0, maxChars);
  const lastPeriod = Math.max(
    truncated.lastIndexOf('。'),
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('?'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('\n')
  );

  if (lastPeriod > maxChars * 0.5) {
    return truncated.slice(0, lastPeriod + 1);
  }
  return truncated.trim() + '...';
}
```

---

### 8. Extension Hook + Helper Functions

```typescript
// ================ Constants ================
const INDEX_VERSION = 1;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;  // 24h
const TOP_K = 5;           // BM25 初筛数量
const TOP_K_FINAL = 2;     // 最终返回数量
const MAX_CHARS_PER_SESSION = 1000;  // 每个 session 提取的最大字符数

// ================ Cache ================
let indexCache: SearchIndex | null = null;
let indexBuildPromise: Promise<SearchIndex> | null = null;

async function getOrBuildIndex(): Promise<SearchIndex | null> {
  const metas = getAllSessions();

  // 快速路径：零 session
  if (metas.length === 0) {
    return null;
  }

  // 检查缓存有效性
  const needsRebuild =
    !indexCache ||
    indexCache.version !== INDEX_VERSION ||
    indexCache.sessionCount !== metas.length ||
    Date.now() - indexCache.builtAt > CACHE_TTL_MS;

  if (!needsRebuild) {
    return indexCache;
  }

  // 并发保护：复用正在构建的 Promise
  if (indexBuildPromise) {
    return indexBuildPromise;
  }

  indexBuildPromise = buildIndex(getAllSessions).then(index => {
    indexCache = index;
    indexBuildPromise = null;
    return index;
  });

  return indexBuildPromise;
}

// ================ retrievedSessions Map with TTL cleanup ================
// 修复 P2: retrievedSessions Set 内存泄漏 → 改为带 TTL 的 Map，定期清理
const retrievedSessions = new Map<string, number>();  // sessionId → retrievedAt

function markRetrieved(sessionId: string): boolean {
  const now = Date.now();
  if (retrievedSessions.has(sessionId)) {
    return false;  // 已检索过
  }
  retrievedSessions.set(sessionId, now);

  // 每 100 次调用清理一次过期 entry（> 10 分钟前的）
  if (retrievedSessions.size % 100 === 0) {
    const cutoff = now - 10 * 60 * 1000;
    for (const [sid, ts] of retrievedSessions) {
      if (ts < cutoff) retrievedSessions.delete(sid);
    }
  }
  return true;
}

// ================ Helper Functions ================

/** 根据 BM25 score 相似度去重，score 差值 < 0.1 视为重复 */
function deduplicateByScore(
  results: { sessionId: string; firstQuestion: string; content: string; score?: number }[],
  threshold: number = 0.1
): typeof results {
  if (results.length <= 1) return results;
  const sorted = [...results].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const kept: typeof results = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prevScore = kept[kept.length - 1].score ?? 0;
    const currScore = sorted[i].score ?? 0;
    if (prevScore - currScore >= threshold) {
      kept.push(sorted[i]);
    }
  }
  return kept;
}

/** 计算 RAG 内容的总长度（用于判断是否超限） */
function calculateRAGLength(
  results: { content: string; firstQuestion: string }[]
): number {
  return results.reduce((sum, r) => {
    return sum + r.firstQuestion.length + r.content.length + 100; // 100 = header overhead
  }, 0);
}

/** 计算允许的最大 RAG 长度：预留 30% headroom */
function calculateMaxRAGLength(
  usage: { percent?: number; tokens?: number },
  ctx: ExtensionContext
): number {
  const contextWindow = ctx.model?.contextWindow ?? 200000;
  const limit = contextWindow * 0.7;  // 70% 为上限
  const currentTokens = usage.tokens ?? 0;
  const usedChars = currentTokens * 4; // 粗略估算：1 token ≈ 4 chars
  const available = limit - usedChars;
  return Math.min(Math.max(available, 0), 2000); // 最少 0，最多 2000
}

/** 从后往前截断，确保不超出 maxLength */
function truncateRAGContent(
  results: { content: string; firstQuestion: string }[],
  maxLength: number
): typeof results {
  let remaining = maxLength;
  const truncated: typeof results = [];

  for (const r of results) {
    const needed = r.firstQuestion.length + r.content.length + 100;
    if (remaining - needed < 0) {
      // 截断此 session 的 content
      const availableForContent = Math.max(0, remaining - r.firstQuestion.length - 100);
      truncated.push({
        ...r,
        content: truncateToSentence(r.content, availableForContent),
      });
      remaining = 0;
      break;
    } else {
      truncated.push(r);
      remaining -= needed;
    }
  }
  return truncated;
}

/** 格式化注入的 context */
function formatSessionContext(
  results: { sessionId: string; firstQuestion: string; createdAt: number; content: string }[]
): string {
  if (results.length === 0) return '';

  const lines = ['【相关历史会话】\n参考以下过去会话中的相关内容：\n'];

  for (const r of results) {
    const relativeTime = formatRelativeTime(r.createdAt);
    lines.push(
      `## 会话: ${r.sessionId} | ${relativeTime}`,
      `**问题**: ${r.firstQuestion}`,
      ``,
      `### 助手回答`,
      `${r.content}`,
      `---`,
      ``,
    );
  }

  return lines.join('\n');
}

/** 相对时间格式化 */
function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days} 天前`;
  if (hours > 0) return `${hours} 小时前`;
  if (mins > 0) return `${mins} 分钟前`;
  return '刚刚';
}

// ================ Extension Entry ================
export default function (api: ExtensionAPI) {
  api.on('before_agent_start', async (event: BeforeAgentStartEvent, ctx) => {
    // === P0: All errors caught，never throw ===
    try {
      const currentSid = ctx.sessionManager.getSessionId();

      // === P0: 每 session 只检索一次 ===
      if (!markRetrieved(currentSid)) {
        return {};
      }

      // === P0: Check context length, don't overflow ===
      const usage = ctx.getContextUsage?.() ?? {};
      if ((usage.percent ?? 0) > 0.8) {
        return {};
      }

      // === P1: Check user intent: skip if "重新"/"clear" ===
      if (/重新|不管之前|clear\s*context/i.test(event.prompt)) {
        return {};
      }

      // === Build/get index ===
      const index = await withTimeout(getOrBuildIndex(), 3000, null);
      if (!index) return {};

      // === Search ===
      const queryTokens = preprocessForQuery(event.prompt);
      const candidates = bm25Search(index, queryTokens, currentSid, TOP_K);

      if (candidates.length === 0) return {};

      // === Extract content from top candidates (top-2) ===
      const results: (SessionIndexEntry & { content: string })[] = [];
      for (const candidate of candidates.slice(0, TOP_K_FINAL)) {
        try {
          const content = await extractAssistantContent(candidate.filePath, MAX_CHARS_PER_SESSION);
          results.push({ ...candidate, content });
        } catch {
          // Skip failed extractions
        }
      }

      if (results.length === 0) return {};

      // === P1: De-duplicate similar sessions ===
      const deduped = deduplicateByScore(results);

      // === P1: Calculate total length, truncate if needed ===
      const maxLength = calculateMaxRAGLength(usage, ctx);
      const truncated = truncateRAGContent(deduped, maxLength);

      // === Format context ===
      const context = formatSessionContext(truncated);

      // === P1: DEBUG logging ===
      console.log(`[SessionRAG] Retrieved ${results.length} sessions, context ${context.length} chars`);

      // === Return systemPrompt modification ===
      return { systemPrompt: context };

    } catch (err) {
      // === P0: All errors caught, return empty ===
      console.error('[SessionRAG] Error:', err);
      return {};
    }
  });
}
```

---

### 9. Context Injection Format

```
【相关历史会话】
参考以下过去会话中的相关内容：

## 会话: {session_id} | {relative_time}
**问题**: {first_question}

### 助手回答
{extracted assistant content, truncated to sentence boundary}

---
```

---

### 10. Key Integration Points

**Register extension** in `server/session-service.ts`:
```typescript
extensionFactories: [
  subagents, tasks,
  memoryExtension,          // consolidation (50%)
  contextExtension,         // compaction
  memoryContextExtension,    // MEMORY.md injection
  sessionHistoryExtension,  // NEW: session RAG
]
```

**Reuse existing utilities**:
- `lib/session-transcript.ts:extractFromSessionFile()` — for reference, but custom extraction needed for tool_call filtering
- `db/index.ts:getAllSessions()` — session metadata
- `ctx.sessionManager.getSessionId()` — current session ID (for exclusion)

**Files to create/modify**:

| File | Action | Purpose |
|------|--------|---------|
| `.pi/extensions/session-history-rag/types.ts` | Create | `SearchIndex`, `SessionIndexEntry`, `SessionMeta` 接口 |
| `.pi/extensions/session-history-rag/bm25.ts` | Create | `hasChinese`, `tryJieba`, `charNgram`, `tokenizeForIndex`, `tokenizeForQuery`, `preprocessSync`, `preprocessForIndex`, `preprocessForQuery`, `STOP_WORDS`, `bm25Search`, `K1`, `B` |
| `.pi/extensions/session-history-rag/storage.ts` | Create | `extractAssistantContent`, `truncateToSentence`, `readFileLineByLine` |
| `.pi/extensions/session-history-rag/indexer.ts` | Create | `buildIndex`, `getOrBuildIndex`, `indexCache`, `indexBuildPromise`, `SearchIndex` 缓存管理 |
| `.pi/extensions/session-history-rag/index.ts` | Create | Extension entry + 所有辅助函数（`markRetrieved`, `deduplicateByScore`, `calculateRAGLength`, `calculateMaxRAGLength`, `truncateRAGContent`, `formatSessionContext`, `formatRelativeTime`, `withTimeout`） |
| `lib/session-history/storage.ts` | Create | 共享的 `extractAssistantContent`（供其他模块复用） |
| `server/session-service.ts` | Modify | Add `sessionHistoryExtension` to `extensionFactories` |

> `config.ts` 被省略 — 常量直接定义在 `index.ts` 中（INDEX_VERSION, CACHE_TTL_MS, TOP_K, TOP_K_FINAL, MAX_CHARS_PER_SESSION）。如需外部化配置，后续可拆出。

---

### 11. Performance Summary

| Concern | Solution |
|---------|----------|
| Index rebuild on every startup | Lazy build on first query |
| Session growth (n → large) | Index cached + sessionCount 检查，只在变化时 rebuild |
| Concurrent index builds | Promise lock, single builder |
| File I/O | Serial reads, max 2 sessions |
| Context size | Sentence boundary truncate + total length guard |
| Memory leak in retrievedSessions | Map with TTL cleanup every 100 calls |
| Cold start | Empty sessions_meta → fast path, skip build |
| Cache expiry | 24h TTL, version bump on code change |

---

## Verification

### P0 验证（上线前必须通过）

1. **BM25 算法正确性**
   ```typescript
   const index = await buildIndex(() => [
     { session_id: 's1', first_question: 'Docker 部署', file_path: '', created_at: Date.now() }
   ]);
   const scores = bm25Search(index, ['docker', '部署'], 's1', 5);
   assert(scores.length === 1);           // s1 被检索到
   assert(scores[0].sessionId === 's1');
   ```

2. **中文分词**
   ```typescript
   const tokens = await tokenizeForIndex('怎么部署Docker');
   assert(tokens.length >= 2);             // 有分词结果
   assert(!tokens.includes('的'));            // 停用词被过滤
   ```

3. **Tool call 过滤**：session JSONL 含 tool_call 时，extract 后不含 tool 内容

4. **截断到句子边界**："这是第一句。这是第二句。" 截断到 10 chars → "这是第一句。"

5. **当前 session 排除**：检索结果不包含当前 sessionId

6. **System Prompt 不超限**：注入后 total length < model context window 80%

7. **超时处理**：索引构建超时（3s）时返回空，不阻塞 agent

8. **异常不抛出**：任何 step 抛错都被 catch，返回 `{}`

9. **retrievedSessions TTL 清理**：100 次调用后清理 > 10 分钟的 entry

### 构建和类型检查

```bash
bun run build          # 必须通过
bunx tsc --noEmit     # 整个项目零错误
```

### 手动测试

1. **基础检索**
   - 创建 session A: "Explain async/await in JavaScript"
   - 创建 session B: "Debug Node.js memory leak"
   - 新 session 问: "How do Promises work?"
   - 验证 session A 被检索到（keyword overlap: JavaScript/async）

2. **中文检索**
   - 创建 session C: "怎么用 Docker 部署应用"
   - 新 session 问: "怎么用 docker 运行容器"
   - 验证 session C 被检索到（docker/容器 重合）

3. **Tool call 过滤**
   - Session 含 assistant 调用 bash 工具
   - 检索结果应只含 text 回复，不含工具调用内容

4. **短 query fallback**
   - 问: "这个怎么用"
   - 应 fallback 到按时间排序的最新 session（不是 BM25）

5. **用户意图跳过**
   - 问: "不管之前说的，重新帮我分析"
   - RAG 应跳过，无检索结果

6. **同 session 不重复**
   - 同一个 session 发两条消息
   - RAG 只在第一条消息时触发，第二次不重复

### 边界条件

| 条件 | 预期行为 |
|------|---------|
| 零 session | 返回空，无报错 |
| session 文件损坏 | 跳过该 session，继续 |
| 检索无结果 | 返回 `{}` |
| 索引构建超时 | 返回空，3s 后继续 |
| first_question 超长 | 截断到 500 chars |
| 内容截断 | 截断到句子边界，不是单词中间 |

---

## 事前验尸 (Pre-mortem)

### 风险与缓解（第四次验尸）

| # | 风险 | 概率 | 影响 | 缓解方案 |
|---|------|------|------|---------|
| 1 | **索引失效**：sessions 新增/删除后缓存不同步 | 高 | 中 | 缓存加 session count 检查，变化则 rebuild |
| 2 | **文件读取失败**：session 文件损坏/不存在 | 中 | 低 | try-catch 包裹读取，跳过异常 session |
| 3 | **短 query 无效**：关键词太少如 "这个怎么用" | 中 | 中 | 不足最小关键词数 → fallback 到时间排序最新 N 个 |
| 4 | **上下文膨胀**：检索内容过多干扰决策 | 中 | 中 | per-session cap 降至 300 tokens，top-K=2 |
| 5 | **索引构建阻塞**：首次 query 慢（n=100 时 2-3s） | 低 | 中 | 后台异步构建，前端显示加载中或返回空 |
| 6 | **first_question 误导**：session 内容与首问无关 | 中 | 中 | top-K 获取后扫描 session 文件内容二次过滤 |
| 7 | **语义相关性低**：BM25 纯词匹配，语义相关但词不同则漏检 | 高 | 低 | 承认局限；后续可加 LLM 二次重排 |
| 8 | **Extension 执行顺序副作用**：memory-context 和 session-history-rag 注入内容超长 | 低 | 中 | 各自独立控制注入长度，不相互依赖 |
| 9 | **索引全在内存**：sessions 多了后内存占用高 | 中 | 低 | 索引只存 first_question，不存完整 content |
| 10 | **并发构建竞争**：多请求同时触发索引构建 | 中 | 中 | Promise 锁确保只有一个构建任务 |
| 11 | **当前 session 被检索**：正在进行的 session 被自己检索出来 | 高 | 中 | 排除当前 sessionId |
| 12 | **工具消息干扰**：session JSONL 混入 tool_return 噪声 | 高 | 中 | 只提取 role: "assistant"，跳过 tool |
| 13 | **截断语义破坏**：固定字符截断在句子中间切断 | 中 | 中 | 截断到句子/word boundary |
| 14 | **同话题重复检索**：同一话题多个 session 都返回，内容重复 | 中 | 低 | 相似去重或只取最新 |
| 15 | **空结果处理**：无历史 session 时 context 如何处理 | 中 | 低 | 无结果时不注入任何内容 |
| 16 | **Extension 异常阻塞**：session-history-rag 抛异常导致 agent 初始化失败 | 中 | 高 | 所有 async 操作 try-catch，失败返回 `{}` |
| 17 | **SQLite 并发锁**：索引构建时读 sessions_meta 与写 meta 冲突 | 低 | 中 | busy_timeout + retry |
| 18 | **时区显示混乱**：UTC timestamp 显示为本地时间 | 低 | 低 | 格式化时转本地时区或显示相对时间 |
| 19 | **跨用户隐私泄露**：多用户共用 Krebs 时 session 互相可见 | 低 | 高 | 标记为多租户 issue，后续按需处理 |
| 20 | **中文分词失效**：BM25 依赖空格分词，中文无空格导致索引无效 | 高 | 高 | 使用 `nodejieba` 分词，或 fallback 到 n-gram Jaccard |
| 21 | **Session 文件追加中**：active session 正在写入时被读取，内容不完整 | 中 | 中 | active session 排除，只读已完成 session |
| 22 | **缓存假有效**：sessionCount 不变但 session 文件内容已变化 | 中 | 中 | 缓存加 mtime/inode 检查 |
| 23 | **Stop words 干扰**：高频停用词主导 BM25 评分 | 中 | 中 | 中文停用词表过滤（"的、了、在、怎么、什么"） |
| 24 | **缓存击穿**：缓存失效瞬间大量请求同时触发 index building | 中 | 中 | Promise 锁确保单次构建 |
| 25 | **检索顺序不稳定**：BM25 平分时返回顺序不确定 | 低 | 低 | 平分时用 created_at 降序 tiebreaker |
| 26 | **Extension 同步异常**：同步代码抛错未被 async rejection catch | 中 | 高 | 入口 try-catch 捕获所有异常 |
| 27 | **无 session 目录**：sessions/ 目录不存在时 readdirSync 报错 | 低 | 中 | 启动时创建 + 构建前检查目录存在性 |
| 28 | **Session 文件过大**：大 session JSONL 读取解析慢 | 中 | 中 | 流式读取 + 限制文件大小 max 1MB |
| 29 | **首问重复无法区分**：多个 session first_question 完全相同 | 低 | 低 | 接受局限，二次过滤时用内容区分 |
| 30 | **索引不持久化**：重启后需全量重建 | 中 | 中 | 存文件，增量更新 |
| 31 | **Extension 文件系统权限**：不确定能否读 sessions/ | 中 | 高 | 测试 ctx.cwd 访问，fallback |
| 32 | **nodejieba 引入**：native 依赖安装复杂 | 中 | 中 | 纯 JS n-gram fallback |
| 33 | **System Prompt 超限**：总长度超 context window | 中 | 高 | 计算 total length，超阈值裁剪 RAG 内容 |
| 34 | **用户意图未判断**：不问用户意愿直接注入 | 中 | 中 | 识别"重新"等关键词跳过 |
| 35 | **重复回答检测缺失**：检索到相同答案仍重复 | 低 | 低 | 标注"已有类似回答" |
| 36 | **调试黑盒**：RAG 行为不可追溯 | 中 | 低 | DEBUG 日志 + metadata |
| 37 | **监控指标缺失**：无法量化 RAG 效果 | 低 | 低 | logger 记录指标 |
| 38 | **内存泄漏**：索引只增不减 | 中 | 中 | LRU 淘汰，max size 500 限制 |
| 39 | **文件描述符耗尽**：高并发读取多文件 | 低 | 中 | 串行读取或限制并发 |
| 40 | **JSONL 解析低效**：大文件全量解析内存翻倍 | 中 | 中 | 流式解析，按需停止 |
| 41 | **缓存并发读写**：读写冲突 | 低 | 中 | 读写锁或 COW swap |
| 42 | **敏感 session 泄露** | 低 | 高 | 暂不支持，按需加 |
| 43 | **无法主动刷新索引** | 低 | 低 | 暂不支持，按需加 |
| 44 | **索引文件损坏**：缓存写入时被截断/损坏 | 中 | 中 | 写临时文件 + rename 原子替换 |
| 45 | **first_question 过长**：超长首问建索引词数爆炸 | 中 | 中 | 截断 max 500 chars |
| 46 | **非 ASCII 字符异常**：emoji、符号导致分词/B25 异常 | 中 | 中 | 过滤保留 Unicode Letter/Number |
| 47 | **文件名编码路径错误**：特殊字符导致路径处理出错 | 低 | 中 | path.resolve + try-catch |
| 48 | **增量更新 O(n)**：需扫描所有 session 判断变化 | 低 | 低 | 接受 O(n)，或维护 mtime 缓存 |
| 49 | **Extension 同步/异步**：hook 返回时机不确定 | 中 | 中 | 确认 async hook，await 索引构建 |
| 50 | **缓存预热并发冲突**：启动预热和请求并发冲突 | 中 | 中 | 全局 flag，请求时检查等待 |
| 51 | **冷启动零 session**：零 session 时每次都走完整流程 | 低 | 低 | 空 sessions_meta 直接返回空 |
| 52 | **无测试覆盖**：无测试用例回归无法发现 bug | 中 | 中 | BM25 单元测试 + 中文分词测试 |
| 53 | **文档缺失**：维护者不清楚 RAG 行为 | 低 | 低 | 设计决策和局限写入代码注释 |
| 54 | **Hook 每 turn 执行**：before_agent_start 每轮触发，RAG 重复执行 | 高 | 中 | Extension 加 flag，同 session 只检索一次 |
| 55 | **索引构建阻塞请求**：首个请求构建时其他请求等待 | 中 | 中 | Promise 锁，请求等待同一 Promise |
| 56 | **内存/文件索引不一致**：两份索引维护困难 | 低 | 中 | 只用内存索引，文件作持久化备份 |
| 57 | **Session 树结构遗漏**：只读 leaf 可能遗漏其他 branch | 低 | 中 | JSONL 包含完整树结构，直接读取即可 |
| 58 | **消息顺序不确定**：JSONL 行顺序不一定等于时间顺序 | 低 | 中 | 按 timestamp 字段排序 |
| 59 | **Tool call 内容干扰**：tool_call 格式内容无意义 | 高 | 中 | 只提取 text content，跳过 tool_call |
| 60 | **Extension 执行顺序不确定**：memory-context 和 session-history-rag 顺序未知 | 低 | 中 | 明确注册顺序，各自控制注入长度 |
| 61 | **文件扩展名不一致**：.jsonl 和 .json 混用 | 低 | 低 | 过滤只读 .jsonl 文件 |
| 62 | **缓存无限期有效**：长时间不用不清理 | 低 | 低 | 加 24h 过期策略 |
| 63 | **并发修改 session**：读取时 session 被删除 | 低 | 中 | try-catch 捕获，失败 skip |
| 64 | **Unicode 归一化**：全角半角导致匹配失败 | 中 | 中 | 建索引和查询时 normalize('NFC') |
| 65 | **大小写敏感**：Docker 和 docker 不同 term | 中 | 中 | 统一转小写 |
| 66 | **索引构建超时**：大索引阻塞 agent 响应 | 中 | 高 | 加 3s timeout，超时返回空 |
| 67 | **Extension 卸载残留**：旧缓存版本残留 | 低 | 低 | 缓存加版本号，代码更新时 bump |
| 68 | **Agent 不使用 context**：systemPrompt 被覆盖 | 低 | 中 | 确保 before_agent_start 返回格式正确 |
| 69 | **IDE 场景 context 超限**：IDE 粘贴代码 + RAG 超出限制 | 低 | 中 | RAG 控制注入量 |
| 70 | **中英混合分词**：混合语言分词困难 | 中 | 中 | 分开处理或统一 n-gram |
| 71 | **有文件无 metadata**：session 文件存在但 SQLite 没有 | 低 | 低 | 索引同时扫描目录和 SQLite，合并去重 |
| 72 | **Session 内容加密**：未来加密后 RAG 失效 | 低 | 高 | 暂不支持，标记为未来 issue |
| 73 | **首次安装依赖**：native 依赖编译失败 | 中 | 中 | 纯 JS fallback 优先 |

### P0 必做（12 项）

1. **索引失效检测**：缓存中加入 `sessionCount` 字段，对比 `sessions_meta.count()` 触发 rebuild
2. **文件读取容错**：所有文件读取包裹 try-catch，跳过失败的 session 不阻塞整体流程
3. **排除当前 session**：检索结果过滤掉当前 sessionId
4. **工具消息过滤**：只提取 role: "assistant" 的消息，跳过 tool_call
5. **Extension 异常隔离**：所有操作 try-catch，失败返回 `{}`
6. **中文分词**：使用 `nodejieba` 分词，或 fallback 到字符级 n-gram Jaccard
7. **Extension 同步异常捕获**：入口 try-catch，捕获同步和异步所有异常
8. **Extension 文件系统权限**：测试 ctx.cwd 访问 sessions/，不可访问则 fallback
9. **System Prompt 超限**：计算 total length，超阈值从后往前裁剪 RAG 内容
10. **Hook 每 turn 执行**：Extension 加 flag，同 session 只检索一次
11. **Tool call 内容过滤**：只提取 text content，跳过 tool_call
12. **索引构建超时**：加 3s timeout，超时返回空，不阻塞 agent

### P1 应该做（49 项）

13. **短 query fallback**：提取不到 2 个以上关键词时，切换为按 `created_at DESC` 取最新 2 个 session
14. **二次过滤**：BM25 初筛 top-5，再读取文件内容做关键词二次评分，取 top-2
15. **截断到句子边界**：避免在单词中间截断
16. **相似去重**：BM25 score 接近的 session 只保留一个
17. **无结果时不注入**：避免空文本占用 context
18. **并发构建加锁**：Promise 确保单次构建
19. **active session 排除**：不检索正在进行的 session
20. **缓存加 mtime 检查**：session 内容变化时缓存失效
21. **停用词过滤**：建索引和查询时过滤高频停用词
22. **无 session 目录处理**：启动时创建 + 构建前检查
23. **大文件流式读取**：限制 max 1MB，只读最新消息
24. **索引持久化**：存文件，重启后增量更新
25. **用户意图判断**：识别"重新"等关键词跳过 RAG
26. **DEBUG 日志**：记录检索结果 metadata
27. **索引 max size**：限制 500 session，LRU 淘汰
28. **串行文件读取**：避免 fd 耗尽
29. **索引文件原子写入**：写临时文件 + rename 原子替换
30. **first_question 截断**：max 500 chars
31. **非 ASCII 过滤**：过滤 emoji、特殊符号，保留 Unicode Letter/Number
32. **路径规范化**：path.resolve + try-catch
33. **async hook 确认**：await 索引构建完成再返回
34. **缓存预热 flag**：全局 flag，请求时检查等待
35. **冷启动快速路径**：空 sessions_meta 直接返回空
36. **单元测试**：BM25 算法 + 中文分词测试
37. **文档注释**：设计决策和局限写入代码注释
38. **Promise 锁请求等待**：首个请求构建时其他请求等待同一 Promise
39. **只用内存索引**：文件索引作持久化备份，不维护两份
40. **按 timestamp 排序**：JSONL 提取后按时间排序
41. **明确注册顺序**：extensionFactories 中明确 extension 顺序
42. **过滤 .jsonl**：只读 .jsonl 文件
43. **缓存 24h 过期**：长时间不用视为过期
44. **normalize('NFC')**：建索引和查询时统一归一化
45. **统一小写**：建索引和查询时都转小写
46. **缓存版本号**：代码更新时 bump，旧缓存失效
47. **确保 before_agent_start 正确**：验证 systemPrompt 注入生效
48. **RAG 注入量控制**：配合 IDE context 总量限制
49. **中英分词分开处理**：中文 jieba，英文空格，混合内容统一 n-gram
50. **扫描目录和 SQLite**：session 文件和 metadata 合并去重
51. **Unicode 过滤保留 Letter/Number**：避免符号干扰

### P2 后续迭代（12 项）

52. **后台预热**：server startup 时异步构建索引，不阻塞首轮 query
53. **LLM 重排**：BM25 初筛后，用 LLM 判断相关性再排序（增加延迟和成本）
54. **多租户隔离**：按用户 ID 分离 sessions 检索范围
55. **向量检索**：引入 embedding 模型替代 BM25（需外部服务）
56. **监控指标**：暴露 RAG 命中率/延迟到 /metrics
57. **敏感 session 标记**：用户可标记 session 为私有
58. **主动刷新 API**：CLI 或 API 触发索引 rebuild
59. **Session 内容加密支持**：未来按需实现
60. **Native 依赖可选**：nodejieba 作为可选依赖

---

## 风险统计

| 优先级 | 数量 |
|--------|------|
| P0 | 12 |
| P1 | 49 |
| P2 | 12 |
| **合计** | **73** |

---

## 已知局限

BM25 是词匹配算法，对语义相关但措辞不同的内容检索能力有限。例如：
- 用户问 "怎么写异步代码"，session 用词是 "async/await"
- 关键词重合少 → 可能检索不到

这是纯 text-based RAG 的固有局限，vector embedding 可解决但需引入外部服务。
