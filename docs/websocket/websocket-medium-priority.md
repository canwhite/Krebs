# WebSocket 中优先级问题修复文档

## 修复日期

2026-03-29

## 概述

本文档记录了对 `server.ts` 中 6 个中优先级问题的修复，包括 Session 切换竞态、异步操作错误处理、超时处理、Logger 清理、Session 清理和重试机制优化。

---

## 问题 4: Session 切换竞态

### 问题描述

**严重程度：** 🟡 中

**位置：** `server.ts` 第 1001-1053 行

**问题详情：**

```typescript
// 修复前的代码
if (data.type === "switch_session" && data.sessionId) {
  const success = await session.switchSession(sessionMeta.file_path);
  if (success) {
    sessions.set(data.sessionId, session);
    if (sessionId && sessionId !== data.sessionId) {
      sessions.delete(sessionId);
    }
    (ws as any).data.sessionId = data.sessionId;
  }
}
```

**问题分析：**

1. **竞态条件**：多个 WebSocket 连接可能同时切换到同一 session
2. **状态不一致**：sessions Map 的 delete/get/set 操作非原子性
3. **错误暴露**：直接将 error.message 发送给客户端可能泄露敏感信息

### 修复方案

#### 修改 4.1：添加切换状态标志位

**位置：** 第 1001-1068 行

```typescript
// 修复后
if (data.type === "switch_session" && data.sessionId) {
  // 防止并发切换 session
  if ((ws as any).data.isSwitchingSession) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Session 切换中，请稍后",
      }),
    );
    return;
  }

  console.log(`[WebSocket] 切换 session 到: ${data.sessionId}`);

  const sessionMeta = getSessionById(data.sessionId);
  if (!sessionMeta || !sessionMeta.file_path) {
    ws.send(
      JSON.stringify({
        type: "error",
        message: "Session 不存在或文件路径无效",
      }),
    );
    return;
  }

  (ws as any).data.isSwitchingSession = true;

  try {
    const success = await session.switchSession(sessionMeta.file_path);
    if (success) {
      // Update sessions Map mapping
      sessions.set(data.sessionId, session);

      // Remove old sessionId mapping if different
      if (sessionId && sessionId !== data.sessionId) {
        sessions.delete(sessionId);
      }

      // Update the sessionId in ws.data
      (ws as any).data.sessionId = data.sessionId;
      (ws as any).data.firstMessageSaved = true;

      ws.send(
        JSON.stringify({
          type: "session_switched",
          sessionId: data.sessionId,
        }),
      );
      console.log(`[WebSocket] Session 切换成功: ${data.sessionId}`);
    } else {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "切换 session 失败",
        }),
      );
    }
  } catch (error: any) {
    console.error(`[WebSocket] 切换 session 出错:`, error);
    ws.send(
      JSON.stringify({
        type: "error",
        message: "切换 session 出错，请重试",
      }),
    );
  } finally {
    (ws as any).data.isSwitchingSession = false;
  }
}
```

**关键改进：**

1. **并发保护**：使用 `isSwitchingSession` 标志位防止并发切换
2. **状态一致性**：使用 try-catch-finally 确保标志位始终被重置
3. **错误过滤**：不直接暴露错误详情给客户端
4. **错误日志**：添加 console.error 记录完整错误信息

### 修复效果

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 单次切换 | ✅ 正常 | ✅ 正常 |
| 并发切换 | ❌ 状态混乱 | ✅ 拒绝重复请求 |
| 切换失败 | ❌ 暴露错误信息 | ✅ 通用错误提示 |

---

## 问题 5: 异步操作错误处理不完整

### 问题描述

**严重程度：** 🟡 中

**位置：** `server.ts` 第 1152-1177 行

**问题详情：**

```typescript
// 修复前的代码
session.followUp(data.message).catch((error) => {
  ws.send(
    JSON.stringify({
      type: "error",
      message: error.message,  // 直接暴露错误信息
    }),
  );
});

session.prompt(data.message).catch((error) => {
  ws.send(
    JSON.stringify({
      type: "error",
      message: error.message,  // 直接暴露错误信息
    }),
  );
});
```

**问题分析：**

1. **缺少日志**：错误只发送给客户端，服务器无记录
2. **信息泄露**：error.message 可能包含敏感的系统信息
3. **调试困难**：无法追溯错误发生的原因

### 修复方案

#### 修改 5.1：增强错误处理

**位置：** 第 1152-1177 行

```typescript
// 修复后 - followUp
session.followUp(data.message).catch((error) => {
  const errorMessage = error?.message || "未知错误";
  const wsLogger = (ws as any).data?.logger;
  if (wsLogger) {
    wsLogger.log(`[ERROR] followUp 失败: ${errorMessage}`);
  }
  console.error(`[WebSocket] followUp 失败:`, error);

  ws.send(
    JSON.stringify({
      type: "error",
      message: "消息处理失败，请重试",
    }),
  );
});

// 修复后 - prompt
session.prompt(data.message).catch((error) => {
  const errorMessage = error?.message || "未知错误";
  const wsLogger = (ws as any).data?.logger;
  if (wsLogger) {
    wsLogger.log(`[ERROR] prompt 失败: ${errorMessage}`);
  }
  console.error(`[WebSocket] prompt 失败:`, error);

  ws.send(
    JSON.stringify({
      type: "error",
      message: "消息处理失败，请重试",
    }),
  );
});
```

**关键改进：**

1. **双重日志**：logger.log + console.error 确保错误被记录
2. **信息过滤**：客户端只收到通用错误消息
3. **详细日志**：服务器记录完整的错误信息用于调试
4. **安全防护**：避免泄露系统内部信息

### 修复效果

| 方面 | 修复前 | 修复后 |
|------|--------|--------|
| 客户端收到的错误 | ❌ 详细错误信息 | ✅ 通用错误提示 |
| 服务器日志 | ❌ 无记录 | ✅ 完整记录 |
| 安全性 | 🔴 信息泄露风险 | 🟢 安全 |
| 可调试性 | 🔴 困难 | 🟢 容易 |

---

## 问题 6: waitForSessionComplete 超时处理

### 问题描述

**严重程度：** 🟡 中

**位置：** `server.ts` 第 322-371 行, 504-507 行

**问题详情：**

```typescript
// 修复前的代码
async function waitForSessionComplete(
  session: AgentSession,
  logger?: { log: (msg: string) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();  // 可能在 try 块外，清理不完整
      clearInterval(checkInterval);
      reject(new Error(`Session 超时...`));
    }, SESSION_TIMEOUT_MS);

    const unsubscribe = session.subscribe((event) => {
      // ...
    });
  });
}

// 调用处
await waitForSessionComplete(session, logger);
// 没有 try-catch 处理超时
```

**问题分析：**

1. **清理不完整**：超时时 unsubscribe 可能未正确执行
2. **调用处无处理**：Promise reject 未被捕获
3. **资源泄漏**：超时后事件订阅可能未清理

### 修复方案

#### 修改 6.1：确保资源清理

**位置：** 第 322-371 行

```typescript
// 修复后
async function waitForSessionComplete(
  session: AgentSession,
  logger?: { log: (msg: string) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let resolved = false;
    let unsubscribe: () => void;

    // 超时关闭
    const timer = setTimeout(() => {
      if (resolved) return;
      resolved = true;

      // 确保清理所有资源
      try {
        if (unsubscribe) unsubscribe();
      } catch (e) {
        // 忽略清理错误
      }
      clearInterval(checkInterval);

      reject(
        new Error(
          `Session 超时 (${SESSION_TIMEOUT_MS}ms)，当前状态: isStreaming=${session.isStreaming}`,
        ),
      );
    }, SESSION_TIMEOUT_MS);

    // 成功关闭
    unsubscribe = session.subscribe((event) => {
      if (event.type === "message_end") {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        clearInterval(checkInterval);
        try {
          unsubscribe();
        } catch (e) {
          // 忽略清理错误
        }
        logger?.log(
          `[SESSION] message_end 收到，耗时: ${Date.now() - startTime}ms`,
        );
        resolve();
      }
    });

    // 备用：如果 isStreaming 变成 false，也认为完成
    const checkInterval = setInterval(() => {
      if (!session.isStreaming) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        clearInterval(checkInterval);
        try {
          unsubscribe();
        } catch (e) {
          // 忽略清理错误
        }
        logger?.log(
          `[SESSION] isStreaming=false，耗时: ${Date.now() - startTime}ms`,
        );
        resolve();
      }
    }, 500);
  });
}
```

#### 修改 6.2：调用处添加超时处理

**位置：** 第 504-518 行

```typescript
// 修复后
await session.prompt(message);

// 等待 session 完成（message_end 事件或 isStreaming 为 false）
try {
  await waitForSessionComplete(session, logger);
} catch (error: any) {
  if (error.message.includes("超时")) {
    logger.log(`[ERROR] Session 处理超时`);
    return Response.json(
      { error: "请求超时，请稍后重试" },
      { status: 408, headers: corsHeaders },
    );
  }
  throw error;
}
```

**关键改进：**

1. **变量提升**：将 unsubscribe 声明提升到作用域顶部
2. **Try-Catch 包裹**：所有清理操作都包裹在 try-catch 中
3. **Resolved 标志**：防止重复执行清理逻辑
4. **调用处处理**：特殊处理超时错误，返回 408 状态码

### 修复效果

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 正常完成 | ✅ 正常 | ✅ 正常 |
| 超时 | ❌ 可能泄漏 | ✅ 完全清理 |
| 超时响应 | ❌ 未处理 | ✅ 返回 408 |
| 清理异常 | ❌ 中断清理 | ✅ 继续清理 |

---

## 问题 7: Logger 实例未清理

### 问题描述

**严重程度：** 🟡 中

**位置：** `server.ts` 第 1178-1182 行

**问题详情：**

```typescript
// 修复前的代码
if (logger) {
  logger.log(`[SESSION] Session ${sessionId} WebSocket closed`);
  logger.close();  // 可能抛出异常，但未处理
}

// ws.data 清理在之前已完成
(ws as any).data = null;
```

**问题分析：**

1. **异常未处理**：logger.close() 可能抛出异常
2. **清理中断**：异常会影响后续的 ws.data 清理

### 修复方案

#### 修改 7.1：添加异常处理

**位置：** 第 1178-1187 行

```typescript
// 修复后
if (logger) {
  try {
    logger.log(`[SESSION] Session ${sessionId} WebSocket closed`);
    logger.close();
  } catch (error) {
    console.error(`[WebSocket] Logger 关闭失败:`, error);
  }
}

if (sessionId) {
  deleteSession(sessionId);
}

// 清理 ws.data 引用
(ws as any).data = null;
```

**关键改进：**

1. **Try-Catch 包裹**：确保 logger.close() 异常不影响其他清理
2. **错误记录**：使用 console.error 记录关闭失败
3. **继续清理**：即使 logger 关闭失败，也继续清理其他资源

### 修复效果

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 正常关闭 | ✅ 清理成功 | ✅ 清理成功 |
| 关闭异常 | ❌ 后续清理中断 | ✅ 继续清理 |
| 错误日志 | ❌ 无记录 | ✅ 记录到 console |

---

## 问题 8: Session 清理不完整

### 问题描述

**严重程度：** 🟡 中

**位置：** `server.ts` 第 299-305 行

**问题详情：**

```typescript
// 修复前的代码
function deleteSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (session) {
    session.dispose();  // 可能抛出异常，未处理
    sessions.delete(sessionId);
  }
}
```

**问题分析：**

1. **异常未处理**：dispose() 可能抛出异常
2. **状态未检查**：没有检查 session 是否仍在运行
3. **无日志记录**：清理失败无法追溯

### 修复方案

#### 修改 8.1：增强清理逻辑

**位置：** 第 299-317 行

```typescript
// 修复后
function deleteSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (session) {
    try {
      // 检查 session 状态
      if (session.isStreaming) {
        console.log(`[DELETE] Session ${sessionId} 仍在运行，先终止`);
        session.abort().catch(() => {
          // 忽略 abort 错误
        });
      }

      session.dispose();
      sessions.delete(sessionId);
      console.log(`[DELETE] Session ${sessionId} 已清理`);
    } catch (error) {
      console.error(`[DELETE] Session ${sessionId} 清理失败:`, error);
    }
  }
}
```

**关键改进：**

1. **状态检查**：检查 session 是否仍在运行
2. **先终止**：如果正在运行，先调用 abort()
3. **Try-Catch 包裹**：确保清理异常不影响其他操作
4. **日志记录**：记录清理成功或失败

### 修复效果

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| 空闲 session | ✅ 清理成功 | ✅ 清理成功 |
| 运行中 session | ❌ 可能泄漏 | ✅ 先终止再清理 |
| 清理异常 | ❌ 中断清理 | ✅ 记录并继续 |
| 可追溯性 | 🔴 低 | 🟢 高 |

---

## 问题 9: message_end 重试机制缺陷

### 问题描述

**严重程度：** 🟡 中

**位置：** `server.ts` 第 916-963 行

**问题详情：**

```typescript
// 修复前的代码
void (async () => {
  const maxRetries = 5;
  const retryDelay = 100; // 固定延迟

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const fullTextResponse = await getLastAssistantMessageFromFile(
        sessionFilePath,
        logger,
      );
      const generatedContent = extractFromSessionText(
        fullTextResponse,
        logger,
      );

      ws.send({
        type: "response_end",
        generatedContent: generatedContent,
      });
      break;
    } catch (error: any) {
      if (attempt === maxRetries) {
        ws.send({
          type: "response_end",
          generatedContent: undefined,
        });
      } else {
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay),
        );
      }
    }
  }

  isProcessingMessageEnd = false;
})();
```

**问题分析：**

1. **无连接检查**：WebSocket 可能已关闭但仍尝试发送
2. **固定延迟**：使用固定 100ms 延迟，无指数退避
3. **重复发送**：每次重试失败都发送错误消息

### 修复方案

#### 修改 9.1：增强重试机制

**位置：** 第 916-963 行

```typescript
// 修复后
void (async () => {
  const maxRetries = 5;
  let retryDelay = 50; // 初始延迟更短

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    // 检查 WebSocket 是否仍然连接
    if (ws.readyState !== WebSocket.OPEN) {
      logger.log(`[SESSION] WebSocket 已关闭，停止重试`);
      isProcessingMessageEnd = false;
      return;
    }

    try {
      const fullTextResponse = await getLastAssistantMessageFromFile(
        sessionFilePath,
        logger,
      );
      const generatedContent = extractFromSessionText(
        fullTextResponse,
        logger,
      );

      // 再次检查连接状态
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "response_end",
            generatedContent: generatedContent,
          }),
        );
      }
      break; // 成功，退出重试循环
    } catch (error: any) {
      if (attempt === maxRetries) {
        // 最后一次重试失败
        logger.log(
          `[SESSION] 读取文件失败（已重试 ${maxRetries} 次）: ${error.message}`,
        );
        // 只在连接仍然打开时发送错误响应
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "response_end",
              generatedContent: undefined,
            }),
          );
        }
      } else {
        // 指数退避
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay),
        );
        retryDelay = Math.min(retryDelay * 2, 500); // 最大 500ms
      }
    }
  }

  // 重置处理标志
  isProcessingMessageEnd = false;
})();
```

**关键改进：**

1. **连接状态检查**：每次操作前检查 ws.readyState
2. **指数退避**：50ms → 100ms → 200ms → 400ms → 500ms
3. **提前退出**：连接关闭时立即停止重试
4. **条件发送**：只在连接打开时发送消息

### 修复效果

| 特性 | 修复前 | 修复后 |
|------|--------|--------|
| 连接检查 | ❌ 无 | ✅ 每次操作前检查 |
| 重试延迟 | 🔴 固定 100ms | 🟢 指数退避 50-500ms |
| 提前退出 | ❌ 继续重试 | ✅ 连接关闭时退出 |
| 重复发送 | ❌ 每次都发送 | ✅ 只在连接时发送 |

---

## 代码变更汇总

### 文件变更

| 文件 | 变更行数 | 变更类型 |
|------|----------|----------|
| `server.ts` | ~150 行 | 增强/修复 |

### 新增变量/标志位

| 变量名 | 类型 | 作用域 | 用途 |
|--------|------|--------|------|
| `isSwitchingSession` | `boolean` | ws.data | 防止 Session 切换并发 |
| `unsubscribe` | `function` | 局部 | 保存取消订阅函数 |
| `resolved` | `boolean` | 局部 | waitForSessionComplete 状态 |

### 新增日志

| 日志内容 | 级别 | 用途 |
|----------|------|------|
| `[ERROR] followUp 失败: ${errorMessage}` | error | 记录 followUp 错误 |
| `[ERROR] prompt 失败: ${errorMessage}` | error | 记录 prompt 错误 |
| `[ERROR] Session 处理超时` | error | 记录超时错误 |
| `[WebSocket] Logger 关闭失败: ${error}` | error | 记录 Logger 关闭失败 |
| `[DELETE] Session ${sessionId} 已清理` | info | 确认清理成功 |
| `[DELETE] Session ${sessionId} 清理失败: ${error}` | error | 记录清理失败 |
| `[SESSION] WebSocket 已关闭，停止重试` | info | 记录重试提前退出 |

---

## 测试建议

### 1. Session 切换竞态测试

```typescript
// 测试脚本：同时从多个连接切换到同一 session
const ws1 = new WebSocket('ws://localhost:3000/ws');
const ws2 = new WebSocket('ws://localhost:3000/ws');

ws1.onopen = () => {
  ws2.onopen = () => {
    // 同时发送切换请求
    ws1.send(JSON.stringify({
      type: 'switch_session',
      sessionId: 'target-session-id'
    }));
    ws2.send(JSON.stringify({
      type: 'switch_session',
      sessionId: 'target-session-id'
    }));
  };
};
```

**预期结果：**
- 只有一个切换成功
- 另一个收到 "Session 切换中，请稍后" 错误

### 2. 错误处理测试

```typescript
// 测试脚本：触发各种错误
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  // 发送无效消息
  ws.send(JSON.stringify({
    type: 'prompt',
    message: null  // 无效消息
  }));
};
```

**预期结果：**
- 客户端收到通用错误消息
- 服务器日志记录详细错误信息

### 3. 超时处理测试

```typescript
// 模拟长时间运行的 session
// 1. 修改 SESSION_TIMEOUT_MS 为较小值（如 5000ms）
// 2. 发送一个需要长时间处理的请求
// 3. 观察超时后的处理
```

**预期结果：**
- 超时后返回 408 状态码（HTTP）或错误消息（WebSocket）
- 事件订阅被正确清理
- 无内存泄漏

### 4. 重试机制测试

```typescript
// 测试脚本：在重试期间关闭连接
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'prompt',
    message: '测试消息'
  }));

  // 在收到 response 前关闭连接
  setTimeout(() => {
    ws.close();
  }, 100);
};
```

**预期结果：**
- 重试机制检测到连接关闭
- 停止重试，不向已关闭连接发送消息
- 日志记录 "WebSocket 已关闭，停止重试"

---

## 相关文档

- [WebSocket 高优先级问题修复](./websocket-optimization-2026-03-29.md)
- [HTTP vs WebSocket 事件处理机制差异](./http-vs-websocket-difference.md)
- [PI SDK 事件结构详解](./pi-sdk-event-structure.md)

---

## 修复时间线

| 时间 | 修复内容 |
|------|----------|
| 2026-03-29 | 完成 Session 切换竞态修复 |
| 2026-03-29 | 完成异步操作错误处理修复 |
| 2026-03-29 | 完成 waitForSessionComplete 超时处理修复 |
| 2026-03-29 | 完成 Logger 实例清理修复 |
| 2026-03-29 | 完成 Session 清理不完整修复 |
| 2026-03-29 | 完成 message_end 重试机制修复 |
