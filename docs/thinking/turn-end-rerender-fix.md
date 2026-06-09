# Turn End Rerender Fix：用 Session 完整内容修复 Markdown 渲染

## 问题

AI 消息的 markdown 内容在 StreamingMarkdown 中渲染不正常（列表混乱、粗体/斜体异常、标题层级不清晰）。根本原因是内容通过 `text_delta` 流式片段拼接而成，StreamingMarkdown 在每次更新时重新解析完整字符串——但片段拼接的内容与 session 文件中存储的**完整正确内容**之间存在差异。

与此同时，服务器在 `agent_end` 时已经从 session 文件读取了完整内容并通过 `response_end` 发送到前端，但**前端完全忽略了这个内容**——只用来设置 `isStreaming = false`，没有更新消息的 `content` 字段。

## 解决思路

```
之前：
  text_delta → append → msg.content（片段拼接）→ StreamingMarkdown（渲染异常）
  agent_end → response_end { generatedContent } → 前端忽略（仅设 isStreaming=false）

之后：
  text_delta → append → msg.content（片段拼接）→ StreamingMarkdown（流式期间保持原样）
  turn_end → 前端收到完整内容 → 替换 msg.content → StreamingMarkdown（正确渲染）
```

## 改动

### 1. 服务器：新增 `extractCompleteContent` 工具函数

```ts
// server.ts:817
function extractCompleteContent(message: any): string {
  const textParts =
    message?.content
      ?.filter((c: any) => c.type === "text" || c.type === "thinking")
      .map((c: any) => (c.type === "thinking" ? c.thinking : c.text)) || [];
  return textParts.join("");
}
```

逻辑同现有 `getLastAssistantMessageFromFile`，但从内存中的 event.message 直接提取，无需文件 I/O。

### 2. 服务器：修改 `turn_end` 事件处理

两处（`setupEventSubscriptionForSwitch` 和 WebSocket `open` handler）原来 `turn_end` 只是日志记录，改为提取完整内容并发送给前端：

```ts
if (event.type === "turn_end") {
  const completeContent = extractCompleteContent((event as any).message);
  ws.send(JSON.stringify({
    type: "turn_end",
    content: completeContent,
  }));
}
```

选择 `turn_end` 而非 `message_end` 的原因：
- `message_end`：文本流式结束但工具尚未执行，消息不完整
- `turn_end`：整个轮次完成（含工具执行和后续消息），内容最完整

### 3. 前端：新增 `turn_end` WSMessage 类型

```ts
| { type: "turn_end"; content: string }
```

### 4. 前端：新增 `turn_end` 消息处理器

```ts
case "turn_end":
  if (data.content && streamingMessageIdRef.current) {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === streamingMessageIdRef.current
          ? { ...msg, content: data.content, isStreaming: false }
          : msg,
      ),
    );
  }
  break;
```

通过 `streamingMessageIdRef.current` 找到当前流式中的 assistant 消息，用 session 的完整内容替换其 `content`，触发 StreamingMarkdown 重新渲染。

## 关键设计点

| 决策 | 选择 | 理由 |
|------|------|------|
| 触发时机 | `turn_end` | 轮次完成时内容最完整，避免工具执行尚未结束 |
| 内容来源 | event.message（内存） | 无需读盘，与 session 文件内容一致 |
| 流式期间 | 保持现有渲染 | 不改流式行为，只改最终渲染 |
| 消息定位 | `streamingMessageIdRef.current` | 精确指向当前流式消息，避免误改 |

## 变更文件

- `server.ts`：新增 `extractCompleteContent` 函数 + 两处 `turn_end` 处理改写
- `frontend/chat.tsx`：新增 `turn_end` 类型 + 消息处理器
