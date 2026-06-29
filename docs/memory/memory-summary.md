# Memory 实现总结

> 更新时间：2026-06-29

## 概述

Memory 模块实现了两阶段记忆机制：**写入阶段**在 50% token 使用率时将对话摘要持久化到 `MEMORY.md`，**读取阶段**在 Session 开始时将 `MEMORY.md` 内容注入 agent context。目的是让 agent 跨越会话记住重要信息。

---

## 架构图

```
写入阶段（50% 触发）:
┌──────────────┐     ┌─────────────────┐     ┌─────────────┐
│ context hook │ ──► │ LLM 摘要生成     │ ──► │ MEMORY.md  │
│ (50% 阈值)   │     │ (engine.ts)    │     │ (追加写入)  │
└──────────────┘     └─────────────────┘     └─────────────┘

读取阶段（Session 开始）:
┌──────────────┐     ┌─────────────────┐     ┌─────────────┐
│ before_      │ ──► │ 读取 MEMORY.md   │ ──► │ systemPrompt│
│ agent_start  │     │ (storage.ts)   │     │ 注入        │
└──────────────┘     └─────────────────┘     └─────────────┘
```

---

## 写入阶段：Memory Consolidation

### 触发条件

- **阈值**：token 使用率 `>= 50% && < 70%`
- **时机**：每次 LLM 调用前（`context` hook）
- **防重**：通过 session entries 中的 `messageCountAtConsolidation` 判断是否有新消息

### 核心流程

1. 读取 session entries 获取上次的 `ConsolidationState`
2. 计算新增消息范围：`messages[messageCountAtConsolidation:]`
3. 调用 LLM 生成摘要（`llm.ts`）
4. 检查摘要是否有用（长度 >= 50 字符且非 "SKIP"）
5. 有用则写入 `MEMORY.md`，无用则仅推进指针
6. 记录新的 `ConsolidationState` 到 session entries

### LLM 摘要生成

使用 `completeSimple` 调用同模型生成摘要。系统提示词要求简洁，200 字符以内，提取关键决策、开放问题和必要上下文。如果对话无价值则返回 "SKIP"。

### MEMORY.md 格式

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

## 读取阶段：Memory Context Injection

### 触发条件

- **时机**：每次 agent loop 开始前（`before_agent_start` hook）
- **注入方式**：返回 `systemPrompt` 字段

### 核心流程

1. `before_agent_start` hook 触发
2. 同步读取 `MEMORY.md`（`readMemorySync`）
3. 检查是否有内容
4. 有内容则返回 `{ systemPrompt: header + content }`
5. agent 使用修改后的 systemPrompt

### 防重置机制

pi-agent 的 `before_agent_start` 机制：每次 agent loop 开始时，如果不返回 `systemPrompt`，会被重置回 base。因此**每次都返回** memory systemPrompt（只要存在）。

---

## Rollback 机制

Sessions 可以通过 `consolidation_invalidation` entry 撤销之前的 consolidation：

```typescript
api.appendEntry("consolidation_invalidation", {
  invalidatedEntryId: lastEntry.id,
  invalidatedAt: Date.now(),
  reason: "user_requested"
});
```

---

## 文件结构

```
server/services/memory/
├── index.ts       # 导出
├── types.ts      # 类型定义 + 常量
├── storage.ts    # MEMORY.md 读写
├── engine.ts     # 核心逻辑
└── llm.ts       # LLM 摘要生成

.pi/extensions/
├── memory/              # Memory Consolidation extension
└── memory-context/       # Memory Context Injection extension
```

---

## 阈值配置

| 层 | 阈值 | 功能 |
|:---|:-----|:-----|
| Memory | 50% | 摘要 → MEMORY.md |
| Micro Compact | 70% | 截断 tool results |
| Context Collapse | 75% | 生成投影摘要 |
| Auto Compact | 83.5% | 激进压缩 |

Memory consolidation 最早触发，将关键信息沉淀到外部文件，为后续压缩层提供上下文参考。
