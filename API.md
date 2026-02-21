# Krebs API 接口文档

> **版本**: v1.0.0
> **更新时间**: 2026-02-21
> **基础URL**: `http://localhost:3000` (HTTP), `ws://localhost:3001` (WebSocket)

---

## 目录

- [概述](#概述)
- [HTTP API](#http-api)
  - [健康检查](#健康检查)
  - [工具管理](#工具管理)
  - [技能管理](#技能管理)
  - [聊天接口](#聊天接口)
  - [Agent 管理](#agent-管理)
  - [会话管理](#会话管理)
- [WebSocket API](#websocket-api)
- [数据模型](#数据模型)
- [错误码](#错误码)

---

## 概述

Krebs 提供 RESTful HTTP API 和 WebSocket API 两种接口方式。

### 通信格式

**HTTP API**:
- 请求格式: `application/json`
- 响应格式: `application/json`
- 支持 CORS（跨域请求）

**WebSocket API**:
- 消息格式: JSON
- 支持双向通信和流式响应

### 协议帧格式

**请求帧**（RequestFrame）:
```json
{
  "id": "unique-request-id",
  "method": "method.name",
  "params": { /* 方法参数 */ }
}
```

**响应帧**（ResponseFrame）:
```json
{
  "id": "unique-request-id",
  "result": { /* 成功结果 */ },
  "error": { /* 错误信息，可选 */ }
}
```

**事件帧**（EventFrame）:
```json
{
  "type": "event.type",
  "data": { /* 事件数据 */ }
}
```

---

## HTTP API

### 健康检查

#### 1. 健康检查

**接口**: `GET /health`

**描述**: 检查服务是否正常运行

**请求参数**: 无

**响应示例**:
```json
{
  "status": "ok",
  "timestamp": 1736097660000
}
```

---

#### 2. API 健康检查

**接口**: `GET /api/health`

**描述**: 检查 API 服务是否正常运行

**请求参数**: 无

**响应示例**:
```json
{
  "status": "ok",
  "timestamp": 1736097660000
}
```

---

### 工具管理

#### 3. 获取工具列表

**接口**: `GET /api/tools`

**描述**: 获取所有可用的工具列表

**请求参数**: 无

**响应示例**:
```json
{
  "tools": [
    {
      "name": "read",
      "description": "Read a file from the filesystem",
      "category": "filesystem",
      "requiresApiKey": false,
      "apiKeyName": null
    },
    {
      "name": "web_search",
      "description": "Search the web for information",
      "category": "web",
      "requiresApiKey": true,
      "apiKeyName": "serper"
    }
  ]
}
```

---

#### 4. 设置 API Keys

**接口**: `POST /api/tools/keys`

**描述**: 为需要 API Key 的工具设置密钥

**请求参数**:
```json
{
  "keys": {
    "serper": "your-serper-api-key",
    "github": "your-github-token"
  }
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "API keys stored successfully"
}
```

**错误响应**:
```json
{
  "success": false,
  "error": "Invalid keys format"
}
```

---

#### 5. 获取已配置的 API Keys

**接口**: `GET /api/tools/keys`

**描述**: 获取已配置的 API Keys 状态

**请求参数**: 无

**响应示例**:
```json
{
  "configuredTools": ["serper", "github"]
}
```

---

#### 6. 获取工具状态

**接口**: `GET /api/tools/status`

**描述**: 获取工具的详细状态信息

**请求参数**: 无

**响应示例**:
```json
{
  "tools": [
    {
      "name": "read",
      "enabled": true,
      "configured": true
    },
    {
      "name": "web_search",
      "enabled": true,
      "configured": false
    }
  ]
}
```

---

### 技能管理

#### 7. 获取技能列表

**接口**: `GET /api/skills`

**描述**: 获取所有可用的技能列表

**请求参数**: 无

**响应示例**:
```json
{
  "skills": [
    {
      "id": "github",
      "name": "github",
      "description": "GitHub integration skill",
      "enabled": true,
      "category": "development",
      "emoji": "🐙",
      "tags": ["git", "code", "repository"]
    },
    {
      "id": "filesystem",
      "name": "filesystem",
      "description": "Filesystem operations",
      "enabled": true,
      "category": "general",
      "emoji": "📁",
      "tags": ["files", "system"]
    }
  ]
}
```

---

#### 8. 启用/禁用技能

**接口**: `PATCH /api/skills/:skillId`

**描述**: 启用或禁用指定技能

**URL 参数**:
- `skillId` (string): 技能 ID

**请求参数**:
```json
{
  "enabled": true
}
```

**响应示例**:
```json
{
  "success": true
}
```

---

#### 9. 上传技能

**接口**: `POST /api/skills/upload`

**描述**: 上传新的技能包（支持 .zip 或 .tar.gz 格式）

**请求类型**: `multipart/form-data`

**请求参数**:
- `skill` (file): 技能包文件（最大 50MB）

**响应示例**:
```json
{
  "success": true,
  "message": "Skill 'my-skill' uploaded successfully",
  "skillName": "my-skill",
  "path": "/path/to/skills/bundled/my-skill"
}
```

**错误响应**:
```json
{
  "error": "Skill validation failed",
  "details": ["Missing 'name' field in frontmatter"]
}
```

---

### 聊天接口

#### 10. 发送聊天消息（简化版）

**接口**: `POST /api/chat`

**描述**: 发送聊天消息给 Agent，获取回复

**请求参数**:
```json
{
  "message": "Hello, how are you?",
  "sessionId": "user:123",
  "agentId": "default"
}
```

**参数说明**:
- `message` (string, 必需): 用户消息
- `sessionId` (string, 可选): 会话 ID，如果不提供将自动生成
- `agentId` (string, 可选): Agent ID，默认为 "default"

**响应示例**:
```json
{
  "content": "I'm doing well, thank you!",
  "payloads": [],
  "usage": {
    "promptTokens": 10,
    "completionTokens": 5,
    "totalTokens": 15
  },
  "sessionId": "user:123"
}
```

**注意**:
- 如果不提供 `sessionId`，系统会基于客户端标识（IP + User-Agent）生成固定的 sessionId
- 返回的 `sessionId` 可以在后续请求中复用

---

#### 11. 发送聊天消息（RequestFrame 格式）

**接口**: `POST /api/chat`

**描述**: 使用标准 RequestFrame 格式发送消息（向后兼容）

**请求参数**:
```json
{
  "id": "req-001",
  "method": "chat.send",
  "params": {
    "agentId": "default",
    "sessionId": "user:123",
    "message": "Hello, how are you?"
  }
}
```

**响应示例**:
```json
{
  "id": "req-001",
  "result": {
    "response": "I'm doing well, thank you!",
    "usage": {
      "promptTokens": 10,
      "completionTokens": 5,
      "totalTokens": 15
    }
  }
}
```

**错误响应**:
```json
{
  "id": "req-001",
  "error": {
    "code": -1,
    "message": "Error details here"
  }
}
```

---

### Agent 管理

#### 12. 创建 Agent

**接口**: `POST /api/agent/create`

**描述**: 创建新的 Agent 实例

**请求参数**:
```json
{
  "id": "my-agent",
  "name": "My Custom Agent",
  "systemPrompt": "You are a helpful assistant",
  "model": "gpt-4",
  "temperature": 0.7,
  "maxTokens": 2000
}
```

**参数说明**:
- `id` (string, 必需): Agent 唯一标识
- `name` (string, 必需): Agent 显示名称
- `systemPrompt` (string, 可选): 系统提示词
- `model` (string, 可选): 使用的模型
- `temperature` (number, 可选): 温度参数（0-1）
- `maxTokens` (number, 可选): 最大 token 数

**响应示例**:
```json
{
  "id": "req-001",
  "result": {
    "agentId": "my-agent",
    "name": "My Custom Agent"
  }
}
```

---

#### 13. 列出 Agents

**接口**: `GET /api/agent/list`

**描述**: 获取所有可用的 Agent 列表

**请求参数**: 无

**响应示例**:
```json
{
  "id": "",
  "result": {
    "agents": [
      {
        "id": "default",
        "name": "Default Agent",
        "model": "deepseek-chat"
      },
      {
        "id": "my-agent",
        "name": "My Custom Agent",
        "model": "gpt-4"
      }
    ]
  }
}
```

---

### 会话管理

#### 14. 列出会话

**接口**: `GET /api/session/list`

**描述**: 获取所有会话列表

**URL 参数**:
- `agentId` (string, 可选): 筛选指定 Agent 的会话

**请求示例**:
```
GET /api/session/list?agentId=default
```

**响应示例**:
```json
{
  "id": "",
  "result": {
    "sessions": [
      {
        "sessionId": "user:123",
        "updatedAt": 1736097660000,
        "messageCount": 10
      },
      {
        "sessionId": "user:456",
        "updatedAt": 1736097600000,
        "messageCount": 5
      }
    ]
  }
}
```

---

#### 15. 创建会话（简化版）

**接口**: `POST /api/session/create`

**描述**: 创建新的会话

**请求参数**（可选）:
```json
{
  "agentId": "default",
  "metadata": {
    "title": "My Conversation",
    "tags": ["work", "project"]
  }
}
```

**响应示例**:
```json
{
  "sessionId": "user:1736097660000_abc123",
  "createdAt": 1736097660000,
  "entry": {
    "sessionId": "user:1736097660000_abc123",
    "createdAt": 1736097660000,
    "updatedAt": 1736097660000,
    "title": "My Conversation",
    "tags": ["work", "project"]
  }
}
```

**注意**:
- `sessionId` 格式为 `user:{timestamp}_{random}`
- 如果不提供参数，将创建空会话

---

#### 16. 创建会话（RequestFrame 格式）

**接口**: `POST /api/session/create`

**描述**: 使用标准 RequestFrame 格式创建会话（向后兼容）

**请求参数**:
```json
{
  "id": "req-002",
  "method": "session.create",
  "params": {
    "agentId": "default",
    "metadata": {
      "title": "My Conversation"
    }
  }
}
```

**响应示例**:
```json
{
  "id": "req-002",
  "result": {
    "sessionId": "user:1736097660000_abc123",
    "createdAt": 1736097660000,
    "entry": {
      "sessionId": "user:1736097660000_abc123",
      "createdAt": 1736097660000,
      "updatedAt": 1736097660000
    }
  }
}
```

---

## WebSocket API

### 连接

**URL**: `ws://localhost:3001`

**连接成功后**，服务器会发送欢迎消息：
```json
{
  "type": "connected",
  "data": {
    "clientId": "client_1736097660000_abc123"
  }
}
```

---

### 方法

#### 1. 发送聊天消息

**方法**: `chat.send`

**请求参数**:
```json
{
  "id": "ws-001",
  "method": "chat.send",
  "params": {
    "agentId": "default",
    "sessionId": "user:123",
    "message": "Hello, how are you?",
    "stream": true
  }
}
```

**参数说明**:
- `agentId` (string): Agent ID
- `sessionId` (string): 会话 ID
- `message` (string): 用户消息
- `stream` (boolean): 是否使用流式响应

**非流式响应**:
```json
{
  "id": "ws-001",
  "result": {
    "response": "I'm doing well, thank you!",
    "usage": {
      "promptTokens": 10,
      "completionTokens": 5,
      "totalTokens": 15
    }
  }
}
```

**流式响应**:
```json
{
  "id": "ws-001",
  "result": {
    "streaming": true
  }
}
```

然后会收到多个 `chat.chunk` 事件：
```json
{
  "type": "chat.chunk",
  "data": {
    "agentId": "default",
    "sessionId": "user:123",
    "chunk": "I'm"
  }
}
```

```json
{
  "type": "chat.chunk",
  "data": {
    "agentId": "default",
    "sessionId": "user:123",
    "chunk": " doing"
  }
}
```

**完成事件**:
```json
{
  "type": "chat.complete",
  "data": {
    "agentId": "default",
    "sessionId": "user:123"
  }
}
```

**错误事件**:
```json
{
  "type": "chat.error",
  "data": {
    "agentId": "default",
    "sessionId": "user:123",
    "error": "Error message here"
  }
}
```

---

## 数据模型

### RequestFrame

```typescript
interface RequestFrame<T = unknown> {
  id: string;          // 请求唯一标识
  method: string;      // 方法名称
  params?: T;          // 方法参数
}
```

---

### ResponseFrame

```typescript
interface ResponseFrame<T = unknown> {
  id: string;          // 请求 ID（与请求对应）
  result?: T;          // 成功结果
  error?: {            // 错误信息
    code: number;      // 错误码
    message: string;   // 错误消息
  };
}
```

---

### EventFrame

```typescript
interface EventFrame<T = unknown> {
  type: string;        // 事件类型
  data?: T;            // 事件数据
}
```

---

### ChatSendParams

```typescript
interface ChatSendParams {
  agentId: string;     // Agent ID
  sessionId: string;   // 会话 ID
  message: string;     // 用户消息
  stream?: boolean;    // 是否流式响应（仅 WebSocket）
}
```

---

### ChatSendResult

```typescript
interface ChatSendResult {
  response: string;    // Agent 回复
  usage?: {            // Token 使用统计
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

---

### AgentCreateParams

```typescript
interface AgentCreateParams {
  id: string;              // Agent 唯一标识
  name: string;            // Agent 显示名称
  systemPrompt?: string;   // 系统提示词
  model?: string;          // 使用的模型
  temperature?: number;    // 温度参数（0-1）
  maxTokens?: number;      // 最大 token 数
}
```

---

### SessionCreateParams

```typescript
interface SessionCreateParams {
  agentId?: string;                        // 关联的 Agent ID
  metadata?: Record<string, unknown>;       // 会话元数据
}
```

---

### SessionCreateResult

```typescript
interface SessionCreateResult {
  sessionId: string;                       // 会话 ID
  createdAt: number;                       // 创建时间戳
  entry: Record<string, unknown>;          // 会话条目
}
```

---

## 错误码

| 错误码 | 名称 | 说明 |
|--------|------|------|
| `-1` | `Unknown` | 未知错误 |
| `0` | `Ok` | 成功 |
| `1` | `InvalidParams` | 参数无效 |
| `2` | `NotFound` | 资源未找到 |
| `3` | `InternalError` | 内部错误 |

---

## 通用说明

### Session ID 格式

Session ID 使用以下格式：
- 简单格式: `user:123`
- 时间戳格式: `user:{timestamp}_{random}`

### Agent ID

默认 Agent ID 为 `default`，可以通过 `POST /api/agent/create` 创建自定义 Agent。

### 错误处理

所有错误响应都遵循统一格式：
```json
{
  "error": {
    "code": -1,
    "message": "Error description"
  }
}
```

或（RequestFrame 格式）:
```json
{
  "id": "request-id",
  "error": {
    "code": -1,
    "message": "Error description"
  }
}
```

---

## 使用示例

### JavaScript/TypeScript

```typescript
// 发送聊天消息
const response = await fetch('http://localhost:3000/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'Hello!',
    sessionId: 'user:123',
    agentId: 'default'
  })
});

const data = await response.json();
console.log(data.content);
```

### WebSocket

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  // 发送消息
  ws.send(JSON.stringify({
    id: 'ws-001',
    method: 'chat.send',
    params: {
      agentId: 'default',
      sessionId: 'user:123',
      message: 'Hello!',
      stream: true
    }
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'chat.chunk') {
    console.log('Chunk:', data.data.chunk);
  } else if (data.type === 'chat.complete') {
    console.log('Complete!');
  }
};
```

---

## 相关文档

- [生产环境部署](./production.md)
- [Docker 部署](./docs/DOCKER.md)
- [架构分析](./docs/architecture-analysis.md)

---

## 更新日志

- **2026-02-21**: 初始版本，包含所有 HTTP 和 WebSocket API
