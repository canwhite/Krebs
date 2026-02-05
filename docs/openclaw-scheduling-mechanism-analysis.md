# openclaw-cn-ds 调度机制分析

> **创建时间**: 2026-02-05
> **分析目标**: 理解 openclaw-cn-ds 如何根据一系列操作给出结果
> **对比对象**: Krebs 项目

---

## 1. 核心调度架构

### 1.1 执行流程概览

```
用户请求 → runReplyAgent → runAgentTurnWithFallback → runEmbeddedPiAgent
                                                              ↓
                                                    Lane 队列调度
                                                              ↓
                                                    工具调用循环
                                                              ↓
                                                    结果组合 (buildEmbeddedRunPayloads)
```

**关键文件**：
- `src/auto-reply/reply/agent-runner.ts` - 入口协调器
- `src/auto-reply/reply/agent-runner-execution.ts` - 执行循环
- `src/agents/pi-embedded-runner/run.ts` - 核心 Agent 运行器
- `src/agents/pi-embedded-runner/run/attempt.ts` - 单次执行尝试

---

## 2. Lane 队列调度系统

### 2.1 什么是 Lane？

**Lane** 是 openclaw-cn-ds 的核心并发控制机制，类似于 Krebs 的 `scheduler/lanes.ts`。

**Lane 类型**（`src/agents/pi-embedded-runner/lanes.ts`）：
- **Session Lane**: 按会话隔离，避免同一会话的并发冲突
- **Global Lane**: 全局并发控制，限制总体并发数

**代码示例**：
```typescript
// src/agents/pi-embedded-runner/run.ts:72-77
const sessionLane = resolveSessionLane(params.sessionKey?.trim() || params.sessionId);
const globalLane = resolveGlobalLane(params.lane);

const enqueueSession = (task, opts) => enqueueCommandInLane(sessionLane, task, opts);
const enqueueGlobal = (task, opts) => enqueueCommandInLane(globalLane, task, opts);
```

### 2.2 队列嵌套

```typescript
// 嵌套队列：Session Lane → Global Lane
return enqueueSession(() =>
  enqueueGlobal(async () => {
    // Agent 执行代码
  })
);
```

**优势**：
1. **隔离性**: 同一会话的请求串行执行，避免状态冲突
2. **并发控制**: 全局限制总并发数，防止资源耗尽
3. **优先级**: 支持 Lane 优先级配置

---

## 3. Agent 执行主循环

### 3.1 runAgentTurnWithFallback

**位置**: `src/auto-reply/reply/agent-runner-execution.ts:54-`

**核心特性**：
```typescript
while (true) {  // 无限循环，直到成功或达到重试限制
  try {
    // 1. 尝试执行
    const fallbackResult = await runWithModelFallback({
      cfg: params.followupRun.run.config,
      provider,
      model,
      run: (provider, model) => runEmbeddedPiAgent({...})
    });

    // 2. 处理结果
    runResult = fallbackResult.result;
    break;  // 成功，退出循环

  } catch (error) {
    // 3. 错误处理和重试
    if (isContextOverflowError(error)) {
      // 自动压缩会话
      await resetSessionAfterCompactionFailure();
      continue;  // 重试
    }

    if (isAuthAssistantError(error)) {
      // 尝试下一个 Auth Profile
      const advanced = await advanceAuthProfile();
      if (advanced) continue;
    }

    // 其他错误，抛出
    throw error;
  }
}
```

### 3.2 失败重试机制

**错误分类**（`src/agents/pi-embedded-helpers.ts`）：
- **Context Overflow**: 会话上下文溢出 → 自动压缩
- **Auth Error**: 认证失败 → 切换 Auth Profile
- **Rate Limit**: 速率限制 → 等待或降级
- **Timeout**: 超时 → 重试
- **Compaction Failure**: 压缩失败 → 重置会话

**Model Fallback**（`src/agents/model-fallback.ts`）：
```typescript
await runWithModelFallback({
  provider,
  model,
  fallbacksOverride: resolveAgentModelFallbacksOverride(config, agentId),
  run: (provider, model) => {
    // 执行 Agent
  }
});
```

---

## 4. 工具调用管理

### 4.1 工具调度流程

**基于 pi-coding-agent**：

```typescript
// runEmbeddedPiAgent 内部调用
const runResult = await runEmbeddedAttempt({
  // ... 配置
  tools: skillsSnapshot,  // 技能快照
  onToolResult: (result) => {
    // 工具结果回调
  },
  onPartial: (partial) => {
    // 流式输出回调
  }
});
```

### 4.2 工具调用特性

1. **并行调用**: LLM 可以同时请求多个工具
2. **流式结果**: 工具结果可以流式返回给 LLM
3. **错误恢复**: 工具失败不会中断整个流程
4. **上下文注入**: 工具调用历史会被注入到后续的 LLM 请求中

**关键代码**（`src/agents/pi-embedded-runner/run/attempt.ts`）：
```typescript
// 构建 LLM 请求
const messages = [
  ...history,  // 历史消息（包括之前的工具调用）
  {
    role: "user",
    content: prompt
  }
];

// 执行 LLM 调用
const result = await anthropic.messages.create({
  messages,
  tools: skillsSnapshot,  // 工具定义
  max_tokens: 4096,
  stream: true,
});

// 处理流式响应
for await (const event of result) {
  if (event.type === "content_block_delta") {
    // 文本流
  } else if (event.type === "tool_use") {
    // 工具调用
    const toolResult = await executeTool(event);
    // 将工具结果添加到历史
    messages.push({
      role: "user",
      content: [{ type: "tool_result", ...toolResult }]
    });
  }
}
```

---

## 5. 结果组合机制

### 5.1 buildEmbeddedRunPayloads

**位置**: `src/agents/pi-embedded-runner/run/payloads.ts`

**功能**：
1. **解析 LLM 输出**: 提取文本、工具调用、媒体等
2. **组合 Payload**: 构建统一的消息格式
3. **处理标签**: 解析 `@reply`、`@final` 等特殊标签
4. **流式分块**: 支持分块流式输出

**代码示例**：
```typescript
export function buildEmbeddedRunPayloads(params: {
  completion: EmbeddedPiCompletion;
  toolResultFormat: "markdown" | "plain";
  // ...
}): ReplyPayload[] {
  const payloads: ReplyPayload[] = [];

  // 1. 提取文本块
  for (const block of completion.content) {
    if (block.type === "text") {
      payloads.push({
        kind: "text",
        text: block.text,
        // ...
      });
    } else if (block.type === "tool_use") {
      // 工具调用记录（不直接输出）
    }
  }

  // 2. 应用回复指令
  const parsed = parseReplyDirectives(payloads);

  // 3. 过滤和排序
  return applyReplyToMode(parsed);
}
```

### 5.2 回复指令（Reply Directives）

**特殊标签**：
- `@reply:user-id` - 指定回复目标
- `@final` - 标记最终回复
- `@silent` - 静默回复（不输出）
- `HEARTBEAT_OK` - 心跳标记

**解析代码**（`src/auto-reply/reply/reply-directives.ts`）：
```typescript
export function parseReplyDirectives(payloads: ReplyPayload[]) {
  return payloads.map(payload => {
    if (payload.text?.includes("@reply:")) {
      const match = payload.text.match(/@reply:(\S+)/);
      if (match) {
        payload.replyTo = match[1];
      }
    }
    return payload;
  });
}
```

---

## 6. 与 Krebs 的对比

### 6.1 架构差异

| 维度 | openclaw-cn-ds | Krebs |
|------|----------------|-------|
| **调度器** | Lane 队列系统 | Lane 队列系统（类似） |
| **Agent 核心** | runEmbeddedPiAgent | Agent.processWithTools |
| **工具管理** | pi-coding-agent（外部库） | 自建 Skills 系统 |
| **失败重试** | 多层级重试（Model Fallback + Auth Profile） | 基础重试 |
| **结果组合** | buildEmbeddedRunPayloads（复杂） | 简单字符串拼接 |
| **上下文管理** | 自动压缩（auto compaction） | 手动管理 |

### 6.2 核心差异分析

#### **差异 1: 工具调用深度**

**openclaw-cn-ds**:
```typescript
// 完整的工具调用循环
while (true) {
  const result = await llm_call(messages, tools);

  for (const block of result.content) {
    if (block.type === "tool_use") {
      // 执行工具
      const toolResult = await executeTool(block);
      // 将工具结果添加到历史
      messages.push({
        role: "user",
        content: [{ type: "tool_result", ...toolResult }]
      });
    }
  }

  if (allToolsDone) break;  // 所有工具执行完毕
}

// 返回最终文本
return finalText;
```

**Krebs**（当前）:
```typescript
// src/agent/core/agent.ts:processWithTools
const result = await this.provider.chat(messages, { tools });
// 简单返回结果，没有工具调用循环
return result;
```

**问题**: Krebs **缺少工具调用循环**，只调用一次 LLM，无法支持多步工具调用。

#### **差异 2: 结果组合和流式输出**

**openclaw-cn-ds**:
- ✅ 流式分块输出（block streaming）
- ✅ 工具结果分离输出
- ✅ 回复指令解析（@reply、@final）
- ✅ 心跳机制（HEARTBEAT_OK）

**Krebs**:
- ✅ 支持流式输出（chatStream）
- ❌ 无分块流式
- ❌ 无工具结果分离
- ❌ 无回复指令

#### **差异 3: 错误恢复**

**openclaw-cn-ds**:
- ✅ 上下文溢出自动压缩
- ✅ Auth Profile 自动切换
- ✅ Model Fallback（多模型降级）
- ✅ Rate Limit 冷却机制

**Krebs**:
- ⚠️ 基础错误处理
- ❌ 无自动压缩
- ❌ 无 Auth Profile 管理
- ❌ 无 Model Fallback

---

## 7. 改造建议

### 7.1 高优先级（核心功能缺失）

#### 1️⃣ **实现工具调用循环**

**目标**: 让 Agent 可以连续调用多个工具，然后给出最终答案。

**实施方案**：
```typescript
// src/agent/core/agent.ts
async processWithTools(messages, options) {
  let currentMessages = [...messages];
  const maxIterations = 10;  // 防止无限循环

  for (let i = 0; i < maxIterations; i++) {
    // 1. 调用 LLM
    const result = await this.provider.chat(currentMessages, {
      tools: this.skills.getAvailableTools()
    });

    // 2. 检查是否有工具调用
    const toolCalls = this.extractToolCalls(result);
    if (toolCalls.length === 0) {
      // 没有工具调用，返回最终结果
      return result;
    }

    // 3. 执行工具
    const toolResults = await this.executeTools(toolCalls);

    // 4. 将工具结果添加到历史
    for (const toolResult of toolResults) {
      currentMessages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: toolResult.id,
          content: JSON.stringify(toolResult.result)
        }]
      });
    }
  }

  throw new Error("Max iterations reached");
}
```

#### 2️⃣ **实现上下文自动压缩**

**目标**: 当上下文溢出时，自动压缩历史消息。

**实施方案**：
```typescript
// src/agent/core/context-manager.ts
async compactIfNeeded(messages: Message[]): Promise<Message[]> {
  const totalTokens = this.estimateTokens(messages);
  const maxTokens = this.getMaxTokens();

  if (totalTokens <= maxTokens) {
    return messages;  // 无需压缩
  }

  // 保留系统消息和最近的 N 条消息
  const systemMessages = messages.filter(m => m.role === "system");
  const recentMessages = messages.slice(-10);  // 保留最近 10 条

  // TODO: 更智能的压缩策略（如语义总结）
  return [...systemMessages, ...recentMessages];
}
```

#### 3️⃣ **实现结果 Payload 系统**

**目标**: 统一的消息格式，支持工具结果分离、流式分块等。

**实施方案**：
```typescript
// src/types/payload.ts
export interface ReplyPayload {
  kind: "text" | "tool_result" | "media";
  text?: string;
  toolUseId?: string;
  toolName?: string;
  toolResult?: unknown;
  replyTo?: string;  // @reply 标签
  final?: boolean;  // @final 标签
}

// src/agent/core/payload-builder.ts
export function buildPayloads(result: ChatCompletionResult): ReplyPayload[] {
  const payloads: ReplyPayload[] = [];

  for (const content of result.content) {
    if (content.type === "text") {
      payloads.push({ kind: "text", text: content.text });
    } else if (content.type === "tool_use") {
      // 记录工具调用，但暂不输出
      payloads.push({
        kind: "tool_result",
        toolUseId: content.id,
        toolName: content.name,
      });
    }
  }

  return payloads;
}
```

### 7.2 中优先级（增强功能）

#### 4️⃣ **Model Fallback 机制**

**实施方案**：
```typescript
// src/agent/core/model-fallback.ts
export async function runWithModelFallback<T>(params: {
  provider: string;
  model: string;
  fallbacks: Array<{ provider: string; model: string }>;
  run: (provider: string, model: string) => Promise<T>;
}): Promise<T> {
  try {
    return await params.run(params.provider, params.model);
  } catch (error) {
    if (isRecoverableError(error) && params.fallbacks.length > 0) {
      const [next, ...rest] = params.fallbacks;
      console.warn(`Model ${params.provider}/${params.model} failed, trying ${next.provider}/${next.model}`);
      return runWithModelFallback({
        provider: next.provider,
        model: next.model,
        fallbacks: rest,
        run: params.run,
      });
    }
    throw error;
  }
}
```

#### 5️⃣ **Lane 队列增强**

**Krebs 已有基础实现**，可以增强：
- 添加优先级支持
- 添加超时机制
- 添加队列统计

### 7.3 低优先级（锦上添花）

#### 6️⃣ **Auth Profile 管理**
- 适用于多账户场景
- 支持轮换、冷却等

#### 7️⃣ **心跳机制**
- 长时间任务的进度反馈
- 防止请求超时

---

## 8. 实施路线图

### 第一阶段：核心功能（2-3天）
- [ ] 实现工具调用循环
- [ ] 实现上下文自动压缩
- [ ] 实现 Payload 系统

### 第二阶段：增强功能（2-3天）
- [ ] Model Fallback
- [ ] Lane 队列增强
- [ ] 流式分块输出

### 第三阶段：高级功能（可选）
- [ ] Auth Profile 管理
- [ ] 心跳机制
- [ ] 智能上下文压缩（语义总结）

---

## 9. 关键代码位置索引

### openclaw-cn-ds
| 功能 | 文件路径 | 行号 |
|------|----------|------|
| Agent 执行入口 | `src/auto-reply/reply/agent-runner.ts` | 47 |
| 执行循环 | `src/auto-reply/reply/agent-runner-execution.ts` | 54 |
| 核心 Agent 运行器 | `src/agents/pi-embedded-runner/run.ts` | 69 |
| Lane 队列 | `src/agents/pi-embedded-runner/lanes.ts` | - |
| 结果组合 | `src/agents/pi-embedded-runner/run/payloads.ts` | - |
| 工具调用 | `src/agents/pi-embedded-runner/run/attempt.ts` | - |
| 上下文压缩 | `src/agents/pi-embedded-runner/compact.ts` | - |
| Model Fallback | `src/agents/model-fallback.ts` | - |

### Krebs
| 功能 | 文件路径 |
|------|----------|
| Agent 核心 | `src/agent/core/agent.ts` |
| 工具调度 | `src/agent/core/orchestrator.ts` |
| Lane 队列 | `src/scheduler/lanes.ts` |
| 技能系统 | `src/agent/skills/` |

---

## 10. 总结

### openclaw-cn-ds 的核心优势

1. **完整的工具调用循环** - 支持多步推理和工具链式调用
2. **智能的错误恢复** - 自动压缩、Model Fallback、Auth Profile 切换
3. **精细的结果控制** - Payload 系统、回复指令、流式分块
4. **强大的并发控制** - Lane 队列、优先级、超时

### Krebs 的改进方向

**最关键的缺失**：**工具调用循环**

这是多步推理的基础，没有它，Agent 只能"一步到位"，无法完成复杂任务。

**次重要**：**上下文自动压缩** + **结果 Payload 系统**

这两个功能是长期运行的保障。

---

**下一步**: 根据本文档的分析，开始实施 Krebs 的调度优化。
