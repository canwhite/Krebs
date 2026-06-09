# HTTP API 超时机制改造说明

## 📋 概述

本文档详细说明了 HTTP API 超时等待机制的改造过程，从硬编码的 10 秒轮询改为智能的事件驱动等待。

---

## 📝 改造前后代码对比

### 改造前的代码（已删除）

```typescript
// server.ts 第 517-538 行（已删除）

// 1. 设置一个标志
let isWriting = true;

// 2. 订阅事件，只是改标志位
session.subscribe((event) => {
  if (event.type === "message_end") {
    isWriting = false;  // 写完改成 false
    logger.log("[SESSION] 写入完成");
  }
});

// 3. 调用 AI
await session.prompt(message);

// 4. 轮询等待 10 秒（硬编码）
const maxWaitTime = 10000;  // 固定 10 秒
const startTime2 = Date.now();

while (isWriting && Date.now() - startTime2 < maxWaitTime) {
  // 每 100ms 检查一次 isWriting
  await new Promise((resolve) => setTimeout(resolve, 100));
}
```

**问题**：
- `while` 循环每 100ms 检查一次，浪费 CPU
- 固定 10 秒，不够灵活
- 响应快也要等满 10 秒

---

### 改造后的代码（现在使用的）

```typescript
// server.ts 第 365-405 行（新增的函数）

async function waitForSessionComplete(
  session: AgentSession,
  logger?: { log: (msg: string) => void },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    // 1. 设置超时定时器（默认 120 秒）
    const timer = setTimeout(() => {
      unsubscribe();
      clearInterval(checkInterval);
      reject(
        new Error(
          `Session 超时 (${SESSION_TIMEOUT_MS}ms)，当前状态: isStreaming=${session.isStreaming}`,
        ),
      );
    }, SESSION_TIMEOUT_MS);

    let resolved = false;

    // 2. 订阅 message_end 事件（AI 完成时触发）
    const unsubscribe = session.subscribe((event) => {
      if (event.type === "message_end") {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        clearInterval(checkInterval);
        unsubscribe();
        logger?.log(
          `[SESSION] message_end 收到，耗时: ${Date.now() - startTime}ms`,
        );
        resolve();  // ✅ 完成了，立即返回
      }
    });

    // 3. 备用方案：每 500ms 检查 isStreaming 状态
    const checkInterval = setInterval(() => {
      if (!session.isStreaming) {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        clearInterval(checkInterval);
        unsubscribe();
        logger?.log(
          `[SESSION] isStreaming=false，耗时: ${Date.now() - startTime}ms`,
        );
        resolve();  // ✅ 完成了，立即返回
      }
    }, 500);
  });
}
```

---

### 在 HTTP API 中的使用

```typescript
// server.ts 第 517-527 行（简化后的调用）

async function handleApiMessage(req: Request): Promise<Response> {
  // ... 前面的代码 ...

  // 调用 AI
  await session.prompt(message);

  // 等待完成（智能等待，最多 120 秒）
  await waitForSessionComplete(session, logger);

  // 读取结果并返回
  const fullTextResponse = await getLastAssistantMessageFromFile(
    sessionFilePath,
    logger,
  );

  return Response.json({
    sessionId: usedSessionId,
    response: fullTextResponse,
    generatedContent: extractFromSessionText(fullTextResponse, logger),
  });
}
```

---

## 🎯 改造的关键变化

### 变化 1：从轮询到事件驱动

```typescript
// ❌ 改造前：轮询（每 100ms 检查一次）
while (isWriting && Date.now() - startTime2 < 10000) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}

// ✅ 改造后：事件驱动（完成时立即触发）
session.subscribe((event) => {
  if (event.type === "message_end") {
    resolve();  // 立即返回，不等待
  }
});
```

### 变化 2：从固定超时到可配置超时

```typescript
// ❌ 改造前：硬编码 10 秒
const maxWaitTime = 10000;

// ✅ 改造后：环境变量配置（默认 120 秒）
const SESSION_TIMEOUT_MS = parseInt(process.env.SESSION_TIMEOUT_MS || "120000", 10);
```

在 `.env` 文件中：
```bash
SESSION_TIMEOUT_MS=180000  # 改成 3 分钟
```

### 变化 3：双重保障机制

```typescript
// ✅ 方式 1：等待 message_end 事件（主要）
session.subscribe((event) => {
  if (event.type === "message_end") {
    resolve();
  }
});

// ✅ 方式 2：检查 isStreaming 状态（备用）
setInterval(() => {
  if (!session.isStreaming) {
    resolve();
  }
}, 500);

// ✅ 方式 3：超时保护（最后防线）
setTimeout(() => {
  reject(new Error("超时"));
}, SESSION_TIMEOUT_MS);
```

---

## 📊 实际运行示例

### 场景 1：快速响应（3 秒）

```
改造前：
00:00 开始等待
00:03 AI 完成（但 isWriting = false）
00:10 10 秒到了，返回结果  ← 浪费了 7 秒

改造后：
00:00 开始等待
00:03 message_end 事件触发
00:03 立即返回结果  ← 不浪费时间！
```

### 场景 2：慢速响应（30 秒）

```
改造前：
00:00 开始等待
00:10 10 秒到了，强制返回  ← 结果不完整！❌

改造后：
00:00 开始等待
00:30 message_end 事件触发
00:30 返回完整结果  ← 等待完成，结果正确！✅
```

---

## 🔍 完整的请求流程

```
客户端发送请求
    ↓
[HTTP IN] 日志：收到请求
    ↓
session.prompt(message)  // 调用 AI
    ↓
waitForSessionComplete() 开始等待
    ↓
┌─────────────────────────────────┐
│  AI 思考（可能需要几秒到几分钟）  │
│  - 调用工具                      │
│  - 生成内容                      │
│  - MiniMax think 模式            │
└─────────────────────────────────┘
    ↓
message_end 事件触发
    ↓
[SESSION] 日志：message_end 收到
    ↓
从文件读取完整响应
    ↓
[HTTP OUT] 日志：返回结果
    ↓
客户端收到完整响应
```

---

## 📦 HTTP API vs WebSocket - 就像点餐

### HTTP API（像打包带走）
```
你 → 给餐厅打电话下单
............ (等待，什么都看不到)
餐厅 → 做好了，一次性给你所有食物
```

### WebSocket（像堂食看厨房）
```
你 → 坐在餐厅里下单
     ← 厨师开始切菜了
     ← 菜下锅了
     ← 加调料了
     ← 好了，端上来了
```

---

## 💡 为什么"中间没有输出"

### 你看到的（客户端）
```
发送请求 → .................................... → 收到响应
           ↑ 这里看起来"卡住了"
```

### 实际发生的（服务器端）
```
接收请求 → AI 开始思考 → AI 调用工具 → AI 生成内容 → 完成
           ↓              ↓              ↓
         有日志        有日志        有日志
      (monitor.log)  (monitor.log)  (monitor.log)
```

**关键点**：
- **客户端**：只能看到"发送"和"收到"两个时刻
- **服务器**：中间所有过程都记录在 `monitor.log` 文件里

---

## 🎯 如果你想看到中间过程

### 方法 1：查看服务器日志
```bash
# 实时查看日志
tail -f monitor.log
```

你会看到：
```
[HTTP IN] 收到请求
[SESSION] AI 开始思考
[TOOL] 调用工具
[SESSION] message_end 收到
[HTTP OUT] 返回响应
```

### 方法 2：使用前端界面（WebSocket）
打开 `http://localhost:3333`，你会看到：
- 实时显示 AI 的思考过程
- 逐步显示生成的内容
- 工具调用的进度

---

## 📝 总结

| 对比项 | HTTP API | WebSocket |
|--------|----------|-----------|
| 使用场景 | 程序调用 | 人工使用 |
| 中间输出 | ❌ 没有 | ✅ 实时显示 |
| 一次性返回 | ✅ 完整结果 | ❌ 流式返回 |
| 等待时间 | 改造前固定10秒，改造后智能等待 | 实时更新 |

**改造的核心**：把"傻等 10 秒"改成"等真正完成"，更灵活可靠！

---

## 🔧 配置说明

在 `.env` 文件中添加以下配置：

```bash
# Session 超时时间（毫秒）- HTTP API 等待 AI 响应的最长时间
# 默认 120000ms (2 分钟)，可根据 skill 执行时间调整
SESSION_TIMEOUT_MS=120000
```

**建议值**：
- 简单对话：`60000`（1 分钟）
- 包含 skill：`180000`（3 分钟）
- 复杂任务：`300000`（5 分钟）
