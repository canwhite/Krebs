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
| 🎯 **Goal Constraint** | Auto-detect conversation drift and inject correction messages |
| ✅ **Self-Verification** | Post-response verification that checks alignment with original task, injects corrections on drift |
| 🤖 **Subagent** | Launch autonomous sub-agents, Task queue, Fleet view, Scheduled recurring tasks |

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
User Message → before_agent_start → BM25 retrieval → Inject relevant past sessions
```

- **Timing**: `before_agent_start` hook (perception phase), once per session
- **Retrieval**: BM25 algorithm matches current query with historical session firstQuestions
- **Injection**: Top-2 relevant sessions (1000 chars each) formatted and injected into systemPrompt
- **Protection**: Skip if context >80% full, skip on intent (restart/clear), 3s timeout

### Goal Constraint (Perception Phase)

```
Context Event → Token threshold detection → Drift detection → Inject correction
```

- **Goal Extraction**: At 25%/40%/55% token thresholds, LLM extracts core goal from conversation history
- **Drift Detection**: BM25 hybrid scoring (keyword weight 0.6 + semantic weight 0.4) compares current dialogue with goal
- **Correction Injection**: On drift detection, prepend `[GOAL CONSTRAINT]` correction message to message list
- **Cooldown**: 3-turn cooldown after correction to prevent over-intervention

### Self-Verification (Post-Response Phase)

```
Agent Response → Verification Check → Correction injection (if drift detected)
```

- **Timing**: After each agent response (skips first 2 turns)
- **Verification**: LLM checks if response aligns with original task/goal
- **Correction**: If misalignment detected, injects `[SELF-VERIFICATION]` correction message
- **Retry**: Up to 5 retries before accepting potentially drifted response

### Subagent (Fleet / Task Management)

The agent can launch autonomous sub-agents, manage tasks, and schedule recurring jobs:

```
Main Agent ──► Agent(task)     ──► Subagent (runs independently)
            ──► TaskExecute    ──► Task (queued, run by subagent)
            ──► Schedule       ──► Recurring job (cron or interval)
            ──► FleetView      ──► See all running agents
```

**Tools available to the agent:**

| Tool | Description |
|:-----|:------------|
| `Agent` | Start a subagent to perform a task |
| `get_subagent_result` | Get result of a completed subagent |
| `steer_subagent` | Send a message to a running subagent |
| `TaskCreate` | Create a named task |
| `TaskExecute` | Execute a task using a subagent |
| `TaskList` / `TaskGet` | List or view task status |
| `TaskUpdate` | Update task status |
| `FleetView` | View all running agents |
| `Schedule` / `CancelSchedule` | Schedule recurring tasks (cron or interval) |
| `LoadCustomAgents` | Load custom agent definitions from `.pi/agents` |
| `CleanupAgents` | Cleanup all agents for this session |

### 429 Retry Handling

API rate limits (HTTP 429) are handled with automatic exponential backoff:

```
429 → retry 1 (2s) → retry 2 (4s) → retry 3 (8s) → fail
```

- **Max attempts**: 3 (configurable)
- **Delays**: Exponential `[2000, 4000, 8000]` ms
- **During retry**: New prompts are rejected with `rate_limited` event
- **User abort**: Send `{ type: "abort_retry" }` to cancel in-progress retry
- **pi-agent retry events**: `auto_retry_start/end` are forwarded to frontend, but control flow uses custom `ws.data.retryState` for accurate prompt preservation

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
                              │  ├── PromptHandler /api/messages   │
                              │  ├── SwitchSession /api/sessions   │
                              │  └── (inlined)     /api/auth       │
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
                              │    ├── goal-constraint/ (Drift)       │
                              │    ├── self-verification/ (Verify)    │
                              │    └── subagent/ (Fleet/Tasks)         │
                              │                                       │
                              │  server/services/                     │
                              │    ├── compact/                      │
                              │    ├── memory/                       │
                              │    ├── session-history/ (BM25+tools) │
                              │    ├── goal-constraint/ (Engine)    │
                              │    ├── self-verification/ (LLM)     │
                              │    └── subagent/ (Fleet/Tasks)       │
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
| `rate_limited` | API 429 — retry in progress |
| `retry_success` | Retry succeeded, response delivered |
| `retry_failed` | All retries exhausted |
| `retry_aborted` | User aborted retry via `abort_retry` message |
| `question_queued` | Follow-up received while agent was streaming |

### Send messages

```javascript
ws.send(JSON.stringify({ type: "prompt", message: "Hello" }));
ws.send(JSON.stringify({ type: "stop" }));
ws.send(JSON.stringify({ type: "abort_retry" }));        // abort in-progress retry
ws.send(JSON.stringify({ type: "switch_session", sessionId: "..." }));
```

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
│   ├── handlers/            # PromptHandler, SwitchSessionHandler (Auth/Stop inlined in ws-router)
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
│       ├── self-verification/  # Post-response LLM verification
│       │   ├── llm.ts       # Verification LLM calls
│       │   └── types.ts     # Result types
│       └── subagent/        # Fleet / task management
│           ├── agent-manager.ts  # Subagent lifecycle
│           ├── scheduler.ts   # Cron/interval job scheduler
│           ├── fleet-view.ts  # Running agents overview
│           ├── custom-agents.ts  # Load from .pi/agents
│           └── types.ts     # Shared types
│
├── .pi/extensions/          # pi-coding-agent hooks
│   ├── context/             # Compression hooks
│   ├── memory/              # Memory consolidation (50% trigger)
│   ├── memory-context/      # Memory injection (session start)
│   ├── session-history-rag/ # Session History RAG (before_agent_start)
│   ├── goal-constraint/    # Goal constraint (context event)
│   ├── self-verification/  # Self-verification (post-response)
│   └── subagent/           # Subagent fleet management
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
