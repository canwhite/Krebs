# Thinking 事件支持实现计划

## 背景

当前服务端只处理 `text_delta` 事件，忽略了 `thinking_delta` 事件。导致：
1. 前端无法收到 MiniMax 模型输出的流式 thinking 内容
2. `response_end` 时 `generatedContent` 为空（缺少 thinking 内容）

## PI SDK Thinking 事件结构

```
message_update (thinking_start)
message_update (thinking_delta) → "分析用户需求..."
message_update (thinking_end)
message_update (text_delta) → "根据分析..."
message_end
```

事件类型：
- `thinking_start`: 思考开始
- `thinking_delta`: 思考内容增量
- `thinking_end`: 思考结束，内容在 `content` 字段

## 修改清单

### 1. WebSocket 流式推送 - server.ts

**位置**: 约行 831，`text_delta` 处理之后

```typescript
// 添加 thinking 事件处理
if (event.assistantMessageEvent.type === "thinking_start") {
  logger.log(`[THINKING_START] ContentIndex: ${event.assistantMessageEvent.contentIndex}`);
  ws.send(
    JSON.stringify({
      type: "thinking_start",
      contentIndex: event.assistantMessageEvent.contentIndex
    })
  );
}
if (event.assistantMessageEvent.type === "thinking_delta") {
  ws.send(
    JSON.stringify({
      type: "thinking_delta",
      delta: event.assistantMessageEvent.delta
    })
  );
}
if (event.assistantMessageEvent.type === "thinking_end") {
  logger.log(`[THINKING_END] ContentIndex: ${event.assistantMessageEvent.contentIndex}`);
  ws.send(
    JSON.stringify({
      type: "thinking_end",
      contentIndex: event.assistantMessageEvent.contentIndex,
      content: event.assistantMessageEvent.content
    })
  );
}
```

### 2. 内容提取逻辑 - server.ts

**位置**: 约行 424-427，`getLastAssistantMessageFromFile` 函数

```typescript
// 原始代码
const textParts =
  data.message.content
    ?.filter((c: any) => c.type === "text")
    .map((c: any) => c.text) || [];

// 修改为
const textParts =
  data.message.content
    ?.filter((c: any) => c.type === "text" || c.type === "thinking")
    .map((c: any) => (c.type === "thinking" ? c.thinking : c.text)) || [];
```

### 3. 前端类型定义 - frontend/chat.tsx

**位置**: 约行 50-58，WSMessage 类型

```typescript
// 添加新类型
| { type: "thinking_start"; contentIndex: number }
| { type: "thinking_delta"; delta: string }
| { type: "thinking_end"; contentIndex: number; content: string }
```

### 4. 前端处理逻辑 - frontend/chat.tsx

**位置**: 约行 160-171，`response_start` 处理附近

```typescript
case "thinking_start":
  setIsThinking(true);
  break;

case "thinking_delta":
  // 可选：显示思考内容
  break;

case "thinking_end":
  setIsThinking(false);
  break;
```

## 完整流程

```
服务端                            客户端
  |
  |-- message_start ------------>|
  |-- thinking_start ------------>| 显示"思考中..."
  |-- thinking_delta ------------>| 显示思考内容
  |-- thinking_end -------------->| 
  |-- text_delta ---------------->| 显示生成内容
  |-- message_end ---------------|
  |-- 读取 session 文件 --------->| (包含 text + thinking)
  |-- response_end (generatedContent) ->| 解析 JSON
```

## 验证方法

1. 启动 Krebs 服务端
2. 启动前端应用
3. 生成章节（使用 MiniMax 模型）
4. 观察控制台日志，确认收到 `thinking_delta` 消息
5. 确认 `response_end` 时 `generatedContent` 包含 thinking 内容

## 相关文件

- `server.ts`: 约行 831, 424-427
- `frontend/chat.tsx`: 约行 50-58, 160-171
