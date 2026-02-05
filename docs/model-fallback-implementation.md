# Model Fallback 机制实现总结

> **完成时间**: 2026-02-05
> **优先级**: 第二优先级（核心功能）
> **状态**: ✅ 已完成并测试通过

---

## 📋 实现内容

### 1. 核心类型定义

**文件位置**: `src/agent/model-fallback/types.ts`

**核心类型**：
```typescript
export interface ModelConfig {
  provider: string;
  model: string;
}

export interface FallbackOptions {
  enabled?: boolean;
  recoverableErrors?: RegExp[];
  maxRetries?: number;
  retryDelay?: number;
  onFallback?: (from: ModelConfig, to: ModelConfig, error: Error) => void;
  onRetry?: (model: ModelConfig, attempt: number, error: Error) => void;
}
```

### 2. Fallback 执行器

**文件位置**: `src/agent/model-fallback/runner.ts`

**核心功能**：
- ✅ **多级降级**：主模型 → 多个备用模型
- ✅ **智能重试**：可恢复错误自动重试
- ✅ **错误识别**：识别 rate limit、timeout、服务器错误等
- ✅ **回调机制**：onFallback 和 onRetry 回调
- ✅ **上下文追踪**：FallbackContext 提供详细的执行状态

### 3. Agent 集成

**文件位置**: `src/agent/core/agent.ts`

**关键改动**：
```typescript
// AgentConfig 扩展
export interface AgentConfig {
  // ... 其他配置
  fallbackEnabled?: boolean;
  fallbackModels?: Array<{ provider: string; model: string }>;
}

// callLLM 方法使用 fallback
private async callLLM(messages: Message[]): Promise<any> {
  const primaryModel = { provider: providerName, model: defaultModel };
  const fallbackModels = this.config.fallbackModels || [];

  if (this.config.fallbackEnabled && fallbackModels.length > 0) {
    return await runWithModelFallback({
      primary: primaryModel,
      fallbacks: fallbackModels,
      run: async (modelConfig) => {
        return await this.deps.provider.chat(messages, { ... });
      },
      options: { enabled: true, ... },
    });
  }
  // 直接调用
}
```

---

## 🔧 核心功能详解

### 1. 多级降级机制

**功能**：当主模型失败时，自动按顺序尝试备用模型

**示例**：
```typescript
const models = [
  { provider: "anthropic", model: "claude-3-5-sonnet" },
  { provider: "anthropic", model: "claude-3-haiku" },
  { provider: "openai", model: "gpt-4" },
  { provider: "openai", model: "gpt-3.5-turbo" },
];

// 执行顺序：
// 1. claude-3-5-sonnet (重试 maxRetries 次)
// 2. claude-3-haiku (重试 maxRetries 次)
// 3. gpt-4 (重试 maxRetries 次)
// 4. gpt-3.5-turbo (重试 maxRetries 次)
// 5. 如果全部失败，抛出错误
```

### 2. 可恢复错误识别

**功能**：自动识别可恢复的错误，进行重试

**默认识别的错误类型**：
```typescript
const DEFAULT_RECOVERABLE_ERRORS = [
  // Rate limit errors
  /rate.*limit/i,
  /too.*many.*requests/i,
  /429/i,

  // Server errors
  /503/i,  // Service Unavailable
  /502/i,  // Bad Gateway
  /504/i,  // Gateway Timeout

  // Timeout errors
  /timeout/i,
  /timed out/i,

  // Network errors
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,

  // Context length errors
  /context.*length/i,
  /maximum.*context/i,

  // Authentication errors
  /401/i,
  /403/i,
  /unauthorized/i,

  // Model overload
  /overloaded/i,
  /capacity/i,
];
```

### 3. 智能重试策略

**策略**：
1. 可恢复错误：重试（最多 maxRetries 次）
2. 不可恢复错误：立即切换到下一个模型
3. 重试前延迟：retryDelay 毫秒

**示例**：
```typescript
// Rate limit error (可恢复)
// Attempt 1: 失败 → 等待 1000ms → 重试
// Attempt 2: 失败 → 等待 1000ms → 重试
// Attempt 3: 失败 → 切换到下一个模型

// Invalid API key (不可恢复)
// Attempt 1: 失败 → 立即切换到下一个模型
```

### 4. 回调机制

**onFallback 回调**：当切换模型时触发
```typescript
onFallback: (from, to, error) => {
  console.warn(`Fallback: ${from.model} -> ${to.model}`);
}
```

**onRetry 回调**：每次重试时触发
```typescript
onRetry: (model, attempt, error) => {
  console.warn(`Retry ${model.model} (${attempt}/${maxRetries})`);
}
```

---

## 📊 对比分析

### Krebs vs openclaw-cn-ds

| 维度 | openclaw-cn-ds | Krebs（实现前） | Krebs（实现后） |
|------|----------------|----------------|----------------|
| **多级降级** | ✅ 支持 | ❌ 无 | ✅ 支持 |
| **智能重试** | ✅ 支持 | ❌ 无 | ✅ 支持 |
| **错误识别** | ✅ 完善 | ❌ 无 | ✅ 基础支持 |
| **回调机制** | ✅ 支持 | ❌ 无 | ✅ 支持 |
| **上下文追踪** | ✅ 支持 | ❌ 无 | ✅ 支持 |

### 改进效果

**之前的问题**：
- ❌ 模型调用失败直接报错
- ❌ 无自动降级机制
- ❌ 用户体验差（频繁中断）

**现在的优势**：
- ✅ 自动降级，提高可用性
- ✅ 智能重试，减少失败率
- ✅ 详细的上下文追踪
- ✅ 灵活的回调机制

---

## 🎯 使用示例

### 示例 1：基础 Fallback

```typescript
import { runWithModelFallback } from "@/agent/model-fallback/index.js";

const result = await runWithModelFallback({
  primary: {
    provider: "anthropic",
    model: "claude-3-5-sonnet",
  },
  fallbacks: [
    { provider: "anthropic", model: "claude-3-haiku" },
    { provider: "openai", model: "gpt-4" },
  ],
  run: async (modelConfig, context) => {
    // 调用 LLM
    return await provider.chat(messages, {
      model: modelConfig.model,
      ...
    });
  },
  options: {
    enabled: true,
    maxRetries: 2,
    retryDelay: 1000,
  },
});
```

### 示例 2：Agent 配置

```typescript
import { Agent } from "@/agent/core/agent.js";

const agent = new Agent(
  {
    agentId: "my-agent",
    model: "claude-3-5-sonnet",
    fallbackEnabled: true,
    fallbackModels: [
      { provider: "anthropic", model: "claude-3-haiku" },
      { provider: "openai", model: "gpt-4" },
    ],
  },
  deps
);
```

### 示例 3：创建可重用的 Caller

```typescript
import { createFallbackLLMCaller } from "@/agent/model-fallback/index.js";

const caller = createFallbackLLMCaller({
  primary: { provider: "anthropic", model: "claude-3-5-sonnet" },
  fallbacks: [
    { provider: "anthropic", model: "claude-3-haiku" },
  ],
  options: {
    enabled: true,
    maxRetries: 2,
    onFallback: (from, to, error) => {
      console.warn(`Switching from ${from.model} to ${to.model}`);
    },
  },
});

// 多次使用
const result1 = await caller((model) => callLLM(model, messages1));
const result2 = await caller((model) => callLLM(model, messages2));
```

---

## ✅ 测试验证

### 测试覆盖

**测试文件**: `test/agent/model-fallback.test.ts`

**测试场景**（12个测试，全部通过）：
- ✅ 主模型正常时不触发 fallback
- ✅ 主模型失败时切换到备用模型
- ✅ 所有模型失败时抛出错误
- ✅ 未启用时直接运行主模型
- ✅ 可恢复错误时重试
- ✅ 达到最大重试次数后切换模型
- ✅ 不可恢复错误时立即切换模型
- ✅ 多级降级（按顺序尝试多个模型）
- ✅ createFallbackLLMCaller 可重用性
- ✅ 识别 rate limit 错误
- ✅ 识别 timeout 错误
- ✅ 识别服务器错误

### 测试结果

```
Test Files: 1 passed (1)
Tests: 12 passed (12)
Duration: 2.24s
```

### 全量测试

```
Test Files: 21 passed (21)
Tests: 353 passed (353)
Duration: 36.74s
```

---

## 🚀 后续优化方向

### 第三优先级（未实现）

#### 1️⃣ 跨 Provider Fallback

**当前限制**：假设所有模型使用同一个 provider 实例

**改进方向**：
- 支持动态创建不同的 provider 实例
- 支持跨 provider fallback（Anthropic → OpenAI → DeepSeek）

#### 2️⃣ 智能降级策略

**目标**：根据错误类型选择最优的 fallback 模型

**实施**：
```typescript
const fallbackStrategy = {
  rateLimit: ["claude-3-haiku", "gpt-3.5-turbo"],  // 降级到更快的模型
  contextLength: ["gpt-4"],  // 降级到更大上下文的模型
  authError: ["backup-profile"],  // 切换认证 profile
};
```

#### 3️⃣ 性能监控

**目标**：追踪每个模型的成功率和延迟

**实施**：
- 记录每个模型的调用次数、成功率
- 记录每个模型的平均响应时间
- 动态调整 fallback 顺序（优先使用高性能模型）

---

## 📝 与其他模块的集成

### 1. Agent 模块

- ✅ AgentConfig 支持 fallback 配置
- ✅ callLLM 方法集成 fallback 机制
- ✅ 自动推断 provider 名称

### 2. Provider 模块（未来增强）

- 计划：支持动态创建 provider 实例
- 计划：支持跨 provider fallback

### 3. Gateway 模块（未来集成）

- 计划：全局 fallback 配置
- 计划：fallback 事件通知

---

## 🎉 总结

**Model Fallback 机制已完成**！

Krebs 现在具备了：
- ✅ 多级模型降级
- ✅ 智能重试机制
- ✅ 可恢复错误识别
- ✅ 完整的测试覆盖（12个测试）

**完整功能列表**：
1. ✅ **工具并行执行优化** - Promise.allSettled 并行执行
2. ✅ **Payload 系统** - 统一消息格式，回复指令解析
3. ✅ **Model Fallback** - 多级降级，智能重试

**下一步**：
- 性能优化和监控
- 更智能的降级策略
- 跨 provider fallback

---

**相关文档**：
- `docs/openclaw-scheduling-mechanism-analysis.md` - openclaw-cn-ds 调度机制分析
- `docs/tool-calling-loop-implementation.md` - 工具调用循环实现
- `docs/payload-system-implementation.md` - Payload 系统实现
- `src/agent/model-fallback/` - Model Fallback 源码
- `test/agent/model-fallback.test.ts` - Model Fallback 测试
