# Krebs

[English](#english) | [中文](#中文)

---

## English

### AI Coding Assistant based on `@mariozechner/pi-coding-agent` with Web UI and Interactive Chat

## Features

- 🤖 **Smart Code Generation** - Supports DeepSeek and Claude models
- 📝 **File Operations** - Safe file read/write, all files written to `custom/` directory
- 🔧 **Bash Execution** - Execute shell commands in isolated environment
- 🔍 **Web Search** - Integrated web search capability
- 💬 **Web UI** - Real-time chat interface with Markdown and code highlighting
- 📊 **Streaming Display** - Real-time file write progress and content display
- 🐛 **Debug Mode** - Optional event logging feature

## Quick Start

```bash
# Install dependencies
bun install

# Configure API Key (choose one)
export DEEPSEEK_API_KEY=your_key_here    # Recommended, cost-effective
# or
export ANTHROPIC_API_KEY=your_key_here

# Start server
bun run server.ts

# Open Web UI
open http://localhost:3000
```

## Environment Configuration

Create a `.env` file:

```bash
# API Key (required)
DEEPSEEK_API_KEY=your_deepseek_key
# or
ANTHROPIC_API_KEY=your_anthropic_key

# Server port (optional, default 3000)
PORT=3000

# Log level (optional)
LOG_LEVEL=NORMAL    # Output to console only
LOG_LEVEL=DEBUG     # Output to console and write to monitor.log
```

## Features Demo

### 1. Code Generation

```
User: Write a Python quicksort for me

AI: I'll write a Python version of the quicksort algorithm for you.

📝 Preparing to write file...
📝 Generating file: custom/quick_sort.py...
📝 Writing file: custom/quick_sort.py

📄 Content:
def quick_sort(arr):
    """
    Quicksort algorithm
    ...

✅ Write complete!
📁 File: custom/quick_sort.py
📊 Size: 1234 bytes
```

### 2. Code Execution

```
User: Run this quicksort

AI: Sure, let me run this quicksort program to test it.

🔧 Executing tool: bash
📝 Args: {"command":"python custom/quick_sort.py"}

Testing quicksort algorithm
==================================================
Test case 1: [64, 34, 25, 12, 22, 11, 90]
  Quicksort (new list): [11, 12, 22, 25, 34, 64, 90]
  ✓ Sort correct
...
```

### 3. File Reading

```
User: View the content of quick_sort.py

AI: Sure, let me read the content of this file.

📄 File content:
def quick_sort(arr):
    ...
```

## Project Structure

```
Krebs/
├── server.ts           # WebSocket server and Agent session management
├── index.ts            # HTTP server and static file serving
├── frontend/           # Web UI frontend
│   ├── chat.html       # HTML and CSS styles
│   └── chat.tsx        # React components and WebSocket client
├── lib/                # Utilities
│   └── logger.ts       # Logging utility (supports NORMAL/DEBUG mode)
├── custom/             # Agent working directory (all files written here)
├── docs/               # Documentation
│   ├── architecture-overview.md    # Architecture overview
│   ├── write-tool-loading-debug.md # Write Tool Loading troubleshooting
│   ├── write-tool-streaming-display.md # Streaming content display optimization
│   └── pi-mono-tool-monitoring.md  # pi-mono tool monitoring mechanism
└── schema/             # Data model definitions
```

## Tools

| Tool | Function | Example |
|------|----------|---------|
| `read` | Read file | `Read the content of custom/app.py` |
| `write` | Write file | `Create a hello.py file` |
| `bash` | Execute command | `Run python hello.py` |
| `web_search` | Web search | `Search latest TypeScript features` |

## How It Works

### Tool Calling Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Tool Calling Flow                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User Input                                                   │
│     "Create a TypeScript file for me"                           │
│            ↓                                                     │
│  2. LLM Analyzes Request                                         │
│     Understanding: need to create file → choose write tool      │
│            ↓                                                     │
│  3. Tool Call Generation (toolcall_delta)                        │
│     Incremental transfer: path, content, etc.                    │
│            ↓                                                     │
│  4. Tool Execution (tool_execution_start)                        │
│     writeTool.execute(params) → 2ms complete                    │
│            ↓                                                     │
│  5. Return Result (tool_execution_end)                          │
│     { success: true, bytes: 1234 }                              │
│            ↓                                                     │
│  6. LLM Continues Based on Result                                │
│     "File created successfully, contains the following..."       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### ReAct Loop Pattern

Agent uses ReAct (Reasoning + Acting) pattern:

1. **Reason** - LLM analyzes current state, decides next action
2. **Act** - Execute tool call
3. **Observe** - Observe tool execution result
4. **Loop** - Repeat until task is complete

### Event Flow

```
toolcall_start      → LLM starts generating tool call
  ↓
toolcall_delta      → Incremental parameter transfer (real-time progress)
  ↓
toolcall_end        → LLM completes tool call generation
  ↓
tool_execution_start → Tool starts execution (2-4ms)
  ↓
tool_execution_end   → Tool execution complete
```

## Development

### Adding a New Tool

```typescript
import { Type } from "@sinclair/typebox";

const myTool: ToolDefinition = {
  name: "my_tool",
  label: "My Tool",
  description: "Tool description",
  parameters: Type.Object({
    param1: Type.String({ description: "Parameter description" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
    // Tool execution logic
    return {
      content: [{ type: "text", text: "Execution result" }],
      details: {},
    };
  },
};

// Register in createAgentSession
tools: [
  createReadTool(cwd),
  createBashTool(join(cwd, "custom")),
  createWriteTool(join(cwd, "custom")),
  myTool,  // Add new tool here
],
```

### Debug Logging

```bash
# Enable DEBUG mode
echo "LOG_LEVEL=DEBUG" > .env

# Restart server
bun run server.ts

# View logs
tail -f monitor.log
```

## Tech Stack

- **Backend**: Bun + TypeScript
- **Frontend**: Preact + Markdown + Highlight.js
- **AI**: `@mariozechner/pi-coding-agent`
- **Communication**: WebSocket
- **Styling**: Custom CSS (dark theme)

## External API Guide

Krebs provides HTTP API and WebSocket interfaces for external applications.

### Authentication

#### Method A: Authorization Header (Recommended)

```bash
curl http://localhost:3000/api/sessions/list \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

#### Method B: Cookie

```bash
# Step 1: Authenticate to get Cookie
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"token": "YOUR_TOKEN_HERE"}' \
  -c cookies.txt

# Step 2: Use Cookie to call API
curl http://localhost:3000/api/sessions/list -b cookies.txt
```

### HTTP API Endpoints

#### 1. Send Message (Chat)

**POST** `/api/messages`

Send a message and get AI response:

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, please introduce yourself"
  }'
```

**Response:**
```json
{
  "sessionId": "session_abc123",
  "response": "Hello! I am an AI assistant..."
}
```

#### 2. Continue Conversation (Keep Context)

**POST** `/api/messages`

Use `sessionId` to continue previous conversation:

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What did I ask you just now?",
    "sessionId": "session_abc123"
  }'
```

#### 3. Get All Sessions List

**GET** `/api/sessions/list`

```bash
curl http://localhost:3000/api/sessions/list \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Response:**
```json
{
  "sessions": [
    {
      "id": "session_abc123",
      "session_id": "session_abc123",
      "first_question": "Hello, please introduce yourself",
      "created_at": 1712000000000
    }
  ]
}
```

#### 4. Get Session History Messages

**GET** `/api/sessions/:sessionId`

```bash
curl http://localhost:3000/api/sessions/session_abc123 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Response:**
```json
{
  "sessionId": "session_abc123",
  "messages": [
    {
      "role": "user",
      "content": "Hello, please introduce yourself"
    },
    {
      "role": "assistant",
      "content": "Hello! I am an AI assistant..."
    }
  ]
}
```

#### 5. Delete Session

**DELETE** `/api/sessions/:sessionId`

```bash
curl -X DELETE http://localhost:3000/api/sessions/session_abc123 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

#### 6. Health Check

**GET** `/health`

```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "ok",
  "sessions": 5
}
```

### WebSocket Real-time Communication

WebSocket supports real-time streaming responses, suitable for scenarios requiring immediate feedback.

#### Connection and Authentication

```javascript
const ws = new WebSocket("ws://localhost:3000/ws");

ws.onopen = () => {
  // Send auth message after connection established
  ws.send(JSON.stringify({ type: "auth" }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "auth_success") {
    console.log("Auth success");
    // Now you can send messages
  }
};
```

#### Send Message

```javascript
ws.send(JSON.stringify({
  type: "prompt",
  message: "Write a quicksort in Python"
}));
```

#### Receive Streaming Response

```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "text_delta":
      // Receive text increment
      console.log(data.delta);
      break;

    case "tool_call_start":
      // AI starts calling tool
      console.log(`Calling tool: ${data.tool}`);
      break;

    case "tool_call_delta":
      // Tool call incremental update (e.g., file write progress)
      if (data.tool === "write") {
        console.log(`Writing file: ${data.path}`);
      }
      break;

    case "tool_end":
      // Tool call complete
      console.log(`Tool execution complete: ${data.success ? "success" : "failed"}`);
      break;

    case "response_end":
      // Full response end
      console.log("Conversation complete");
      break;

    case "error":
      console.error("Error:", data.message);
      break;
  }
};
```

#### Stop Generation

```javascript
ws.send(JSON.stringify({ type: "stop" }));
```

### Complete Example Code

#### Python Example

```python
import requests

TOKEN = "your_token_here"
BASE_URL = "http://localhost:3000"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

# Send message
response = requests.post(
    f"{BASE_URL}/api/messages",
    headers=headers,
    json={"message": "What is recursion?"}
)

data = response.json()
print(f"Session ID: {data['sessionId']}")
print(f"Response: {data['response']}")

# Continue conversation
response2 = requests.post(
    f"{BASE_URL}/api/messages",
    headers=headers,
    json={
        "message": "Can you give me an example?",
        "sessionId": data['sessionId']
    }
)

print(f"Response 2: {response2.json()['response']}")
```

#### JavaScript/Node.js Example

```javascript
const TOKEN = "your_token_here";
const BASE_URL = "http://localhost:3000";

async function chat(message, sessionId = null) {
  const response = await fetch(`${BASE_URL}/api/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      sessionId
    }),
  });

  const data = await response.json();
  return data;
}

// Usage example
chat("Write a quicksort algorithm for me")
  .then(result => {
    console.log("Session:", result.sessionId);
    console.log("Response:", result.response);

    // Continue conversation
    return chat("What is the time complexity of this code?", result.sessionId);
  })
  .then(result2 => {
    console.log("Response 2:", result2.response);
  });
```

#### WebSocket Complete Example

```javascript
class KrebsClient {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.ws = null;
    this.messageHandlers = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        // Send auth
        this.ws.send(JSON.stringify({ type: "auth" }));
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "auth_success") {
          resolve();
        } else {
          // Trigger message handlers
          this.messageHandlers.forEach(handler => handler(data));
        }
      };

      this.ws.onerror = (error) => reject(error);
    });
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  sendMessage(message) {
    this.ws.send(JSON.stringify({
      type: "prompt",
      message
    }));
  }

  stop() {
    this.ws.send(JSON.stringify({ type: "stop" }));
  }

  disconnect() {
    this.ws.close();
  }
}

// Usage example
const client = new KrebsClient("ws://localhost:3000/ws", "your_token");

await client.connect();

client.onMessage((data) => {
  if (data.type === "text_delta") {
    process.stdout.write(data.delta);
  }
});

client.sendMessage("Introduce Python to me");
```

### Error Handling

#### HTTP Status Codes

- **200** - Request successful
- **400** - Invalid request parameters
- **401** - Unauthorized (Token invalid or missing)
- **404** - Resource not found (e.g., session not found)
- **500** - Internal server error

#### Error Response Format

```json
{
  "error": "Error description"
}
```

### Security Recommendations

1. **Use HTTPS in Production**
   - Set `NODE_ENV=production` environment variable
   - Cookies will automatically add `Secure` flag

2. **Regularly Rotate Tokens**
   - Modify `TOKEN` value in `.env` file
   - Restart server

3. **Restrict Access Sources**
   - Use firewall to restrict IP access
   - Only allow trusted networks to access

For detailed security documentation, see [SECURITY.md](./SECURITY.md) and [docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md).

## References

- [pi-mono GitHub](https://github.com/badlogic/pi-mono)
- [pi-coding-agent Documentation](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)
- [Anthropic Tool Use](https://docs.anthropic.com/claude/docs/tool-use)
- [Project Documentation](./docs/)
- [Authentication Details](./docs/AUTHENTICATION.md)

## License

MIT

---

## 中文

基于 `@mariozechner/pi-coding-agent` 的 AI 编程助手，支持 Web UI 和交互式聊天。

## 特性

- 🤖 **智能代码生成** - 支持 DeepSeek 和 Claude 模型
- 📝 **文件读写** - 安全的文件操作，所有文件写入到 `custom/` 目录
- 🔧 **Bash 执行** - 在隔离环境中执行 shell 命令
- 🔍 **网络搜索** - 集成网络搜索能力
- 💬 **Web UI** - 实时聊天界面，支持 Markdown 和代码高亮
- 📊 **流式显示** - 实时显示文件写入进度和内容
- 🐛 **调试模式** - 可选的事件日志记录功能

## 快速开始

```bash
# 安装依赖
bun install

# 配置 API Key（二选一）
export DEEPSEEK_API_KEY=your_key_here    # 推荐，性价比高
# 或
export ANTHROPIC_API_KEY=your_key_here

# 启动服务器
bun run server.ts

# 访问 Web UI
open http://localhost:3000
```

## 环境配置

创建 `.env` 文件：

```bash
# API Key（必需）
DEEPSEEK_API_KEY=your_deepseek_key
# 或
ANTHROPIC_API_KEY=your_anthropic_key

# 服务器端口（可选，默认 3000）
PORT=3000

# 日志级别（可选）
LOG_LEVEL=NORMAL    # 只输出到控制台
LOG_LEVEL=DEBUG     # 输出到控制台并写入 monitor.log
```

## 功能演示

### 1. 代码生成

```
用户：帮我写一个 Python 快速排序

AI：我来帮你写一个 Python 版本的快速排序算法。

📝 准备写入文件...
📝 正在生成文件: custom/quick_sort.py...
📝 写入文件: custom/quick_sort.py

📄 内容：
def quick_sort(arr):
    """
    快速排序算法
    ...

✅ 写入完成！
📁 文件: custom/quick_sort.py
📊 大小: 1234 bytes
```

### 2. 代码执行

```
用户：运行这个快速排序

AI：好的，我来运行这个快速排序程序来测试一下。

🔧 执行工具: bash
📝 参数: {"command":"python custom/quick_sort.py"}

测试快速排序算法
==================================================
测试用例 1: [64, 34, 25, 12, 22, 11, 90]
  快速排序（新列表）: [11, 12, 22, 25, 34, 64, 90]
  ✓ 排序正确
...
```

### 3. 文件读取

```
用户：查看 quick_sort.py 的内容

AI：好的，让我读取这个文件的内容。

📄 文件内容：
def quick_sort(arr):
    ...
```

## 项目结构

```
Krebs/
├── server.ts           # WebSocket 服务器和 Agent 会话管理
├── index.ts            # HTTP 服务器和静态文件服务
├── frontend/           # Web UI 前端
│   ├── chat.html       # HTML 和 CSS 样式
│   └── chat.tsx        # React 组件和 WebSocket 客户端
├── lib/                # 工具库
│   └── logger.ts       # 日志工具（支持 NORMAL/DEBUG 模式）
├── custom/             # Agent 工作目录（所有文件写入此处）
├── docs/               # 文档
│   ├── architecture-overview.md    # 架构概览
│   ├── write-tool-loading-debug.md # Write Tool Loading 问题排查
│   ├── write-tool-streaming-display.md # 流式内容显示优化
│   └── pi-mono-tool-monitoring.md  # pi-mono 工具监听机制
└── schema/             # 数据模型定义
```

## 工具说明

| 工具 | 功能 | 示例 |
|------|------|------|
| `read` | 读取文件 | `读取 custom/app.py 的内容` |
| `write` | 写入文件 | `创建一个 hello.py 文件` |
| `bash` | 执行命令 | `运行 python hello.py` |
| `web_search` | 网络搜索 | `搜索 TypeScript 最新特性` |

## 工作原理

### Tool Calling 流程

```
┌─────────────────────────────────────────────────────────────────┐
│                         Tool Calling 流程                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 用户输入                                                      │
│     "帮我创建一个 TypeScript 文件"                                 │
│            ↓                                                     │
│  2. LLM 分析需求                                                  │
│     理解：需要创建文件 → 选择 write 工具                          │
│            ↓                                                     │
│  3. 工具调用生成（toolcall_delta）                                │
│     增量传输：path, content 等参数                                 │
│            ↓                                                     │
│  4. 工具执行（tool_execution_start）                             │
│     writeTool.execute(params) → 2ms 完成                         │
│            ↓                                                     │
│  5. 返回结果（tool_execution_end）                               │
│     { success: true, bytes: 1234 }                               │
│            ↓                                                     │
│  6. LLM 根据结果继续                                              │
│     "文件已创建成功，包含以下函数..."                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### ReAct 循环模式

Agent 使用 ReAct (Reasoning + Acting) 模式：

1. **Reason** - LLM 分析当前状态，决定下一步行动
2. **Act** - 执行工具调用
3. **Observe** - 观察工具执行结果
4. **循环** - 重复直到任务完成

### 事件流

```
toolcall_start      → LLM 开始生成工具调用
  ↓
toolcall_delta      → 增量传输参数（实时显示进度）
  ↓
toolcall_end        → LLM 完成工具调用生成
  ↓
tool_execution_start → 工具开始执行（2-4ms）
  ↓
tool_execution_end   → 工具执行完成
```

## 开发

### 添加新工具

```typescript
import { Type } from "@sinclair/typebox";

const myTool: ToolDefinition = {
  name: "my_tool",
  label: "My Tool",
  description: "工具描述",
  parameters: Type.Object({
    param1: Type.String({ description: "参数说明" }),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
    // 工具执行逻辑
    return {
      content: [{ type: "text", text: "执行结果" }],
      details: {},
    };
  },
};

// 在 createAgentSession 中注册
tools: [
  createReadTool(cwd),
  createBashTool(join(cwd, "custom")),
  createWriteTool(join(cwd, "custom")),
  myTool,  // 添加新工具
],
```

### 日志调试

```bash
# 开启 DEBUG 模式
echo "LOG_LEVEL=DEBUG" > .env

# 重启服务器
bun run server.ts

# 查看日志
tail -f monitor.log
```

## 技术栈

- **后端**: Bun + TypeScript
- **前端**: Preact + Markdown + Highlight.js
- **AI**: `@mariozechner/pi-coding-agent`
- **通信**: WebSocket
- **样式**: 自定义 CSS（暗色主题）

## 外部 API 调用指南

Krebs 提供了 HTTP API 和 WebSocket 接口，支持外部应用调用。

### 认证方式

#### 方式 A：Authorization Header（推荐）

```bash
curl http://localhost:3000/api/sessions/list \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

#### 方式 B：Cookie

```bash
# 步骤 1：认证获取 Cookie
curl -X POST http://localhost:3000/api/auth \
  -H "Content-Type: application/json" \
  -d '{"token": "YOUR_TOKEN_HERE"}' \
  -c cookies.txt

# 步骤 2：使用 Cookie 调用 API
curl http://localhost:3000/api/sessions/list -b cookies.txt
```

### HTTP API 端点

#### 1. 发送消息（对话）

**POST** `/api/messages`

发送消息并获取 AI 响应：

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "你好，请介绍一下你自己"
  }'
```

**响应：**
```json
{
  "sessionId": "session_abc123",
  "response": "你好！我是一个 AI 助手..."
}
```

#### 2. 继续对话（保持上下文）

**POST** `/api/messages`

使用 `sessionId` 继续之前的对话：

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "我刚才问了你什么？",
    "sessionId": "session_abc123"
  }'
```

#### 3. 获取所有会话列表

**GET** `/api/sessions/list`

```bash
curl http://localhost:3000/api/sessions/list \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**响应：**
```json
{
  "sessions": [
    {
      "id": "session_abc123",
      "session_id": "session_abc123",
      "first_question": "你好，请介绍一下你自己",
      "created_at": 1712000000000
    }
  ]
}
```

#### 4. 获取会话历史消息

**GET** `/api/sessions/:sessionId`

```bash
curl http://localhost:3000/api/sessions/session_abc123 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**响应：**
```json
{
  "sessionId": "session_abc123",
  "messages": [
    {
      "role": "user",
      "content": "你好，请介绍一下你自己"
    },
    {
      "role": "assistant",
      "content": "你好！我是一个 AI 助手..."
    }
  ]
}
```

#### 5. 删除会话

**DELETE** `/api/sessions/:sessionId`

```bash
curl -X DELETE http://localhost:3000/api/sessions/session_abc123 \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

#### 6. 健康检查

**GET** `/health`

```bash
curl http://localhost:3000/health
```

**响应：**
```json
{
  "status": "ok",
  "sessions": 5
}
```

### WebSocket 实时通信

WebSocket 支持实时流式响应，适合需要即时反馈的场景。

#### 连接和认证

```javascript
const ws = new WebSocket("ws://localhost:3000/ws");

ws.onopen = () => {
  // 连接建立后发送认证消息
  ws.send(JSON.stringify({ type: "auth" }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "auth_success") {
    console.log("认证成功");
    // 现在可以发送消息
  }
};
```

#### 发送消息

```javascript
ws.send(JSON.stringify({
  type: "prompt",
  message: "请用 Python 写一个快速排序"
}));
```

#### 接收流式响应

```javascript
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case "text_delta":
      // 接收文本增量
      console.log(data.delta);
      break;

    case "tool_call_start":
      // AI 开始调用工具
      console.log(`调用工具: ${data.tool}`);
      break;

    case "tool_call_delta":
      // 工具调用增量更新（如文件写入进度）
      if (data.tool === "write") {
        console.log(`正在写入文件: ${data.path}`);
      }
      break;

    case "tool_end":
      // 工具调用完成
      console.log(`工具执行完成: ${data.success ? "成功" : "失败"}`);
      break;

    case "response_end":
      // 完整响应结束
      console.log("对话完成");
      break;

    case "error":
      console.error("错误:", data.message);
      break;
  }
};
```

#### 停止生成

```javascript
ws.send(JSON.stringify({ type: "stop" }));
```

### 完整示例代码

#### Python 示例

```python
import requests

TOKEN = "your_token_here"
BASE_URL = "http://localhost:3000"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

# 发送消息
response = requests.post(
    f"{BASE_URL}/api/messages",
    headers=headers,
    json={"message": "什么是递归？"}
)

data = response.json()
print(f"Session ID: {data['sessionId']}")
print(f"Response: {data['response']}")

# 继续对话
response2 = requests.post(
    f"{BASE_URL}/api/messages",
    headers=headers,
    json={
        "message": "能给我举个例子吗？",
        "sessionId": data['sessionId']
    }
)

print(f"Response 2: {response2.json()['response']}")
```

#### JavaScript/Node.js 示例

```javascript
const TOKEN = "your_token_here";
const BASE_URL = "http://localhost:3000";

async function chat(message, sessionId = null) {
  const response = await fetch(`${BASE_URL}/api/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      sessionId
    }),
  });

  const data = await response.json();
  return data;
}

// 使用示例
chat("帮我写一个快速排序算法")
  .then(result => {
    console.log("Session:", result.sessionId);
    console.log("Response:", result.response);

    // 继续对话
    return chat("这段代码的时间复杂度是多少？", result.sessionId);
  })
  .then(result2 => {
    console.log("Response 2:", result2.response);
  });
```

#### WebSocket 完整示例

```javascript
class KrebsClient {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.ws = null;
    this.messageHandlers = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        // 发送认证
        this.ws.send(JSON.stringify({ type: "auth" }));
      };

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "auth_success") {
          resolve();
        } else {
          // 触发消息处理器
          this.messageHandlers.forEach(handler => handler(data));
        }
      };

      this.ws.onerror = (error) => reject(error);
    });
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
  }

  sendMessage(message) {
    this.ws.send(JSON.stringify({
      type: "prompt",
      message
    }));
  }

  stop() {
    this.ws.send(JSON.stringify({ type: "stop" }));
  }

  disconnect() {
    this.ws.close();
  }
}

// 使用示例
const client = new KrebsClient("ws://localhost:3000/ws", "your_token");

await client.connect();

client.onMessage((data) => {
  if (data.type === "text_delta") {
    process.stdout.write(data.delta);
  }
});

client.sendMessage("介绍一下 Python");
```

### 错误处理

#### HTTP 状态码

- **200** - 请求成功
- **400** - 请求参数错误
- **401** - 未授权（Token 无效或缺失）
- **404** - 资源不存在（如会话不存在）
- **500** - 服务器内部错误

#### 错误响应格式

```json
{
  "error": "错误描述信息"
}
```

### 安全建议

1. **生产环境使用 HTTPS**
   - 设置 `NODE_ENV=production` 环境变量
   - Cookie 将自动添加 `Secure` 标志

2. **定期更换 Token**
   - 修改 `.env` 文件中的 `TOKEN` 值
   - 重启服务器

3. **限制访问来源**
   - 使用防火墙限制 IP 访问
   - 只允许可信网络访问

详细的安全说明请参考 [SECURITY.md](./SECURITY.md) 和 [docs/AUTHENTICATION.md](./docs/AUTHENTICATION.md)。

## 参考资源

- [pi-mono GitHub](https://github.com/badlogic/pi-mono)
- [pi-coding-agent 文档](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent)
- [Anthropic Tool Use](https://docs.anthropic.com/claude/docs/tool-use)
- [项目文档](./docs/)
- [认证机制详细说明](./docs/AUTHENTICATION.md)

## License

MIT
