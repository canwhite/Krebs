# isStreaming 概念解释

## 两种不同的"流式"概念

### 1. PI SDK 内部的 isStreaming（状态标记）

`isStreaming` 是 PI Agent SDK 提供的状态标记，表示 **AI Agent 是否正在流式输出响应**。

```typescript
session.isStreaming  // AI 是否正在"思考/工作"
```

这是 **PI Agent 框架内部的概念**，表示 AI 正在工作（生成内容、调用工具等），与网络传输方式无关。

#### isStreaming 的状态流转

```
用户提问 → isStreaming = true
         ↓
    [AI 生成内容...]
         ↓
    [可能调用工具...]
         ↓
message_end 事件触发 → isStreaming = false
```

### 2. HTTP 的流式响应（网络传输层面）

这是 **网络传输层面的概念**，即服务器是否一边生成一边返回数据。

```
传统方式：等 AI 全部说完 → 一次性返回 JSON
流式方式：AI 每说一个字 → 立即推送给浏览器（SSE/Chunked）
```

## 当前 HTTP Gateway 的实现

### 架构关系

```
┌─────────────────────────────────────────────────────────┐
│  PI SDK 内部（流式）                                      │
│  用户提问 → [流式生成中...] → 完成 → isStreaming = false │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  HTTP Handler（非流式）                                   │
│  等待 isStreaming = false → 读取结果 → 一次性返回 JSON    │
└─────────────────────────────────────────────────────────┘
```

### 当前实现流程

```typescript
// 1. 接收请求
const { message, sessionId } = await req.json();

// 2. 调用 PI SDK
await session.prompt(message);

// 3. 等待 AI 完成
await waitForSessionComplete(session, logger);

// 4. 一次性返回结果
return Response.json({
  sessionId: usedSessionId,
  response: fullTextResponse,
  generatedContent: generatedContent,
});
```

## 为什么 HTTP Handler 需要检查 isStreaming？

虽然你**不是流式返回**给客户端，但 PI SDK 内部是**流式生成**的。你需要知道：

> **"AI 什么时候说完了？我才能返回响应"**

### 需要考虑的问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| **何时知道 AI 说完了？** | 流式输出没有明确的"结束信号" | 监听 `message_end` 事件 |
| **事件可能丢失** | 网络问题或 SDK bug 导致 `message_end` 没触发 | 轮询检查 `isStreaming` 作为备用 |
| **防止超时** | AI 思考或执行工具可能耗时很长 | 设置超时，但检查状态避免误判 |

### 双重保障机制

```typescript
// 方案 1: 监听 message_end 事件（主要方式）
session.subscribe((event) => {
  if (event.type === "message_end") {
    resolve();  // ✅ 正常完成
  }
});

// 方案 2: 轮询 isStreaming（备用兜底）
const checkInterval = setInterval(() => {
  if (!session.isStreaming) {
    if (resolved) return;
    resolved = true;
    clearTimeout(timer);
    clearInterval(checkInterval);
    unsubscribe();
    resolve();  // ✅ 如果事件丢失，也能检测到完成
  }
}, 500);
```

## 概念对比总结

| 概念 | 位置 | 含义 | 当前状态 |
|------|------|------|----------|
| `session.isStreaming` | PI SDK 内部 | AI 是否正在工作 | ✅ 使用中 |
| SSE 流式响应 | HTTP 网络层 | 服务器是否边生成边推数据 | ❌ 未使用（当前是一次性返回） |

## 未来可能的改进

如果需要实现 SSE 流式返回，需要在 `waitForSessionComplete` 期间就把数据推送给客户端，而不是等全部完成后再返回。这样可以提供更实时的用户体验，但会增加实现复杂度。
