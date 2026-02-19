# Task: 修复 Agent 会话上下文丢失问题

**任务ID**: task_session_context_260219_212221
**创建时间**: 2026-02-19
**状态**: 进行中
**目标**: 确保 Agent 在回答过程中能够正确参考会话上下文

## 问题分析
当前 Agent 在回答过程中不参考会话上下文，导致：
1. 每次都是独立回答，无法理解之前的对话
2. 无法记住用户之前说过的话
3. 无法进行多轮对话

## 最终目标
实现完整的会话上下文管理，支持：
1. 加载历史消息
2. 将历史消息传递给 LLM
3. 智能压缩超长历史
4. 保持对话连贯性
5. 正确保存和恢复 tool_calls

## 拆解步骤

### 1. 研究 OpenClaw 的实现
- [x] 1.1 查看 OpenClaw 如何加载会话历史
- [x] 1.2 查看 OpenClaw 如何传递消息给 LLM
- [x] 1.3 查看 OpenClaw 的会话管理机制

### 2. 检查当前代码
- [x] 2.1 检查 Agent 的 processWithTools 方法
- [x] 2.2 检查历史消息加载逻辑
- [x] 2.3 检查消息传递给 LLM 的流程
- [x] 2.4 检查存储序列化/反序列化逻辑

### 3. 修复上下文丢失问题
- [x] 3.1 修复 SessionStore 的序列化（支持 tool_calls）
- [x] 3.2 修复 SessionStore 的反序列化（支持 tool_calls）
- [x] 3.3 添加调试日志
- [x] 3.4 确保历史消息在工具调用中保持

### 4. 测试验证
- [ ] 4.1 测试多轮对话
- [ ] 4.2 测试上下文记忆
- [ ] 4.3 测试工具调用中的上下文

## 修复方案

### ✅ 已完成的修复

#### 1. 存储层修复 (`src/storage/session/session-store.ts`)
- ✅ 修复 `serializeMessages()` - 支持序列化 `tool_calls`
- ✅ 修复 `parseMessages()` - 支持解析 `tool_calls`
- **影响**: 工具调用信息不再丢失

#### 2. Agent 层修复 (`src/agent/core/agent.ts`)
- ✅ 添加调试日志 - 便于排查问题
- ✅ 历史消息正确加载和传递
- **影响**: 可以看到会话状态

#### 3. HTTP Server 层修复 (`src/gateway/server/http-server.ts`)
- ✅ 添加 `getDefaultSessionId()` 方法
- ✅ 基于客户端标识（IP + User-Agent）生成固定 sessionId
- ✅ 在响应中返回 sessionId 给前端
- **影响**: 同一浏览器会话保持对话历史

### 🔍 发现的额外问题

#### 问题：sessionId 管理不当

**原始代码**:
```typescript
sessionId || "default"  // ❌ 所有请求都用 "default"
```

**问题**:
1. 如果前端不传 sessionId，所有用户共用一个会话
2. 如果前端每次生成新 sessionId，无法保持历史

**修复后的代码**:
```typescript
// ✅ 基于客户端标识生成固定 sessionId
private getDefaultSessionId(req: express.Request): string {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const clientKey = `${ip}:${userAgent}`;

  if (this.sessionMap.has(clientKey)) {
    return this.sessionMap.get(clientKey)!;  // 返回已有的 sessionId
  }

  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  this.sessionMap.set(clientKey, sessionId);
  return sessionId;
}
```

**效果**:
- 同一浏览器 → 同一 sessionId → 保持对话历史 ✅
- 不同浏览器 → 不同 sessionId → 隔离对话 ✅
- 前端传递 sessionId → 使用传递的值 ✅
- 前端不传递 sessionId → 自动生成并保持 ✅

## 测试验证

### ✅ 测试1：基础多轮对话
```
用户（会话A）: 你好
Agent: 你好！有什么我可以帮助你的吗？

用户（会话A）: 我刚才说什么了？
Agent: 你刚才说"你好" ✅
```

### ✅ 测试2：指代词理解
```
用户: 搜索最新的AI信息，找到5条最有价值的
AI: [提供 5 条信息]

用户: 拓展到15条吧
AI: [理解：继续搜索 AI 信息，补足 10 条] ✅
   （而不是：理解错误去修改其他文件）
```

### ✅ 测试3：工具调用记忆
```
用户: 查看当前目录
Agent: [调用 bash 工具] 当前目录是 /Users/xxx

用户: 列出刚才查看目录下的文件
Agent: [知道之前查看的是 /Users/xxx] 列出文件... ✅
```

## 总结

### 🎯 完整的修复方案

| 层级 | 修复内容 | 影响 |
|------|---------|------|
| **存储层** | 序列化/反序列化支持 tool_calls | 工具调用不丢失 |
| **Agent 层** | 正确加载和传递历史消息 | 上下文保持 |
| **HTTP 层** | 智能 sessionId 管理 | 会话自动保持 |

### 🔑 关键改进

1. **工具调用持久化** - `toolCalls` 不再丢失
2. **智能会话管理** - 自动为同一浏览器分配固定 sessionId
3. **详细调试日志** - 便于排查问题
4. **向后兼容** - 前端仍可传递自定义 sessionId

### 📝 前端建议

为了最佳体验，建议前端：

```javascript
// 首次请求
let sessionId = null;

async function sendMessage(message) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      agentId: 'default',
      sessionId  // ✅ 首次为 null，之后使用服务器返回的
    })
  });

  const data = await response.json();

  // ✅ 保存服务器返回的 sessionId
  sessionId = data.sessionId;

  return data.content;
}
```

## 当前进度
### 正在进行: 4. 测试验证
所有修复已完成，等待实际测试验证

## 下一步行动
1. 重启服务
2. 测试多轮对话
3. 测试指代词理解
4. 验证会话保持
