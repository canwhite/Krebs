# server.ts 逻辑分析报告

## 发现的问题

### 🔴 严重问题

#### 1. 会话切换后事件订阅未更新

**位置:** server.ts:1275-1288

**问题:**
```typescript
const result = await runtime.switchSession(sessionMeta.file_path);
if (!result.cancelled) {
  sessions.set(data.sessionId, runtime);
  // ...
  (ws as any).data.session = runtime.session; // ✅ 更新了 session
  // ❌ 但是没有更新 unsubscribe 订阅！
}
```

**影响:**
- 切换会话后，WebSocket 仍然监听**旧 session** 的事件
- 新 session 的事件不会发送到前端
- 前端看不到新会话的响应

**修复建议:**
```typescript
const result = await runtime.switchSession(sessionMeta.file_path);
if (!result.cancelled) {
  // 重新订阅新 session 的事件
  const newSession = runtime.session;
  unsubscribe(); // 取消旧订阅

  // 重新订阅
  const newUnsubscribe = newSession.subscribe((event) => {
    // ... 相同的事件处理逻辑
  });

  (ws as any).data.session = newSession;
  (ws as any).data.unsubscribe = newUnsubscribe;
}
```

---

#### 2. HTTP API 使用完 session 后未清理

**位置:** server.ts:615-629

**问题:**
```typescript
if (sessionId) {
  const existing = getSession(sessionId);
  if (existing) {
    session = existing.session;  // ✅ 获取 session
    usedSessionId = sessionId;
  }
} else {
  usedSessionId = generateSessionId();
  const result = await createRuntime(usedSessionId);
  session = result.runtime.session;
  // ❌ HTTP 请求创建的 runtime 存储了吗？
  // ❌ 请求完成后会清理吗？
}
```

**影响:**
- HTTP 请求创建的临时 runtime 可能泄漏
- 内存中积累未清理的 session

**修复建议:**
```typescript
} else {
  usedSessionId = generateSessionId();
  const result = await createRuntime(usedSessionId);
  session = result.runtime.session;

  // 标记为临时会话，请求完成后清理
  (result.runtime as any).temporary = true;
  sessions.set(usedSessionId, result.runtime);
}

// ... 处理请求 ...

// 请求完成后清理临时会话
if (!sessionId) {
  deleteSession(usedSessionId);
}
```

---

### 🟡 中等问题

#### 3. switch_session 可能覆盖现有会话

**位置:** server.ts:1278

**问题:**
```typescript
sessions.set(data.sessionId, runtime);
```

**影响:**
- 如果目标 sessionId 已经在 Map 中存在，会被覆盖
- 可能导致旧 runtime 引用丢失，无法正确清理

**修复建议:**
```typescript
// 检查是否已存在
const existingRuntime = sessions.get(data.sessionId);
if (existingRuntime && existingRuntime !== runtime) {
  // 清理旧 runtime
  try {
    await existingRuntime.dispose();
  } catch (e) {
    console.error(`[WebSocket] 清理旧 runtime 失败:`, e);
  }
}

sessions.set(data.sessionId, runtime);
```

---

#### 4. WebSocket 关闭时未清理 runtime

**位置:** server.ts:1115-1184

**问题:**
```typescript
ws.close(1011, "Session creation failed");
// ❌ 没有清理 runtime
```

**影响:**
- WebSocket 异常关闭时，runtime 未释放
- 事件订阅可能仍然活跃

**修复建议:**
在 WebSocket close 处理中添加清理逻辑：
```typescript
ws.close(1011, "Session creation failed");

// 清理 runtime
const currentSessionId = (ws as any).data.sessionId;
if (currentSessionId) {
  try {
    const runtime = sessions.get(currentSessionId);
    if (runtime) {
      await runtime.dispose();
      sessions.delete(currentSessionId);
    }
  } catch (e) {
    console.error(`[WebSocket] 清理 runtime 失败:`, e);
  }
}
```

---

### 🟢 轻微问题

#### 5. message_end 处理逻辑冗余

**位置:** server.ts:1121-1123

```typescript
isProcessingMessageEnd = true;
logger.log("[SESSION] message_end 收到，等待 turn_end");
isProcessingMessageEnd = false;  // ❌ 立即设置为 false，没意义
```

**建议:** 删除冗余的 `isProcessingMessageEnd = false`

---

#### 6. getSession 一致性问题

**位置:** server.ts:747-750

```typescript
const session = getSession(sessionId);  // 返回 AgentSessionRuntime
if (session) {
  deleteSession(sessionId);  // 期望 AgentSessionRuntime
}
```

虽然能工作，但命名容易混淆。建议重命名：
```typescript
function getRuntime(sessionId: string): AgentSessionRuntime | undefined {
  return sessions.get(sessionId);
}
```

---

## 优先级修复顺序

1. **🔴 P0:** 会话切换后事件订阅未更新 - 影响核心功能
2. **🔴 P0:** WebSocket 关闭时未清理 runtime - 资源泄漏
3. **🟡 P1:** switch_session 覆盖现有会话 - 潜在泄漏
4. **🟡 P1:** HTTP API 临时会话未清理 - 内存泄漏
5. **🟢 P2:** 代码质量改进

---

## 架构建议

### 考虑引入 RuntimeManager

```typescript
class RuntimeManager {
  private runtimes = new Map<string, AgentSessionRuntime>();

  async create(sessionId: string, options?: { sessionPath?: string }): Promise<AgentSessionRuntime> {
    // 创建并存储
  }

  async get(sessionId: string): Promise<AgentSessionRuntime> {
    // 获取
  }

  async dispose(sessionId: string): Promise<void> {
    // 清理
  }

  async switch(fromSessionId: string, toSessionId: string, toSessionPath: string): Promise<void> {
    // 安全切换
  }
}
```

这样可以统一管理 runtime 生命周期，避免遗漏清理。
