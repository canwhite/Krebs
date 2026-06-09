# Krebs

[English](#english) | [中文](#中文)

---

### AI Gateway — Chat UI + HTTP + WebSocket

A self-hosted AI coding gateway with an embedded **agent** at its core. The agent maintains session context, executes tools, and calls skills — Krebs just exposes it over HTTP and WebSocket.

## Features

- **Embedded Agent** — Stateful coding agent with long-term memory across requests
- **Browser UI** — Real-time chat, Markdown rendering, code highlighting. No account, no external service
- **HTTP API** — One-shot `POST /api/messages` for CI/CD, scripts, other tools
- **WebSocket API** — Stream tokens and tool events as they happen
- **Persistent Sessions** — Resume any past conversation by `sessionId`
- **Tool Execution** — Agent reads, writes, and runs code in `custom/`
- **Sandbox** — Optional wasmtime + coreutils sandbox for write operations (read-write separation)
- **Lua Tools** — Drop a `.lua` file in `lua-tools/`, the agent can call it immediately (9 built-in)
- **Skills** — 7 built-in skills the agent reads in relevant contexts (web search, JSON validation, resume optimization, etc.)
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
| `SESSION_TIMEOUT_MS` | `480000` | Max agent run time (8 min) |

## Architecture

```
                     Browser              HTTP Client             Script
                          │                   │                    │
                     ┌────▼────┐       ┌────▼────┐        ┌────▼────┐
                     │   Web   │       │   HTTP  │        │   WS    │
                     │   UI    │       │   API   │        │  Client │
                     └────┬────┘       └────┬────┘        └────┬────┘
                          │                 │                 │
                          └─────────────────┼─────────────────┘
                                            │
                          ┌─────────────────▼─────────────────┐
                          │            Krebs Gateway           │
                          │                                      │
                          │  ws-router        HTTP routes       │
                          │  ├── AuthHandler   /api/messages     │
                          │  ├── PromptHandler /api/sessions      │
                          │  ├── StopHandler   /api/auth          │
                          │  └── SwitchSession                   │
                          └─────────────────┬───────────────────┘
                                            │
                          ┌─────────────────▼───────────────────┐
                          │              Agent                   │
                          │                                      │
                          │  session-service                     │
                          │    creates / manages runtime         │
                          │                                      │
                          │  event-subscription                   │
                          │    forwards events → WS               │
                          │                                      │
                          │  think-parser                         │
                          │    extracts <think> tags             │
                          │                                      │
                          │  tools/  +  lua-tools/  +  skills/  │
                          │  bash     9 Lua scripts     7 skills  │
                          └─────────────────┬───────────────────┘
                                            │
                          ┌─────────────────▼───────────────────┐
                          │         SessionManager              │
                          │  persists sessions → ./sessions/   │
                          └───────────────────────────────────┘

                          ┌───────────────────────────────────┐
                          │     db/sessions_meta (SQLite)      │
                          │  sessionId → sessionFile mapping    │
                          └───────────────────────────────────┘
```

## Project Structure

```
Krebs/
├── server/                    # Krebs gateway
│   ├── index.ts              # Bun.serve() — HTTP + WebSocket bootstrap
│   ├── session-service.ts     # Agent runtime factory + session lifecycle
│   ├── event-subscription.ts # Forwards agent events over WebSocket
│   ├── think-parser.ts        # Extract <think> tags from model output
│   ├── ws-router.ts           # Route WS messages to handlers
│   ├── sandbox/              # wasmtime sandbox (optional)
│   │   ├── executor.ts       # wasmtime wrapper
│   │   └── tools/bash.ts    # sandbox bash tool
│   ├── handlers/              # Prompt / Stop / Auth / SwitchSession
│   └── routes/               # /api/messages, /api/sessions, /api/auth
│
├── lib/                      # Shared utilities
│   ├── logger.ts             # NORMAL / DEBUG logging
│   ├── session-repository.ts  # SessionRepository interface + in-memory impl
│   └── session-transcript.ts  # Extract content from agent responses
│
├── tools/                    # Tool system
│   ├── lua-runtime.ts        # Lua 5.4 VM (Wasmoon)
│   ├── lua-tools-registry.ts # Auto-load *.lua from lua-tools/
│   └── lua-exec.ts          # Executes a named Lua tool
│
├── lua-tools/                # 9 Lua scripts — each becomes a tool the agent can call
│   ├── file-read.lua
│   ├── file-write.lua
│   ├── json-encode.lua
│   └── ... (datetime, string, math utilities)
│
├── skills/                   # 7 skills the agent reads in context
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
├── wasm/                      # wasmtime + coreutils
│   ├── bin/wasmtime          # v45.0.1
│   └── coreutils/coreutils.wasm
│
└── prompts/
    └── index.ts              # Agent system prompt (Chinese)
```

## Sandbox (Optional)

Enable with `createRuntime(sessionId, sessionPath, true)`.

**Read-write separation**:
- **Read commands** (`ls`, `cat`, `grep`, etc.) → passthrough to native bash
- **Write commands** (`echo`, `mkdir`, `rm`, etc.) → sandbox via wasmtime + coreutils

**Security**: Write operations are restricted to `cwd` via wasmtime `--dir` flag.

See [docs/sandbox-wasmtime.md](docs/sandbox-wasmtime.md) for details.

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
| `text_delta` | Streaming token from agent |
| `think_block` | `<think>` tag content |
| `tool_call_start` | Agent started generating a tool call |
| `tool_start` / `tool_end` | Tool execution |
| `turn_end` | Round complete |
| `response_end` | Full agent response done |

## Web UI

Open `http://localhost:3000/`. Connects to `/ws`, authenticates automatically. Features:

- Real-time token streaming
- Markdown rendering with code highlighting
- Session history sidebar
- Stop / restart generation

## Lua Tools

Drop a Lua script into `lua-tools/`, restart the server. The agent can call it by name.

```lua
-- lua-tools/json-encode.lua
function main(args)
  local value = args[1]
  return cjson.encode(value)
end
```

Agent calls it as `lua_exec("json-encode", { value })`.

## Skills

Skills are `SKILL.md` files the agent reads when relevant. All 7 are listed in `skills/index.ts`.

## Tech Stack

Bun · TypeScript · React 19 · bun:sqlite · WebSocket · Wasmoon (Lua 5.4)

---

### AI 网关 — 聊天界面 + HTTP + WebSocket

自托管 AI 编程网关，内置**Agent**作为核心。Agent 维护会话上下文、执行工具、调用技能——Krebs 只负责把 Agent 通过 HTTP 和 WebSocket 暴露出来。

## 特性

- **内置 Agent** — 有状态的编程 Agent，请求之间保持记忆
- **浏览器界面** — 实时聊天，Markdown 渲染，代码高亮。无需账号，无需外部服务
- **HTTP API** — 一次 `POST /api/messages` 请求，适合 CI/CD、脚本、工具集成
- **WebSocket API** — 实时流式返回 token 和工具执行事件
- **会话持久化** — 通过 `sessionId` 随时恢复历史对话
- **工具执行** — Agent 在 `custom/` 中读写文件、执行命令
- **沙箱** — 可选的 wasmtime + coreutils 沙箱（读写分离）
- **Lua 工具** — 将 `.lua` 文件放入 `lua-tools/`，Agent 可立即调用（共 9 个内置）
- **技能系统** — 7 个内置技能，Agent 在相关场景下自动读取使用（搜索、JSON 校验、简历优化等）
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
| `SESSION_TIMEOUT_MS` | `480000` | Agent 最大运行时间（8 分钟） |

## 架构

```
                     浏览器              HTTP 客户端             脚本
                          │                   │                    │
                     ┌────▼────┐       ┌────▼────┐        ┌────▼────┐
                     │   Web   │       │   HTTP  │        │   WS    │
                     │   UI    │       │   API   │        │  Client │
                     └────┬────┘       └────┬────┘        └────┬────┘
                          │                 │                 │
                          └─────────────────┼─────────────────┘
                                            │
                          ┌─────────────────▼─────────────────┐
                          │          Krebs Gateway            │
                          │                                      │
                          │  ws-router        HTTP 路由         │
                          │  ├── AuthHandler   /api/messages    │
                          │  ├── PromptHandler /api/sessions     │
                          │  ├── StopHandler   /api/auth         │
                          │  └── SwitchSession                  │
                          └─────────────────┬───────────────────┘
                                            │
                          ┌─────────────────▼───────────────────┐
                          │              Agent                  │
                          │                                      │
                          │  session-service                     │
                          │    创建和管理运行时                   │
                          │                                      │
                          │  event-subscription                   │
                          │    将事件转发到 WebSocket            │
                          │                                      │
                          │  think-parser                         │
                          │    提取模型输出中的 <think> 标签      │
                          │                                      │
                          │  tools/  +  lua-tools/  +  skills/  │
                          │  bash     9 个 Lua 脚本     7 个技能  │
                          └─────────────────┬───────────────────┘
                                            │
                          ┌─────────────────▼───────────────────┐
                          │        SessionManager               │
                          │   持久化会话 → ./sessions/         │
                          └───────────────────────────────────┘

                          ┌───────────────────────────────────┐
                          │     db/sessions_meta (SQLite)      │
                          │  sessionId → sessionFile 映射       │
                          └───────────────────────────────────┘
```

## 项目结构

```
Krebs/
├── server/                    # Krebs 网关
│   ├── index.ts              # Bun.serve() — HTTP + WebSocket 启动
│   ├── session-service.ts     # Agent runtime 工厂 + 会话生命周期
│   ├── event-subscription.ts # 将 Agent 事件转发到 WebSocket
│   ├── think-parser.ts        # 从模型输出中提取 <think> 标签
│   ├── ws-router.ts           # WS 消息路由到各 handler
│   ├── handlers/              # Prompt / Stop / Auth / SwitchSession
│   └── routes/               # /api/messages, /api/sessions, /api/auth
│
├── lib/                      # 共享工具
│   ├── logger.ts             # NORMAL / DEBUG 两种日志模式
│   ├── session-repository.ts  # SessionRepository 接口 + 内存实现
│   └── session-transcript.ts  # 从 Agent 响应中提取内容
│
├── tools/                    # 工具系统
│   ├── lua-runtime.ts        # Lua 5.4 虚拟机（Wasmoon）
│   ├── lua-tools-registry.ts # 自动加载 lua-tools/ 下所有 *.lua
│   └── lua-exec.ts          # 执行命名的 Lua 工具
│
├── lua-tools/                # 9 个 Lua 脚本 — 每个都成为 Agent 可调用的工具
│   ├── file-read.lua
│   ├── file-write.lua
│   ├── json-encode.lua
│   └── ...（时间、字符串、数学工具）
│
├── skills/                   # 7 个技能，Agent 在相关场景下自动读取
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
├── wasm/                      # wasmtime + coreutils
│   ├── bin/wasmtime          # v45.0.1
│   └── coreutils/coreutils.wasm
│
└── prompts/
    └── index.ts              # Agent system prompt（中文）
```

## 沙箱（可选）

启用方式：`createRuntime(sessionId, sessionPath, true)`

**读写分离**：
- **读命令**（`ls`, `cat`, `grep` 等）→ 透传到原生 bash
- **写命令**（`echo`, `mkdir`, `rm` 等）→ 通过 wasmtime + coreutils 沙箱执行

**安全性**：写操作通过 wasmtime `--dir` 限制在 `cwd` 目录。

详见 [docs/sandbox-wasmtime.md](docs/sandbox-wasmtime.md)。

## HTTP API

需要 `Authorization: Bearer <token>` — 首次启动时 token 输出到控制台并写入 `.env`。

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
| `text_delta` | Agent 流式输出 token |
| `think_block` | `<think>` 标签内容 |
| `tool_call_start` | Agent 开始生成工具调用 |
| `tool_start` / `tool_end` | 工具执行开始/结束 |
| `turn_end` | 回合完成 |
| `response_end` | Agent 完整响应结束 |

## Web UI

打开 `http://localhost:3000/`。自动连接 `/ws` 并认证。功能：

- 实时 token 流式输出
- Markdown 渲染 + 代码高亮
- 会话历史侧边栏
- 停止 / 重新生成

## Lua 工具

将 Lua 脚本放入 `lua-tools/`，重启服务器即可。Agent 通过名称调用：

```lua
-- lua-tools/json-encode.lua
function main(args)
  local value = args[1]
  return cjson.encode(value)
end
```

Agent 调用方式：`lua_exec("json-encode", { value })`

## 技能（Skills）

技能是 `SKILL.md` 文件，Agent 在相关场景下自动读取使用。共 7 个，见 `skills/index.ts`。

## 技术栈

Bun · TypeScript · React 19 · bun:sqlite · WebSocket · Wasmoon (Lua 5.4)
