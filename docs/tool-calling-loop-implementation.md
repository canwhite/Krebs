# 工具调用循环实现总结

> **完成时间**: 2026-02-05
> **优先级**: 第一优先级（核心功能）
> **状态**: ✅ 已完成并测试通过

---

## 📋 实现内容

### 1. 中间消息保存

**之前**：只保存最终回复，丢失工具调用历史

**现在**：保存完整的对话历史

```typescript
// 保存的消息包括：
1. 用户消息
2. Assistant 消息（包含 tool_calls）
3. User 消息（包含 tool_result）
4. Assistant 消息（最终回复）
```

**代码位置**：`src/agent/core/agent.ts:136-174`

### 2. 上下文自动压缩

**功能**：当上下文过长时，自动删除旧消息

**策略**：
- 检测上下文长度（基于 token 估算）
- 保留最近 20 条消息
- 保守策略：3 字符 ≈ 1 token

**代码位置**：`src/agent/core/agent.ts:325-360`

```typescript
private async compactIfNeeded(messages: Message[]): Promise<Message[]> {
  const maxTokens = this.config.maxTokens || 4096;
  const estimatedTokens = this.estimateTokens(messages);

  if (estimatedTokens <= maxTokens * 0.8) {
    return messages;  // 未超限，直接返回
  }

  // 保留最近 20 条消息
  return messages.slice(-20);
}
```

### 3. 完整测试覆盖

**测试文件**：`test/agent/agent-tool-loop.test.ts`

**测试场景**（8个测试，全部通过）：
- ✅ 单步工具调用
- ✅ 多步顺序调用
- ✅ 并行工具调用
- ✅ 无工具调用（正常对话）
- ✅ 工具执行错误处理
- ✅ 工具不存在处理
- ✅ 最大迭代限制
- ✅ 会话历史管理

---

## 🔧 关键改动

### 改动 1: Message 类型扩展

**文件**：`src/types/index.ts`

```typescript
export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp?: number;
  // 新增：支持工具调用
  toolCalls?: any[];
}
```

### 改动 2: 保存所有中间消息

**文件**：`src/agent/core/agent.ts`

```typescript
// Tool Calling 循环
let currentMessages = [...messagesForLLM];
let iteration = 0;
const allMessages: Message[] = []; // 保存所有中间消息

while (iteration < this.maxIterations) {
  iteration++;
  const response = await this.callLLM(currentMessages);

  if (response.toolCalls && response.toolCalls.length > 0) {
    // 保存 assistant 的工具调用消息
    const assistantToolMessage: Message = {
      role: "assistant",
      content: response.content || "",
      timestamp: Date.now(),
      toolCalls: response.toolCalls,
    };
    allMessages.push(assistantToolMessage);
    currentMessages.push(assistantToolMessage);

    // 执行工具并保存结果
    const toolResults = await this.executeToolCalls(response.toolCalls);
    for (const toolResult of toolResults) {
      const toolResultMessage: Message = {
        role: "user",
        content: JSON.stringify({
          toolCallId: toolResult.id,
          toolName: toolResult.name,
          result: toolResult.result,
        }),
        timestamp: Date.now(),
      };
      allMessages.push(toolResultMessage);
      currentMessages.push(toolResultMessage);
    }

    continue;
  }

  // 最终回复
  const finalMessage = {
    role: "assistant",
    content: response.content || "",
    timestamp: Date.now(),
  };
  allMessages.push(finalMessage);

  // 保存所有消息（包含中间消息）
  const messagesToSave = [...history, ...allMessages];
  const compressedMessages = await this.compactIfNeeded(messagesToSave);
  await this.saveHistory(sessionId, compressedMessages);
}
```

---

## 📊 对比分析

### Krebs vs openclaw-cn-ds

| 维度 | openclaw-cn-ds | Krebs（改进前） | Krebs（改进后） |
|------|---------------|----------------|---------------|
| **中间消息保存** | ✅ 保存 | ❌ 不保存 | ✅ 保存 |
| **上下文压缩** | ✅ 智能压缩 | ❌ 无压缩 | ✅ 简单压缩 |
| **多步工具调用** | ✅ 支持 | ✅ 支持 | ✅ 支持 |
| **并行工具调用** | ✅ 支持 | ✅ 支持 | ✅ 支持 |
| **测试覆盖** | ✅ 完善 | ❌ 无测试 | ✅ 8个测试 |

### 改进效果

**之前的问题**：
- ❌ 丢失工具调用历史
- ❌ 无法追踪工具使用
- ❌ 上下文可能过长

**现在的优势**：
- ✅ 完整的对话历史
- ✅ 可以追踪和分析工具使用
- ✅ 自动控制上下文长度
- ✅ 更好的多轮对话支持

---

## 🎯 后续优化方向

### 第二优先级（已部分完成）

#### 1️⃣ 智能上下文压缩

**当前**：简单删除旧消息

**改进方向**：
- 语义总结（将旧消息总结为简短描述）
- 保留重要消息（如系统提示、关键信息）
- 分层压缩（保留最近的详细信息，旧消息总结）

#### 2️⃣ Payload 系统

**目标**：统一的消息格式，支持复杂的结果组合

**实施**：
- 定义 `ReplyPayload` 类型
- 支持工具结果分离输出
- 支持流式分块
- 支持回复指令（@reply、@final）

#### 3️⃣ Model Fallback

**目标**：模型错误时自动降级

**实施**：
```typescript
await runWithModelFallback({
  provider: "anthropic",
  model: "claude-3-5-sonnet",
  fallbacks: [
    { provider: "anthropic", model: "claude-3-haiku" },
    { provider: "openai", model: "gpt-4" }
  ],
  run: async (provider, model) => {
    // 执行 Agent
  }
});
```

---

## ✅ 验证结果

### 测试通过率

#### 基础测试
```
Test Files: 1 passed (1)
Tests: 8 passed (8)
Duration: 158ms
```

#### 全面测试
```
Test Files: 1 passed (1)
Tests: 19 passed (19)
Duration: 484ms
```

#### 全部测试
```
Test Files: 19 passed (19)
Tests: 316 passed (316)
Duration: 36.71s
```

**测试覆盖**：
- ✅ 单步工具调用
- ✅ 多步顺序调用
- ✅ 并行工具调用
- ✅ 无工具调用（正常对话）
- ✅ 工具执行错误处理
- ✅ 工具不存在处理
- ✅ 最大迭代限制
- ✅ 会话历史管理
- ✅ 中间消息保存
- ✅ 上下文自动压缩
- ✅ 工具参数传递
- ✅ 多会话隔离
- ✅ 边缘情况处理
- ✅ 性能测试

### 编译状态

```bash
npm run build
✅ 编译通过，无错误
```

### 功能验证

- ✅ 单步工具调用正常
- ✅ 多步顺序调用正常
- ✅ 并行工具调用正常
- ✅ 错误处理正常
- ✅ 中间消息保存正常
- ✅ 上下文压缩触发正常

---

## 📝 使用示例

### 单步工具调用

```typescript
const agent = new Agent(config, deps);
const result = await agent.process("What's the weather in Beijing?", "session-1");

// 执行流程：
// 1. LLM 调用 get_weather 工具
// 2. 执行工具，获取天气数据
// 3. LLM 根据工具结果生成最终回复
// 4. 保存所有中间消息
```

### 多步工具调用

```typescript
const result = await agent.process("Check weather and calculate", "session-2");

// 执行流程：
// 1. LLM 调用 get_weather 工具
// 2. 执行工具，获取结果
// 3. LLM 决定调用 calculate 工具
// 4. 执行工具，获取结果
// 5. LLM 综合两个工具的结果生成最终回复
// 6. 保存所有中间消息
```

### 并行工具调用

```typescript
const result = await agent.process("Check weather and time", "session-3");

// 执行流程：
// 1. LLM 同时调用 get_weather 和 get_time 工具
// 2. 并行执行两个工具
// 3. LLM 根据两个工具的结果生成最终回复
// 4. 保存所有中间消息
```

---

## 🎉 总结

**第一优先级功能已完成**！

Krebs 现在具备了：
- ✅ 完整的工具调用循环
- ✅ 中间消息保存
- ✅ 上下文自动压缩
- ✅ 全面的测试覆盖

**下一步**：实现第二优先级功能（Payload 系统、Model Fallback 等）

---

**相关文档**：
- `docs/openclaw-scheduling-mechanism-analysis.md` - openclaw-cn-ds 调度机制分析
- `test/agent/agent-tool-loop.test.ts` - 测试用例
- `src/agent/core/agent.ts` - 核心实现
