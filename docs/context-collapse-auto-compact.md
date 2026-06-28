# Context Collapse & AutoCompact 设计文档

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
│  你的 Context Collapse 层      │  ← 读时投影，非破坏性，70-80%触发
│  你的 AutoCompact 层          │  ← 更激进的压缩，83.5%触发
└────────────────────────────────┘
```

**Context Collapse** 和 **AutoCompact** 是**包装**库的压缩，通过扩展钩子在它之前/之后做分级处理，而不是替换它。

---

## Context

当前 Krebs 项目使用 `pi-coding-agent` 库的自带单一压缩层（触发时直接生成摘要替换历史）。用户需要更精细的多层分级压缩机制，在不同阈值下渐进式触发，以延长会话可用性、减少重压缩频率。

## 目标

1. **Context Collapse**（非破坏性读时投影）- 70-80% 触发
2. **AutoCompact**（最后手段重压缩）- ~83.5% 触发

## 现有系统分析

- **CompactionEntry** (`session-manager.d.ts:36-45`) 有 `details?: T` 可扩展字段
- **context 扩展钩子** (`.pi/extensions/context/index.ts`) 可返回 `ContextEventResult { messages?: AgentMessage[] }` 修改消息
- **session_before_compact 钩子** 可返回 `SessionBeforeCompactResult { compaction?: CompactionResult }` 自定义压缩
- `ctx.getContextUsage()` 返回 `{ tokens, contextWindow, percent }`

## 架构设计

```
server/
├── services/compact/
│   ├── types.ts              # compact_boundary, ContextCollapseLayer
│   ├── contextCollapse.ts    # 读时投影核心逻辑
│   └── autoCompact.ts        # AutoCompact 服务
└── query.ts                  # 集成层（与 pi-coding-agent 对接）

.pi/extensions/context/index.ts  # 扩展钩子实现
```

## 详细设计

### 1. types.ts - 共享类型

```typescript
// ContextCollapseLayer 枚举（各层独立触发）
type ContextCollapseLayer =
  | "budget_reduction"   // ~50%
  | "snip"              // ~60%
  | "micro_compact"     // ~70%
  | "context_collapse"  // ~75%
  | "auto_compact";     // ~83.5%

// compact_boundary 存储在 CompactionEntry.details
interface CompactBoundary {
  headUuid: string;      // 折叠区域起始 Entry ID
  anchorUuid: string;    // 参考点（最近消息边界）
  tailUuid: string;      // 折叠区域结束 Entry ID
  layer: ContextCollapseLayer;
}

// 阈值配置
const LAYER_THRESHOLDS: Record<ContextCollapseLayer, number> = {
  budget_reduction: 0.50,
  snip: 0.60,
  micro_compact: 0.70,
  context_collapse: 0.75,
  auto_compact: 0.835,
};
```

### 2. contextCollapse.ts - 读时投影

```typescript
export function createContextCollapser(options?: Partial<CollapseOptions>) {
  // 返回对象包含:
  // - shouldCollapse(tokens, contextWindow): ContextCollapseLayer | null
  // - createProjection(messages, boundary): AgentMessage[]  // 不修改底层
  // - updateState(utilization, boundary): void
}
```

**关键实现逻辑：**
1. `shouldCollapse` 根据上下文利用率返回应触发层级（或 null）
2. `createProjection` 在内存中创建折叠视图：
   - 找到 headUuid → tailUuid 范围
   - 用摘要消息替换该范围
   - 返回新消息数组（底层 JSONL 不变）

### 3. autoCompact.ts - AutoCompact 服务

```typescript
// 环境变量 CLAUDE_AUTOCOMPACT_PCT_OVERRIDE
const AUTOCOMPACT_PCT = parseFloat(
  process.env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE || "0.835"
);

// export function createAutoCompactService()
// - markForAggressiveCompaction(tokens, contextWindow)
// - shouldUseAggressiveSettings(): boolean
// - getAggressiveSettings(): CompactionSettings  // 更大 reserveTokens
```

### 4. query.ts - 集成层（新建）

```typescript
// server/query.ts
// - createQueryContext(session): 初始化 context manager
// - getContextUsage(session): 获取当前 token 使用情况
// - getActiveLayer(utilization): 返回当前应触发层级
```

### 5. 扩展钩子实现 - .pi/extensions/context/index.ts

```typescript
api.on("context", async (event, ctx) => {
  const usage = ctx.getContextUsage();
  if (!usage?.tokens) return {};

  const layer = collapser.shouldCollapse(usage.tokens, usage.contextWindow);
  if (!layer) return {};

  // 从最新 CompactionEntry 获取 boundary
  const entries = ctx.sessionManager.getEntries();
  const latestCompaction = getLatestCompactionEntry(entries);
  if (!latestCompaction?.details) return {};

  const boundary = latestCompaction.details as CompactBoundary;
  const projected = collapser.createProjection(event.messages, boundary);

  return { messages: projected };
});

api.on("session_before_compact", async (event, ctx) => {
  if (autoCompact.shouldUseAggressiveSettings()) {
    return {
      compaction: {
        summary: `...[summarized]...`,
        firstKeptEntryId: event.preparation.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
        details: { layer: "auto_compact" },
      },
    };
  }
  return {};
});
```

## 关键文件修改

| 文件 | 操作 |
|------|------|
| `server/services/compact/types.ts` | **新建** - 共享类型定义 |
| `server/services/compact/contextCollapse.ts` | **新建** - 读时投影核心逻辑 |
| `server/services/compact/autoCompact.ts` | **新建** - AutoCompact 服务 |
| `server/query.ts` | **新建** - 集成层 |
| `.pi/extensions/context/index.ts` | **修改** - 实现 context + session_before_compact 钩子 |

## 潜在问题（事前验尸）

| 问题 | 风险 | 解决方案 |
|------|------|----------|
| **Cache 破坏** | 投影可能破坏 Prompt Cache | boundary 包含 anchorUuid，投影仅折叠 anchorUuid 之前的区域，不碰缓存区 |
| **嵌套折叠** | 多层嵌套导致 chain 混乱 | 每层创建新 CompactionEntry，通过 firstKeptEntryId 维护连续性 |
| **投影过期** | 长时间运行的会话投影可能过期 | 添加 `maxProjectionAge` 检查，过期则重新投影或触发完整压缩 |
| **Token 估算误差** | 客户端与服务端 token 计数不一致 | 优先使用 LLM 返回的 `usage.totalTokens`，fallback 到 char/4 估算 |
| **Extension 执行顺序** | 多扩展处理 context 可能冲突 | 链式处理：每个 handler 接收前一 handler 输出 |
| **Reserve buffer 变化** | 13k-20k+ token 范围不确定 | 通过 `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` 设置百分比，自动计算 buffer |

## 验证计划

1. **编译验证**：`bun run build` + `bunx tsc --noEmit` 无错误
2. **功能验证**：
   - 创建长会话，触发各层阈值
   - 验证 compact_boundary 正确写入 CompactionEntry.details
   - 验证 Context Collapse 读时投影不影响底层 JSONL
   - 验证 AutoCompact 在 83.5% 触发并使用更大 reserve
3. **边界验证**：
   - 嵌套折叠场景
   - 跨会话恢复后投影状态恢复
   - CLAUDE_AUTOCOMPACT_PCT_OVERRIDE 环境变量生效

## 实现顺序

1. `types.ts` - 类型定义（基础）
2. `contextCollapse.ts` - 核心投影逻辑
3. `autoCompact.ts` - AutoCompact 服务
4. `query.ts` - 集成层
5. 扩展钩子实现 - 最后集成到 `.pi/extensions/context/index.ts`
