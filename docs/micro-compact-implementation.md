# Micro Compact 实现文档

## 概述

**触发时机**：每次 `context` hook（发消息给 LLM 之前）

**机制**：轻量级 truncate，不调 LLM，完整内容持久化到 transcript。

## 算法流程

```
1. 扫描 messages 中所有 role === "toolResult" 的消息
2. 跳过已包含 [MicroCompact] 占位符的消息（防重复）
3. 按 age 升序排序（age 越小越新）
4. slice(keepRecent) 取最老的 keepRecent 个
5. 超过 truncateThreshold 的替换为占位符
6. 完整内容通过 ctx.appendEntry("micro_compact", ...) 持久化
```

## 关键实现

### findToolResultsToPrune

```typescript
function findToolResultsToPrune(messages: AgentMessage[]): PruneTarget[] {
  const toolResults: PruneTarget[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;

    // ToolResultMessage 是独立的 role === "toolResult"
    if (msg.role === "toolResult") {
      const toolMsg = msg as ToolResultMessage;

      // 跳过已处理的
      if (isAlreadyTruncated(toolMsg.content)) {
        continue;
      }

      toolResults.push({
        messageIndex: i,
        toolMessage: toolMsg,
        age: messages.length - i,  // age 越大越老
        contentLength: extractTextContent(toolMsg.content).length,
      });
    }
  }

  // 按 age 升序排序（ newest first）
  // slice(keepRecent) 取前 keepRecent 个（最新的）
  // 所以剩余的是最老的
  toolResults.sort((a, b) => a.age - b.age);
  return toolResults.slice(cfg.keepRecent);
}
```

### truncateToolResults

```typescript
function truncateToolResults(
  messages: AgentMessage[],
  toPrune: PruneTarget[]
): AgentMessage[] {
  if (toPrune.length === 0) return messages;

  // 构建 placeholder map
  const truncateMap = new Map<number, string>();
  for (const target of toPrune) {
    if (target.contentLength <= cfg.truncateThreshold) continue;

    const placeholder = `${MICRO_COMPACT_PREFIX} Previous ${target.toolMessage.toolName} result (cleared to save tokens, original length: ${target.contentLength})`;
    truncateMap.set(target.messageIndex, placeholder);
  }

  if (truncateMap.size === 0) return messages;

  // Immutable 更新
  return messages.map((msg, i) => {
    const placeholder = truncateMap.get(i);
    if (placeholder === undefined) return msg;

    return {
      ...msg,
      content: [{ type: "text", text: placeholder }],
    } as ToolResultMessage;
  });
}
```

## 配置

```typescript
interface MicroCompactConfig {
  keepRecent: number;           // 保留最近 N 个 tool result（默认 8）
  maxAge: number;               // 超过多少轮视为"旧"（默认 15，未使用）
  truncateThreshold: number;     // 内容长度阈值，超过才 truncate（默认 300）
  enabled: boolean;
}
```

## 占位符格式

```
[MicroCompact] Previous ${toolName} result (cleared to save tokens, original length: ${originalLength})
```

## 示例

| 消息内容 | 长度 | 结果 |
|----------|------|------|
| `{ "files": [...] }` | 2847 chars | 🔴 替换为占位符 |
| `✅ done` | 7 chars | ✅ 保持不变（小于阈值） |

## 文件位置

```
server/services/compact/microCompact.ts
```

## 验证

```bash
bun run build        # 构建成功
bunx tsc --noEmit   # TypeScript 检查通过
```
