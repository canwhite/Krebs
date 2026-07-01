# 429 Rate Limit 处理方案

> 实现文档 — 2026-07-01

---

## 架构概览

```
PromptHandler                      event-subscription.ts
┌──────────────────────┐          ┌──────────────────────────────────────────┐
│ 收到 prompt 消息       │          │  订阅 session.subscribe(events)            │
│  保存 lastPrompt      │          │                                          │
│  检查 retryState      │          │  ┌─ message ──────────► 429 检测          │
│  检查 isRetrying     │          │  │     stopReason=error?   │               │
│  调用 session.prompt()│          │  │         ↓                              │
└──────────────────────┘          │  │    isRateLimit?                       │
                                  │  │         ↓                              │
                                  │  │  ws.data.retryState = {...}           │
                                  │  │  startRetryDelay()                     │
                                  │  │    └─ setTimeout(delayMs)             │
                                  │  │         └─ abort() → prompt(savedPrompt)│
                                  │  └──────────────────────────────────────────┘
                                  │
                                  │  ws-router.ts: abort_retry case
                                  │    └─ clearTimeout → ws.data.retryState = null
```

---

## 核心状态

### ws.data.retryState

```typescript
interface RetryState {
  prompt: string;        // 被 429 的 prompt
  attempt: number;       // 当前尝试次数（从 1 开始）
  maxAttempts: number;   // 最大尝试次数（默认 3）
  delays: number[];      // 退避延迟数组 [2000, 4000, 8000]（ms）
  timer: any;            // setTimeout handle，用于取消
}
```

### SharedState（event-subscription.ts 内部）

```typescript
interface SharedState {
  hasSentResponseStart: boolean;  // 是否已发 response_start
  hasSentResponseEnd: boolean;   // 是否已发 response_end（防止重复）
  messageStartTime: number | null;
  textDeltas: string[];
  isProcessingMessageEnd: boolean; // guard：防止并发 message_end
}
```

---

## 429 检测流程

```
pi-coding-agent 发出 type:"message" stopReason:"error"
                              │
                              ▼
              ┌───────────────────────────────┐
              │  isRateLimitError(errMsg)       │
              │  包含 "429" | "rate limit"     │
              │  | "too many requests"          │
              └───────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          │ retryState 不存在（首次 429）         │
          │  lastPrompt 有值？                    │
          │    ├─ 有：初始化 retryState          │
          │    │     startRetryDelay()            │
          │    └─ 无：handleRetryFailure(0)     │
          │         → abort() + retry_failed     │
          │                                       │
          │ retryState 存在（再次 429）           │
          │  attempt < maxAttempts？              │
          │    ├─ 是：attempt++                  │
          │    │   startRetryDelay()             │
          │    └─ 否：handleRetryFailure()       │
          │         → abort() + retry_failed     │
          └───────────────────────────────────────┘
```

---

## 重试时序

```
用户 prompt
    │
    ▼
session.prompt()
    │
    ├─ 成功 → message_end(stopReason≠error)
    │         └─ retryState 被清空
    │
    └─ 429 → message(stopReason=error, isRateLimit)
              │
              ▼
         startRetryDelay()
              │
              ├─ 发 WS { type: "rate_limited", attempt:1/3, delayAfter:2 }
              │
              └─ setTimeout(2000ms)
                        │
                        ├─ abort() 停止当前 agent
                        ├─ session.prompt(lastPrompt)
                        │
                        ├─ 成功 → message_end → retryState 清空
                        │            WS { type: "retry_success" }
                        │
                        └─ 又 429 → attempt=2 → startRetryDelay()
                                          └─ setTimeout(4000ms)
                                                    └─ ...（最多3次）
```

---

## PromptHandler.ts 关键逻辑

```typescript
handle(ws, message) {
  // 1. 保存 lastPrompt（retry 时需要）
  (ws as any).data.lastPrompt = message.message;

  // 2. 检查 retryState（自己管理的重试状态）
  const retryState = (ws as any).data?.retryState;
  if (retryState) {
    ws.send({ type: "rate_limited", attempt: retryState.attempt, ... });
    return; // 拒绝新 prompt，避免排队
  }

  // 3. 检查 pi-agent 内部重试状态
  if (session.isRetrying) {
    ws.send({ type: "rate_limited", message: "正在等待 API 重试" });
    return;
  }

  // 4. 正常流程
  if (session.isStreaming) {
    session.followUp(message.message); // 排队
  } else {
    session.prompt(message.message);
  }
}
```

---

## event-subscription.ts 关键逻辑

### 429 检测（subscribe 回调开头）

```typescript
const ev = event as any;
if (ev.type === "message" && ev.stopReason === "error") {
  if (isRateLimitError(ev.errorMessage)) {
    // 首次 429 → 初始化
    if (!retryState) { ... startRetryDelay(); return; }
    // 再次 429 → attempt++ 继续
    if (retryState.attempt < retryState.maxAttempts) { ... startRetryDelay(); return; }
    // 超过最大次数 → 彻底失败
    handleRetryFailure(...); return;
  }
}
```

### 成功响应时清理 retryState

```typescript
if (event.type === "message_end") {
  const msgEvent = event as any;
  const retryState = ws.data?.retryState;
  if (retryState && msgEvent.stopReason !== "error") {
    if (retryState.timer) clearTimeout(retryState.timer);
    ws.data.retryState = null;  // 非 error 响应说明 retry 成功
  }
}
```

### handleRetryFailure

```typescript
async function handleRetryFailure(ws, session, errMsg, sessionEndHandler, attempt) {
  // 1. 清理 timer + retryState
  if (currentRetryState?.timer) clearTimeout(currentRetryState.timer);
  ws.data.retryState = null;

  // 2. abort session
  try {
    await session.abort();  // 成功 → 触发 agent_end → onAgentEnd() 发 response_end
  } catch (e) {
    sessionEndHandler.onAgentEnd();  // 失败 → 手动兜底发 response_end
  }

  // 3. 通知用户
  ws.send({ type: "retry_failed", attempt, finalError: errMsg });
}
```

### startRetryDelay

```typescript
function startRetryDelay(ws, session, sessionEndHandler) {
  const { delays, attempt, maxAttempts } = ws.data.retryState;
  const delayMs = delays[attempt - 1];

  // 发 rate_limited 通知
  ws.send({ type: "rate_limited", attempt, maxAttempts, retryAfter: delayMs/1000, ... });

  // 设置 timer
  retryState.timer = setTimeout(async () => {
    try {
      await session.abort();              // 停止当前
      if (session.isStreaming)
        await new Promise(r => setTimeout(r, 100)); // 等 idle
      await session.prompt(savedPrompt);  // 重发 prompt
    } catch (err) {
      handleRetryFailure(...);
    }
  }, delayMs);
}
```

---

## ws-router.ts abort_retry

```typescript
case "abort_retry": {
  const retryState = (ws as any).data?.retryState;
  if (retryState?.timer) {
    clearTimeout(retryState.timer);
  }
  (ws as any).data.retryState = null;
  ws.send(JSON.stringify({ type: "retry_aborted" }));
  break;
}
```

---

## WS 消息协议

| 方向 | type | 字段 | 说明 |
|------|------|------|------|
| Server → Client | `rate_limited` | `attempt`, `maxAttempts`, `retryAfter`, `message` | 限流通知，告知用户等待 |
| Server → Client | `retry_success` | `attempt` | 重试成功，响应已发出 |
| Server → Client | `retry_failed` | `attempt`, `finalError` | 重试彻底失败 |
| Server → Client | `retry_aborted` | — | 用户中止重试 |
| Client → Server | `abort_retry` | — | 用户请求中止重试 |

---

## 关键设计决策

### 自建 retry 状态 vs pi-agent 内置 retry

pi-coding-agent 有 `auto_retry_start/end` 事件，但存在以下问题：
- `auto_retry_end(success=false)` 在 `agent_end` **之后**才发出（事件顺序问题）
- pi-agent 的 retry 在 prompt 之前，不保留 prompt 上下文

因此采用自建 `ws.data.retryState`：
- 在 PromptHandler 层保存 `lastPrompt`
- 在 session 事件中检测 429，手动用 timer + `session.prompt(lastPrompt)` 重试
- pi-agent 的 `auto_retry_start/end` 事件仅用于转发给前端（不用于控制流程）

### 为什么不用 pi-agent 内置 retry

1. pi-agent 的 retry 由 `session.prompt()` 内部触发，不保留 prompt
2. retry 前后 session 状态需要正确清理（timer、retryState）
3. 需要在 retry 期间拒绝新 prompt，避免排队混乱

### hasSentResponseEnd 防重

`handleRetryFailure` 中 `session.abort()` 成功时会触发 `agent_end` → `onAgentEnd()` → 发 `response_end`。此时 `hasSentResponseEnd` 已被设为 true，下次 `onAgentEnd()` 调用直接 return，保证 `response_end` 只发一次。

---

## 验证标准

| 场景 | 预期结果 |
|------|---------|
| 429 首次 | 前端收到 `rate_limited` (attempt:1/3, retryAfter:2) |
| 429 第2次 | 前端收到 `rate_limited` (attempt:2/3, retryAfter:4) |
| 429 第3次 | 前端收到 `rate_limited` (attempt:3/3, retryAfter:8) |
| 429 第4次 | 前端收到 `retry_failed`，session 结束 |
| retry 成功 | 前端收到 `retry_success` |
| retry 期间发 prompt | 前端收到 `rate_limited`，prompt 被拒绝 |
| abort_retry | 前端收到 `retry_aborted` |
