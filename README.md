# Krebs

### AI Gateway — General Purpose Assistant

A self-hosted AI gateway with an embedded **general-purpose agent** at its core. Supports conversation, task execution, tool calling, and context compression.

**Not a coding tool — any task requiring AI assistance works.**

## Features

- **General Purpose Agent** — Stateful AI assistant with multi-turn dialogue, tool execution, and skill invocation
- **Context Compression** — Intelligent compression to break token limits (via pi-coding-agent)
  - Micro Compact (70%): Tool result pruning
  - Context Collapse (75%): Deep dialogue summarization to projection
  - Auto Compact (83.5%): Built into pi-coding-agent, aggressive compression near limit
- **Browser UI** — Real-time chat, Markdown rendering, no account needed
- **HTTP API** — One `POST /api/messages`, suitable for CI/CD, scripts, tool integration
- **WebSocket API** — Stream tokens and tool events in real-time
- **Persistent Sessions** — Resume any past conversation by `sessionId`
- **Multi-Model** — Switch between DeepSeek / Claude with one env var
- **Sandbox** — Optional wasmtime + coreutils sandbox (read-write separation)
- **Lua Tools** — Drop a `.lua` in `lua-tools/`, agent can call it immediately (9 built-in)
- **Skills** — 7 built-in skills the agent reads in relevant contexts

## Quick Start

```bash
bun install
export DEEPSEEK_API_KEY=your_key
bun run server/index.ts
open http://localhost:3333
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | — | DeepSeek API key (recommended) |
| `ANTHROPIC_API_KEY` | — | Alternative: Anthropic API key |
| `PORT` | `3333` | HTTP/WebSocket port |
| `MODEL_PROVIDER` | `deepseek` | `deepseek`, `anthropic`, or `ollama` |
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
                          │          Krebs Gateway               │
                          │                                       │
                          │  ws-router        HTTP routes          │
                          │  ├── AuthHandler   /api/messages     │
                          │  ├── PromptHandler /api/sessions      │
                          │  ├── StopHandler   /api/auth         │
                          │  └── SwitchSession                     │
                          └─────────────────┬───────────────────┘
                                            │
                          ┌─────────────────▼───────────────────┐
                          │              Agent                      │
                          │                                        │
                          │  session-service                       │
                          │    creates / manages runtime            │
                          │                                        │
                          │  .pi/extensions/                       │
                          │    └── context/         上下文压缩    │
                          │                                        │
                          │  event-subscription                    │
                          │    forwards events → WebSocket         │
                          │                                        │
                          │  tools/  +  lua-tools/  +  skills/   │
                          │  bash      9 Lua scripts     7 skills │
                          └────────────────────────────────────────┘
                                            │
                          ┌─────────────────▼───────────────────┐
                          │        SessionManager                   │
                          │   persists sessions → ./sessions/      │
                          └───────────────────────────────────────┘

                          ┌───────────────────────────────────┐
                          │     db/sessions_meta (SQLite)       │
                          │  sessionId → sessionFile mapping    │
                          └───────────────────────────────────┘
```

## Context Compression Layers

When token usage reaches thresholds, compression triggers automatically:

| Layer | Threshold | Trigger | Action |
|-------|-----------|---------|--------|
| Micro Compact | 70% | Too many tool results | Prune old tool outputs, keep key info |
| Context Collapse | 75% | Context too long | Compress middle dialogue into summary projection |
| Auto Compact | 83.5% | Near limit | Built into pi-coding-agent, aggressive compression |

## Project Structure

```
Krebs/
├── server/                    # Krebs gateway
│   ├── index.ts             # Bun.serve() — HTTP + WebSocket bootstrap
│   ├── session-service.ts   # Agent runtime factory + session lifecycle
│   ├── event-subscription.ts # Forwards agent events over WebSocket
│   ├── ws-router.ts        # Route WS messages to handlers
│   ├── handlers/           # Prompt / Stop / Auth / SwitchSession
│   ├── routes/              # /api/messages, /api/sessions, /api/auth
│   └── services/
│       └── compact/         # Context compression services
│           ├── microCompact.ts    # Micro Compact
│           └── contextCollapse.ts # Context Collapse
│
├── .pi/                     # Pi Agent extensions
│   └── extensions/
│       └── context/         # Context compression hook
│
├── lib/                     # Shared utilities
│   ├── logger.ts           # NORMAL / DEBUG logging
│   ├── session-repository.ts # SessionRepository interface + in-memory impl
│   └── session-transcript.ts # Extract content from agent responses
│
├── tools/                   # Tool system
│   ├── lua-runtime.ts      # Lua 5.4 VM (Wasmoon)
│   ├── lua-tools-registry.ts # Auto-load *.lua from lua-tools/
│   └── lua-exec.ts        # Execute named Lua tools
│
├── lua-tools/               # 9 Lua scripts
│   ├── file-read.lua
│   ├── file-write.lua
│   └── ... (datetime, string, math utilities)
│
├── skills/                  # 7 skills
│   ├── web-search-tool/
│   ├── json-output-optimizer/
│   ├── resume-optimizer/
│   └── ...
│
├── frontend/
│   ├── chat.html          # HTML shell + styles
│   └── chat.tsx           # React 19 app
│
├── db/
│   └── index.ts           # SQLite
│
└── prompts/
    └── index.ts           # Agent system prompt (Chinese)
```

## HTTP API

Requires `Authorization: Bearer <token>` — token printed to console on first start and saved to `.env`.

### Send a message

```bash
curl -X POST http://localhost:3333/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Help me plan a trip to Japan"}'
```

Returns `{sessionId, response, generatedContent}`.

### Resume a session

```bash
curl -X POST http://localhost:3333/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "Continue", "sessionId": "session_xxx"}'
```

### Session management

```bash
curl http://localhost:3333/api/sessions/list -H "Authorization: Bearer $TOKEN"
curl http://localhost:3333/api/sessions/:sessionId -H "Authorization: Bearer $TOKEN"
curl -X DELETE http://localhost:3333/api/sessions/:sessionId -H "Authorization: Bearer $TOKEN"
```

## WebSocket API

```javascript
const ws = new WebSocket("ws://localhost:3333/ws");
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
|--------|------|
| `connected` | Connection open |
| `text_delta` | Streaming token from agent |
| `think_block` | `<think>` tag content |
| `tool_call_start` | Agent started generating a tool call |
| `tool_start` / `tool_end` | Tool execution |
| `turn_end` | Round complete |
| `response_end` | Full agent response done |

## Web UI

Open `http://localhost:3333/`. Connects to `/ws`, authenticates automatically. Features:

- Real-time token streaming
- Markdown rendering
- Session history sidebar
- Stop / restart generation

## Lua Tools

Drop a Lua script into `lua-tools/`, restart the server. Agent can call it by name:

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

### AI 网关 — 通用智能助手

自托管 AI 网关，内置**通用 Agent** 作为核心。支持对话、任务执行、工具调用、上下文压缩。

**不是编程工具，任何需要 AI 协助的任务都能用。**

## 特性

- **通用 Agent** — 有状态的 AI 助手，支持多轮对话、工具执行、技能调用
- **上下文压缩** — 智能压缩上下文，突破 token 限制（通过 pi-coding-agent）
  - Micro Compact (70%): 工具结果精简
  - Context Collapse (75%): 深层对话摘要为投影
  - Auto Compact (83.5%): 内置在 pi-coding-agent，接近上限时激进压缩
- **浏览器界面** — 实时聊天，Markdown 渲染，无需账号
- **HTTP API** — 一次 `POST /api/messages`，适合 CI/CD、脚本、工具集成
- **WebSocket API** — 实时流式返回 token 和工具执行事件
- **会话持久化** — 通过 `sessionId` 随时恢复历史对话
- **多模型** — 改一个环境变量即可切换 DeepSeek / Claude
- **沙箱** — 可选的 wasmtime + coreutils 沙箱（读写分离）
- **Lua 工具** — 放一个 `.lua` 文件到 `lua-tools/`，Agent 立即可用（共 9 个内置）
- **技能系统** — 7 个内置技能，Agent 在相关场景下自动读取

## 快速开始

```bash
bun install
export DEEPSEEK_API_KEY=your_key
bun run server/index.ts
open http://localhost:3333
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DEEPSEEK_API_KEY` | — | DeepSeek API key（推荐） |
| `ANTHROPIC_API_KEY` | — | 备选：Anthropic API key |
| `PORT` | `3333` | HTTP/WebSocket 端口 |
| `MODEL_PROVIDER` | `deepseek` | `deepseek`、`anthropic` 或 `ollama` |
| `MODEL_BASE_URL` | `https://api.deepseek.com/v1` | 自定义模型端点 |
| `MODEL_ID` | `deepseek-chat` | 模型名称 |
| `SESSION_TIMEOUT_MS` | `480000` | Agent 最大运行时间（8 分钟） |

## 上下文压缩层级

当 token 用量达到阈值时，自动触发压缩：

| 层级 | 阈值 | 触发条件 | 动作 |
|------|------|---------|------|
| Micro Compact | 70% | 工具结果过多 | 精简旧工具输出，保留关键信息 |
| Context Collapse | 75% | 上下文过长 | 将中间对话压缩为摘要投影 |
| Auto Compact | 83.5% | 接近上限 | 内置在 pi-coding-agent，接近限制时激进压缩 |

## 项目结构

```
Krebs/
├── server/                    # Krebs 网关
│   ├── index.ts             # Bun.serve() — HTTP + WebSocket 启动
│   ├── session-service.ts   # Agent runtime 工厂 + 会话生命周期
│   ├── event-subscription.ts # 将 Agent 事件转发到 WebSocket
│   ├── ws-router.ts        # WS 消息路由到各 handler
│   ├── handlers/           # Prompt / Stop / Auth / SwitchSession
│   ├── routes/             # /api/messages, /api/sessions, /api/auth
│   └── services/
│       └── compact/         # 上下文压缩服务
│           ├── microCompact.ts    # Micro Compact
│           └── contextCollapse.ts # Context Collapse
│
├── .pi/                     # Pi Agent 扩展
│   └── extensions/
│       └── context/         # 上下文压缩 hook
│
├── lib/                     # 共享工具
│   ├── logger.ts           # NORMAL / DEBUG 两种日志模式
│   ├── session-repository.ts # SessionRepository 接口 + 内存实现
│   └── session-transcript.ts # 从 Agent 响应中提取内容
│
├── tools/                   # 工具系统
│   ├── lua-runtime.ts      # Lua 5.4 虚拟机（Wasmoon）
│   ├── lua-tools-registry.ts # 自动加载 lua-tools/ 下所有 *.lua
│   └── lua-exec.ts        # 执行命名的 Lua 工具
│
├── lua-tools/               # 9 个 Lua 脚本
│   ├── file-read.lua
│   ├── file-write.lua
│   └── ...（时间、字符串、数学等）
│
├── skills/                  # 7 个技能
│   ├── web-search-tool/
│   ├── json-output-optimizer/
│   ├── resume-optimizer/
│   └── ...
│
├── frontend/
│   ├── chat.html          # HTML 壳 + 样式
│   └── chat.tsx           # React 19 应用
│
├── db/
│   └── index.ts           # SQLite
│
└── prompts/
    └── index.ts           # Agent system prompt（中文）
```

## HTTP API

需要 `Authorization: Bearer <token>` — 首次启动时 token 输出到控制台并写入 `.env`。

### 发送消息

```bash
curl -X POST http://localhost:3333/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "帮我规划一次日本旅行"}'
```

返回 `{sessionId, response, generatedContent}`。

### 恢复会话

```bash
curl -X POST http://localhost:3333/api/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "继续", "sessionId": "session_xxx"}'
```

### 会话管理

```bash
curl http://localhost:3333/api/sessions/list -H "Authorization: Bearer $TOKEN"
curl http://localhost:3333/api/sessions/:sessionId -H "Authorization: Bearer $TOKEN"
curl -X DELETE http://localhost:3333/api/sessions/:sessionId -H "Authorization: Bearer $TOKEN"
```

## WebSocket API

```javascript
const ws = new WebSocket("ws://localhost:3333/ws");
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

打开 `http://localhost:3333/`。自动连接 `/ws` 并认证。功能：

- 实时 token 流式输出
- Markdown 渲染
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
