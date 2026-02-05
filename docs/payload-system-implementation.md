# Payload 系统实现总结

> **完成时间**: 2026-02-05
> **优先级**: 第二优先级（核心功能）
> **状态**: ✅ 已完成并测试通过

---

## 📋 实现内容

### 1. Payload 类型系统

**文件位置**: `src/agent/payload/types.ts`

**核心类型**：
```typescript
export type PayloadKind = "text" | "tool_result" | "media" | "error";

export interface TextPayload {
  kind: "text";
  text: string;
  replyTo?: string;  // @reply:user-id
  final?: boolean;   // @final 标记
  silent?: boolean;  // @silent 不输出
}

export interface ToolResultPayload {
  kind: "tool_result";
  toolCallId: string;
  toolName: string;
  result: unknown;
  success?: boolean;
  error?: string;
}
```

### 2. Payload 构建器

**文件位置**: `src/agent/payload/builder.ts`

**核心功能**：
- ✅ **回复指令解析**：解析 `@reply`、`@final`、`@silent` 等特殊标签
- ✅ **文本 Payload 创建**：支持指令解析和清理
- ✅ **工具结果 Payload 创建**：支持成功/失败状态
- ✅ **Payload 列表构建**：混合文本和工具结果
- ✅ **回复模式应用**：支持 `all` 和 `final_only` 模式
- ✅ **工具结果格式化**：JSON、Markdown、Plain 三种格式

### 3. Agent 集成

**文件位置**: `src/agent/core/agent.ts`

**关键改动**：
```typescript
// 收集所有工具结果
const allToolResults: any[] = [];

// 在工具调用循环中收集
allToolResults.push(...toolResults);

// 构建并返回 Payload 列表
const payloads = buildPayloads({
  content: response.content || "",
  toolResults: allToolResults,
  options: {
    toolResultFormat: "json",
    includeDirectives: true,
    filterSilent: true,
  },
});

return {
  response: response.content || "",
  payloads,  // 新增：结构化结果
  usage: response.usage,
};
```

### 4. 类型扩展

**文件位置**: `src/types/index.ts`

**AgentResult 扩展**：
```typescript
export interface AgentResult {
  response: string;
  payloads?: any[];  // 新增：Payload[] - 支持结构化结果
  usage?: { ... };
  success?: boolean;
  data?: unknown;
  error?: string;
}
```

---

## 🔧 核心功能详解

### 1. 回复指令解析

**功能**：解析文本中的特殊标签，控制消息行为

**支持指令**：
- `@reply:user-id` - 指定回复目标
- `@final` - 标记最终回复
- `@silent` - 静默回复（不输出）

**示例**：
```typescript
const text = "Processing @silent Internal work...";
const result = parseDirectives(text);

// result.silent === true
// result.cleanText === "Processing Internal work..."
```

### 2. 工具结果分离

**功能**：将工具调用结果与普通文本分离，提供结构化访问

**示例**：
```typescript
const payloads = buildPayloads({
  content: "I've searched for you",
  toolResults: [
    { id: "call_1", name: "search", result: { items: ["A", "B"] } }
  ],
});

// payloads[0] -> TextPayload ("I've searched for you")
// payloads[1] -> ToolResultPayload (search result)
```

### 3. 回复模式应用

**功能**：根据 `@final` 标记过滤返回内容

**模式**：
- `all` - 返回所有 Payload
- `final_only` - 只返回标记为 `@final` 的文本（如果没有 `@final`，返回所有文本）

**示例**：
```typescript
const payloads = [
  { kind: "text", text: "Thinking..." },
  { kind: "tool_result", toolName: "search" },
  { kind: "text", text: "Done @final", final: true },
];

const result = applyReplyMode(payloads, "final_only");
// result -> [{ kind: "text", text: "Done", final: true }]
```

---

## 📊 对比分析

### Krebs vs openclaw-cn-ds

| 维度 | openclaw-cn-ds | Krebs（实现前） | Krebs（实现后） |
|------|----------------|----------------|----------------|
| **消息格式** | ReplyPayload[] | 简单字符串 | Payload[] |
| **工具结果分离** | ✅ 支持 | ❌ 混合 | ✅ 支持 |
| **回复指令** | ✅ 支持 | ❌ 无 | ✅ 支持 |
| **流式分块** | ✅ 支持 | ❌ 无 | ⚠️ 基础支持 |
| **结果格式化** | ✅ 多种格式 | ❌ 无 | ✅ 3 种格式 |

### 改进效果

**之前的问题**：
- ❌ 工具结果与文本混合，难以解析
- ❌ 无法标记回复行为（@reply、@final）
- ❌ 没有结构化的结果格式

**现在的优势**：
- ✅ 清晰的消息类型分离
- ✅ 支持回复指令控制
- ✅ 结构化、可扩展的结果格式
- ✅ 多种工具结果格式化选项

---

## 🎯 使用示例

### 示例 1：基础 Payload 构建

```typescript
import { buildPayloads } from "@/agent/payload/index.js";

const payloads = buildPayloads({
  content: "The weather in Beijing is sunny @final",
  toolResults: [
    {
      id: "call_1",
      name: "get_weather",
      result: { city: "Beijing", temp: 25, condition: "sunny" }
    }
  ],
  options: {
    toolResultFormat: "json",
    includeDirectives: true,
    filterSilent: true,
  },
});

// payloads[0] -> TextPayload
// { kind: "text", text: "The weather in Beijing is sunny", final: true }

// payloads[1] -> ToolResultPayload
// { kind: "tool_result", toolName: "get_weather", result: {...} }
```

### 示例 2：解析回复指令

```typescript
import { parseDirectives } from "@/agent/payload/index.js";

const text = "Done @reply:alice @final";
const { replyTo, final, cleanText } = parseDirectives(text);

// replyTo -> "alice"
// final -> true
// cleanText -> "Done"
```

### 示例 3：格式化工具结果

```typescript
import { formatToolResult } from "@/agent/payload/index.js";

const payload = {
  kind: "tool_result",
  toolCallId: "call_1",
  toolName: "search",
  result: { query: "test", count: 5 }
};

// JSON 格式
const json = formatToolResult(payload, "json");
// '{\n  "query": "test",\n  "count": 5\n}'

// Markdown 格式
const md = formatToolResult(payload, "markdown");
// '**Tool:** search\n```\n{...}\n```'

// Plain 格式
const plain = formatToolResult(payload, "plain");
// '[search] {"query":"test","count":5}'
```

---

## ✅ 测试验证

### 测试覆盖

**测试文件**: `test/agent/payload.test.ts`

**测试场景**（25个测试，全部通过）：
- ✅ 回复指令解析（@reply、@final、@silent）
- ✅ 文本 Payload 创建
- ✅ 工具结果 Payload 创建
- ✅ Payload 列表构建
- ✅ 回复模式应用
- ✅ 工具结果格式化
- ✅ 集成测试

### 测试结果

```
Test Files: 1 passed (1)
Tests: 25 passed (25)
Duration: 153ms
```

### 全量测试

```
Test Files: 20 passed (20)
Tests: 341 passed (341)
Duration: 36.74s
```

---

## 🚀 后续优化方向

### 第三优先级（未实现）

#### 1️⃣ 流式分块输出

**目标**：支持流式 Payload，逐步输出结果

**实施**：
- 定义 `StreamPayload` 类型
- 实现 `buildStreamingPayloads` 函数
- 支持增量式 Payload 发送

#### 2️⃣ 媒体 Payload

**目标**：支持图片、音频等媒体内容

**实施**：
```typescript
export interface MediaPayload {
  kind: "media";
  mediaType: "image" | "audio" | "video" | "file";
  url?: string;
  data?: string;  // base64
  mimeType?: string;
}
```

#### 3️⃣ Payload 序列化

**目标**：标准化的 Payload 序列化和反序列化

**实施**：
- 定义 `serializePayload` / `deserializePayload` 函数
- 支持 JSON 和 MessagePack 格式
- 跨进程/跨服务传输

---

## 📝 与其他模块的集成

### 1. Agent 模块

- ✅ Agent.process() 返回 AgentResult.payloads
- ✅ 收集所有工具结果
- ✅ 构建完整 Payload 列表

### 2. Gateway 模块（未来集成）

- 计划：支持 Payload 的 WebSocket 推送
- 计划：根据 `@reply` 指令路由消息
- 计划：根据 `@final` 判断是否结束流

### 3. Skills 模块（未来集成）

- 计划：Skills 可以返回 Payload
- 计划：支持 `@silent` 技能（不输出中间步骤）

---

## 🎉 总结

**Payload 系统已完成**！

Krebs 现在具备了：
- ✅ 统一的消息格式（Payload）
- ✅ 回复指令解析（@reply、@final、@silent）
- ✅ 工具结果分离和格式化
- ✅ 完整的测试覆盖（25个测试）

**下一步**：实现 Model Fallback 机制

---

**相关文档**：
- `docs/openclaw-scheduling-mechanism-analysis.md` - openclaw-cn-ds 调度机制分析
- `docs/tool-calling-loop-implementation.md` - 工具调用循环实现总结
- `src/agent/payload/` - Payload 系统源码
- `test/agent/payload.test.ts` - Payload 测试用例
