# 上下文拼接位置分析报告

## Context

在感知-决策-行动-反馈的 event loop 过程中，决策前有个压缩评价上下文的过程。这个过程发生在 pi-coding-agent 库中。

---

## 核心发现

### 1. 压缩触发检查位置

**文件**: `node_modules/.pnpm/@mariozechner+pi-coding-agent@0.66.1_ws@8.20.0_zod@4.4.3/node_modules/@mariozechner/pi-coding-agent/dist/core/agent-session.js`

**关键方法**: `_checkCompaction()` (第 1364-1433 行)

触发时机:
- **Case 1: Overflow** - LLM 返回上下文溢出错误时触发 (第 1385-1406 行)
- **Case 2: Threshold** - 上下文 token 超过阈值时触发 (第 1408-1433 行)

### 2. 压缩执行逻辑

**文件**: `node_modules/.pnpm/@mariozechner+pi-coding-agent@0.66.1_ws@8.20.0_zod@4.4.3/node_modules/@mariozechner/pi-coding-agent/dist/core/compaction/compaction.js`

**关键函数**:
- `prepareCompaction()` (第 469-532 行) - 准备压缩，确定要摘要的消息范围
- `generateSummary()` (第 432-468 行) - 调用 LLM 生成上下文摘要

### 3. 摘要 Prompt 模板

**SUMMARIZATION_PROMPT** (第 358-389 行) - 初始摘要格式:
```
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

**UPDATE_SUMMARIZATION_PROMPT** (第 390-427 行) - 更新已有摘要格式

### 4. Krebs 项目配置

**文件**: `/Users/Admin/Desktop/Krebs/CLAUDE.md`

Krebs 项目定义了压缩优先级:
```
1. Architecture decisions (NEVER summarize)
2. Modified files and their key changes
3. Current verification status (pass/fail)
4. Open TODOs and rollback notes
5. Tool outputs (can delete, keep pass/fail only)
```

---

## Event Loop 流程与压缩时机

```
agent_start
  → turn_start
    → message_start (用户输入/感知)
    → [_checkCompaction() 检查是否需要压缩]
    → [LLM 决策过程: streamAssistantResponse]
    → message_end
    → executeToolCalls (行动)
    → tool_execution_end
    → turn_end
  → agent_end
```

压缩发生在 **决策前** (`_checkCompaction`)，在下一次 `prompt` 提交之前。

---

## 关键文件汇总

| 功能 | 文件路径 |
|------|----------|
| 压缩触发检查 | `.../pi-coding-agent/dist/core/agent-session.js` (1364-1433) |
| 压缩执行逻辑 | `.../pi-coding-agent/dist/core/compaction/compaction.js` |
| 摘要生成 | `.../pi-coding-agent/dist/core/compaction/compaction.js` (432-468) |
| 摘要 Prompt | `.../pi-coding-agent/dist/core/compaction/compaction.js` (358-427) |
| 压缩工具函数 | `.../pi-coding-agent/dist/core/compaction/utils.js` |
| Event Loop 核心 | `.../pi-agent-core/dist/agent-loop.js` |
| Krebs 集成层 | `/Users/Admin/Desktop/Krebs/server/session-service.ts` |
| 压缩优先级配置 | `/Users/Admin/Desktop/Krebs/CLAUDE.md` |
