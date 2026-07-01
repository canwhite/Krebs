# Bug: `extractFromTurnEvent` 将 think 内容也提取出来

## 影响范围

`lib/session-transcript.ts`

## 根因

流式渲染时，think 内容通过 `think_block` 事件单独创建为 `thinking` role 的消息（显示为 collapsible "💭 思考过程"）。

但 `turn_end` 时：

```typescript
// lib/session-transcript.ts:extractFromTurnEvent
const textParts =
  message?.content
    ?.filter((c: any) => c.type === "text" || c.type === "thinking")
    .map((c: any) => (c.type === "thinking" ? c.thinking : c.text)) || [];
```

提取了 `text` 和 `thinking` 两种类型，拼成完整内容发给前端。前端用 `turn_end.content` 替换 assistant 消息的 content → **think 内容又出现在主消息里**，导致每个 turn 结束后 think 部分被重新渲染一遍。

## 修复

只提取 `text` 类型，不过滤 `thinking`：

```typescript
const textParts =
  message?.content
    ?.filter((c: any) => c.type === "text")  // 不再包含 thinking
    .map((c: any) => c.text) || [];
```

Think 内容全程只在流式期间通过 `think_block` → `thinking` role 消息路径出现，不再窜入 turn_end content。

## 验证

| 路径 | think 处理 | 结论 |
|------|-----------|------|
| 流式期间 | `think_block` → 独立 thinking 消息 | ✅ |
| turn_end 替换 | 只含 text，不含 thinking | ✅ |
| response_end | 仅设 `isStreaming=false`，不替换 content | ✅ |

- Build ✅
- TypeScript ✅（零错误）
