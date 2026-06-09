# HTTP API 网关改造文档

## 概述

本文档记录了对 Krebs HTTP API 网关的改造，使外部前端通过 HTTP API 调用时能够直接获取 AI 生成的内容，而不是文件路径或成功消息。

---

## 改造背景

### 原有问题

当外部前端通过 HTTP API 调用网关时，AI 使用 `write` 工具生成的内容会被写入本地 `custom/` 目录，但 HTTP 响应只返回类似 "Successfully wrote 31 bytes to simple_data.json" 的成功消息，而不是实际生成的内容。

这对于作为网关服务的场景是不合理的，调用方需要的是最终生成的数据，而非文件操作状态。

### 期望行为

HTTP API 响应应该直接返回 AI 生成的最终内容（如 JSON 数据），调用方可以直接使用，无需访问本地文件系统。

---

## 改造内容

### 改造 1: 添加 HTTP 请求日志

**文件**: `server.ts` (第 371-455 行)

**位置**: `handleApiMessage` 函数

**修改内容**:

```typescript
async function handleApiMessage(req: Request): Promise<Response> {
  const startTime = Date.now();
  const logger = MonitorLogger.getInstance();

  // 请求进入时记录
  logger.log(
    `[HTTP IN] Method: ${req.method} | Path: /api/messages | SessionID: ${sessionId || "(new)"} | Message: ${message?.substring(0, 100)}...`
  );

  // ... 处理逻辑 ...

  // 响应返回时记录
  logger.log(
    `[HTTP OUT] Status: 200 | SessionID: ${usedSessionId} | ResponseLength: ${textResponse.length} | HasGeneratedContent: ${!!generatedContent} | Duration: ${Date.now() - startTime}ms`
  );
}
```

**作用**: 方便观测 HTTP 请求和响应，包括耗时、是否生成内容等关键指标。

---

### 改造 2: 提取工具调用内容并返回

**文件**: `server.ts` (第 412-450 行)

**位置**: `handleApiMessage` 函数中的事件订阅和响应构建

**修改内容**:

```typescript
// 收集工具调用信息
const toolCalls: Array<{
  toolName: string;
  args: any;
  timestamp: number;
}> = [];

session.subscribe((event) => {
  events.push(event);

  // 捕获工具调用开始
  if (event.type === "tool_execution_start") {
    toolCalls.push({
      toolName: event.toolName,
      args: event.args,
      timestamp: Date.now(),
    });
  }
});

// 提取 write 工具生成的内容
let generatedContent: string | undefined;
const writeToolCall = toolCalls.find((tc) => tc.toolName === "write");
if (writeToolCall?.args?.content) {
  generatedContent = writeToolCall.args.content;
}

// 在响应中包含生成内容
return Response.json({
  sessionId: usedSessionId,
  response: textResponse,
  generatedContent: generatedContent,  // 新增字段
}, { headers: corsHeaders });
```

**响应格式**:

```json
{
  "sessionId": "session_xxx",
  "response": "AI的文本回复，可能包含解释和说明",
  "generatedContent": "{\n  \"name\": \"张三\",\n  \"age\": 28\n}"
}
```

**重要说明**:

- `response`: AI 的完整文本回复，包含中间思考过程、解释等
- `generatedContent`: `write` 工具的 `content` 参数，即最终生成的产物
- `generatedContent` 的结构由用户的 prompt 决定，不是固定的

**作用**: 前端可以直接从 `generatedContent` 字段获取 AI 生成的最终内容，不需要读取本地文件。

---

### 改造 3: 优化 systemPrompt

**文件**: `server.ts` (第 154-172 行)

**修改前**:
```typescript
"写新文件时必须使用 write 工具，有一种特殊情况，如果要返回json那就返回最终的生成结果"
```

**修改后**:
```typescript
"写新文件时必须使用 write 工具"
"当用户要求生成 JSON 时，必须严格按照用户指定的格式和字段生成，不要自作主张修改格式"
```

**作用**: 明确指令，让 AI 严格按照用户指定的 JSON 格式生成，而不是自作主张修改格式。

---

## 使用示例

### 示例 1: 生成简单 JSON

**请求**:
```bash
curl -X POST http://localhost:3333/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"message": "请生成一个用户信息JSON，包含姓名、年龄、城市三个字段"}'
```

**响应**:
```json
{
  "sessionId": "session_1774430105763_u56i2n6",
  "response": "我来为您生成一个用户信息JSON...",
  "generatedContent": "{\n  \"name\": \"张三\",\n  \"age\": 28,\n  \"city\": \"北京\"\n}"
}
```

**前端解析**:
```javascript
const data = await response.json();
const userInfo = JSON.parse(data.generatedContent);
console.log(userInfo); // { name: "张三", age: 28, city: "北京" }
```

---

### 示例 2: 生成自定义格式 JSON

**请求**:
```bash
curl -X POST http://localhost:3333/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "message": "请生成JSON，格式要求：{\"title\": \"章节名称\", \"chapter\": \"正文内容\", \"continuity_check\": {\"time\": \"时间\", \"space\": \"空间\"}}"
  }'
```

**响应**:
```json
{
  "sessionId": "session_xxx",
  "response": "我将为您生成符合要求的JSON...",
  "generatedContent": "{\n  \"title\": \"第一章\",\n  \"chapter\": \"这是一个测试\",\n  \"continuity_check\": {\n    \"time\": \"时间\",\n    \"space\": \"空间\"\n  }\n}"
}
```

**前端解析**:
```javascript
const data = await response.json();
const chapter = JSON.parse(data.generatedContent);
console.log(chapter.title);    // "第一章"
console.log(chapter.chapter);   // "这是一个测试"
```

---

## 关键文件

| 文件路径 | 修改内容 |
|---------|---------|
| `/Users/zack/Desktop/Krebs/server.ts` | HTTP API 主要逻辑，包含所有改造 |

---

## 注意事项

### 1. `generatedContent` 的结构

`generatedContent` 的结构由用户的 prompt 决定，不是固定的。AI 会严格按照用户指定的格式生成。

### 2. 前端解析

前端需要使用 `JSON.parse()` 解析 `generatedContent` 字段：

```javascript
const data = await response.json();
const finalResult = JSON.parse(data.generatedContent);
```

### 3. 超时问题

对于复杂的生成任务（如小说章节），AI 可能需要较长时间（2-3 分钟）。建议在客户端设置较长的超时时间：

```javascript
fetch(url, {
  signal: AbortSignal.timeout(300000) // 5分钟
})
```

---

## 测试验证

### 测试命令

```bash
# 启动服务器
bun run server.ts

# 发送测试请求
TOKEN=$(grep "TOKEN=" .env | cut -d'=' -f2)
curl -X POST http://localhost:3333/api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "请生成一个用户信息JSON，包含姓名和年龄"}'
```

### 验证结果

测试通过，确认：
- ✅ HTTP 响应包含 `generatedContent` 字段
- ✅ `generatedContent` 包含 AI 生成的最终内容
- ✅ 日志正确记录请求耗时和结果
- ✅ AI 严格按照用户指定的 JSON 格式生成

---

## 完成状态

- ✅ 添加 HTTP 请求日志
- ✅ 提取 `write` 工具内容并返回
- ✅ 优化 systemPrompt 指令
- ✅ 测试验证通过
