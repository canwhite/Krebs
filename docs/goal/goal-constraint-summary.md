# Goal Constraint 实现总结

## 解决的问题

当 Agent 与用户进行多轮对话时，对话内容容易偏离用户最初的目标。Goal Constraint 在 `context` 事件上监控对话，在 token 消耗达到特定阈值时提取核心目标，持续检测当前对话是否偏离目标，偏离时自动注入纠正消息让 Agent 回到正轨。

## 核心流程

```
用户消息 → context事件 → ①token阈值检测(25%/40%/55%)
→ ②达到阈值则LLM提取核心目标 → ③漂移检测(B干ax25混合评分)
→ ④低于阈值则注入纠正消息 → ⑤冷却N轮后恢复检测
```

## 核心机制

### 1. Token 阈值触发

分别在 token 消耗达到 25%、40%、55% 时触发目标提取（避开 contextCollapse 的 75% 阈值）。使用 `getContextUsage()` 获取当前 token 使用情况：

```typescript
const percent = (usage.tokens / usage.contextWindow) * 100;
if (percent >= threshold) {
  return threshold; // 触发目标提取
}
```

每个阈值只触发一次，用 `Set<number>` 记录已触发的阈值。

### 2. 目标提取（LLM + Fallback）

优先调用 LLM 从对话历史中提取核心目标和关键指标：

```
输入：对话历史（user messages）
LLM提取 → JSON { goals: ["目标1", "目标2"], metrics: [...] }
每个goal生成 keywords（用于BM25匹配）
```

若 LLM 不可用（无 model、无 API key、调用失败），降级为启发式提取：从用户消息中提取关键词作为目标。

### 3. 漂移检测（BM25 + Keyword Hybrid）

漂移检测在每次 context 事件时执行（冷却期除外），使用混合评分：

```typescript
hybrid = keywordWeight × bm25Score + semanticWeight × keywordMatchRate
// keywordWeight=0.6, semanticWeight=0.4
// 阈值: keyword<0.5 或 hybrid<0.5 则判定为漂移
// keywordMatchRate = 命中的goal关键词数 / goal的关键词总数
// bm25Score : 和 Session History RAG 一样的 BM25 公式，只是这次不是检索 session，而是用消息 tokens 检索 goal keywords：
```

- **BM25 Score**：当前对话文本与目标 keywords 的 BM25 相似度
- **Keyword Match Rate**：当前对话中目标关键词的命中率
- **前 20 条消息**用于漂移检测（最近对话最能反映当前方向）
- **前 3 条消息**为 warmup 期，不做检测

### 4. 纠正注入

检测到漂移后，生成纠正消息并注入到消息列表头部：

```typescript
[GOAL CONSTRAINT] Conversation has drifted from core goals.

CORE GOALS:
- 目标1
- 目标2

KEY METRICS:
- 指标1: 值

Please re-orient toward these objectives.
```

消息带 `[GOAL CONSTRAINT]` 标记，Extension 内部会过滤掉该标记避免循环检测。

### 5. 冷却机制

纠正后进入 3 轮冷却期（`CORRECTION_COOLDOWN_TURNS=3`），冷却期内不执行漂移检测，防止过度干预。冷却在 Extension 层管理，每条消息递减。

## 分层架构

```
.pi/extensions/goal-constraint/index.ts  ← Extension入口，hook定义
    │
    ├── server/services/goal-constraint/engine.ts  ← 核心引擎
    │     ├── checkTokenThresholds()  ← 阈值检测
    │     ├── generateGoalSummary()   ← LLM目标提取
    │     ├── detectDrift()          ← BM25混合评分漂移检测
    │     └── generateCorrectionMessage()
    │
    ├── server/services/goal-constraint/llm.ts     ← LLM调用+解析
    ├── server/services/goal-constraint/semantic.ts ← 评分计算
    ├── server/services/goal-constraint/types.ts   ← 类型定义
    └── server/services/goal-constraint/storage.ts ← 持久化
```

## 注册方式

```typescript
extensionFactories: [
  subagents, tasks,
  memoryExtension,
  contextExtension,
  memoryContextExtension,
  sessionHistoryExtension,   // before_agent_start（先注入历史context）
  goalConstraintExtension,  // context（后检测漂移）
],
```

## 关键阈值

| 参数 | 值 | 说明 |
|------|-----|------|
| 检测阈值 | 25%, 40%, 55% | token消耗百分比 |
| BM25权重 | 0.6 | 混合评分中keyword的权重 |
| 漂移阈值 | 0.5 | 低于此值判定为漂移 |
| 冷却轮数 | 3 | 纠正后跳过的消息数 |
| 检测窗口 | 20条 | 用于漂移检测的最新消息数 |
| Warmup | 3条 | 检测前最少消息数 |

## 与 Session History RAG 的关系

Session History RAG 挂在 `before_agent_start`，在 Agent 思考前注入历史相关内容；Goal Constraint 挂在 `context`，在消息层面检测当前对话是否偏离预设目标。两者独立运作，Session History RAG 解决"之前回答过类似问题"，Goal Constraint 解决"对话正在偏离用户原本的目标"。
