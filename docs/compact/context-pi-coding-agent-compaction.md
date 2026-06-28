# pi-coding-agent 自带压缩机制

> 代码位置：`node_modules/@mariozechner/pi-coding-agent/dist/core/compaction/compaction.js`

## 压缩触发条件

```typescript
// compaction.js:149
shouldCompact(contextTokens, contextWindow, settings) {
    return contextTokens > contextWindow - settings.reserveTokens;
}
```

| 配置项 | 默认值 |
|--------|--------|
| `reserveTokens` | 16384 |
| `keepRecentTokens` | 20000 |
| `enabled` | true |

- **Krebs 配置**：`contextWindow = 204800`
- **触发阈值**：约 191,616 tokens（~93.75%）
- **触发方式**：
  - Case 1：LLM 返回上下文溢出错误
  - Case 2：上下文 token 超过阈值

## 压缩流程（单一层）

```
prepareCompaction()  →  findCutPoint()  →  generateSummary()  →  compact()
```

### 1. findCutPoint()（第304行）

从后向前遍历，累积估算 message sizes，保留最近 `keepRecentTokens` 的消息。

- 永远不在 tool results 处切割（它们必须跟随 tool call）
- 在 user/assistant/custom/bashExecution 处可切割
- 如果在 assistant 处切割，会往前找到该 turn 的起始 user message

### 2. prepareCompaction()（第469行）

确定要摘要的消息范围：

```typescript
{
  firstKeptEntryId,      // 压缩后保留的第一个条目 ID
  messagesToSummarize,   // 将被摘要的消息（摘要后丢弃）
  turnPrefixMessages,    // 如果切割点在 turn 中间，记录前缀消息
  isSplitTurn,          // 是否切割了 turn
  tokensBefore,         // 压缩前的 token 数
  previousSummary,      // 上一次压缩的摘要（用于增量摘要）
  fileOps,             // 从消息中提取的文件操作
}
```

### 3. generateSummary()（第432行）

调用 LLM 生成结构化摘要：

```markdown
## Goal
[What is the user trying to accomplish?]

## Constraints & Preferences
- [Any constraints, preferences, or requirements]

## Progress
### Done
- [x] [Completed tasks]

### In Progress
- [ ] [Current work]

### Blocked
[Issues preventing progress]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list]

## Critical Context
- [Any data or references needed]
```

如果有前一次摘要，使用 `UPDATE_SUMMARIZATION_PROMPT` 合并增量。

### 4. compact()（第557行）

返回 `CompactionResult`，由 SessionManager 写入 JSONL。

## CompactionEntry 结构

写入 JSONL 的条目：

```typescript
{
  type: "compaction",
  id: "comp_xxx",
  parentId: "xxx",
  timestamp: "...",
  summary: "生成的摘要...",
  firstKeptEntryId: "msg_yyy",  // 压缩后保留的第一个条目
  tokensBefore: 123456,          // 压缩前的 token 数
  details: {
    readFiles: [...],            // 压缩期间读取的文件
    modifiedFiles: [...]         // 压缩期间修改的文件
  },
  fromHook?: boolean            // 是否来自扩展（Krebs 用）
}
```

## Token 估算

使用 `chars/4` 保守估算：

```typescript
export function estimateTokens(message) {
  // user/assistant/custom: 内容长度 / 4
  // toolResult: 内容长度 / 4 + 4800 (image)
  // bashExecution: (command + output) / 4
  // branchSummary/compactionSummary: summary.length / 4
}
```

实际 token 优先使用 LLM 返回的 `usage.totalTokens`。

## 扩展钩子（Extension Hooks）

> 位置：`types.d.ts:706` 和 `types.d.ts:351-356`

### 可用的钩子

| 钩子 | 时机 | 用途 |
|------|------|------|
| `session_before_compact` | 压缩前，可拦截/替换 | **可取消或自定义压缩** |
| `session_compact` | 压缩后 | 通知，仅用于记录 |

### session_before_compact

```typescript
// types.d.ts:344-350
interface SessionBeforeCompactEvent {
  type: "session_before_compact";
  preparation: CompactionPreparation;
  branchEntries: SessionEntry[];
  customInstructions?: string;
  signal: AbortSignal;
}

// types.d.ts:665-668
interface SessionBeforeCompactResult {
  cancel?: boolean;           // 取消本次压缩
  compaction?: CompactionResult;  // 替换压缩结果
}
```

**执行流程：**
```
库触发压缩
    ↓
session_before_compact 钩子 ← Extensions 可拦截
    ├── { cancel: true } → 取消压缩，跳过库逻辑
    ├── { compaction: {...} } → 用自定义结果替换
    └── {} → 继续默认行为
    ↓
库执行压缩（或用钩子返回的结果）
    ↓
session_compact 钩子 ← 压缩完成通知
```

### 使用场景

1. **降低触发阈值**：拦截后用自己的逻辑更早触发
2. **自定义摘要格式**：替换 `CompactionResult` 用自己的摘要
3. **取消压缩**：返回 `{ cancel: true }` 跳过本次（但下一轮会再次触发）
4. **记录日志**：在 `session_compact` 中记录压缩历史

### Krebs 中的应用

Krebs 通过 `.pi/extensions/context/index.ts` 的扩展钩子拦截压缩过程：

```typescript
api.on("session_before_compact", async (event, ctx) => {
  // 检查是否需要更早触发
  if (shouldUseAggressiveSettings()) {
    return {
      compaction: {
        summary: "...",
        firstKeptEntryId: event.preparation.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
        details: { layer: "auto_compact" },
      },
    };
  }
  return {}; // 使用默认行为
});
```

## 核心问题

| 问题 | 说明 |
|------|------|
| **单一层** | 只有一种压缩，没有分级机制 |
| **破坏性** | 历史消息被删除，只剩摘要 |
| **触发阈值高** | ~94% 才触发，已经很危险 |
| **无投影机制** | 直接修改会话，无法回滚 |
| **每次调 LLM** | 每次压缩都要调用 LLM 生成摘要，代价高 |
