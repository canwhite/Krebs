# Plan: Bash Sandbox + 429 Rate Limit 体验优化

> Pre-Mortem + Solutions (v3 — corrected)

---

## 关键验证结果

### wasmtime 根因确认（实测）

```bash
# ❌ 错误格式 — 根因
wasmtime --dir /path coreutils.wasm mkdir dir
# → "failed to find a pre-opened file descriptor"

# ✅ 正确格式 — 只需加 ::/
wasmtime --dir /path::/ coreutils.wasm mkdir dir
# exit: 0
```

**根因**：wasmtime 45.x 需要 `--dir <host_path>::/` 格式才能将 host 路径映射到 guest 根目录 `/`。原代码只用 `--dir <cwd>`，guest 内部 cwd 在 `/` 但找不到对应 fd。

`echo`、`touch`、`rm` 等命令加 `::/` 后均正常工作。

---

### pi-coding-agent retry 事件（已确认）

- `auto_retry_start`：每次重试前发出，含 `attempt/maxAttempts/delayMs/errorMessage`
- `auto_retry_end`：重试结束后发出，含 `success/finalError`
- `session.abortRetry()`：幂等，调用时非重试状态则无操作
- `session.isRetrying`：当前是否在重试中

---

## Pre-Mortem v3

### 问题 1: Bash 沙箱 `mkdir` 失败

| # | 如果... | 后果 | 概率 |
|---|--------|------|------|
| F1.1 | 只修复 `--dir <cwd>::/`，其他命令（`cp`, `mv`, `chmod`）仍失败 | 部分写命令卡死 | 中 |
| F1.2 | `::/` 映射后 guest 内部路径解析仍有子目录问题 | 深层目录写操作失败 | 低 |
| F1.3 | wasmtime 版本升级后 `--dir::/` 行为改变 | 未来兼容性问题 | 低 |

### 问题 2: 429 Rate Limit

| # | 如果... | 后果 | 概率 |
|---|--------|------|------|
| F2.1 | `auto_retry_start` 发出后，用户立即发新 prompt | 请求入队列，重试结束后被处理 | 高 |
| F2.2 | 前端无 `rate_limited` UI 展示 | 用户仍感知不到（依赖前端） | 高 |
| F2.3 | `abortRetry()` 调用后，session 回到可接受 prompt 状态 | 用户可继续操作，符合预期 | 高 |
| F2.4 | `auto_retry_end(success=false)` 后 session 直接结束 | 用户需手动重启，符合预期 | 中 |
| F2.5 | Phase 2 和 Phase 3 功能重叠 | Phase 2 防止排队，Phase 3 主动中止，重叠但无害 | 低 |

---

## Solutions v3

---

### 问题 1: Bash 沙箱 `mkdir` 失败

#### 根因
`--dir <cwd>` 缺少 `::/` 映射，导致 guest 根目录无 fd。

#### 解法：修正 `--dir` 参数格式

```typescript
// executor.ts — 只需改一行
const proc = spawn(wasmtimePath, [
  "--dir", `${opts.cwd}::/`,  // ← 加 ::/ 映射
  wasmFile,
  command,
  ...args
], { ... });
```

#### 验证

```bash
# 单行验证
wasmtime --dir /tmp::/ \
  /path/coreutils.wasm \
  mkdir verify_works && echo "✅ wasmtime OK" && rm -rf verify_works
```

---

### 问题 2: 429 Rate Limit

#### 根因
pi-agent 的 `auto_retry_*` 事件已设计好，但 server 层未订阅转发给前端。

#### 解法

**Phase 1（核心）：订阅 `auto_retry_*` 事件 → WS 通知**

在 `event-subscription.ts` 的 subscribe 回调末尾添加：

```typescript
// event-subscription.ts — subscribe 回调中
if (event.type === "auto_retry_start") {
  const delaySec = Math.ceil(event.delayMs / 1000);
  ws.send(JSON.stringify({
    type: "rate_limited",
    attempt: event.attempt,
    maxAttempts: event.maxAttempts,
    retryAfter: delaySec,
    message: `API 限流，${delaySec}s 后自动重试 (${event.attempt}/${event.maxAttempts})`,
  }));
}

if (event.type === "auto_retry_end") {
  if (event.success) {
    ws.send(JSON.stringify({ type: "retry_success", attempt: event.attempt }));
  } else {
    ws.send(JSON.stringify({
      type: "retry_failed",
      attempt: event.attempt,
      finalError: event.finalError,
    }));
  }
}
```

**Phase 2：PromptHandler 防护重复排队**

```typescript
// PromptHandler.ts — handle() 开头
const session = (ws as any).data?.session;
if (session?.isRetrying) {
  ws.send(JSON.stringify({
    type: "rate_limited",
    message: "正在等待 API 重试，请稍后",
  }));
  return;
}
```

**Phase 3：允许用户中止重试**

```typescript
// ws-router.ts — switch case 中新增
case "abort_retry": {
  const session = (ws as any).data?.session;
  session?.abortRetry(); // 幂等，非重试状态无操作
  ws.send(JSON.stringify({ type: "retry_aborted" }));
  break;
}
```

#### Phase 4 已移除

`auto_retry_start` 每轮重试都发，Dedupe 无意义。session history 中 429 entries 不造成显著膨胀。

---

## 验证标准

| 解法 | 验证条件 |
|------|---------|
| wasmtime `::/` | `mkdir -p test_$$` 成功，exitCode 0，无 "pre-opened fd" 错误 |
| `auto_retry_start` 通知 | 触发 429 后，前端收到 `rate_limited` WS 消息含 `retryAfter` |
| `auto_retry_end` 通知 | 重试完成后，前端收到 `retry_success` 或 `retry_failed` |
| PromptHandler 拦截 | 重试中发 prompt，收到 `rate_limited` 而非 `question_queued` |
| `abort_retry` | 发送 `abort_retry` 后收到 `retry_aborted`（`abortRetry()` 幂等，调用即成功）|

---

## 优先级（v3）

| 优先级 | 解法 | Impact | Effort | 备注 |
|--------|------|--------|--------|------|
| P0 | wasmtime `::/` 修复 | 解除当前卡死 | 极低 | 只改一个参数 |
| P1 | Phase 1 `auto_retry_*` 通知 | 用户感知 429 | 低 | 约 15 行代码 |
| P2 | Phase 2 PromptHandler 拦截 | 阻止无效排队 | 低 | 约 5 行代码 |
| P3 | Phase 3 `abort_retry` | 用户可中止 | 低 | 约 5 行代码 |
| P4 | 验证其他 wasmtime 命令（cp/mv/chmod） | 完整沙箱恢复 | 中 | 逐一测试 |
