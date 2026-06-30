# Krebs

> A self-hosted AI gateway with a general-purpose agent at its core.

[![Build](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![License](https://img.shields.io/badge/license-MIT-blue)](#)

**Not a coding tool** — any task requiring AI assistance works.

---

## Features

| | | |
|:---|:---|:---|
| 🤖 **General Purpose Agent** | Stateful AI assistant with multi-turn dialogue, tool execution, and skill invocation | |
| 📦 **Context Compression** | Intelligent compression to break token limits (via pi-coding-agent) | |
| 🌐 **Browser UI** | Real-time chat, Markdown rendering, no account needed | |
| 🔌 **HTTP / WebSocket API** | One `POST /api/messages` for CI/CD, scripts, integrations | |
| 💾 **Persistent Sessions** | Resume any past conversation by `sessionId` | |
| 🔧 **Tools & Lua** | Drop a `.lua` in `lua-tools/`, agent can call it immediately | |
| 🧩 **Skills** | 7 built-in skills the agent reads in relevant contexts | |
| 🔄 **Multi-Model** | Switch between DeepSeek / Claude with one env var | |
| 🏖️ **Sandbox** | WASM-based write command sandbox (wasmtime + coreutils) | |
| 🧠 **Memory** | Two-phase memory: 50% trigger consolidation, session start injection | |
| 📚 **Session History RAG** | BM25 retrieval of relevant past sessions at perception phase | |
| 🎯 **Goal Constraint** | Auto-detect conversation drift and inject correction messages | |

### Context Compression Layers

```
Token Usage
    │
    ├── Perception ── Session History RAG ──── Inject relevant past sessions (BM25)
    │
    ├── 50% ─── Memory ───────────── Consolidate to MEMORY.md
    │
    ├── 70% ─── Micro Compact ───── Prune old tool outputs
    │
    ├── 75% ─── Context Collapse ── Summarize dialogue to projection
    │
    └── 83.5% ─ Auto Compact ────── Built into pi-coding-agent

Perception Phase ── Goal Constraint ───────── Monitor drift, inject correction
```

### Sandbox (Write Command Isolation)

Write commands execute in a WASM sandbox via `wasmtime` + `coreutils.wasm`:

| Type | Commands | Routing |
|:-----|:---------|:-------|
| Read | `ls`, `cat`, `grep`, `find` | Passthrough to bash |
| Write | `echo`, `mkdir`, `rm`, `cp`, `mv` | WASM sandbox |

- Sandbox restricts file system access to `cwd` via `--dir` flag
- Read commands bypass sandbox for full shell capabilities
- Only simple commands supported (no pipes, redirects, or chaining)

### Memory (Two-Phase Consolidation)

```
50% Token ──► LLM Summarize ──► MEMORY.md (append)

Session Start ──► Read MEMORY.md ──► Inject into systemPrompt
```

- **Write Phase**: At 50% token usage, LLM generates a summary of recent messages → appends to `MEMORY.md`
- **Read Phase**: On session start, `MEMORY.md` content is injected into agent's system prompt
- **Rollback**: Sessions can invalidate prior consolidations via session entries

### Session History RAG (Perception Phase)

```
User Message → before_agent_start → BM25检索 → 注入相关历史会话
```

- **时机**: `before_agent_start` hook（感知阶段），每 session 只检索一次
- **检索**: BM25 算法匹配当前问题与历史会话的 firstQuestion
- **注入**: top-2 相关会话内容（各1000字符）格式化后注入 systemPrompt
- **保护**: context 已满(>80%)跳过、意图跳过(重新/clear)、3s timeout

### Goal Constraint (Perception Phase)

```
Context Event → Token阈值检测 → 漂移检测 → 注入纠正消息
```

- **目标提取**: 在 25%/40%/55% token 阈值处，LLM 从对话历史提取核心目标
- **漂移检测**: BM25 混合评分（keyword权重0.6 + semantic权重0.4）对比当前对话与目标
- **纠正注入**: 检测到漂移后，在消息列表头部插入 `[GOAL CONSTRAINT]` 纠正消息
- **冷却**: 纠正后进入3轮冷却期，防止过度干预

---

## Quick Start

```bash
bun install
export DEEPSEEK_API_KEY=your_key
bun run server/index.ts
open http://localhost:3333
```

---

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPSEEK_API_KEY` | — | DeepSeek API key (recommended) |
| `ANTHROPIC_API_KEY` | — | Alternative: Anthropic API key |
| `PORT` | `3333` | HTTP/WebSocket port |
| `MODEL_PROVIDER` | `deepseek` | `deepseek` or `anthropic` |
| `MODEL_BASE_URL` | `https://api.deepseek.com/v1` | Custom model endpoint |
| `MODEL_ID` | `deepseek-chat` | Model name |
| `SESSION_TIMEOUT_MS` | `480000` | Max agent run time (8 min) |

---

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
                              │          Krebs Gateway              │
                              │                                    │
                              │  ws-router        HTTP routes       │
                              │  ├── AuthHandler   /api/messages  │
                              │  ├── PromptHandler /api/sessions   │
                              │  ├── StopHandler   /api/auth       │
                              │  └── SwitchSession                  │
                              └─────────────────┬─────────────────┘
                                                │
                              ┌─────────────────▼─────────────────┐
                              │              Agent                   │
                              │                                       │
                              │  session-service                      │
                              │    creates / manages runtime          │
                              │                                       │
                              │  .pi/extensions/                       │
                              │    ├── context/ (Compression)         │
                              │    ├── memory/ (Consolidation 50%)   │
                              │    ├── memory-context/ (Injection)   │
                              │    ├── session-history-rag/ (RAG)    │
                              │    └── goal-constraint/ (Drift)       │
                              │                                       │
                              │  server/services/                     │
                              │    ├── compact/                      │
                              │    ├── memory/                       │
                              │    ├── session-history/ (BM25+tools) │
                              │    └── goal-constraint/ (Engine)     │
                              │                                       │
                              │  server/sandbox/                       │
                              │    └── wasmtime + coreutils.wasm     │
                              │                                       │
                              │  event-subscription                   │
                              │    forwards events → WebSocket        │
                              │                                       │
                              │  tools/  +  lua-tools/  +  skills/  │
                              │  bash      9 Lua scripts     7 skills│
                              └───────────────────────────────────────┘
                                                │
                              ┌─────────────────▼───────────────────┐
                              │        SessionManager                 │
                              │   persists sessions → ./sessions/    │
                              └─────────────────────────────────────┘

                              ┌─────────────────────────────────────┐
                              │     db/sessions_meta (SQLite)         │
                              │  sessionId → sessionFile mapping     │
                              └─────────────────────────────────────┘
```

---

## Context Compression Layers

When token usage reaches thresholds, compression triggers automatically:

| Layer | Threshold | Trigger | Action |
|:------|:----------|:--------|:-------|
| Memory | 50% | Token budget half-used | LLM summarizes recent messages → `MEMORY.md` |
| Micro Compact | 70% | Too many tool results | Prune old tool outputs, keep key info |
| Context Collapse | 75% | Context too long | Compress middle dialogue into summary projection |
| Auto Compact | 83.5% | Near limit | Built into pi-coding-agent, aggressive compression |

---

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
# List all sessions
curl http://localhost:3333/api/sessions/list -H "Authorization: Bearer $TOKEN"

# Get session details
curl http://localhost:3333/api/sessions/:sessionId -H "Authorization: Bearer $TOKEN"

# Delete a session
curl -X DELETE http://localhost:3333/api/sessions/:sessionId -H "Authorization: Bearer $TOKEN"
```

---

## WebSocket API

```javascript
const ws = new WebSocket("ws://localhost:3333/ws");
ws.onopen = () => ws.send(JSON.stringify({ type: "auth" }));
```

**Send messages:**

```javascript
ws.send(JSON.stringify({ type: "prompt", message: "Hello" }));
ws.send(JSON.stringify({ type: "stop" }));
ws.send(JSON.stringify({ type: "switch_session", sessionId: "..." }));
```

**Receive events:**

| Event | When |
|:------|:-----|
| `connected` | Connection open |
| `text_delta` | Streaming token from agent |
| `think_block` | `<think>` tag content |
| `tool_call_start` | Agent started generating a tool call |
| `tool_start` / `tool_end` | Tool execution |
| `turn_end` | Round complete |
| `response_end` | Full agent response done |

---

## Web UI

Open `http://localhost:3333/`. Connects to `/ws`, authenticates automatically.

- Real-time token streaming
- Markdown rendering
- Session history sidebar
- Stop / restart generation

---

## Lua Tools

Drop a Lua script into `lua-tools/`, restart the server. Agent can call it by name.

```lua
-- lua-tools/json-encode.lua
function main(args)
  local value = args[1]
  return cjson.encode(value)
end
```

Agent calls it as `lua_exec("json-encode", { value })`.

---

## Skills

Skills are `SKILL.md` files the agent reads when relevant. All 7 are listed in `skills/index.ts`.

---

## Project Structure

```
Krebs/
├── server/
│   ├── index.ts              # Bun.serve() bootstrap
│   ├── session-service.ts   # Runtime factory + lifecycle
│   ├── event-subscription.ts # Events → WebSocket
│   ├── ws-router.ts         # WS message routing
│   ├── handlers/            # Prompt / Stop / Auth / SwitchSession
│   ├── sandbox/             # WASM sandbox for write commands
│   │   ├── executor.ts      # wasmtime + coreutils runner
│   │   └── tools/bash.ts    # Sandbox bash tool
│   └── services/
│       ├── compact/          # Context compression
│       │   ├── microCompact.ts
│       │   └── contextCollapse.ts
│       ├── memory/           # Memory consolidation
│       │   ├── engine.ts     # LLM summary generation
│       │   ├── storage.ts    # MEMORY.md read/write
│       │   ├── llm.ts       # LLM calls
│       │   └── types.ts     # Constants & types
│       ├── session-history/  # Session History RAG
│       │   ├── bm25.ts      # BM25 algorithm + tokenizer
│       │   ├── indexer.ts   # Index build + cache
│       │   ├── storage.ts   # Content extraction
│       │   └── types.ts     # Type definitions
│       └── goal-constraint/  # Goal constraint
│           ├── engine.ts     # Drift detection engine
│           ├── llm.ts       # LLM goal extraction
│           ├── semantic.ts   # Hybrid scoring
│           ├── storage.ts   # Persistence
│           └── types.ts     # Constants & types
│
├── .pi/extensions/          # pi-coding-agent hooks
│   ├── context/             # Compression hooks
│   ├── memory/              # Memory consolidation (50% trigger)
│   ├── memory-context/      # Memory injection (session start)
│   ├── session-history-rag/ # Session History RAG (before_agent_start)
│   └── goal-constraint/    # Goal constraint (context event)
│
├── lib/                     # Shared utilities
│
├── tools/                   # Tool system
│   └── lua-*.ts
│
├── lua-tools/               # 9 Lua scripts
│
├── skills/                  # 7 skills
│
├── frontend/                # React 19 app
│
├── db/                      # SQLite
│
├── wasm/                    # wasmtime + coreutils.wasm
│
└── prompts/                # System prompt
```

---

## Tech Stack

<p>

 Bun · TypeScript · React 19 · bun:sqlite · WebSocket · Wasmoon (Lua 5.4)

</p>
