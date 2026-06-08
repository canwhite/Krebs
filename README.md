# Krebs

[English](#english) | [中文](#中文)

---

## English

### AI Gateway — Chat UI + HTTP + WebSocket

A self-hosted AI coding gateway. Connect from a browser, a script, or any HTTP client. Sessions persist across requests. All files land in `custom/`.

## Features

- **Browser UI** — Real-time chat with Markdown and code highlighting. No account, no external service.
- **HTTP API** — One-shot `POST /api/messages` for CI/CD, scripts, other tools
- **WebSocket API** — Stream tokens and tool events as they happen
- **Persistent Sessions** — Resume any past conversation by `sessionId`
- **Tool Execution** — AI can read, write, and run code in `custom/`
- **Lua Tools** — Drop a `.lua` file in `lua-tools/`, it's immediately available to the AI
- **Skills** — 7 built-in skills (web search, JSON validation, resume optimization, etc.)
- **Multi-Model** — Switch between DeepSeek / Claude by setting one env var

## Quick Start

```bash
bun install

export DEEPSEEK_API_KEY=your_key    # or ANTHROPIC_API_KEY

bun run server/index.ts
open http://localhost:3000
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | — | DeepSeek API key (recommended) |
| `ANTHROPIC_API_KEY` | — | Alternative: Anthropic API key |
| `PORT` | `3000` | HTTP/WebSocket port |
| `MODEL_PROVIDER` | `deepseek` | `deepseek` or `anthropic` |
| `MODEL_BASE_URL` | `https://api.deepseek.com/v1` | Custom model endpoint |
| `MODEL_ID` | `deepseek-chat` | Model name |
| `SESSION_TIMEOUT_MS` | `480000` | Max session run time (8 min) |

## Project Structure

```
Krebs/
├── server/                    # Server
│   ├── index.ts              # Bun.serve() — HTTP + WebSocket bootstrap
│   ├── session-service.ts     # Runtime factory, session lifecycle
│   ├── event-subscription.ts # Forwards AI events over WebSocket
│   ├── think-parser.ts        # Extract <think> tags from model output
│   ├── ws-router.ts           # Route WS messages to handlers
│   ├── handlers/              # WS message handlers (prompt, stop, auth, switch)
│   └── routes/               # HTTP handlers (/api/messages, /api/sessions, ...)
│
├── lib/                      # Shared
│   ├── logger.ts             # NORMAL / DEBUG logging
│   ├── session-repository.ts  # SessionRepository interface + in-memory impl
│   └── session-transcript.ts  # Extract content from AI responses
│
├── tools/                    # Tool system
│   ├── lua-runtime.ts        # Lua 5.4 VM (Wasmoon)
│   ├── lua-tools-registry.ts # Auto-load *.lua files from lua-tools/
│   └── lua-exec.ts          # Executes a named Lua tool
│
├── lua-tools/                # 9 Lua scripts — each becomes a tool
│   ├── file-read.lua
│   ├── file-write.lua
│   ├── json-encode.lua
│   └── ... (datetime, string, math utilities)
│
├── skills/                   # 7 skills for the AI to use
│   ├── web-search-tool/
│   ├── json-output-optimizer/
│   ├── resume-optimizer/
│   └── ... (no-useeffect, simpleman, etc.)
│
├── frontend/
│   ├── chat.html             # HTML shell + styles
│   └── chat.tsx              # React 19 app (WS client + Markdown renderer)
│
├── db/
│   └── index.ts              # SQLite — sessionId → sessionFile mapping
│
└── prompts/
    └── index.ts              # System prompt (Chinese)
```

## HTTP API

Requires `Authorization: Bearer <token>` — token is printed to console on first start and saved to `.env`.

### Send a message

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Write a Python quicksort"}'
```

Returns `{sessionId, response, generatedContent}`.

### Resume a session

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Add tests", "sessionId": "session_xxx"}'
```

### Session management

```bash
curl http://localhost:3000/api/sessions/list -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/api/sessions/:sessionId -H "Authorization: Bearer $TOKEN"
curl -X DELETE http://localhost:3000/api/sessions/:sessionId -H "Authorization: Bearer $TOKEN"
```

## WebSocket API

```javascript
const ws = new WebSocket("ws://localhost:3000/ws");
ws.onopen = () => ws.send(JSON.stringify({ type: "auth" }));
```

Send messages:

```javascript
ws.send(JSON.stringify({ type: "prompt", message: "Hello" }));
ws.send(JSON.stringify({ type: "stop" }));
ws.send(JSON.stringify({ type: "switch_session", sessionId: "..." }));
```

Receive events:

| Event | When |
|-------|------|
| `connected` | Connection open |
| `text_delta` | Streaming token |
| `think_block` | `<think>` tag content |
| `tool_call_start` | AI started a tool call |
| `tool_start` / `tool_end` | Tool execution |
| `turn_end` | Round complete |
| `response_end` | Full response done |

## Web UI

Open `http://localhost:3000/`. Connects to `/ws`, authenticates automatically via `/api/auth/internal`. Features:

- Real-time token streaming
- Markdown rendering with code highlighting
- Session history sidebar
- Stop / restart generation

## Lua Tools

Drop a Lua script into `lua-tools/`, restart the server. The AI can call it by name.

```lua
-- lua-tools/json-encode.lua
function main(args)
  local value = args[1]
  return cjson.encode(value)
end
```

The AI calls it as `lua_exec("json-encode", { value })`.

## Skills

Skills are `SKILL.md` files the AI reads when relevant. All 7 are listed in `skills/index.ts`.

## Tech Stack

Bun · TypeScript · React 19 · bun:sqlite · WebSocket · Wasmoon (Lua 5.4)

---

## 中文

### AI 网关 — 聊天界面 + HTTP + WebSocket

自托管的 AI 编程网关。从浏览器、脚本或任何 HTTP 客户端连接。会话跨请求持久化。所有文件写入 `custom/`。

## 特性

- **浏览器界面** — 实时聊天，Markdown 渲染，代码高亮。无需账号，无需外部服务
- **HTTP API** — 一次 `POST /api/messages` 请求，适合 CI/CD、脚本、工具集成
- **WebSocket API** — 实时流式返回 token 和工具执行事件
- **会话持久化** — 通过 `sessionId` 随时恢复历史对话
- **工具执行** — AI 可以在 `custom/` 中读写文件、执行命令
- **Lua 工具** — 将 `.lua` 文件放入 `lua-tools/`，立即成为可用工具（共 9 个内置）
- **技能系统** — 7 个内置技能（网页搜索、JSON 校验、简历优化等）
- **多模型** — 改一个环境变量即可切换 DeepSeek / Claude

## 快速开始

```bash
bun install

export DEEPSEEK_API_KEY=your_key    # 或设置 ANTHROPIC_API_KEY

bun run server/index.ts
open http://localhost:3000
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DEEPSEEK_API_KEY` | — | DeepSeek API key（推荐） |
| `ANTHROPIC_API_KEY` | — | 备选：Anthropic API key |
| `PORT` | `3000` | HTTP/WebSocket 端口 |
| `MODEL_PROVIDER` | `deepseek` | `deepseek` 或 `anthropic` |
| `MODEL_BASE_URL` | `https://api.deepseek.com/v1` | 自定义模型端点 |
| `MODEL_ID` | `deepseek-chat` | 模型名称 |
| `SESSION_TIMEOUT_MS` | `480000` | 最大运行时间（8 分钟） |

## 项目结构

```
Krebs/
├── server/                    # 服务器
│   ├── index.ts              # Bun.serve() — HTTP + WebSocket 启动
│   ├── session-service.ts     # Runtime 工厂，session 生命周期
│   ├── event-subscription.ts # 将 AI 事件转发到 WebSocket
│   ├── think-parser.ts        # 从模型输出中提取 <think> 标签
│   ├── ws-router.ts           # WS 消息路由到各 handler
│   ├── handlers/              # WS 消息处理器（prompt, stop, auth, switch）
│   └── routes/               # HTTP 处理器（/api/messages, /api/sessions, ...）
│
├── lib/                      # 共享模块
│   ├── logger.ts             # NORMAL / DEBUG 两种日志模式
│   ├── session-repository.ts  # SessionRepository 接口 + 内存实现
│   └── session-transcript.ts  # 从 AI 响应中提取内容
│
├── tools/                    # 工具系统
│   ├── lua-runtime.ts        # Lua 5.4 虚拟机（Wasmoon）
│   ├── lua-tools-registry.ts # 自动加载 lua-tools/ 下所有 *.lua
│   └── lua-exec.ts          # 执行命名的 Lua 工具
│
├── lua-tools/                # 9 个 Lua 脚本 — 每个对应一个工具
│   ├── file-read.lua
│   ├── file-write.lua
│   ├── json-encode.lua
│   └── ...（时间、字符串、数学工具）
│
├── skills/                   # 7 个技能，AI 在相关场景下自动使用
│   ├── web-search-tool/
│   ├── json-output-optimizer/
│   ├── resume-optimizer/
│   └── ...（no-useeffect, simpleman 等）
│
├── frontend/
│   ├── chat.html             # HTML 壳 + 样式
│   └── chat.tsx              # React 19 应用（WS 客户端 + Markdown 渲染）
│
├── db/
│   └── index.ts              # SQLite — sessionId → sessionFile 映射
│
└── prompts/
    └── index.ts              # System prompt（中文助手）
```

## HTTP API

需要 `Authorization: Bearer <token>` — 首次启动时 token 会输出到控制台并写入 `.env`。

### 发送消息

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "写一个 Python 快速排序"}'
```

返回 `{sessionId, response, generatedContent}`。

### 恢复会话

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "加上测试", "sessionId": "session_xxx"}'
```

### 会话管理

```bash
curl http://localhost:3000/api/sessions/list -H "Authorization: Bearer $TOKEN"
curl http://localhost:3000/api/sessions/:sessionId -H "Authorization: Bearer $TOKEN"
curl -X DELETE http://localhost:3000/api/sessions/:sessionId -H "Authorization: Bearer $TOKEN"
```

## WebSocket API

```javascript
const ws = new WebSocket("ws://localhost:3000/ws");
ws.onopen = () => ws.send(JSON.stringify({ type: "auth" }));
```

发送消息：

```javascript
ws.send(JSON.stringify({ type: "prompt", message: "你好" }));
ws.send(JSON.stringify({ type: "stop" }));
ws.send(JSON.stringify({ type: "switch_session", sessionId: "..." }));
```

接收事件：

| 事件 | 触发时机 |
|------|----------|
| `connected` | 连接建立 |
| `text_delta` | 流式返回 token |
| `think_block` | `<think>` 标签内容 |
| `tool_call_start` | AI 开始生成工具调用 |
| `tool_start` / `tool_end` | 工具执行开始/结束 |
| `turn_end` | 回合完成 |
| `response_end` | 完整响应结束 |

## Web UI

打开 `http://localhost:3000/`。自动连接 `/ws`，通过 `/api/auth/internal` 认证。功能：

- 实时 token 流式输出
- Markdown 渲染 + 代码高亮
- 会话历史侧边栏
- 停止 / 重新生成

## Lua 工具

将 Lua 脚本放入 `lua-tools/`，重启服务器即可。AI 通过名称调用：

```lua
-- lua-tools/json-encode.lua
function main(args)
  local value = args[1]
  return cjson.encode(value)
end
```

AI 调用方式：`lua_exec("json-encode", { value })`

## 技能（Skills）

技能是 `SKILL.md` 文件，AI 在相关场景下自动读取使用。共 7 个，见 `skills/index.ts`。

## 技术栈

Bun · TypeScript · React 19 · bun:sqlite · WebSocket · Wasmoon (Lua 5.4)
