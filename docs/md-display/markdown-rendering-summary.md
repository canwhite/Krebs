# Markdown 渲染问题总结

## 问题

Markdown 特殊符号（`**`、`` ` ``、`##` 等）显示为原始文本而非渲染后的格式。

## 根因

**事件顺序导致内容替换被跳过**

服务器发送事件顺序：
```
text_delta (多次) → message_end → response_end → turn_end
```

`response_end` 先于 `turn_end` 到达时：

1. `response_end` 处理：清除 `streamingMessageIdRef.current`
2. `turn_end` 到达时：ref 为 null，条件 `streamingMessageIdRef.current` 不满足
3. 内容替换被跳过
4. 流式累积的增量内容（含原始 markdown 符号）保留显示

## 诊断过程

1. 添加 `[DEBUG-...]` 日志定位到 `turn_end` 跳过
2. 确认 `response_end` 先于 `turn_end` 到达（大多数回合）
3. 验证 `streamingMessageIdRef.current` 在 `turn_end` 时为 null

日志证据：
```
[DEBUG-resp_end] ref cleared, isStreaming set false  ← response_end FIRST
[DEBUG-turn_end] content_len: 211 ref_exists: false isStreaming_msgs: 0  ← turn_end SKIPPED
```

## 修复

**文件**: `frontend/chat.tsx`

**方案**: `turn_end` 不再依赖 `streamingMessageIdRef`，改为直接查找最后一条 `isStreaming=true` 的 assistant 消息进行替换。

```typescript
case "turn_end":
  if (data.content) {
    setMessages((prev) => {
      const idx = prev.findLastIndex(m => m.role === "assistant" && m.isStreaming);
      if (idx !== -1) {
        return prev.map((msg, i) =>
          i === idx ? { ...msg, content: data.content, isStreaming: false } : msg
        );
      }
      return prev;
    });
  }
  break;
```

**优点**：
- 不依赖 ref，不受事件顺序影响
- 直接查找 `isStreaming=true` 的消息，更可靠
- 如果没有流式消息（idx = -1），prev 直接返回，不产生副作用

## 验证

1. `bun run build` — 通过
2. `bunx tsc --noEmit` — 零错误
3. 启动服务器，打开前端，发送消息测试 `**bold**` 等格式渲染
