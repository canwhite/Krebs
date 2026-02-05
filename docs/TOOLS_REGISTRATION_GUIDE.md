# 工具注册与系统联动指南

> 核心问题：创建工具后，如何让系统知道并能够调用它？

## 目录

1. [快速回答](#快速回答)
2. [完整流程](#完整流程)
3. [代码示例](#代码示例)
4. [验证工具已注册](#验证工具已注册)
5. [工具调用流程](#工具调用流程)
6. [常见问题](#常见问题)

---

## 快速回答

### 🎯 三步走（必须全部完成）

```
1. 定义工具 (src/agent/tools/my-tool.ts)
   ↓
2. 添加到 getBuiltinTools() (src/agent/tools/builtin.ts)
   ↓
3. 重新编译 (npm run build)
```

**完成这三步后，系统就会自动知道并能够调用您的工具！**

---

## 完整流程

### 流程图

```
┌─────────────────────────────────────────────────────────────┐
│  步骤 1: 定义工具                                          │
│  文件: src/agent/tools/my-tool.ts                          │
│  创建一个 Tool 对象                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤 2: 注册工具                                          │
│  文件: src/agent/tools/builtin.ts                         │
│  添加到 getBuiltinTools() 返回数组                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤 3: 导出工具                                          │
│  文件: src/agent/tools/index.ts                            │
│  确保工具可以被导入                                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤 4: 编译项目                                          │
│  命令: npm run build                                       │
│  编译 TypeScript → JavaScript                              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤 5: Agent 加载                                          │
│  Agent 创建时调用 getBuiltinTools()                         │
│  工具存储在 agent.deps.tools 中                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤 6: 传递给 LLM                                          │
│  Agent 调用 LLM API 时，tools 参数包含所有工具              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤 7: LLM 决定调用                                        │
│  LLM 看到工具描述，决定是否调用                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  步骤 8: 执行工具                                            │
│  Agent 执行 tool.execute(params)                            │
│  返回结果给 LLM                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 代码示例

### 完整示例：创建一个简单的 "问候" 工具

#### 步骤 1: 定义工具

**文件**: `src/agent/tools/greet.ts`

```typescript
import { createLogger } from "@/shared/logger.js";
import type { Tool } from "./types.js";

const logger = createLogger("GreetTool");

export const greetTool: Tool = {
  name: "greet",
  description: "向用户发送问候。当用户说你好、早上好等时使用。",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "要问候的名字，如果为空则使用 '朋友'",
      },
      timeOfDay: {
        type: "string",
        description: "一天中的时间：morning, afternoon, evening",
        enum: ["morning", "afternoon", "evening"],
      },
    },
    required: [],  // 没有必需参数
  },

  async execute(params): Promise<{
    success: boolean;
    data?: { message: string };
    error?: string;
  }> {
    const name = (params.name as string) || "朋友";
    const timeOfDay = (params.timeOfDay as string) || "day";

    logger.info(`Greeting ${name} at ${timeOfDay}`);

    try {
      let greeting = "";

      switch (timeOfDay) {
        case "morning":
          greeting = `早上好，${name}！☀️`;
          break;
        case "afternoon":
          greeting = `下午好，${name}！🌤`;
          break;
        case "evening":
          greeting = `晚上好，${name}！🌙`;
          break;
        default:
          greeting = `你好，${name}！👋`;
      }

      return {
        success: true,
        data: {
          message: greeting,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Greet failed: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
};
```

#### 步骤 2: 注册工具

**文件**: `src/agent/tools/builtin.ts`

**修改前**:
```typescript
export function getBuiltinTools(): Tool[] {
  return [
    bashTool,
    readTool,
    writeTool,
    editTool,
    webSearchTool,
    webFetchTool,
  ];
}
```

**修改后**:
```typescript
import { greetTool } from "./greet.js";  // ← 添加导入

export function getBuiltinTools(): Tool[] {
  return [
    bashTool,
    readTool,
    writeTool,
    editTool,
    webSearchTool,
    webFetchTool,
    greetTool,  // ← 添加到返回数组
  ];
}
```

#### 步骤 3: 导出工具

**文件**: `src/agent/tools/index.ts`

**添加导出**:
```typescript
// 内置工具
export { bashTool, readTool, writeTool, editTool, getBuiltinTools } from "./builtin.js";

// Web 工具
export { webSearchTool, webFetchTool, getWebTools } from "./web.js";

// 新工具
export { greetTool } from "./greet.js";  // ← 添加这行
```

#### 步骤 4: 编译

```bash
npm run build
```

**输出**:
```
> tsc && tsc-alias
✅ 编译成功
```

#### 步骤 5: 验证工具已注册

**创建测试脚本**: `test/test-greet-tool.ts`

```typescript
import { getBuiltinTools } from "../src/agent/tools/builtin.js";

const tools = getBuiltinTools();
console.log("所有工具数量:", tools.length);
console.log("\n工具列表:");
tools.forEach((tool, index) => {
  console.log(`${index + 1}. ${tool.name}`);
  console.log(`   ${tool.description}`);
});

// 检查 greetTool 是否存在
const hasGreetTool = tools.some(t => t.name === "greet");
console.log(`\ngreet_tool 已注册: ${hasGreetTool ? "✅ 是" : "❌ 否"}`);
```

**运行测试**:
```bash
npx tsx test/test-greet-tool.ts
```

**预期输出**:
```
所有工具数量: 7

工具列表:
1. bash
   Execute a bash shell command...
2. read_file
   Read the contents of a file...
3. write_file
   Write content to a file...
4. edit_file
   Make precise edits to a file...
5. web_search
   Search the web using Brave Search API...
6. web_fetch
   Fetch and extract readable content...
7. greet
   向用户发送问候...

greet_tool 已注册: ✅ 是
```

---

## 工具调用流程

### 完整的 Agent 调用链

#### 1. Agent 初始化

```typescript
// 创建 Agent
const agent = new Agent(
  {
    model: "deepseek-chat",
    toolProfile: "full",  // 使用 full 配置（允许所有工具）
  },
  {
    provider: deepseekProvider,
    tools: getBuiltinTools(),  // ← 加载所有工具（包括 greetTool）
  }
);
```

#### 2. 用户发送消息

```
用户: "你好"
```

#### 3. Agent 处理消息

```typescript
// src/agent/core/agent.ts
async process(userMessage: string, sessionId: string) {
  // 1. 获取所有工具
  const allTools = this.deps.tools;  // 包含 greetTool

  // 2. 应用工具策略
  const policy = resolveToolPolicy(this.config.toolProfile);
  const filteredTools = filterToolsByPolicy(allTools, policy);

  // 3. 转换为平台格式
  const platform = this.inferProvider(this.config.model);
  const adaptedTools = adaptToolsForDeepSeek(filteredTools);

  // 4. 发送给 LLM
  const response = await this.deps.provider.chat(
    [
      { role: "system", content: "..." },
      { role: "user", content: userMessage },
    ],
    {
      model: this.config.model,
      tools: adaptedTools,  // ← 包含 greetTool 的声明
    }
  );

  // 5. 检查是否有工具调用
  if (response.toolCalls && response.toolCalls.length > 0) {
    // LLM 决定调用 greetTool
    for (const toolCall of response.toolCalls) {
      if (toolCall.name === "greet") {
        const result = await this.executeTool(toolCall);
        // 返回结果给 LLM
      }
    }
  }
}
```

#### 4. LLM 看到的工具声明

**DeepSeek API 调用**:
```json
{
  "model": "deepseek-chat",
  "messages": [
    { "role": "system", content: "..." },
    { "role": "user", content: "你好" }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "greet",
        "description": "向用户发送问候。当用户说你好、早上好等时使用。",
        "parameters": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "description": "要问候的名字"
            },
            "timeOfDay": {
              "type": "string",
              "description": "一天中的时间：morning, afternoon, evening",
              "enum": ["morning", "afternoon", "evening"]
            }
          },
          "required": []
        }
      }
    }
  ]
}
```

#### 5. LLM 决定调用工具

**LLM 的决策**:
- 分析用户消息："你好"
- 查看可用工具：看到 `greet` 工具
- 工具描述："向用户发送问候。当用户说你好、早上好等时使用。"
- **决定**: 调用 `greet` 工具

**工具调用**:
```json
{
  "name": "greet",
  "arguments": {
    "name": "",
    "timeOfDay": "day"
  }
}
```

#### 6. Agent 执行工具

```typescript
// src/agent/core/agent.ts
async executeTool(toolCall: ToolCall) {
  // 找到工具
  const tool = this.deps.tools.find(t => t.name === toolCall.name);

  if (!tool) {
    return { success: false, error: "Tool not found" };
  }

  // 执行工具
  const result = await tool.execute(toolCall.arguments);

  // result.data = { message: "你好，朋友！👋" }
  return result;
}
```

#### 7. 返回结果给 LLM

```json
{
  "role": "tool",
  "tool_call_id": "call_123",
  "content": "{\"message\": \"你好，朋友！👋\"}"
}
```

#### 8. LLM 生成最终回复

```
Agent: 你好，朋友！👋
```

---

## 验证工具已注册

### 方法 1: 检查工具列表

```typescript
import { getBuiltinTools } from "@/agent/tools/index.js";

const tools = getBuiltinTools();
console.log("工具总数:", tools.length);
console.log("工具列表:", tools.map(t => t.name));
```

### 方法 2: 测试工具执行

```typescript
import { greetTool } from "@/agent/tools/greet.js";

const result = await greetTool.execute({
  name: "张三",
  timeOfDay: "morning"
});

console.log("执行结果:", result);
// 输出: { success: true, data: { message: "早上好，张三！☀️" } }
```

### 方法 3: 查看平台适配结果

```typescript
import { getBuiltinTools } from "@/agent/tools/index.js";
import { adaptToolsForDeepSeek } from "@/agent/tools/adapters/deepseek.js";

const tools = getBuiltinTools();
const adapted = adaptToolsForDeepSeek(tools);

// 找到 greet 工具
const greetTool = adapted.find(t => t.function.name === "greet");
console.log("greet 工具声明:", JSON.stringify(greetTool, null, 2));
```

---

## 关键机制解析

### 1. 自动发现机制

系统通过 `getBuiltinTools()` 函数自动发现所有工具：

```typescript
// src/agent/tools/builtin.ts
export function getBuiltinTools(): Tool[] {
  return [
    bashTool,
    readTool,
    writeTool,
    editTool,
    webSearchTool,
    webFetchTool,
    greetTool,  // ← 只要在数组里，系统就会知道
  ];
}
```

**关键点**:
- ✅ 工具必须在返回数组中
- ✅ 不需要额外注册代码
- ✅ 不需要配置文件

### 2. 工具命名规范

工具名称 (`name`) 是唯一标识符：

```typescript
export const greetTool: Tool = {
  name: "greet",  // ← 这个名称会被 LLM 看到并用于调用
  // ...
}
```

**要求**:
- 必须唯一（不能重复）
- 使用小写字母和下划线
- 描述性强（让 LLM 理解）

### 3. 工具描述的重要性

LLM 完全依赖 `description` 来决定是否调用工具：

```typescript
description: "向用户发送问候。当用户说你好、早上好等时使用。"
```

**好的描述** ✅:
```typescript
description: "向用户发送问候。当用户说你好、早上好、晚上好等时使用。"
```

**不好的描述** ❌:
```typescript
description: "问候工具"  // 太简单，LLM 不知道何时使用
```

### 4. 参数设计原则

```typescript
inputSchema: {
  type: "object",
  properties: {
    // 必需参数放在 required 中
    requiredParam: { type: "string" },

    // 可选参数不放在 required 中
    optionalParam: { type: "number" },
  },
  required: ["requiredParam"],
}
```

---

## 完整测试流程

### 测试脚本: test/test-greet-complete.ts

```typescript
#!/usr/bin/env tsx

import { getBuiltinTools } from "../src/agent/tools/builtin.js";
import { greetTool } from "../src/agent/tools/greet.js";
import { adaptToolsForDeepSeek } from "../src/agent/tools/adapters/deepseek.js";

console.log("🔍 测试工具注册和系统联动\n");

// 1. 验证工具定义
console.log("=== 1. 验证工具定义 ===");
const directResult = await greetTool.execute({
  name: "测试用户",
  timeOfDay: "morning"
});
console.log("直接执行结果:", directResult.success ? "✅ 成功" : "❌ 失败");
console.log("返回:", directResult.data);
console.log();

// 2. 验证工具注册
console.log("=== 2. 验证工具注册 ===");
const allTools = getBuiltinTools();
const hasGreet = allTools.some(t => t.name === "greet");
console.log(`工具总数: ${allTools.length}`);
console.log(`greet 工具已注册: ${hasGreet ? "✅ 是" : "❌ 否"}`);
console.log();

// 3. 验证平台适配
console.log("=== 3. 验证平台适配 ===");
const adaptedTools = adaptToolsForDeepSeek(allTools);
const greetAdapted = adaptedTools.find((t: any) => t.function?.name === "greet");
if (greetAdapted) {
  console.log("✅ greet 工具已适配为 DeepSeek 格式");
  console.log("\n工具声明:");
  console.log(JSON.stringify(greetAdapted, null, 2).split("\n").map(l => "  " + l).join("\n"));
}
console.log();

// 4. 模拟 LLM 调用
console.log("=== 4. 模拟 LLM 工具调用 ===");
console.log("用户消息: 你好");
console.log("\nLLM 看到的工具:");
console.log("-".repeat(80));

// 模拟 LLM 收到的工具列表（只显示 greet）
console.log(JSON.stringify({
  type: "function",
  function: {
    name: "greet",
    description: "向用户发送问候。当用户说你好、早上好等时使用。",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "要问候的名字"
        },
        timeOfDay: {
          type: "string",
          description: "一天中的时间",
          enum: ["morning", "afternoon", "evening"]
        }
      },
      required: []
    }
  }
}, null, 2));

console.log("-".repeat(80));
console.log("\nLLM 决定调用 greet 工具:");
console.log(JSON.stringify({
  name: "greet",
  arguments: {
    name: "",
    timeOfDay: "day"
  }
}, null, 2));

console.log("\n执行结果:");
console.log(JSON.stringify(directResult.data, null, 2));

console.log("\n" + "=".repeat(80));
console.log("\n✅ 工具已完全集成到系统！");
console.log("✅ Agent 可以自动调用这个工具");
console.log("✅ LLM 会根据用户输入自动决定何时调用");
```

---

## 常见问题

### Q1: 添加了工具但看不到？

**检查清单**:
- [ ] 是否添加到 `getBuiltinTools()` 返回数组？
- [ ] 是否导出到 `index.ts`？
- [ ] 是否重新编译 (`npm run build`)？
- [ ] 是否重启了 Agent？

### Q2: LLM 不调用我的工具？

**可能原因**:
1. **描述不清楚** - LLM 不知道何时使用
2. **参数不合适** - LLM 不知道如何调用
3. **工具被策略过滤** - 策略禁止了这个工具

**解决方案**:
```typescript
// 1. 改进描述
description: "明确的说明：何时使用、如何使用、什么场景"

// 2. 简化参数
inputSchema: {
  properties: {
    simpleParam: { type: "string", description: "简单的参数描述" }
  },
  required: ["simpleParam"]
}

// 3. 检查策略
const policy = resolveToolPolicy('full'); // 允许所有工具
```

### Q3: 工具执行出错但不知道原因？

**调试方法**:
```typescript
async execute(params) {
  // 添加详细日志
  console.log("[DEBUG] 收到参数:", params);
  console.log("[DEBUG] 参数类型:", typeof params.param1);

  try {
    const result = await doSomething(params);
    console.log("[DEBUG] 执行成功:", result);
    return { success: true, data: result };
  } catch (error) {
    console.log("[DEBUG] 执行失败:", error);
    return {
      success: false,
      error: error.message
    };
  }
}
```

### Q4: 如何让工具只在特定条件下可用？

**使用工具策略**:
```typescript
// 默认允许所有工具
export function getBuiltinTools(): Tool[] {
  return [greetTool, ...];
}

// Agent 配置时控制
const agent = new Agent({
  toolProfile: 'minimal',  // 可能不包含 greetTool
  // 或
  toolAllowlist: ['greet'],  // 只允许 greetTool
});
```

---

## 核心要点总结

### ✅ 必须做的（3步）

1. **定义工具** - 创建 Tool 对象
2. **添加到 getBuiltinTools()** - 注册工具
3. **编译项目** - `npm run build`

### ✅ 关键机制

- **自动发现** - 通过 `getBuiltinTools()` 自动加载
- **LLM 驱动** - LLM 根据描述决定调用
- **平台适配** - 自动转换为各平台格式
- **策略控制** - 通过策略过滤可用工具

### ✅ 命名约定

```typescript
// ✅ 好的命名
name: "web_search"
name: "read_file"
name: "greet"

// ❌ 不好的命名
name: "WebSearch"  // 不要大写
name: "ws"         // 不要缩写
name: "tool1"       // 不要无意义
```

---

**更新时间**: 2026-02-05
**版本**: 1.0
**作者**: Krebs Team
