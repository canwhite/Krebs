# Context Collapse & AutoCompact 设计文档

---

## Pre - Token 用量如何确定

### 扩展 API 提供

通过 `ctx.getContextUsage()` 获取当前 token 用量：

```typescript
// types.d.ts:165-171
interface ContextUsage {
  tokens: number | null;       // 估算的 context tokens
  contextWindow: number;        // 上下文窗口大小
  percent: number | null;      // 使用百分比
}
```

调用方式：
```typescript
api.on("context", async (event, ctx) => {
  const usage = ctx.getContextUsage();
  if (!usage?.tokens) return {};

  const percent = usage.tokens / usage.contextWindow;
  // percent = 0.75 表示 75% 用量
});
```

### tokens 估算来源

`usage.tokens` 是**估算值**，不是精确值。可能的估算方式：

1. **精确值**：每次 LLM 响应后，累加 `usage.totalTokens`
2. **估算值**：`char / 4` 或类似的粗略估算

> ⚠️ **注意**：客户端与服务端的 token 计数可能存在误差。优先信任 LLM 返回的 `usage.totalTokens`。

### 阈值计算示例

假设 `contextWindow = 200000`：

| 层级 | 阈值 | tokens |
|------|------|--------|
| micro_compact | 70% | 140,000 |
| context_collapse | 75% | 150,000 |
| auto_compact | 83.5% | 167,000 |

---

## pi-coding-agent 自带压缩机制

> 以下是 `pi-coding-agent` 库内置的压缩实现，代码位于 `node_modules/@mariozechner/pi-coding-agent/dist/core/compaction/compaction.js`

### 压缩触发条件

```typescript
// compaction.js:149
shouldCompact(contextTokens, contextWindow, settings) {
    return contextTokens > contextWindow - settings.reserveTokens;
}
```

- **默认配置**：`reserveTokens = 16384`
- **Krebs 配置**：`contextWindow = 204800`
- **触发阈值**：约 191,616 tokens（~93.75%）
- **触发方式**：LLM 返回上下文溢出错误，或阈值超限

### 压缩流程（单一层）

```
prepareCompaction()  →  findCutPoint()  →  generateSummary()  →  compact()
```

1. **findCutPoint()**（第304行）：从后向前遍历，保留最近 `keepRecentTokens`（默认20000）的消息
2. **prepareCompaction()**（第469行）：确定要摘要的消息范围 `messagesToSummarize`
3. **generateSummary()**（第432行）：调用 LLM 生成结构化摘要
4. **compact()**（第557行）：返回摘要结果，写入 JSONL

### 摘要格式

```markdown
## Goal
## Constraints & Preferences
## Progress
### Done
### In Progress
### Blocked
## Key Decisions
## Next Steps
## Critical Context
```

### CompactionEntry 结构

写入 JSONL 的条目：
```typescript
{
  type: "compaction",
  id: "comp_xxx",
  parentId: "xxx",
  summary: "生成的摘要...",
  firstKeptEntryId: "msg_yyy",  // 压缩后保留的第一个条目
  tokensBefore: 123456,           // 压缩前的 token 数
  details: { readFiles, modifiedFiles }  // 扩展字段
}
```

### 核心问题

| 问题 | 说明 |
|------|------|
| **单一层** | 只有一种压缩，没有分级机制 |
| **破坏性** | 历史消息被删除，只剩摘要 |
| **触发阈值高** | ~94% 才触发，已经很危险 |
| **无投影机制** | 直接修改会话，无法回滚 |

### 你的设计与现有系统的关系

```
pi-coding-agent 压缩层（单一，破坏性，~94%触发）
         ↑
         │  ← 拦截 session_before_compact 钩子
         │
┌────────┴───────────────────────┐
│  你的 Context Collapse 层      │  ← 读时投影，75%触发，自己生成摘要
│  你的 AutoCompact 层          │  ← 更激进的压缩，83.5%触发
└────────────────────────────────┘
```

**Context Collapse** 和 **AutoCompact** 是**包装**库的压缩，通过扩展钩子在它之前/之后做分级处理，而不是替换它。

---

## Context

当前 Krebs 项目使用 `pi-coding-agent` 库的自带单一压缩层（触发时直接生成摘要替换历史）。用户需要更精细的多层分级压缩机制，在不同阈值下渐进式触发，以延长会话可用性、减少重压缩频率。

## 目标

1. **Context Collapse**（75% 触发）**自己生成摘要**，创建读时投影
2. **AutoCompact**（83.5% 触发）最后手段重压缩

---

## 架构设计

### 压缩层级阈值

```typescript
const LAYER_THRESHOLDS = {
  budget_reduction: 0.50,
  snip: 0.60,
  micro_compact: 0.70,
  context_collapse: 0.75,
  auto_compact: 0.835,
};
```

### 层级职责

| 层级 | 触发阈值 | 机制 |
|------|----------|------|
| **budget_reduction** | ~50% | 降低 token 预算（未来扩展） |
| **snip** | ~60% | 剪裁（未来扩展） |
| **micro_compact** | ~70% | truncate 旧 tool results（已实现） |
| **context_collapse** | ~75% | **自己生成摘要**，创建读时投影 |
| **auto_compact** | ~83.5% | 调 LLM 生成新摘要，最后手段 |

---

## Context Collapse 详细设计

### 核心流程

```
75% tokens →
  1. 计算 boundary（headIndex, tailIndex）
  2. 调 LLM 对 [headIndex, tailIndex) 生成摘要
  3. 创建投影：摘要消息替换旧消息段
  4. context hook 返回投影
  5. 底层 JSONL 不变
```

### Boundary 确认流程

#### 1. 计算 tailIndex（压缩结束点）

从当前最新消息（session tail）往前累加 tokens，保留**最近固定量**：
- 方式 A：保留最后 8-15 轮对话
- 方式 B：保留 20-30% 总 tokens（或 8000 tokens）

`tailIndex` = 该保留段**第一条消息的 index**

这样，`tailIndex` 之后的所有消息保持全量 verbatim。

#### 2. 确定 headIndex（压缩起始点）

- **优先**：取**上次 collapse 留下的 SummaryAnchor.tailIndex**
- **若无**：从头开始（index = 0）

这形成 `[headIndex, tailIndex)` 的待压缩范围。

#### 3. 验证与调整

- 检查该段 tokens 是否值得压缩（> 一定阈值，如 5000 tokens）
- 可分块：若过长，按自然对话段或固定 token 块分割，生成多条 hierarchical summaries
- 特殊情况：若中间有重要 artifact/tool output，可把 tail 往后推，保护关键点

#### 4. 执行

LLM 对 `[headIndex, tailIndex)` 范围生成摘要 → 投影中替换 → context hook 返回

**优势**：边界动态滚动、可追溯（Summary Anchor 记录 index 范围），底层 JSONL 不变。

### Summary Anchor 结构

每次 collapse 后，插入一个 Summary Anchor 记录压缩范围，供下次 collapse 使用：

```typescript
interface SummaryAnchor {
  type: "summary_anchor";
  headIndex: number;       // 压缩范围起始 index（包含）
  tailIndex: number;       // 压缩范围结束 index（不包含）
  summary: string;          // 摘要内容
  tokensBefore: number;     // 压缩前的 token 数
  createdAt: number;       // 时间戳
  layer: "context_collapse";
}
```

通过 `ctx.appendEntry("summary_anchor", anchorData)` 持久化到 session。

### 文件结构

```
server/
├── services/compact/
│   ├── types.ts              # 共享类型（CompactBoundary, SummaryAnchor）
│   ├── microCompact.ts       # Micro Compact（已实现）
│   ├── contextCollapse.ts    # Context Collapse 核心逻辑
│   └── autoCompact.ts        # AutoCompact 服务（未来）
└── query.ts                  # 集成层（未来）

.pi/extensions/
└── context/
    └── index.ts              # 扩展钩子实现
```

### Context Collapse 配置

```typescript
interface ContextCollapseConfig {
  keepRecentTokens: number;   // 保留最近的 token 数（默认 8000）
  keepRecentRounds: number;    // 或保留最近 N 轮（默认 10）
  minCompressionTokens: number; // 最小压缩阈值（默认 5000）
  enabled: boolean;
}

export const DEFAULT_CONTEXT_COLLAPSE_CONFIG: ContextCollapseConfig = {
  keepRecentTokens: 8000,
  keepRecentRounds: 10,
  minCompressionTokens: 5000,
  enabled: true,
};
```

### contextCollapse.ts 核心逻辑

```typescript
export interface CompactBoundary {
  headIndex: number;   // 压缩起始 index（包含）
  tailIndex: number;   // 压缩结束 index（不包含）
}

export interface CollapseResult {
  projectedMessages: AgentMessage[];
  boundary: CompactBoundary;
  summary: string;
}

export function createContextCollapser(config: Partial<ContextCollapseConfig> = {}) {
  const cfg = { ...DEFAULT_CONTEXT_COLLAPSE_CONFIG, ...config };

  return {
    /**
     * 判断是否应该触发 Context Collapse
     */
    shouldCollapse(tokens: number, contextWindow: number): boolean {
      const percent = tokens / contextWindow;
      return percent >= LAYER_THRESHOLDS.context_collapse && cfg.enabled;
    },

    /**
     * 计算压缩边界（基于 index）
     * @param messages AgentMessage[] - 完整消息数组
     * @param latestAnchor 上次 collapse 的 SummaryAnchor（如果有）
     */
    calculateBoundary(
      messages: AgentMessage[],
      latestAnchor?: SummaryAnchor
    ): CompactBoundary | null {
      // 1. 确定 headIndex：
      //    - 如果有 latestAnchor，用其 tailIndex
      //    - 否则从 0 开始
      const headIndex = latestAnchor?.tailIndex ?? 0;

      // 2. 计算 tailIndex：
      //    - 从 tail 往前累加，保留 cfg.keepRecentRounds 轮
      //    - 或达到 cfg.keepRecentTokens 时停止
      let tokenCount = 0;
      let tailIndex = messages.length;

      for (let i = messages.length - 1; i >= headIndex && tokenCount < cfg.keepRecentTokens; i--) {
        tokenCount += estimateMessageTokens(messages[i]);
        tailIndex = i;
      }

      // 3. 确保有足够的待压缩内容
      if (tailIndex - headIndex < 2) {
        return null; // 内容太少，不需要压缩
      }

      return { headIndex, tailIndex };
    },

    /**
     * 创建投影（在内存中，不修改底层）
     */
    createProjection(
      messages: AgentMessage[],
      boundary: CompactBoundary,
      summary: string
    ): AgentMessage[] {
      const { headIndex, tailIndex } = boundary;

      // 构建新消息数组：
      // - [0, headIndex): 保持原样
      // - [headIndex, tailIndex): 替换为摘要消息
      // - [tailIndex, end): 保持原样

      const summaryMessage: AgentMessage = {
        role: "user",
        content: `【Context Collapse 摘要】\n${summary}`,
        timestamp: Date.now(),
      } as AgentMessage;

      return [
        ...messages.slice(0, headIndex),
        summaryMessage,
        ...messages.slice(tailIndex),
      ];
    },

    /**
     * 生成摘要（调 LLM）
     */
    async generateSummary(
      messages: AgentMessage[],
      headIndex: number,
      tailIndex: number
    ): Promise<string> {
      // 1. 提取 [headIndex, tailIndex) 的消息内容
      const rangeMessages = messages.slice(headIndex, tailIndex);

      // 2. 构造 prompt 调 LLM 生成摘要
      const prompt = `请为以下对话历史生成简洁摘要：

${rangeMessages.map((m, i) => `[${i + headIndex}] ${m.role}: ${JSON.stringify(m.content)}`).join('\n')}

摘要要求：
- 保留关键决策和进展
- 简洁明了，便于后续上下文理解
- 100-200 字以内`;

      // 3. 调用 LLM 生成摘要（具体实现依赖 API）
      const summary = await callLLM(prompt);
      return summary;
    },
  };
}
```

### 扩展钩子实现

```typescript
// .pi/extensions/context/index.ts

api.on("context", async (event, ctx) => {
  const usage = ctx.getContextUsage();
  if (!usage?.tokens) return {};

  const mc = createMicroCompact();
  const cc = createContextCollapser();

  // 1. Micro Compact（如果启用）
  // ... (已有实现)

  // 2. Context Collapse
  if (cc.shouldCollapse(usage.tokens, usage.contextWindow)) {
    // 从 session entries 获取上次的 SummaryAnchor
    const entries = ctx.sessionManager.getEntries();
    const latestAnchor = getLatestSummaryAnchor(entries);

    // 计算边界
    const boundary = cc.calculateBoundary(event.messages, latestAnchor);
    if (!boundary) return {};

    // 检查是否值得压缩
    const rangeTokens = estimateTokens(event.messages, boundary.headIndex, boundary.tailIndex);
    if (rangeTokens < cc.getConfig().minCompressionTokens) return {};

    // 生成摘要
    const summary = await cc.generateSummary(
      event.messages,
      boundary.headIndex,
      boundary.tailIndex
    );

    // 创建投影
    const projected = cc.createProjection(event.messages, boundary, summary);

    // 持久化 Summary Anchor
    ctx.appendEntry("summary_anchor", {
      headIndex: boundary.headIndex,
      tailIndex: boundary.tailIndex,
      summary,
      tokensBefore: usage.tokens,
      createdAt: Date.now(),
      layer: "context_collapse",
    });

    return { messages: projected };
  }

  return {};
});
```

---

## AutoCompact 详细设计（未来）

### 核心思路

在 83.5% 触发，强制库的压缩使用更激进的设置：

```typescript
// 环境变量
const AUTOCOMPACT_PCT = parseFloat(
  process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE || "0.835"
);
```

### session_before_compact 钩子

```typescript
api.on("session_before_compact", async (event, ctx) => {
  const usage = ctx.getContextUsage();
  if (!usage?.tokens) return {};

  const percent = usage.tokens / usage.contextWindow;
  if (percent < LAYER_THRESHOLDS.auto_compact) return {};

  // 使用更激进的压缩设置
  return {
    compaction: {
      // 让库的压缩使用更大的 reserveTokens
      // 具体实现待定
    },
  };
});
```

---

## 辅助函数

```typescript
/**
 * 获取最新的 SummaryAnchor
 */
function getLatestSummaryAnchor(entries: SessionEntry[]): SummaryAnchor | undefined {
  return entries
    .filter((e): e is CustomEntry =>
      e.type === "custom" && e.customType === "summary_anchor"
    )
    .map(e => e.data as SummaryAnchor)
    .pop();
}

/**
 * 获取最新的 CompactionEntry（库的压缩留下）
 */
function getLatestCompactionEntry(entries: SessionEntry[]): CompactionEntry | undefined {
  return entries
    .filter((e): e is CompactionEntry => e.type === "compaction")
    .pop();
}

/**
 * 估算消息范围的 token 数
 */
function estimateTokens(messages: AgentMessage[], startIndex: number, endIndex: number): number {
  let count = 0;
  for (let i = startIndex; i < endIndex && i < messages.length; i++) {
    const msg = messages[i];
    count += estimateMessageTokens(msg);
  }
  return count;
}

function estimateMessageTokens(msg: AgentMessage): number {
  // 简单估算：按字符数 / 4
  const str = JSON.stringify(msg);
  return Math.ceil(str.length / 4);
}
```

---

## 潜在问题（事前验尸）

| 问题 | 风险 | 解决方案 |
|------|------|----------|
| **Cache 破坏** | 投影可能破坏 Prompt Cache | boundary 只折叠 headIndex 之前的区域，tailIndex 之后的是 cache 区 |
| **嵌套折叠** | 多层嵌套导致 chain 混乱 | 每次 collapse 用 Summary Anchor 追踪，连续滚动 |
| **投影过期** | 长时间运行的会话投影可能过期 | 添加 `maxProjectionAge` 检查 |
| **Token 估算误差** | 客户端与服务端 token 计数不一致 | 优先使用 `usage.totalTokens`，fallback 到 char/4 估算 |
| **Extension 执行顺序** | 多扩展处理 context 可能冲突 | 链式处理：Micro Compact 先执行，再 Context Collapse |
| **LLM 调用失败** | 生成摘要时 LLM 调用失败 | 降级：返回空投影，触发 AutoCompact |
| **Summary Anchor 丢失** | session 恢复后找不到 anchor | 每次 compact 后都插入 anchor，从 head 向后找 |

---

## 验证计划

1. **编译验证**：`bun run build` + `bunx tsc --noEmit` 无错误
2. **功能验证**：
   - 创建长会话，触发 Context Collapse（75%）
   - 验证 Summary Anchor 正确持久化
   - 验证投影创建正确（摘要替换旧消息）
   - 验证底层 JSONL 不变
3. **边界验证**：
   - 无 prior session 时首次 collapse
   - 连续多次 collapse（滚动）
   - 跨会话恢复后投影状态

---

## 实现顺序

1. `types.ts` - 更新类型定义（添加 SummaryAnchor）
2. `contextCollapse.ts` - Context Collapse 核心逻辑
3. `.pi/extensions/context/index.ts` - 更新钩子实现
4. `autoCompact.ts` - AutoCompact 服务（未来）
5. `query.ts` - 集成层（未来）

---

## 参考

- Claude Code 压缩设计
- `types.d.ts` - Extension 类型
- `session-manager.d.ts` - SessionEntry 类型
- `compaction.d.ts` - Compaction 类型
