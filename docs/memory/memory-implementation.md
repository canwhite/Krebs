# Memory 实现总结

> 更新时间：2026-06-29

## 概述

Memory 模块实现了两阶段机制：
1. **写入阶段**：50% token 触发时，将对话摘要写入 `MEMORY.md`
2. **读取阶段**：Session 开始时，将 `MEMORY.md` 内容注入 agent context

## 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    Memory Architecture                        │
└─────────────────────────────────────────────────────────────┘

写入阶段（50% 触发）:
┌──────────────┐     ┌─────────────────┐     ┌─────────────┐
│ context hook │ ──► │ LLM 摘要生成     │ ──► │ MEMORY.md  │
│ (50% 阈值)   │     │ (engine.ts)     │     │ (追加写入)  │
└──────────────┘     └─────────────────┘     └─────────────┘

读取阶段（Session 开始）:
┌──────────────┐     ┌─────────────────┐     ┌─────────────┐
│ before_      │ ──► │ 读取 MEMORY.md   │ ──► │ systemPrompt│
│ agent_start   │     │ (storage.ts)    │     │ 注入        │
└──────────────┘     └─────────────────┘     └─────────────┘
```

---

## 文件结构

```
server/services/memory/
├── index.ts         # 导出
├── types.ts        # 类型定义 + 常量
├── storage.ts      # MEMORY.md 读写
├── engine.ts       # 摘要生成逻辑
└── llm.ts          # LLM 调用

.pi/extensions/
├── memory/              # Memory Consolidation extension
│   └── index.ts
└── memory-context/      # Memory Context Injection extension
    └── index.ts
```

---

## 写入阶段：Memory Consolidation

### 触发条件

- **阈值**：`usage.percent >= 0.5 && < 0.70`
- **时机**：每次 LLM 调用前（`context` hook）
- **检查**：session entries 中记录的上次 `messageCountAtConsolidation`

### 核心流程

```
context hook 触发 (50%)
    │
    ├─► 读取 session entries 获取上次 ConsolidationState
    │
    ├─► 计算新增消息范围: messages[messageCountAtConsolidation:]
    │
    ├─► 调用 LLM 生成摘要 (llm.ts)
    │
    ├─► 检查摘要是否有用 (isUseful: length >= 50 chars && !== "SKIP")
    │       │
    │       ├─► 有用: 写入 MEMORY.md (storage.ts)
    │       └─► 无用: 仅推进指针
    │
    └─► 记录 ConsolidationState (api.appendEntry)
```

### 关键文件

| 文件 | 职责 |
|------|------|
| `memory/index.ts` | context hook 入口，50% 阈值检查 |
| `engine.ts` | 核心逻辑：计算增量、调用 LLM、持久化 |
| `llm.ts` | LLM 摘要生成（`completeSimple`） |
| `storage.ts` | MEMORY.md 读写 |
| `types.ts` | 常量定义 |

### 状态管理

ConsolidationState 记录在 session entries 中：
```typescript
interface ConsolidationState {
  messageCountAtConsolidation: number;  // 指针
  summaryText: string;
  tokensAtConsolidation: number;
  createdAt: number;
}
```

**防重机制**：通过 messageCount 计数器判断是否有新消息。

### Rollback 机制

通过 invalidation entry 实现：
```typescript
// 追加 invalidation entry
api.appendEntry("consolidation_invalidation", {
  invalidatedEntryId: lastEntry.id,
  invalidatedAt: Date.now(),
  reason: "user_requested"
});
```

---

## 读取阶段：Memory Context Injection

### 触发条件

- **时机**：每次 agent loop 开始前（`before_agent_start` hook）
- **注入方式**：`systemPrompt`

### 核心流程

```
before_agent_start 触发
    │
    ├─► 读取 MEMORY.md (readMemorySync)
    │
    ├─► 检查是否有内容
    │       │
    │       ├─► 无内容: 返回 {}
    │       └─► 有内容: 返回 { systemPrompt: header + content }
    │
    └─► Agent 使用修改后的 systemPrompt
```

### 关键设计

**防止被重置**：由于 pi-agent 的 `before_agent_start` 机制，每次 agent loop 开始时：
- 如果不返回 `systemPrompt`，会被重置回 base
- 因此**每次都返回** memory systemPrompt（只要存在）

### 关键文件

| 文件 | 职责 |
|------|------|
| `memory-context/index.ts` | before_agent_start hook，读取并注入 |

---

## 阈值配置

```typescript
export const LAYER_THRESHOLDS = {
  budget_reduction: 0.50,  // Memory Consolidation
  snip: 0.60,
  micro_compact: 0.70,    // Micro Compact
  context_collapse: 0.75, // Context Collapse
  auto_compact: 0.835,    // Auto Compact
} as const;
```

---

## 与其他压缩层的关系

| 层 | 阈值 | 功能 | 与 Memory 的关系 |
|---|------|------|-----------------|
| Memory | 50% | 摘要 → MEMORY.md | 最先触发，写入外部存储 |
| Micro Compact | 70% | 截断 tool results | 仅修改 messages，不写外部 |
| Context Collapse | 75% | 生成投影摘要 | 仅修改 messages，不写外部 |
| Auto Compact | 83.5% | 激进压缩 | 最后防线 |

**设计意图**：Memory consolidation 最早触发，将关键信息沉淀到外部文件，为后续压缩层提供上下文参考。

---

## MEMORY.md 格式

```markdown
# Memory

## Session: {sessionId} | {timestamp}

**Token Range:** {startTokens} → {endTokens}
**Message Count:** {count} messages consolidated

### Summary
{summary from LLM — concise bullet points}

---
```

---

## 已知问题

### discoverAndLoadExtensions 未实现

pi-coding-agent 文档声称支持 `.pi/extensions/` 自动发现，但 `resource-loader.js` 从未调用 `discoverAndLoadExtensions()`。

**当前解决方案**：通过 `extensionFactories` 显式注册。

详见：`docs/pi/extension-loading-mechanism.md`

---

## Verification Steps

1. 启动 session，发送足够多消息达到 50% token
2. 检查 `MEMORY.md` 是否生成并包含摘要
3. 创建/编辑 `MEMORY.md` 填充测试内容
4. 新开 session 或 fork
5. 验证 agent 能"记住" MEMORY.md 中的内容
6. 多轮对话后验证 memory 内容仍然存在
