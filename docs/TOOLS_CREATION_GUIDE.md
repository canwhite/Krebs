# Krebs 工具系统完整指南

> 从零创建工具到系统集成的完整流程

## 目录

1. [系统架构概览](#系统架构概览)
2. [工具定义](#工具定义)
3. [工具创建流程](#工具创建流程)
4. [工具加载机制](#工具加载机制)
5. [平台适配](#平台适配)
6. [完整示例](#完整示例)
7. [最佳实践](#最佳实践)

---

## 系统架构概览

### 核心组件

```
┌─────────────────────────────────────────────────────────┐
│                    Krebs 工具系统                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐        ┌──────────────┐             │
│  │  工具定义层   │        │  工具注册表   │             │
│  │  Tool Type   │───────▶│  Registry    │             │
│  └──────────────┘        └──────────────┘             │
│                                  │                       │
│  ┌──────────────┐        ┌──────────────┐             │
│  │  工具策略层   │◀───────│              │             │
│  │  Policy      │        │              │             │
│  └──────────────┘        │              │             │
│                                  │                       │
│  ┌──────────────┐        │              │             │
│  │  平台适配层   │        │              │             │
│  │  Adapters    │        │              │             │
│  └──────────────┘        │              │             │
│                                  │                       │
│  ┌──────────────┐        │              │             │
│  │  LLM 集成层   │        │              │             │
│  │  Agent       │◀───────│              │             │
│  └──────────────┘        └──────────────┘             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 数据流向

```
1. 工具定义 (Tool)
   ↓
2. 注册到工具列表 (getBuiltinTools)
   ↓
3. Agent 加载工具
   ↓
4. 应用策略过滤 (resolveToolPolicy)
   ↓
5. 平台适配 (adaptToolsForDeepSeek)
   ↓
6. 传递给 LLM (tools 参数)
   ↓
7. LLM 调用工具
   ↓
8. Agent 执行 (execute)
   ↓
9. 返回结果给 LLM
```

---

## 工具定义

### Tool 接口

**文件**: `src/agent/tools/types.ts`

```typescript
interface Tool {
  /** 工具名称（唯一标识） */
  name: string;

  /** 工具描述（LLM 会看到这个描述） */
  description: string;

  /** 参数 Schema */
  inputSchema: ToolParameterSchema;

  /** 执行函数 */
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}
```

### 参数 Schema

```typescript
interface ToolParameterSchema {
  type: "object" | "string" | "number" | "boolean" | "array";
  description?: string;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
}
```

### 执行结果

```typescript
interface ToolResult {
  /** 是否成功执行 */
  success: boolean;

  /** 返回的数据（成功时） */
  data?: unknown;

  /** 错误信息（失败时） */
  error?: string;

  /** 输出文本（用于显示） */
  output?: string;
}
```

---

## 工具创建流程

### 步骤 1: 定义工具结构

创建一个新文件，如 `src/agent/tools/my-tool.ts`:

```typescript
import { createLogger } from "@/shared/logger.js";
import type { Tool } from "./types.js";

const logger = createLogger("MyTool");

export const myTool: Tool = {
  name: "my_tool",
  description: "工具的简短描述，LLM 会根据这个描述决定何时使用",
  inputSchema: {
    type: "object",
    properties: {
      param1: {
        type: "string",
        description: "参数1的描述",
      },
      param2: {
        type: "number",
        description: "参数2的描述（可选）",
      },
    },
    required: ["param1"],
  },

  async execute(params): Promise<{ success: boolean; data?: unknown; error?: string }> {
    // 1. 提取参数
    const param1 = params.param1 as string;
    const param2 = params.param2 as number | undefined;

    // 2. 参数验证
    if (!param1) {
      return {
        success: false,
        error: "param1 is required",
      };
    }

    try {
      logger.info(`Executing my_tool with param1=${param1}`);

      // 3. 执行工具逻辑
      const result = await doSomething(param1, param2);

      // 4. 返回成功结果
      return {
        success: true,
        data: result,
      };
    } catch (error) {
      // 5. 返回失败结果
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`my_tool failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};

// 辅助函数
async function doSomething(param1: string, param2?: number): Promise<any> {
  // 实现具体的工具逻辑
  return { result: "done" };
}
```

### 步骤 2: 注册工具

**文件**: `src/agent/tools/builtin.ts`

```typescript
import { myTool } from "./my-tool.js";

export function getBuiltinTools(): Tool[] {
  return [
    bashTool,
    readTool,
    writeTool,
    editTool,
    webSearchTool,
    webFetchTool,
    myTool,  // ✅ 添加新工具
  ];
}
```

### 步骤 3: 导出工具

**文件**: `src/agent/tools/index.ts`

```typescript
// 新工具
export { myTool } from "./my-tool.js";
```

### 步骤 4: 更新工具分组（可选）

**文件**: `src/agent/tools/groups.ts`

```typescript
export const TOOL_GROUPS: Record<string, string[]> = {
  // ... 现有分组

  // 添加新分组
  "group:custom": ["my_tool", "another_tool"],
};
```

### 步骤 5: 测试工具

创建测试文件 `test/test-my-tool.ts`:

```typescript
import { myTool } from "../src/agent/tools/my-tool.js";

async function test() {
  console.log("测试 my_tool:");

  // 测试成功情况
  const result1 = await myTool.execute({
    param1: "test",
  });
  console.log("结果1:", result1);

  // 测试失败情况
  const result2 = await myTool.execute({
    param1: "",
  });
  console.log("结果2:", result2);
}

test();
```

---

## 工具加载机制

### 1. 工具注册流程

```
getBuiltinTools() 被调用
  ↓
返回所有工具的数组
  ↓
Agent 获取工具列表
  ↓
工具可用于后续处理
```

**代码位置**: `src/agent/tools/builtin.ts`

```typescript
export function getBuiltinTools(): Tool[] {
  // 返回所有内置工具
  return [
    bashTool,
    readTool,
    writeTool,
    editTool,
    webSearchTool,
    webFetchTool,
    // ... 更多工具
  ];
}
```

### 2. Agent 加载工具

**文件**: `src/agent/core/agent.ts`

```typescript
export class Agent {
  private deps: {
    tools?: Tool[];  // 工具列表
  };

  constructor(config: AgentConfig, deps: AgentDeps) {
    this.deps = deps;
  }

  private async callLLM(messages: Message[]): Promise<any> {
    // 工具会通过 this.deps.tools 传递
    return await this.deps.provider.chat(messages, {
      model: this.config.model,
      tools: this.deps.tools,  // ✅ 工具在这里
    });
  }
}
```

### 3. 工具策略过滤

**文件**: `src/agent/core/agent.ts` (集成示例)

```typescript
private async callLLM(messages: Message[]): Promise<any> {
  // 1. 解析工具策略
  const policy = resolveToolPolicy(
    this.config.toolProfile,    // 配置文件: minimal/coding/full
    this.config.toolAllowlist,   // 自定义允许列表
    this.config.toolDenylist     // 自定义禁止列表
  );

  // 2. 过滤工具
  const filteredTools = filterToolsByPolicy(
    this.deps.tools || [],
    policy
  );

  // 3. 转换为平台格式
  const platform = this.inferProvider(this.config.model);
  const adaptedTools = this.adaptTools(filteredTools, platform);

  // 4. 调用 LLM
  return await this.deps.provider.chat(messages, {
    tools: adaptedTools,
  });
}
```

---

## 平台适配

### 为什么需要平台适配？

不同的 LLM 平台使用不同的工具格式：

| 平台 | 工具格式 | 示例 |
|------|---------|------|
| DeepSeek | OpenAI 兼容 | `{type: "function", function: {...}}` |
| OpenAI | OpenAI 格式 | `{type: "function", function: {...}}` |
| Anthropic | 原生格式 | `{name: "...", input_schema: {...}}` |

### 适配流程

```
Krebs Tool (统一格式)
  ↓
Platform Adapter (转换器)
  ↓
Platform Specific Format (平台特定格式)
  ↓
LLM API Call
```

### DeepSeek 适配器

**文件**: `src/agent/tools/adapters/deepseek.ts`

```typescript
export function adaptToolForDeepSeek(tool: Tool): DeepSeekToolDeclaration {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: convertProperties(tool.inputSchema.properties || {}),
        required: tool.inputSchema.required || [],
      },
    },
  };
}

export function adaptToolsForDeepSeek(tools: Tool[]): DeepSeekToolDeclaration[] {
  return tools.map(adaptToolForDeepSeek);
}
```

### Anthropic 适配器

**文件**: `src/agent/tools/adapters/anthropic.ts`

```typescript
export function adaptToolForAnthropic(tool: Tool): AnthropicToolDeclaration {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object",
      properties: convertProperties(tool.inputSchema.properties || {}),
      required: tool.inputSchema.required || [],
    },
  };
}
```

### 使用适配器

```typescript
import { adaptToolsForDeepSeek } from '@/agent/tools/adapters/deepseek.js';
import { adaptToolsForAnthropic } from '@/agent/tools/adapters/anthropic.js';

// DeepSeek
const deepseekTools = adaptToolsForDeepSeek(tools);

// Anthropic
const anthropicTools = adaptToolsForAnthropic(tools);
```

---

## 完整示例

### 示例：创建一个简单的计算器工具

#### 1. 定义工具

**文件**: `src/agent/tools/calculator.ts`

```typescript
import { createLogger } from "@/shared/logger.js";
import type { Tool } from "./types.js";

const logger = createLogger("CalculatorTool");

export const calculatorTool: Tool = {
  name: "calculator",
  description: "Perform basic arithmetic calculations (add, subtract, multiply, divide).",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        description: "Operation to perform: add, subtract, multiply, divide",
        enum: ["add", "subtract", "multiply", "divide"],
      },
      a: {
        type: "number",
        description: "First number",
      },
      b: {
        type: "number",
        description: "Second number",
      },
    },
    required: ["operation", "a", "b"],
  },

  async execute(params): Promise<{
    success: boolean;
    data?: { result: number; operation: string };
    error?: string;
  }> {
    const operation = params.operation as string;
    const a = params.a as number;
    const b = params.b as number;

    // 参数验证
    if (!operation || typeof a !== "number" || typeof b !== "number") {
      return {
        success: false,
        error: "Invalid parameters: operation, a, and b are required",
      };
    }

    // 检查除零
    if (operation === "divide" && b === 0) {
      return {
        success: false,
        error: "Division by zero is not allowed",
      };
    }

    try {
      let result: number;

      switch (operation) {
        case "add":
          result = a + b;
          break;
        case "subtract":
          result = a - b;
          break;
        case "multiply":
          result = a * b;
          break;
        case "divide":
          result = a / b;
          break;
        default:
          return {
            success: false,
            error: `Unknown operation: ${operation}`,
          };
      }

      logger.info(`Calculator: ${a} ${operation} ${b} = ${result}`);

      return {
        success: true,
        data: {
          result,
          operation: `${a} ${operation} ${b} = ${result}`,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Calculator error: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};
```

#### 2. 注册工具

**文件**: `src/agent/tools/builtin.ts`

```typescript
import { calculatorTool } from "./calculator.js";

export function getBuiltinTools(): Tool[] {
  return [
    bashTool,
    readTool,
    writeTool,
    editTool,
    webSearchTool,
    webFetchTool,
    calculatorTool,  // ✅ 添加计算器工具
  ];
}
```

#### 3. 导出工具

**文件**: `src/agent/tools/index.ts`

```typescript
export { calculatorTool } from "./calculator.js";
```

#### 4. 测试工具

**文件**: `test/test-calculator.ts`

```typescript
import { calculatorTool } from "../src/agent/tools/calculator.js";

async function test() {
  console.log("🧪 测试计算器工具\n");

  // 测试加法
  const result1 = await calculatorTool.execute({
    operation: "add",
    a: 10,
    b: 5,
  });
  console.log("10 + 5 =", result1.success ? result1.data?.result : result1.error);

  // 测试除法
  const result2 = await calculatorTool.execute({
    operation: "divide",
    a: 20,
    b: 4,
  });
  console.log("20 / 4 =", result2.success ? result2.data?.result : result2.error);

  // 测试除零错误
  const result3 = await calculatorTool.execute({
    operation: "divide",
    a: 10,
    b: 0,
  });
  console.log("10 / 0 =", result3.success ? result3.data?.result : result3.error);
}

test();
```

#### 5. 在 Agent 中使用

```typescript
import { getBuiltinTools } from '@/agent/tools/index.js';
import { adaptToolsForDeepSeek } from '@/agent/tools/adapters/deepseek.js';

// Agent 配置
const agent = new Agent({
  toolProfile: 'full',  // 允许所有工具
}, {
  tools: getBuiltinTools(),  // 包含 calculatorTool
});

// LLM 可以调用计算器
// 用户: "计算 25 乘以 4"
// Agent: 调用 calculator_tool
// 结果: 100
```

---

## 最佳实践

### 1. 工具命名规范

- ✅ 使用小写字母和下划线: `web_search`, `read_file`
- ✅ 名称应该描述功能: `calculator`, `web_fetch`
- ❌ 避免缩写: `ws` (应该是 `web_search`)
- ❌ 避免大写: `WebSearch`

### 2. 参数设计

```typescript
// ✅ 好的参数设计
inputSchema: {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Search query string",
    },
    count: {
      type: "number",
      description: "Number of results (1-10)",
    },
  },
  required: ["query"],
}

// ❌ 不好的参数设计
inputSchema: {
  type: "object",
  properties: {
    q: {  // 太简短
      type: "string",
    },
    n: {  // 不清晰
      type: "number",
    },
  },
}
```

### 3. 错误处理

```typescript
async execute(params) {
  try {
    // 1. 参数验证
    if (!params.requiredParam) {
      return {
        success: false,
        error: "requiredParam is required and must be...",
      };
    }

    // 2. 执行逻辑
    const result = await doSomething(params);

    // 3. 返回成功
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    // 4. 返回失败
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
```

### 4. 日志记录

```typescript
import { createLogger } from "@/shared/logger.js";

const logger = createLogger("MyTool");

async execute(params) {
  logger.debug(`Executing my_tool with params:`, params);

  try {
    const result = await doSomething(params);
    logger.info(`my_tool succeeded:`, result);
    return { success: true, data: result };
  } catch (error) {
    logger.error(`my_tool failed:`, error);
    return { success: false, error: error.message };
  }
}
```

### 5. 超时控制

```typescript
// 对于网络操作
async execute(params) {
  const timeout = 10000; // 10秒

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    // ...
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        success: false,
        error: `Request timeout after ${timeout}ms`,
      };
    }
  }
}
```

### 6. 缓存支持

```typescript
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

async execute(params) {
  const cacheKey = JSON.stringify(params);

  // 检查缓存
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return {
      success: true,
      data: cached.data,
      cached: true,
    };
  }

  // 执行逻辑
  const result = await doSomething(params);

  // 写入缓存
  cache.set(cacheKey, {
    data: result,
    timestamp: Date.now(),
  });

  return {
    success: true,
    data: result,
  };
}
```

### 7. 安全考虑

```typescript
async execute(params) {
  const url = params.url as string;

  // ✅ URL 验证（SSRF 防护）
  let validUrl: URL;
  try {
    validUrl = new URL(url);
    if (!["http:", "https:"].includes(validUrl.protocol)) {
      throw new Error("Only HTTP and HTTPS are allowed");
    }
  } catch {
    return {
      success: false,
      error: "Invalid URL",
    };
  }

  // ✅ 命令注入防护
  const command = params.command as string;
  // 验证命令，避免 shell 注入

  // ✅ 文件路径验证
  const path = params.path as string;
  // 确保路径在允许的范围内
}
```

---

## 工具加载时间线

### 初始化阶段

```
应用启动
  ↓
Agent 创建
  ↓
getBuiltinTools() 被调用
  ↓
返回所有工具 (6个)
  ↓
工具存储在 Agent 实例中
```

### 运行阶段

```
用户发送消息
  ↓
Agent.process() 被调用
  ↓
解析工具策略 (resolveToolPolicy)
  ↓
过滤工具 (filterToolsByPolicy)
  ↓
平台适配 (adaptToolsForDeepSeek)
  ↓
发送到 LLM API
  ↓
LLM 决定是否调用工具
  ↓
Agent 执行工具 (tool.execute())
  ↓
返回结果给 LLM
  ↓
LLM 生成最终回复
```

---

## 调试技巧

### 1. 查看已注册的工具

```typescript
import { getBuiltinTools } from '@/agent/tools/index.js';

const tools = getBuiltinTools();
console.log("已注册的工具:");
tools.forEach(tool => {
  console.log(`- ${tool.name}: ${tool.description}`);
});
```

### 2. 测试工具策略

```typescript
import { getBuiltinTools, resolveToolPolicy, filterToolsByPolicy } from '@/agent/tools/index.js';

const allTools = getBuiltinTools();
const policy = resolveToolPolicy('coding');
const filtered = filterToolsByPolicy(allTools, policy);

console.log(`过滤后工具数: ${filtered.length}`);
```

### 3. 查看平台适配结果

```typescript
import { getBuiltinTools } from '@/agent/tools/index.js';
import { adaptToolsForDeepSeek } from '@/agent/tools/adapters/deepseek.js';

const tools = getBuiltinTools();
const adapted = adaptToolsForDeepSeek(tools);

console.log("DeepSeek 格式:");
console.log(JSON.stringify(adapted, null, 2));
```

### 4. 直接测试工具执行

```typescript
import { webSearchTool } from '@/agent/tools/web.js';

const result = await webSearchTool.execute({
  query: "test",
  count: 3,
});

console.log("执行结果:", result);
```

---

## 常见问题

### Q1: 工具没有出现在列表中？

**检查清单**:
- ✅ 工具是否添加到 `getBuiltinTools()`?
- ✅ 工具是否导出到 `index.ts`?
- ✅ 是否重新编译了项目 (`npm run build`)?

### Q2: LLM 不调用我的工具？

**可能原因**:
1. 工具描述不够清晰
2. 参数定义不完整
3. 工具被策略过滤掉了

**解决方案**:
```typescript
// 1. 改进工具描述
description: "明确说明工具的功能和使用场景"

// 2. 检查参数定义
required: ["param1", "param2"]

// 3. 检查策略配置
const policy = resolveToolPolicy('full'); // 允许所有工具
```

### Q3: 工具执行失败但不知道原因？

**调试方法**:
```typescript
async execute(params) {
  // 添加详细日志
  logger.debug("收到参数:", params);
  logger.debug("参数类型:", typeof params.param1);

  try {
    const result = await doSomething(params);
    logger.info("执行成功:", result);
    return { success: true, data: result };
  } catch (error) {
    logger.error("执行失败:", error);
    logger.error("错误堆栈:", error.stack);
    return {
      success: false,
      error: error.message,
    };
  }
}
```

### Q4: 如何支持工具的可选执行？

```typescript
async execute(params) {
  // 检查依赖
  if (params.requiresAPI && !process.env.API_KEY) {
    return {
      success: false,
      error: "API_KEY environment variable is required for this operation",
    };
  }

  // 继续执行...
}
```

---

## 相关文档

- **工具系统指南**: `TOOLS_SYSTEM.md`
- **平台适配器**: `src/agent/tools/adapters/`
- **现有工具示例**: `src/agent/tools/web.ts`
- **工具类型定义**: `src/agent/tools/types.ts`

---

**更新时间**: 2026-02-05
**版本**: 1.0
**维护者**: Krebs Team
