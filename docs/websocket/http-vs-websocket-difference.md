# HTTP vs WebSocket 事件处理机制差异

## 目录

- [PI SDK 事件类型层级（从内到外）](#pi-sdk-事件类型层级从内到外)
- [核心区别对比](#核心区别对比)
- [详细流程分析](#详细流程分析)
- [为什么等待 message_end 有问题](#为什么等待-message_end-有问题)
- [正确解决方案：等待 agent_end](#正确解决方案等待-agent_end)
- [HTTP 和 WebSocket 统一方案](#http-和-websocket-统一方案)

---

## PI SDK 事件类型层级（从内到外）

PI SDK 使用三层事件系统，层级从内到外如下：

```
┌─────────────────────────────────────────────────────────────────┐
│ AgentEvent (最外层 - 整个会话)                                   │
│                                                                  │
│ { type: "agent_start" }                                         │
│       ↓                                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Turn (对话轮次)                                              │ │
│ │                                                              │ │
│ │ { type: "turn_start" }                                      │ │
│ │       ↓                                                      │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ Message (消息)                                          │ │ │
│ │ │                                                         │ │ │
│ │ │ { type: "message_start" }                              │ │ │
│ │ │       ↓                                                 │ │ │
│ │ │ { type: "message_update"; assistantMessageEvent: ... } │ │ │
│ │ │   ├── { type: "text_start" }                           │ │ │
│ │ │   ├── { type: "text_delta"; delta: "..." }             │ │ │
│ │ │   ├── { type: "text_end"; content: "..." }             │ │ │
│ │ │   ├── { type: "thinking_start" }                       │ │ │
│ │ │   ├── { type: "thinking_delta"; delta: "..." }         │ │ │
│ │ │   ├── { type: "thinking_end"; content: "..." }         │ │ │
│ │ │   ├── { type: "toolcall_start" }                       │ │ │
│ │ │   ├── { type: "toolcall_delta"; delta: "..." }         │ │ │
│ │ │   └── { type: "toolcall_end" }                         │ │ │
│ │ │       ↓                                                 │ │ │
│ │ │ { type: "message_end" }  ← 消息结束，但工具可能还在执行 │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ │       ↓                                                      │ │
│ │ ┌─────────────────────────────────────────────────────────┐ │ │
│ │ │ Tool Execution (工具执行 - 在 message_end 之后)         │ │ │
│ │ │                                                         │ │ │
│ │ │ { type: "tool_execution_start"; toolName: "..." }      │ │ │
│ │ │ { type: "tool_execution_update" }                      │ │ │
│ │ │ { type: "tool_execution_end"; result: "..." }          │ │ │
│ │ └─────────────────────────────────────────────────────────┘ │ │
│ │       ↓                                                      │ │
│ │ { type: "turn_end" }  ← 轮次结束，但可能还有新轮次         │ │
│ └─────────────────────────────────────────────────────────────┘ │
│       ↓                                                          │
│ { type: "agent_end"; messages: AgentMessage[] }  ← 会话结束    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 事件详细说明

| 层级        | 事件类型                 | 含义                             | 包含内容                          |
| ----------- | ------------------------ | -------------------------------- | --------------------------------- |
| **Agent**   | `agent_start`            | Agent 会话开始                   | -                                 |
|             | `agent_end` { messages } | **Agent 会话结束，包含所有消息** | 所有对话消息的完整数组            |
| **Turn**    | `turn_start`             | 对话轮次开始                     | -                                 |
|             | `turn_end`               | 对话轮次结束                     | 包含本轮消息和工具结果            |
| **Message** | `message_start`          | 消息开始                         | 消息对象                          |
|             | `message_update`         | 流式更新                         | 增量内容 (text/thinking/toolcall) |
|             | `message_end`            | 消息结束                         | 消息对象                          |
| **Tool**    | `tool_execution_start`   | 工具执行开始                     | 工具名、参数                      |
|             | `tool_execution_update`  | 工具执行中                       | 部分结果                          |
|             | `tool_execution_end`     | 工具执行结束                     | 执行结果                          |

### 关键洞察

1. **message_end 不等于完成**：收到 `message_end` 时，工具可能还在执行
2. **turn_end 不等于会话结束**：`turn_end` 后可能还有新的 `turn_start`
3. **agent_end 是真正的结束**：包含完整的 `messages` 数组，可直接提取内容

---

## 核心区别对比

| 特性         | HTTP                                      | WebSocket                              |
| ------------ | ----------------------------------------- | -------------------------------------- |
| **订阅时机** | `session.prompt()` **之后**才订阅         | 连接建立时**立即**订阅                 |
| **等待方式** | `await waitForSessionComplete()` 阻塞等待 | 在事件回调中处理                       |
| **等待事件** | `message_end` 或 `isStreaming=false`      | `agent_end`                            |
| **内容来源** | 从 `agent_end.messages` 提取              | 从 `agent_end.message` 提取 或文件读取 |
| **响应方式** | 一次性返回完整结果                        | 流式推送实时更新                       |

---

## 详细流程分析

### HTTP 方式（阻塞式）

```
1. 用户请求 → HTTP 服务器
2. session.prompt(message)  ← 触发 AI 开始工作
3. waitForSessionComplete() 开始订阅事件
4. 等待事件...
   - message_start
   - message_update (text_delta) × N
   - message_end ← 旧代码只等这个！
   - tool_execution_start ← 工具开始执行
   - tool_execution_end ← 工具执行完成
   - turn_end
   - agent_end ← 新代码等待这个！
5. 从 event.messages 提取内容
6. 返回响应
```

**旧代码问题**：等待 `message_end` 就返回，但工具还在执行

### WebSocket 方式（事件驱动）

```
1. WebSocket 连接建立
2. session.subscribe() ← 立即订阅
3. 用户发送消息 → session.prompt(message)
4. 实时接收事件：
   - message_start → 推送 response_start
   - message_update (text_delta) → 推送 text_delta
   - message_end ← 旧代码在这里发送 response_end
   - tool_execution_start ← 工具开始
   - tool_execution_end ← 工具结束
   - turn_end
   - agent_end ← 新代码等待这个
5. 推送 response_end
```

**旧代码问题**：

- 快速拒绝时 `message_start` → `message_end` < 300ms
- 工具还在执行就发送 `response_end`
- `turn_end` 后可能还有新轮次

---

## 为什么等待 message_end 有问题

### 问题 1：工具还在执行

```
message_end ← 我们以为完成了
    ↓
tool_execution_start ← 但工具刚开始执行！
    ↓
tool_execution_end ← 工具执行中...
    ↓
(此时前端已经收到 response_end，认为会话结束)
```

### 问题 2：多轮对话

```
turn_end ← 我们以为完成了
    ↓
turn_start ← 但新轮次开始了！
    ↓
message_start → message_update → message_end
    ↓
(前端刚收到 response_end，又收到新消息)
```

### 问题 3：快速拒绝

```
message_start
    ↓
message_end ← 33ms，模型快速拒绝
    ↓
message_start ← 重新开始
    ↓
... ← 这次才有实际内容
```

---

## 正确解决方案：等待 agent_end

### 优势

1. **完整的消息**：`agent_end` 包含所有消息，可直接提取
2. **真正结束**：只有 `agent_end` 才表示整个会话完成
3. **一致性**：HTTP 和 WebSocket 使用相同逻辑

### 实现代码

**HTTP (server.ts:335-402)**

```typescript
async function waitForSessionComplete(
  session: AgentSession,
  logger?: { log: (msg: string) => void },
): Promise<{ messages: any[] }> {
  return new Promise((resolve, reject) => {
    // 等待 agent_end
    unsubscribe = session.subscribe((event) => {
      if (event.type === "agent_end") {
        resolve({ messages: (event as any).messages || [] });
      }
    });
  });
}
```

**WebSocket (server.ts:945-1010)**

```typescript
if (event.type === "agent_end" && !hasSentResponseEnd) {
  // 从 event.message 提取内容并发送 response_end
}
```

---

## HTTP 和 WebSocket 统一方案

### 事件等待策略

| 事件            | HTTP 行为         | WebSocket 行为    | 说明             |
| --------------- | ----------------- | ----------------- | ---------------- |
| `message_start` | 记录时间          | 记录时间          | 用于检测快速拒绝 |
| `message_end`   | 跳过              | 跳过              | 工具可能还在执行 |
| `turn_end`      | 跳过              | 跳过              | 可能还有新轮次   |
| `agent_end`     | ✅ 提取内容并返回 | ✅ 提取内容并发送 | 真正结束         |

### 内容提取策略

1. **首选**：`agent_end` 事件中直接提取
   - HTTP: `event.messages`
   - WebSocket: `event.message`

2. **后备**：从文件读取
   - `getLastAssistantMessageFromFile()`

### 快速拒绝处理

```typescript
if (event.type === "message_start") {
  (ws as any).data.messageStartTime = Date.now();
}

if (event.type === "message_end") {
  const elapsed = Date.now() - messageStartTime;
  if (elapsed < 300 && !hasSentResponseStart) {
    // 快速拒绝，跳过并等待新消息
    return;
  }
}
```

---

## 总结

| 场景               | 旧方案                               | 新方案                |
| ------------------ | ------------------------------------ | --------------------- |
| **HTTP 等待**      | `message_end` 或 `isStreaming=false` | `agent_end`           |
| **WebSocket 发送** | `message_end` 时                     | `agent_end` 时        |
| **内容来源**       | 从文件读取                           | 从事件提取 + 文件后备 |
| **快速拒绝**       | 无处理                               | 检测 < 300ms 并跳过   |

---

## 相关文件

- `server.ts` - HTTP 和 WebSocket 实现
  - HTTP: 行 335-402 (`waitForSessionComplete`)
  - HTTP: 行 515-570 (消息处理)
  - WebSocket: 行 820-1010 (事件订阅)
- `docs/pi-sdk-event-structure.md` - PI SDK 事件结构详解
- `docs/websocket-generation-debug.md` - WebSocket 问题排查
