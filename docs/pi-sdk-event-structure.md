# PI SDK 事件结构与消息系统

## 概述

PI SDK 使用两层事件系统来处理 AI Agent 的流式响应和工具调用：

| 层级 | 事件类型 | 作用 |
|------|----------|------|
| **高层** | `AgentEvent` | 消息/工具的生命周期管理 |
| **低层** | `AssistantMessageEvent` | 流式内容的增量更新 |

## 1. AgentEvent 类型层次结构

来自 `@mariozechner/pi-agent-core`：

```typescript
export type AgentEvent =
  // Agent 生命周期事件
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }

  // Turn 生命周期事件
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }

  // Message 生命周期事件
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }

  // Tool 执行生命周期事件
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean }
```

## 2. AssistantMessageEvent 类型层次结构

来自 `@mariozechner/pi-ai`，嵌套在 `message_update` 事件中：

```typescript
export type AssistantMessageEvent =
  // 消息开始
  | { type: "start"; partial: AssistantMessage }

  // 文本内容流式更新
  | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }

  // 思考过程流式更新
  | { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }

  // 工具调用流式更新
  | { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }

  // 消息结束
  | { type: "done"; reason: Extract<StopReason, "stop" | "length" | "toolUse">; message: AssistantMessage }
  | { type: "error"; reason: Extract<StopReason, "aborted" | "error">; error: AssistantMessage }
```

## 3. 事件从属关系图

```
Agent (整个会话)
 └── agent_start
 └── Turn (一次对话轮次)
     └── turn_start
     └── Message (一条消息)
         ├── message_start
         ├── message_update (流式更新)
         │   ├── text_delta (文本增量)
         │   ├── toolcall_start (工具调用生成开始)
         │   ├── toolcall_delta (工具调用内容增量)
         │   └── toolcall_end (工具调用生成结束)
         └── message_end (消息完成)

     └── Tool Execution (工具实际执行)
         ├── tool_execution_start
         ├── tool_execution_update
         └── tool_execution_end

     └── turn_end
 └── agent_end
```

## 4. 工具调用的两个阶段

重要概念：工具调用的**生成**和**执行**是两个独立的阶段：

| 阶段 | 事件类型 | 含义 | 发生时机 |
|------|----------|------|----------|
| **生成阶段** | `toolcall_*` | LLM 决定调用什么工具、生成参数 | 在 LLM 生成响应时 |
| **执行阶段** | `tool_execution_*` | 实际运行工具代码、获取结果 | 在 message_end 之后 |

### 阶段详解

**生成阶段** (`toolcall_*`)：
- LLM 分析用户请求，决定需要调用哪个工具
- 流式生成工具调用的参数（如文件路径、搜索关键词等）
- 此时工具并未真正执行

**执行阶段** (`tool_execution_*`)：
- 工具参数已经确定，开始执行实际操作
- 例如：真正读取文件、执行 bash 命令、搜索网络等
- 执行完成后将结果返回给 LLM

## 5. contentIndex 的作用

`contentIndex` 用于区分同一条消息中的多个内容块：

```typescript
content: [
  { type: "text", text: "你好，我来帮你..." },        // contentIndex: 0
  { type: "thinking", thinking: "用户想要..." },      // contentIndex: 1
  { type: "toolCall", name: "read", arguments: {...} } // contentIndex: 2
]
```

在流式更新时，`contentIndex` 确保增量内容正确关联到对应的内容块。

## 6. 事件序列示例

### 简单文本响应
```
agent_start
turn_start
message_start
message_update (text_delta) → "你好"
message_update (text_delta) → "，有什么"
message_update (text_delta) → "可以帮你的？"
message_end
turn_end
agent_end
```

### 包含工具调用的响应
```
agent_start
turn_start
message_start
message_update (text_delta) → "让我读取文件..."
message_update (toolcall_start) → 开始生成工具调用
message_update (toolcall_delta) → "read"
message_update (toolcall_delta) → '{"path":"...'
message_update (toolcall_end) → 工具调用参数生成完成
message_end
tool_execution_start → 开始执行 read 工具
tool_execution_end → read 工具执行完成
turn_start (LLM 继续思考工具结果)
message_start
message_update (text_delta) → "文件内容是..."
message_end
turn_end
agent_end
```

### 带思考过程的响应
```
agent_start
turn_start
message_start
message_update (thinking_start)
message_update (thinking_delta) → "分析用户需求..."
message_update (thinking_end)
message_update (text_delta) → "根据分析..."
message_end
turn_end
agent_end
```

## 7. Krebs 中的事件转换

### WebSocket 消息类型

```typescript
type WSMessage =
  // 连接相关
  | { type: "connected"; sessionId: string; message?: string }
  | { type: "session_switched"; sessionId: string }

  // 响应流式传输
  | { type: "response_start" }
  | { type: "text_delta"; delta: string }
  | { type: "tool_call_start"; tool: string; contentIndex: number }
  | { type: "tool_call_delta"; tool: string; path: string; content: string; contentIndex: number }
  | { type: "response_end"; generatedContent?: string }

  // 工具执行
  | { type: "tool_start"; tool: string; args: any }
  | { type: "tool_end"; tool: string; success: boolean; result: string }

  // 其他
  | { type: "auth_success" }
  | { type: "error"; message: string };
```

### 转换映射表

| PI SDK 事件 | WebSocket 消息 | 代码位置 |
|-------------|---------------|----------|
| `message_update` + `text_delta` | `{ type: "text_delta", delta }` | server.ts:830-838 |
| `message_update` + `toolcall_start` | `{ type: "tool_call_start", tool, contentIndex }` | server.ts:854-863 |
| `message_update` + `toolcall_delta` | `{ type: "tool_call_delta", ... }` | server.ts:865-883 |
| `message_end` | `{ type: "response_end", generatedContent }` | server.ts:885-920 |
| `tool_execution_start` | `{ type: "tool_start", tool, args }` | server.ts:922-931 |
| `tool_execution_end` | `{ type: "tool_end", tool, success, result }` | server.ts:933-943 |

### 转换流程图

```
PI SDK Event
    ↓
server.ts (session.subscribe)
    ↓
事件解析与转换
    ↓
WebSocket.send(JSON.stringify(wsMessage))
    ↓
chat.tsx (ws.onmessage)
    ↓
UI 状态更新
```

## 8. AgentMessage 内容结构

```typescript
export interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];  // 内容数组
  api: Api;
  provider: Provider;
  model: string;
  usage: Usage;
  stopReason: StopReason;
  errorMessage?: string;
  timestamp: number;
}

export interface TextContent {
  type: "text";
  text: string;
}

export interface ThinkingContent {
  type: "thinking";
  thinking: string;
}

export interface ToolCall {
  type: "toolCall";
  name: string;
  arguments?: any;
  id?: string;
}
```

## 9. 关键洞察

1. **双层事件系统**：高层控制生命周期，低层处理流式内容
2. **工具调用分离**：生成阶段（LLM 决定）vs 执行阶段（实际运行）
3. **内容块索引**：`contentIndex` 精确追踪多个并发流式内容
4. **事件转换必要性**：PI SDK 事件复杂，需要简化后发送给前端
5. **完整生命周期**：从 agent_start 到 agent_end，覆盖整个会话流程

这个事件系统设计提供了从底层流式内容到高层消息生命周期的完整覆盖，使得开发者可以灵活控制 UI 更新和用户体验。
