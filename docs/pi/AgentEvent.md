# PI SDK AgentEvent 事件系统详解

## 目录

- [概述](#概述)
- [事件层级结构](#事件层级结构)
- [AgentEvent 类型详解](#agentevent-类型详解)
- [AssistantMessageEvent 类型详解](#assistantmessageevent-类型详解)
- [为什么 toolcall 和 tool_execution 层级不同](#为什么-toolcall-和-tool_execution-层级不同)
- [事件流程示例](#事件流程示例)

---

## 概述

PI SDK 使用**双层事件系统**：

1. **AgentEvent** - 高层事件，控制生命周期（agent/turn/message/tool execution）
2. **AssistantMessageEvent** - 低层事件，处理流式内容（text/thinking/toolcall）

---

## 事件层级结构

```
AgentEvent (最外层 - 整个会话)
│
├── agent_start                                    → Agent 开始
│
├── Turn (对话轮次，可能多轮)
│   ├── turn_start                                 → 轮次开始
│   │
│   ├── Message (消息，可能多条)
│   │   ├── message_start { message }              → 消息开始
│   │   │
│   │   ├── message_update { assistantMessageEvent } → 流式更新
│   │   │   │
│   │   │   ├── text_start { contentIndex, partial }    ← LLM 开始生成文本
│   │   │   ├── text_delta { contentIndex, delta, partial } ← LLM 正在生成文本
│   │   │   ├── text_end { contentIndex, content, partial } ← LLM 文本生成完成
│   │   │   │
│   │   │   ├── thinking_start { contentIndex, partial }   ← LLM 开始思考
│   │   │   ├── thinking_delta { contentIndex, delta, partial } ← LLM 思考中
│   │   │   ├── thinking_end { contentIndex, content, partial } ← LLM 思考完成
│   │   │   │
│   │   │   ├── toolcall_start { contentIndex, partial }    ← LLM 开始生成工具调用
│   │   │   ├── toolcall_delta { contentIndex, delta, partial } ← LLM 生成工具参数中
│   │   │   └── toolcall_end { contentIndex, toolCall, partial } ← LLM 工具调用生成完成
│   │   │
│   │   └── message_end { message }                → 消息结束（工具可能还没执行！）
│   │
│   ├── Tool Execution (工具执行 - 在 message_end 之后，**独立于 Message**)
│   │   ├── tool_execution_start { toolCallId, toolName, args }  ← 工具开始执行
│   │   ├── tool_execution_update { toolCallId, toolName, partialResult } ← 执行中
│   │   └── tool_execution_end { toolCallId, toolName, result, isError } ← 执行完成
│   │
│   └── turn_end { message, toolResults }          → 轮次结束（可能还有新轮次）
│
└── agent_end { messages: AgentMessage[] }         → Agent 结束（包含**所有消息**）
```

---

## AgentEvent 类型详解

来自 `@mariozechner/pi-agent-core`：

```typescript
export type AgentEvent =
  // Agent 生命周期事件
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }  // ✅ 包含所有消息

  // Turn 生命周期事件
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResultMessage[] }

  // Message 生命周期事件
  | { type: "message_start"; message: AgentMessage }
  | { type: "message_update"; message: AgentMessage; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: AgentMessage }

  // Tool 执行生命周期事件（**顶层事件，不在 message_update 内**）
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: any }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: any; partialResult: any }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: any; isError: boolean }
```

---

## AssistantMessageEvent 类型详解

来自 `@mariozechner/pi-ai`，嵌套在 `message_update` 事件中：

```typescript
export type AssistantMessageEvent =
  // 消息开始
  | { type: "start"; partial: AssistantMessage }

  // 文本内容流式更新（和 text/thinking/toolcall 同级）
  | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }

  // 思考过程流式更新
  | { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "thinking_end"; contentIndex: number; content: string; partial: AssistantMessage }

  // 工具调用流式更新（**在 message_update 内，LLM 生成阶段**）
  | { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }

  // 消息结束
  | { type: "done"; reason: string; message: AssistantMessage }
  | { type: "error"; reason: string; error: AssistantMessage }
```

---

## 为什么 toolcall 和 tool_execution 层级不同

### 核心区别

| 阶段 | 事件 | 含义 | 层级 |
|------|------|------|------|
| **生成阶段** | `toolcall_*` | LLM 决定调用什么工具，生成参数 | 在 `message_update` 内 |
| **执行阶段** | `tool_execution_*` | 实际运行工具代码 | 顶层 `AgentEvent` |

### 时序示例

```
1. message_update: toolcall_start    ← LLM 开始生成工具调用
2. message_update: toolcall_delta    ← LLM 生成参数 "path": "/Users/..."
3. message_update: toolcall_delta    ← LLM 生成参数 "content": "..."
4. message_update: toolcall_end      ← LLM 生成完成，参数确定

5. message_end                       ← LLM 消息结束（工具还没执行！）

6. tool_execution_start              ← **独立阶段**：开始执行 read 工具
7. tool_execution_update             ← 执行中...
8. tool_execution_end                ← 执行完成，返回结果
```

### 设计思想

```
┌─────────────────────────────────────────────────────────────┐
│ LLM 生成阶段（同步）                                         │
│                                                              │
│ message_update                                              │
│   ├── text_delta        ← 文本输出                          │
│   ├── thinking_delta    ← 思考过程                          │
│   └── toolcall_delta    ← 工具调用参数 ← LLM 生成的"意图"   │
│                                                              │
│ message_end                                                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 工具执行阶段（异步，独立）                                    │
│                                                              │
│ tool_execution_start  ← 实际执行"动作"                      │
│ tool_execution_end                                             │
│                                                              │
│ ⚠️ 注意：tool_execution_* 是顶层事件，不在 message_update 内 │
└─────────────────────────────────────────────────────────────┘
```

**关键点**：
- `toolcall_*`: LLM 告诉你它**打算**调用什么工具（意图）
- `tool_execution_*`: 工具**真正开始**运行（动作）

---

## 事件流程示例

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
    
    message_start → 处理工具结果
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

---

## 关键洞察

1. **message_end 不等于完成**：收到 `message_end` 时，工具可能还在执行
2. **turn_end 不等于会话结束**：`turn_end` 后可能还有新的 `turn_start`
3. **agent_end 是真正的结束**：包含完整的 `messages` 数组，可直接提取内容
4. **toolcall 和 tool_execution 解耦**：
   - `toolcall_*`: LLM 生成阶段（意图）
   - `tool_execution_*`: 独立执行阶段（动作）

---

## 相关文件

- `server.ts` - HTTP 和 WebSocket 事件处理
- `docs/http-vs-websocket-difference.md` - HTTP vs WebSocket 对比
- `docs/websocket-generation-debug.md` - WebSocket 问题排查
