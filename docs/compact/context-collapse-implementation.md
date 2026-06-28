# Context Collapse 实现文档

## 概述

**触发时机**：token 用量达到 75% 时

**机制**：读时投影。在内存中创建折叠视图，底层 JSONL 不变。

## 算法流程

```
75% tokens →
  1. 计算 boundary（headIndex, tailIndex）
  2. 生成摘要（调 LLM）
  3. 创建投影：摘要消息替换 [headIndex, tailIndex)
  4. context hook 返回投影
  5. 持久化 SummaryAnchor
```

---

## Boundary 详解（核心）

### 定义

```
消息数组: [msg_0, msg_1, ..., msg_{n-1}]

boundary:
  headIndex: 压缩起始位置（包含）
  tailIndex: 压缩结束位置（不包含）

压缩范围: [headIndex, tailIndex)  → 被替换为摘要
保留范围: [tailIndex, n)           → 保持全量
```

### 计算规则

```
1. headIndex 确定：
   - 有 latestAnchor → latestAnchor.tailIndex
   - 无 latestAnchor → 0

2. tailIndex 确定：
   - 从后往前累加 token，直到达到 keepRecentTokens
   - tailIndex = 累加停止时的位置

3. 有效性检查：
   - tailIndex <= headIndex → 无内容可压缩，返回 null
```

### 示意图

```
假设 messages.length = 20, keepRecentTokens = 50

从后往前累加:
  msg_19 → 30 tokens, 累加 30
  msg_18 → 15 tokens, 累加 45
  msg_17 → 10 tokens, 累加 55 > 50, 停止

tailIndex = 17

boundary = { headIndex: 0, tailIndex: 17 }

结果:
  [0, 17)    → 压缩范围 (17 条消息)
  [17, 20)   → 保留范围 (3 条消息，最新)
```

### 滚动压缩

当存在 latestAnchor 时，每次压缩连续滚动：

```
第一轮压缩后:
  boundary1 = { headIndex: 0, tailIndex: 17 }
  anchor1 = { headIndex: 0, tailIndex: 17 }

第二轮压缩时:
  latestAnchor = anchor1
  headIndex = anchor1.tailIndex = 17

  从后往前累加 (从 msg_19 开始):
  ...

  boundary2 = { headIndex: 17, tailIndex: xxx }
```

---

## 关键实现

### calculateBoundary

```typescript
function calculateBoundary(
  messages: AgentMessage[],
  latestAnchor?: SummaryAnchor
): CompactBoundary | null {
  // 1. 确定 headIndex
  const headIndex = latestAnchor?.tailIndex ?? 0;

  // 2. 计算 tailIndex（从后往前）
  let tokenCount = 0;
  let tailIndex = messages.length;

  for (let i = messages.length - 1; i >= headIndex && tokenCount < cfg.keepRecentTokens; i--) {
    const msg = messages[i];
    if (!msg) continue;
    tokenCount += estimateMessageTokens(msg);
    tailIndex = i;
  }

  // 3. 有效性检查
  if (tailIndex <= headIndex) {
    return null; // 没有内容可压缩
  }

  return { headIndex, tailIndex };
}
```

### createProjection

```typescript
function createProjection(
  messages: AgentMessage[],
  boundary: CompactBoundary,
  summary: string
): AgentMessage[] {
  const { headIndex, tailIndex } = boundary;

  // 摘要消息
  const summaryMessage: AgentMessage = {
    role: "user",
    content: `【Context Collapse 摘要】\n${summary}`,
    timestamp: Date.now(),
  } as AgentMessage;

  // 构建新数组
  return [
    ...messages.slice(0, headIndex),    // [0, headIndex) 保持原样
    summaryMessage,                       // 替换为摘要
    ...messages.slice(tailIndex),       // [tailIndex, end) 保持原样
  ];
}
```

### generateSummary（stub）

```typescript
async function generateSummary(
  messages: AgentMessage[],
  headIndex: number,
  tailIndex: number
): Promise<string> {
  const rangeMessages = messages.slice(headIndex, tailIndex);

  const prompt = `请为以下对话历史生成简洁摘要：

${rangeMessages.map((m, i) => `[${i + headIndex}] ${m.role}: ${formatContent(m.content)}`).join('\n')}

摘要要求：
- 保留关键决策和进展
- 简洁明了，便于后续上下文理解
- 100-200 字以内`;

  // TODO: 接入实际 LLM API
  return `[摘要 - ${rangeMessages.length} 条消息被压缩]`;
}
```

---

## 配置

```typescript
interface ContextCollapseConfig {
  keepRecentTokens: number;      // 保留最近的 token 数（默认 8000）
  keepRecentRounds: number;       // 保留最近 N 轮（默认 10，未使用）
  minCompressionTokens: number;    // 最小压缩阈值（默认 5000）
  triggerThreshold: number;        // 触发阈值（默认 0.75）
  enabled: boolean;
}
```

---

## Summary Anchor

每次压缩后记录状态，供下次压缩使用：

```typescript
interface SummaryAnchor {
  headIndex: number;    // 压缩范围起始（包含）
  tailIndex: number;    // 压缩范围结束（不包含）
  summary: string;        // 摘要内容
  tokensBefore: number;  // 压缩前的 token 数
  createdAt: number;     // 时间戳
  layer: "context_collapse";
}
```

通过 `ctx.appendEntry("summary_anchor", anchorData)` 持久化到 session。

---

## Token 估算

```typescript
function estimateMessageTokens(msg: AgentMessage): number {
  const str = JSON.stringify(msg);
  return Math.ceil(str.length / 4);
}
```

---

## 文件位置

```
server/services/compact/contextCollapse.ts
```

---

## 待完成

- [ ] `generateSummary()` 接入实际 LLM API
- [ ] 单元测试覆盖

## 验证

```bash
bun run build        # 构建成功
bunx tsc --noEmit   # TypeScript 检查通过
```
