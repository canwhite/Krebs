# Plan: Fix 429 Handling - Auto Retry with Exponential Backoff

> Status: Draft

---

## 问题现象

1. 429 发生时，收到的是普通 `message` 事件带 `stopReason: "error"` 和 `errorMessage: "429 status code (no body)"`
2. `auto_retry_start` / `auto_retry_end` 事件从未触发
3. 4 次 429 后 session 卡死——没有 `agent_end`，无法接收新 prompt
4. 用户等了 33 分钟手动发 "继续" 才恢复

---

## 根因分析

### pi-coding-agent 内部 retry 机制分析

```
_willRetryAfterAgentEnd(event):
  - settings.enabled 默认为 true
  - settings.maxRetries 默认为 3
  - _retryAttempt 从 0 开始
  - 检查 _retryAttempt < maxRetries
  - 遍历 event.messages 找最后一个 assistant message
  - 调用 _isRetryableError(message)

_isRetryableError(message):
  - stopReason 必须是 "error"
  - errorMessage 必须存在
  - 不能是 context overflow 或 billing 错误
  - errorMessage 必须匹配 /429|rate.?limit|.../ 正则

问题：
  429 错误被 provider 层处理后，agent 层可能只看到"无内容"的响应，
  导致 _willRetryAfterAgentEnd() 返回 false，retry 不发生
```

### 关键代码位置

| 文件 | 行 | 问题 |
|------|-----|------|
| `event-subscription.ts` | 249-272 | 写好了 `auto_retry_*` 处理，但事件从不触发 |
| `PromptHandler.ts` | 30 | 检查 `session.isRetrying`，但此属性从不 true |
| `pi-coding-agent` 内部 | `_willRetryAfterAgentEnd()` | retry 检查可能返回 false |
| `pi-coding-agent` 内部 | `_isRetryableError()` | 429 应该匹配，但可能未被调用 |

---

## 重新设计方案 A：自己实现 429 Auto Retry

### 核心思路

**不依赖 pi-coding-agent 的 auto_retry_* 事件**，而是自己实现完整的 retry 逻辑：

1. 监听 `message` 事件的 `stopReason: "error"` 且 errorMessage 含 "429"
2. 保存当前 prompt 到 `ws.data.retryState`
3. 自己实现指数退避重试（2s, 4s, 8s，最多 3 次）
4. 通过 `session.abort()` + `session.prompt()` 重发原始请求
5. 通知前端 rate_limited 状态和进度
6. retry 期间拒绝新 prompt
7. 彻底失败后 `session.abort()` 恢复 session + 通知用户

### 指数退避策略

```
attempt 1: 等待 2s  → 重试
attempt 2: 等待 4s  → 重试
attempt 3: 等待 8s  → 重试
attempt 4: 放弃      → retry_failed + session.abort() 恢复 session
```

### Retry State 结构

```typescript
interface RetryState {
  prompt: string;           // 原始 prompt 内容
  attempt: number;          // 当前尝试次数（1-based）
  maxAttempts: number;      // 最大尝试次数（默认 3）
  delays: number[];         // 退避延迟数组 [2000, 4000, 8000]
  timer: ReturnType<typeof setTimeout> | null;  // 当前 timer
}
```

### 数据流

```
429 错误发生
    ↓
event-subscription 检测到 stopReason: error + "429"
    ↓
检查 ws.data.retryState
  - 如果不存在：首次 429，初始化 retryState，发送 rate_limited，启动 timer
  - 如果存在：在 retry 流程中，说明上次 timer 到期后的重试也 429 了
    ↓
timer 到期
    ↓
调用 session.abort() 终止当前 session 状态
调用 session.prompt(savedPrompt) 重发原始请求
    ↓
如果再次 429：
  - attempt < maxAttempts：increment attempt，发送 rate_limited，启动下一个 timer
  - attempt >= maxAttempts：
      → session.abort() 尝试恢复 session
      → abort 成功会触发 agent_end → sessionEndHandler.onAgentEnd()
      → abort 失败则手动调 sessionEndHandler.onAgentEnd() 兜底
      → 发送 retry_failed 通知用户
```

---

## Pre-Mortem v4（深度分析）

### 源码发现

#### 发现 1：`session.abort()` 是 async 的，必须 await

```javascript
// pi-coding-agent 源码
async abort() {
    this.abortRetry();
    this.agent.abort();
    await this.agent.waitForIdle();  // <-- 异步等待！
}
```

#### 发现 2：`session.prompt()` 在 streaming 时必须传 `streamingBehavior`

```javascript
// pi-coding-agent 源码
if (this.isStreaming) {
    if (!options?.streamingBehavior) {
        throw new Error("Agent is already processing. Specify streamingBehavior ('steer' or 'followUp') to queue the message.");
    }
}
```

#### 发现 3：429 事件之间没有 `message_end`

Session log 显示 4 个 429 事件连续发生（04:42:55 → 04:42:57 → 04:43:01 → 04:43:10），**没有 `message_end` 事件穿插其中**。

#### 发现 4：`session.abort()` 成功后触发 `agent_end` 事件

`session.abort()` 会触发完整的 agent 结束流程，包括 `agent_end` 事件 → `sessionEndHandler.onAgentEnd()` 会被自动调用。

### 风险评估

| # | 如果... | 后果 | 概率 | 严重度 |
|---|--------|------|------|--------|
| P1 | `session.abort()` 没有 await，`session.prompt()` 在 streaming 状态被调用 | prompt 抛出 "Agent is already processing" 错误 | 高 | 高 |
| P2 | `session.abort()` 后 `isStreaming` 还未 false 就调用 `prompt()` | 同 P1 | 中 | 高 |
| P3 | `lastPrompt` 为空（从未保存） | retry 时无内容可重发，直接失败 | 低 | 中 |
| P4 | retry 期间 ws 断开 | timer 继续运行，retry 失败后无意义，可能导致 zombie session | 低 | 中 |
| P5 | retry 期间 ws 重连 | 旧 ws 的 retryState 丢失，新 ws 无 retryState，可能出现双写 | 低 | 高 |
| P6 | `message_end` 在 retry timer 期间到达，清理了 retryState | 后续 429 被当作首次 429，attempt 重置为 1 | 中 | 中 |
| P7 | `turn_end` 和 `message_end` 都触发 retryState 清理 | 重复清理，但无严重影响 | 低 | 低 |
| P8 | `session.abort()` 在 retry 失败时也失败（session 已彻底卡死） | 手动调 `sessionEndHandler.onAgentEnd()` 兜底 | 低 | 中 |
| P9 | 用户在 retry 期间发 `abort_retry` | timer 取消，但如果 abort 已经在运行，prompt 可能在 abort 完成前发出 | 低 | 中 |
| P10 | `session.prompt()` 抛出非 429 错误（比如网络错误） | 被当作 retry_failed，但实际不是 429 | 低 | 低 |
| P11 | provider 的 429 body 不包含 "429" 字符串 | 429 未被捕获，走原有错误流程 | 低 | 高 |
| P12 | 429 后 session 被其他 client 接管 | retry 逻辑作用于错误的对象 | 极低 | 高 |

---

## 最终实现方案

### 改动点 1：ws-router.ts — abort_retry 增强

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

### 改动点 2：event-subscription.ts — 429 retry 逻辑

```typescript
function isRateLimitError(errorMessage: string): boolean {
  const msg = (errorMessage || "").toLowerCase();
  return msg.includes("429") || msg.includes("rate limit") || msg.includes("too many requests");
}

// 处理 429 错误的自动重试
if (event.type === "message" && event.stopReason === "error") {
  const errMsg = event.errorMessage || "";
  if (!isRateLimitError(errMsg)) return;

  const retryState = (ws as any).data?.retryState;
  const session = (ws as any).data?.session;

  if (!retryState) {
    // 首次 429，初始化 retry state
    const lastPrompt = (ws as any).data?.lastPrompt || "";
    if (!lastPrompt) {
      // 没有保存的 prompt，无法重试，走彻底失败流程
      handleRetryFailure(ws, session, errMsg, sessionEndHandler, 0);
      return;
    }
    (ws as any).data.retryState = {
      prompt: lastPrompt,
      attempt: 1,
      maxAttempts: 3,
      delays: [2000, 4000, 8000],
      timer: null,
    };
    startRetryDelay(ws, session);
  } else if (retryState.attempt < retryState.maxAttempts) {
    // retry 中再次 429，增加 attempt，继续
    retryState.attempt++;
    startRetryDelay(ws, session);
  } else {
    // 彻底失败
    handleRetryFailure(ws, session, errMsg, sessionEndHandler, retryState.attempt);
  }
}

// 成功响应时清理 retryState（仅非 error 的响应）
if (event.type === "message_end") {
  const msgEvent = event as any;
  const retryState = (ws as any).data?.retryState;
  if (retryState && msgEvent.stopReason !== "error") {
    if (retryState.timer) clearTimeout(retryState.timer);
    (ws as any).data.retryState = null;
  }
}

// 彻底失败处理：session.abort() + 通知用户
// 注意：此函数可能被调用时 retryState 已为 null（如 timer 回调 catch 中调用）
async function handleRetryFailure(ws: any, session: any, errMsg: string, sessionEndHandler: any, attempt: number) {
  // 从 ws.data 获取当前的 retryState（可能被其他代码已清空）
  const currentRetryState = (ws as any).data?.retryState;

  // 清理 timer（如存在）
  if (currentRetryState?.timer) {
    clearTimeout(currentRetryState.timer);
  }
  // 清理 retryState
  (ws as any).data.retryState = null;

  try {
    // 尝试 abort，成功会触发 agent_end → sessionEndHandler.onAgentEnd()
    await session.abort();
  } catch (e) {
    // abort 失败（session 已卡死），手动触发 handler 兜底
    sessionEndHandler.onAgentEnd();
  }

  // 通知用户
  ws.send(JSON.stringify({
    type: "retry_failed",
    attempt,
    finalError: errMsg,
  }));
}

function startRetryDelay(ws: any, session: any) {
  const retryState = (ws as any).data?.retryState;
  const delayMs = retryState.delays[retryState.attempt - 1];
  const attempt = retryState.attempt;
  const maxAttempts = retryState.maxAttempts;

  ws.send(JSON.stringify({
    type: "rate_limited",
    attempt,
    maxAttempts,
    retryAfter: delayMs / 1000,
    message: `API 限流，${delayMs / 1000}s 后自动重试 (${attempt}/${maxAttempts})`,
  }));

  if (retryState.timer) clearTimeout(retryState.timer);

  retryState.timer = setTimeout(async () => {
    retryState.timer = null;
    const savedPrompt = retryState.prompt;
    const currentAttempt = retryState.attempt;
    if (!savedPrompt) {
      handleRetryFailure(ws, session, "no saved prompt", sessionEndHandler, currentAttempt);
      return;
    }
    try {
      // 必须 await abort，等待 agent 完全停止
      await session.abort();
      // 确保 agent 完全 idle
      if (session.isStreaming) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      await session.prompt(savedPrompt);
    } catch (err: Error) {
      handleRetryFailure(ws, session, err?.message || "unknown error", sessionEndHandler, currentAttempt);
    }
  }, delayMs);
}
```

### 改动点 3：PromptHandler.ts — 拒绝 retry 期间的新 prompt

```typescript
handle(ws: WebSocket, message: { type: "prompt"; message: string }) {
  const retryState = (ws as any).data?.retryState;

  // 保存 lastPrompt 以便 retry 时使用
  (ws as any).data.lastPrompt = message.message;

  // 如果在 retry 期间，拒绝新 prompt
  if (retryState) {
    ws.send(JSON.stringify({
      type: "rate_limited",
      attempt: retryState.attempt,
      maxAttempts: retryState.maxAttempts,
      retryAfter: 0,
      message: `正在等待 API 重试 (${retryState.attempt}/${retryState.maxAttempts})，请稍后`,
    }));
    return;
  }
  // ... 原有逻辑
}
```

### 改动点 4：server/index.ts — WS 断开时清理 retryState

```typescript
// 在创建 WebSocket 时添加 close 事件监听
ws.addEventListener("close", () => {
  const retryState = (ws as any).data?.retryState;
  if (retryState?.timer) {
    clearTimeout(retryState.timer);
  }
  (ws as any).data.retryState = null;
});
```

---

## 验证标准

| 条件 |
|------|
| 触发 429 后，前端收到 `rate_limited` WS 消息含 `retryAfter` |
| 等待 `retryAfter` 秒后，请求自动重发（必须 await abort 完成） |
| 重发成功时，收到正常的 `response_end`，无 `retry_failed` |
| 重发 3 次都 429 后，收到 `retry_failed`，`session.abort()` 触发 `agent_end` |
| retry 失败后 session 恢复可用（`isStreaming=false`），可接受新 prompt |
| retry 期间发新 prompt，收到 `rate_limited` 而非 `question_queued` |
| 发送 `abort_retry` 后，timer 取消，session 恢复可用 |
| WS 断开后 timer 正确清理，无 zombie retry |
| 非 429 的 error 不触发 retry（如网络超时） |

---

## 优先级

| 优先级 | 改动 | Impact | Effort | 备注 |
|--------|------|--------|--------|------|
| P1 | 改动点 2：429 retry 逻辑（含 handleRetryFailure） | 核心功能 | 中 | 约 100 行 |
| P2 | 改动点 3：PromptHandler 拒绝 retry 中 prompt | 防止状态混乱 | 低 | 约 10 行 |
| P3 | 改动点 4：WS 断开时清理 retryState | 防止 zombie | 低 | 约 5 行 |
| P4 | 改动点 1：ws-router.ts abort_retry 增强 | 用户可主动取消 | 低 | 约 5 行 |
