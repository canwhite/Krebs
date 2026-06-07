# WebSocket 高优先级问题修复文档

## 修复日期

2026-03-29

## 概述

本文档记录了对 `server.ts` 中 WebSocket 处理的三个高优先级问题的修复，包括内存泄漏、错误处理缺失和并发竞态条件。

---

## 问题 1: WebSocket 订阅未清理（内存泄漏）

### 问题描述

**严重程度：** 🔴 高

**位置：** `server.ts` 第 772-912 行

**问题详情：**

```typescript
// 修复前的代码
session.subscribe((event) => {
  // ... 事件处理逻辑
});
// subscribe 返回的 unsubscribe 函数未被保存和调用
```

`session.subscribe()` 返回一个 `unsubscribe` 函数，用于取消事件订阅。但原代码没有保存这个函数，导致：

1. **内存泄漏**：事件监听器无法被释放
2. **资源浪费**：即使 WebSocket 连接关闭，事件回调仍在内存中
3. **性能下降**：随着时间推移，未清理的订阅累积影响性能

### 修复方案

#### 修改 1.1：保存 session 引用

**位置：** 第 755-757 行

```typescript
// 修复前
createSession(sessionId).then((result) => {
  const session = result.session;
  (ws as any).data.firstMessageSaved = false;

// 修复后
createSession(sessionId).then((result) => {
  const session = result.session;
  (ws as any).data.session = session;  // 新增：保存 session 引用
  (ws as any).data.firstMessageSaved = false;
```

**原因：** 在 WebSocket 关闭时需要访问 session 对象，但原代码只在局部作用域保存。

#### 修改 1.2：保存 unsubscribe 函数

**位置：** 第 773-774 行, 第 916 行

```typescript
// 修复前
const textDeltas: string[] = [];

session.subscribe((event) => {
  // ... 事件处理
});

// 修复后
const textDeltas: string[] = [];
// 防止 message_end 并发处理的标志位
let isProcessingMessageEnd = false;

// 保存 unsubscribe 函数以便在连接关闭时清理
const unsubscribe = session.subscribe((event) => {
  // ... 事件处理
});

// 保存 unsubscribe 函数以便在连接关闭时清理
(ws as any).data.unsubscribe = unsubscribe;
```

**原因：** 将 `unsubscribe` 函数保存到 `ws.data` 中，以便在连接关闭时调用。

#### 修改 1.3：在 close 时清理订阅

**位置：** 第 1074-1087 行

```typescript
// 修复前
close(ws) {
  const sessionId = (ws as any).data?.sessionId;
  const logger = (ws as any).data?.logger;
  console.log(`[WebSocket] 连接已关闭: ${sessionId}`);

  if (logger) {
    logger.log(`[SESSION] Session ${sessionId} WebSocket closed`);
    logger.close();
  }

  if (sessionId) {
    deleteSession(sessionId);
  }
}

// 修复后
close(ws) {
  const sessionId = (ws as any).data?.sessionId;
  const logger = (ws as any).data?.logger;
  console.log(`[WebSocket] 连接已关闭: ${sessionId}`);

  // 清理事件订阅，防止内存泄漏
  const unsubscribe = (ws as any).data?.unsubscribe;
  if (unsubscribe) {
    try {
      unsubscribe();
      console.log(`[WebSocket] 已清理事件订阅: ${sessionId}`);
    } catch (error) {
      console.error(`[WebSocket] 清理订阅失败: ${error}`);
    }
  }

  if (logger) {
    logger.log(`[SESSION] Session ${sessionId} WebSocket closed`);
    logger.close();
  }

  if (sessionId) {
    deleteSession(sessionId);
  }

  // 清理 ws.data 引用
  (ws as any).data = null;
}
```

**关键改进：**
1. 调用 `unsubscribe()` 取消事件订阅
2. 添加 try-catch 防止清理失败影响其他逻辑
3. 清理 `ws.data` 引用，帮助垃圾回收

### 修复效果

| 指标 | 修复前 | 修复后 |
|------|--------|--------|
| 事件订阅清理 | ❌ 不清理 | ✅ 自动清理 |
| 内存泄漏风险 | 🔴 高 | 🟢 低 |
| WebSocket 关闭后的资源 | ❌ 残留 | ✅ 完全释放 |

---

## 问题 2: Session 创建失败处理

### 问题描述

**严重程度：** 🔴 高

**位置：** `server.ts` 第 755-912 行

**问题详情：**

```typescript
// 修复前的代码
createSession(sessionId).then((result) => {
  const session = result.session;
  ws.send(JSON.stringify({
    type: "connected",
    sessionId,
    message: "WebSocket 连接已建立",
  }));
  // ... 后续处理
});
// 没有 .catch() 处理创建失败的情况
```

**问题分析：**

1. **时序问题**：WebSocket 连接已建立，但 session 可能创建失败
2. **状态不一致**：客户端认为已连接，但服务器端没有可用的 session
3. **无错误反馈**：客户端不知道创建失败，继续发送消息会失败
4. **资源浪费**：保持无效连接占用资源

### 修复方案

#### 修改 2.1：添加错误处理

**位置：** 第 755 行, 第 917-932 行

```typescript
// 修复前
createSession(sessionId).then((result) => {
  // ... 成功处理
});

// 修复后
createSession(sessionId)
  .then((result) => {
    // ... 成功处理
  })
  .catch((error) => {
    // Session 创建失败处理
    console.error(`[WebSocket] Session 创建失败: ${error.message}`);
    logger.log(`[ERROR] Session 创建失败: ${error.message}`);

    // 通知客户端创建失败
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Session 创建失败，请重试",
      }),
    );

    // 关闭连接
    ws.close(1011, "Session creation failed");
  });
```

**关键改进：**

1. **完整错误链**：console.error + logger.log 双重记录
2. **客户端通知**：发送错误消息给客户端
3. **连接关闭**：使用状态码 1011（服务器错误）关闭连接
4. **防止半开状态**：确保客户端知道连接不可用

### 修复效果

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| Session 创建成功 | ✅ 正常 | ✅ 正常 |
| Session 创建失败 | ❌ 半开状态 | ✅ 关闭并通知 |
| 客户端感知 | ❌ 不知道失败 | ✅ 收到错误通知 |
| 错误日志 | ❌ 无记录 | ✅ 完整记录 |

---

## 问题 3: WebSocket 事件处理竞态

### 问题描述

**严重程度：** 🔴 高

**位置：** `server.ts` 第 847-914 行

**问题详情：**

```typescript
// 修复前的代码
} else if (event.type === "message_end") {
  hasSentResponseStart = false;

  // 立即启动异步文件读取
  void (async () => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // ... 重试读取文件
    }
  })();

  textDeltas.length = 0;
}
```

**问题分析：**

1. **并发风险**：如果短时间内收到多个 `message_end` 事件，会启动多个并发读取
2. **资源浪费**：多个异步操作同时读取同一个文件
3. **响应混乱**：可能发送多个 `response_end` 消息
4. **状态不一致**：`textDeltas` 可能在处理过程中被清空

### 修复方案

#### 修改 3.1：添加并发保护标志位

**位置：** 第 773 行, 第 849-924 行

```typescript
// 修复前
const textDeltas: string[] = [];

session.subscribe((event) => {
  // ...
  } else if (event.type === "message_end") {
    hasSentResponseStart = false;
    // 立即处理
  }
});

// 修复后
const textDeltas: string[] = [];
// 防止 message_end 并发处理的标志位
let isProcessingMessageEnd = false;

session.subscribe((event) => {
  // ...
  } else if (event.type === "message_end") {
    // 防止并发处理 message_end 事件
    if (isProcessingMessageEnd) {
      logger.log("[SESSION] message_end 已在处理中，跳过重复事件");
      return;
    }

    isProcessingMessageEnd = true;
    hasSentResponseStart = false;

    // ... 处理逻辑

    // 在异步处理完成后重置标志
    void (async () => {
      // ... 处理逻辑
      isProcessingMessageEnd = false;  // 在最后重置
    })();
  }
});
```

**关键改进：**

1. **标志位检查**：处理前检查 `isProcessingMessageEnd`
2. **早期返回**：如果正在处理，跳过重复事件
3. **状态重置**：处理完成后重置标志位
4. **日志记录**：记录跳过的事件便于调试

#### 修改 3.2：标志位重置时机

```typescript
// 重置位置在异步处理完成后
void (async () => {
  const maxRetries = 5;
  const retryDelay = 100;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // ... 读取文件
      break;
    } catch (error: any) {
      // ... 错误处理
    }
  }

  // 重置处理标志（在所有处理完成后）
  isProcessingMessageEnd = false;
})();
```

**重要：** 标志位重置放在 Promise 链的最后，确保无论成功或失败都会重置。

### 修复效果

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 单次 message_end | ✅ 正常 | ✅ 正常 |
| 短时间多次 message_end | ❌ 并发读取 | ✅ 只处理第一次 |
| 文件读取并发数 | 🔴 可能多个 | 🟢 最多一个 |
| response_end 消息数 | 🔴 可能多个 | 🟢 只有一个 |

---

## 代码变更汇总

### 文件变更

| 文件 | 变更行数 | 变更类型 |
|------|----------|----------|
| `server.ts` | ~60 行 | 增强/修复 |

### 新增变量

| 变量名 | 类型 | 作用域 | 用途 |
|--------|------|--------|------|
| `isProcessingMessageEnd` | `boolean` | 闭包内 | 防止 message_end 并发处理 |
| `unsubscribe` | `function` | 局部 | 保存取消订阅函数 |
| `ws.data.session` | `AgentSession` | ws.data | 保存 session 引用 |
| `ws.data.unsubscribe` | `function` | ws.data | 保存取消订阅函数 |

### 新增日志

| 日志内容 | 级别 | 用途 |
|----------|------|------|
| `[WebSocket] 已清理事件订阅: ${sessionId}` | info | 确认订阅清理成功 |
| `[WebSocket] 清理订阅失败: ${error}` | error | 记录清理失败 |
| `[WebSocket] Session 创建失败: ${error.message}` | error | 记录 session 创建失败 |
| `[ERROR] Session 创建失败: ${error.message}` | error | 记录到 logger |
| `[SESSION] message_end 已在处理中，跳过重复事件` | info | 记录并发事件跳过 |

---

## 测试建议

### 1. 内存泄漏测试

```typescript
// 测试脚本：多次创建和关闭 WebSocket 连接
for (let i = 0; i < 100; i++) {
  const ws = new WebSocket('ws://localhost:3000/ws');
  ws.onopen = () => {
    ws.close();
  };
}
// 检查内存使用情况
```

**预期结果：** 内存使用稳定，不持续增长。

### 2. Session 创建失败测试

```typescript
// 模拟 session 创建失败
// 1. 修改 createSession 使其随机失败
// 2. 观察 WebSocket 是否正确关闭
// 3. 检查是否收到错误消息
```

**预期结果：**
- 客户端收到 `{ type: "error", message: "Session 创建失败，请重试" }`
- WebSocket 连接关闭（状态码 1011）
- 服务器记录错误日志

### 3. 并发事件测试

```typescript
// 测试脚本：快速发送多条消息
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onopen = () => {
  // 快速发送多条消息
  for (let i = 0; i < 10; i++) {
    ws.send(JSON.stringify({
      type: "message",
      message: `测试消息 ${i}`
    }));
  }
};
```

**预期结果：**
- 每条消息只触发一次 `response_end`
- 日志中可能出现 "message_end 已在处理中" 的记录
- 不出现并发读取文件的错误

---

## 相关文档

- [HTTP vs WebSocket 事件处理机制差异](./http-vs-websocket-difference.md)
- [PI SDK 事件结构详解](./pi-sdk-event-structure.md)
- [HTTP API 超时处理重构](./http-api-timeout-refactor.md)

---

## 修复时间线

| 时间 | 修复内容 |
|------|----------|
| 2026-03-29 | 完成 WebSocket 订阅未清理修复 |
| 2026-03-29 | 完成 Session 创建失败处理修复 |
| 2026-03-29 | 完成 WebSocket 事件处理竞态修复 |
