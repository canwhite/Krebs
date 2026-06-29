# Memory Consolidation - Design Specification

> Self-summarization of conversation history at 50% token threshold to preserve key facts in MEMORY.md

---

## TL;DR

在 token 使用达到 50% 时触发，将对话摘要持久化到 `MEMORY.md`。

**核心机制：**
- 每次 LLM 调用前检查 `tokenUsage/maxTokens >= 0.5`
- 若有新增消息，调用 LLM 提取关键事实（精简bullet points）
- 无可用信息时返回 "SKIP"，不写入 MEMORY.md
- `messageCountAtConsolidation` 计数器记录指针，下次从这里继续

**为什么用计数器：** `AgentMessage` 没有 `id`，计数器方案简单有效，contextCollapse 后仍正确。

**幂等设计：** pointer 更新后才记录 state，LLM 失败则自动重试，无需 cooldown。

**与其他压缩层正交：** 50% memory → MEMORY.md | 70% micro → tool results | 75% collapse → 内存投影

---

## Architecture

```
.pi/extensions/memory/
├── index.ts              # Extension entry (context hook)

server/services/memory/
├── index.ts              # Exports
├── engine.ts             # MemoryConsolidationEngine
├── llm.ts                # LLM summarization via completeSimple
├── storage.ts            # MEMORY.md read/write/append
└── types.ts              # Interfaces + constants
```

---

## Trigger Mechanism

### Threshold Check

Using existing `context` hook (fires before each LLM call):

```typescript
api.on("context", async (event, ctx) => {
  const usage = ctx.getContextUsage();
  if (!usage?.percent) return {};

  // Trigger at 50%
  if (usage.percent >= 0.50 && usage.percent < 0.70) {
    await engine.consolidate(event.messages, ctx);
  }

  return {};
});
```

### Why 50%?

- **50% = `budget_reduction` layer** in `LAYER_THRESHOLDS` (currently unused)
- Mid-conversation checkpoint before heavy compression layers (70%, 75%)
- Early enough to preserve context before aggressive pruning

---

## Data Structures

### ConsolidationState

```typescript
interface ConsolidationState {
  messageCountAtConsolidation: number;  // 简单计数器
  summaryText: string;
  tokensAtConsolidation: number;
  createdAt: number;
}
```

**为什么用计数器？**
- `AgentMessage` 没有 `id` 字段，无法直接标识
- SessionEntry 有 ID，但 message 和 entry 不是 1:1 映射
- 用 `messageCountAtConsolidation` 记录当时的总消息数，简单有效

**查找起始位置：**
```typescript
function findConsolidationStart(
  currentMessageCount: number,
  lastState: ConsolidationState | null
): { startIndex: number; hasNewMessages: boolean } {
  if (!lastState) return { startIndex: 0, hasNewMessages: true };

  const newMessagesCount = currentMessageCount - lastState.messageCountAtConsolidation;

  if (newMessagesCount <= 0) {
    // 没有新消息，或者 contextCollapse 删除了旧消息
    return { startIndex: lastState.messageCountAtConsolidation, hasNewMessages: false };
  }

  return { startIndex: lastState.messageCountAtConsolidation, hasNewMessages: true };
}
```

### MEMORY.md Entry Format

```markdown
## Session: {sessionId} | {timestamp}

**Token Range:** {startTokens} → {endTokens}
**Message Count:** {count} messages consolidated

### Summary
{summary from LLM — concise bullet points, or omitted if nothing valuable}

---
```

---

## Core Algorithm

### `MemoryConsolidationEngine.consolidate()`

```
1. READ last state from session entries
   - Filter: entries where type === "custom" && customType === "memory_consolidation"
   - Take last one → get data.messageCountAtConsolidation (default: null)

2. CHECK if there are new messages
   - newMessagesCount = event.messages.length - lastState.messageCountAtConsolidation
   - If <= 0: nothing new, skip

3. SLICE messages[messageCountAtConsolidation:]
   - These are messages NOT yet consolidated

4. GENERATE SUMMARY via LLM
   - System prompt: extract only key facts, decisions, open items — skip if nothing valuable
   - Input: sliced messages
   - Output: concise structured summary, or empty string if nothing值得总结
   - If summary is empty or too short (< 50 chars), skip recording and appending

5. APPEND to MEMORY.md
   - File: {cwd}/MEMORY.md
   - Format: timestamped entry block

6. RECORD ConsolidationState (always)
   - Even if summary is "SKIP": still record state (empty summaryText) so pointer advances
   - api.appendEntry("memory_consolidation", {
       messageCountAtConsolidation: event.messages.length,
       tokensAtConsolidation: usage.tokens,
       summaryText,  // may be empty string
       createdAt: Date.now()
     })
   - Only append to MEMORY.md if summaryText is non-empty
```

---

## LLM Summarization

### Interface

```typescript
// server/services/memory/llm.ts
export async function summarizeMessages(
  messages: AgentMessage[],
  model: Model<any>,
  apiKey: string,
  signal?: AbortSignal
): Promise<string>
```

### System Prompt

```
You are a terse summarizer. If the conversation contains nothing worth preserving (small talk, errors, debugging noise), respond with exactly "SKIP".

Otherwise extract in bullet points:
- Key decisions or facts
- Open questions or follow-ups
- One-line context if needed

Keep output under 200 characters. Be ruthless about excluding noise.
```

### Implementation

Uses `completeSimple` from `@mariozechner/pi-ai` (same as pi's internal compaction):

```typescript
import { completeSimple } from "@mariozechner/pi-ai";

// 获取 model 和 apiKey from ctx
const model = ctx.model!;
const apiKey = ctx.modelRegistry.resolveApiKey(model.provider);

const response = await completeSimple(
  model,
  {
    systemPrompt: SUMMARIZATION_PROMPT,
    messages: toConsolidate
  },
  { maxTokens: 8192, signal, apiKey }
);
```

---

## Memory Storage

### File Location

```
{workspace}/MEMORY.md
```

### Read Pattern

```typescript
// storage.ts
async function readMemory(): Promise<string> {
  const path = join(cwd, "MEMORY.md");
  if (existsSync(path)) {
    return readFileSync(path, "utf-8");
  }
  return "# Memory\n\n";
}
```

### Append Pattern

```typescript
async function appendMemory(entry: string): Promise<void> {
  const path = join(cwd, "MEMORY.md");
  await appendFile(path, entry, "utf-8");
}
```

### Entry Format

```typescript
function formatMemoryEntry(
  sessionId: string,
  messages: AgentMessage[],
  summary: string,
  tokensBefore: number,
  tokensAfter: number
): string {
  const timestamp = new Date().toISOString();
  const count = messages.length;

  return `## Session: ${sessionId} | ${timestamp}

**Token Range:** ${tokensBefore} → ${tokensAfter}
**Message Count:** ${count} messages consolidated

### Summary
${summary}

---
`;
}
```

---

## Rollback Mechanism

### What is "Rollback"?

If a consolidation produces a poor summary, or if the user wants to "undo" the consolidation:

**NOT** a true rollback - messages are never deleted from the session file (append-only design).

**Instead**: Append an invalidation entry, decrement the stored messageCount so the same messages will be re-summarized on next trigger.

### Implementation

```typescript
// In engine.ts
function resetConsolidationPointer(): void {
  // Find last memory_consolidation entry
  const entries = sessionManager.getEntries();
  const consolidationEntries = entries.filter(
    e => e.type === "custom" && e.customType === "memory_consolidation"
  );

  if (consolidationEntries.length > 0) {
    // Mark as invalidated
    const lastEntry = consolidationEntries[consolidationEntries.length - 1];
    api.appendEntry("consolidation_invalidation", {
      invalidatedEntryId: lastEntry.id,
      invalidatedAt: Date.now(),
      reason: "user_requested"
    });

    // Append a new consolidation state with reduced count (will cause re-consolidation)
    api.appendEntry("memory_consolidation", {
      messageCountAtConsolidation: (lastEntry.data as ConsolidationState).messageCountAtConsolidation - 1,
      summaryText: "[ROLLED BACK]",
      tokensAtConsolidation: 0,
      createdAt: Date.now()
    });
  }
}
```

### Recovery on Session Resume

```typescript
function isInvalidated(entryId: string): boolean {
  const entries = sessionManager.getEntries();
  return entries.some(
    e => e.type === "custom" &&
         e.customType === "consolidation_invalidation" &&
         e.data?.invalidatedEntryId === entryId
  );
}

function getLastValidConsolidationState(): ConsolidationState | null {
  const entries = sessionManager.getEntries();
  const consolidations = entries
    .filter(e => e.type === "custom" && e.customType === "memory_consolidation")
    .filter(e => !isInvalidated(e.id));  // Check no invalidation entry

  if (consolidations.length === 0) return null;

  return consolidations[consolidations.length - 1].data as ConsolidationState;
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| First run (no prior state) | messageCountAtConsolidation=0, summarize all |
| No new messages | newMessagesCount <= 0, skip consolidation |
| LLM call fails | Log error, pointer unchanged, automatic retry on next trigger |
| MEMORY.md doesn't exist | Create with `# Memory\n\n` header first |
| Session has 0 messages | Skip consolidation |
| Double-trigger (LLM slow) | Pointer 幂等，重复触发只产生相似摘要，可接受 |
| contextCollapse后消息数变少 | newMessagesCount <= 0，跳过（预期行为） |
| Summary is empty/useless | Record state (pointer advances), skip MEMORY.md write |

---

## Interaction with Other Layers

| Layer | Threshold | Interaction |
|-------|-----------|-------------|
| Memory Consolidation | 50% | Summarizes → MEMORY.md, records messageCount |
| Micro Compact | 70% | Replaces tool results with placeholders, messageCount 不变 |
| Context Collapse | 75% | 压缩消息，messageCount 变小，但不会影响指针逻辑 |

### 为什么计数器方案在 contextCollapse 后仍然有效

```
场景：contextCollapse 触发前
  messages = [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10]
  messageCountAtConsolidation = 5  (已整合前5条)
  新消息数 = 10 - 5 = 5  ✓ 正确

场景：contextCollapse 触发后（压缩中间3条）
  projected = [m1, m2, summary(m3+m4+m5), m6, m7, m8, m9, m10]
  messageCount = 8  (比之前少了2条，因为3条被压缩成1条)

  下次 memory consolidation：
  新消息数 = 8 - 5 = 3  ✓ 正确
  摘要 [5:] = [m6, m7, m8, m9, m10] 的后3条 = m6, m7, m8  ✓ 正确
```

### Order of Operations in context Hook

```
┌─────────────────────────────────────────────────────┐
│ context hook fires (before each LLM call)           │
│                                                     │
│ 1. Check memory consolidation (50%)                 │
│    - Compare messageCount with stored count         │
│    - Consolidates if newMessages > 0                 │
│    - Records new messageCount                         │
│                                                     │
│ 2. microCompact (70%) modifies messages[]           │
│    - Returns NEW array (immutable)                  │
│                                                     │
│ 3. contextCollapse (75%)                            │
│    - Checks after microCompact runs                  │
│    - If triggered: collapses to projection          │
│    - Returns projection                             │
│                                                     │
│ 4. Return modified messages to LLM                  │
└─────────────────────────────────────────────────────┘
```

---

## Extension Registration

### In session-service.ts

Add to `extensionFactories`:

```typescript
import memoryExtension from "./.pi/extensions/memory/index.js";

extensionFactories: [
  ...existing,
  memoryExtension,
]
```

---

## Dependencies

| Item | Status | Notes |
|------|--------|-------|
| `completeSimple` from `@mariozechner/pi-ai` | Available | Same API as pi's internal compaction |
| `LAYER_THRESHOLDS.budget_reduction` | Unused | 50% layer available for this feature |
| `ctx.modelRegistry.resolveApiKey()` | Available | 获取 API key 的标准方式 |

---

## Files to Create

| File | Purpose |
|------|---------|
| `server/services/memory/types.ts` | Interfaces, constants |
| `server/services/memory/llm.ts` | LLM summarization |
| `server/services/memory/storage.ts` | MEMORY.md read/write |
| `server/services/memory/engine.ts` | Main consolidation logic |
| `server/services/memory/index.ts` | Exports |
| `.pi/extensions/memory/index.ts` | Extension hook registration |

---

## Verification

1. `bun run build` - must pass
2. `bunx tsc --noEmit` - zero errors
3. Runtime test:
   - Start session, send ~50 messages
   - At 50% token threshold, verify MEMORY.md has new entry
   - Check session entries contain memory_consolidation custom entries
   - Verify lastConsolidatedIndex advances correctly
