# Task: 整合 openclaw-cn-ds 工具系统到 Krebs

**任务ID**: task_tools_integration_260205_214500
**创建时间**: 2026-02-05
**状态**: 进行中
**目标**: 学习 openclaw-cn-ds 的工具系统架构，设计并实现到 Krebs 的整合方案

## 最终目标

建立一套完整的工具声明、控制和适配系统，支持：
1. **统一工具定义** - 平台无关的工具接口
2. **工具策略控制** - allow/deny、工具分组、配置文件
3. **平台适配器** - 自动转换为 DeepSeek/OpenAI/Anthropic 格式
4. **插件系统** - 支持动态扩展工具

## 学习总结：openclaw-cn-ds 架构

### 1. 工具定义结构

```typescript
export function createWebSearchTool(options?: {
  config?: ClawdbotConfig;
  sandboxed?: boolean;
}): AnyAgentTool | null {
  return {
    label: "Web Search",           // 人类可读标签
    name: "web_search",             // 工具名称（唯一标识）
    description: "Search the web", // LLM 看到的描述
    parameters: WebSearchSchema,    // TypeBox Schema
    execute: async (toolCallId, args) => {
      // 工具执行逻辑
    }
  };
}
```

**关键特性**：
- 使用 **TypeBox** 定义参数 schema
- **工厂函数**创建工具（支持配置和条件禁用）
- 返回 `null` 表示工具被禁用
- `parameters` 直接传递给 LLM（自动转换）

### 2. 工具策略控制系统

**文件**: `src/agents/tool-policy.ts`

```typescript
// 工具分组
export const TOOL_GROUPS: Record<string, string[]> = {
  "group:memory": ["memory_search", "memory_get"],
  "group:web": ["web_search", "web_fetch"],
  "group:fs": ["read", "write", "edit", "apply_patch"],
  "group:runtime": ["exec", "process"],
  // ...
};

// 工具配置文件
const TOOL_PROFILES: Record<ToolProfileId, ToolProfilePolicy> = {
  minimal: { allow: ["session_status"] },
  coding: {
    allow: ["group:fs", "group:runtime", "group:sessions", "group:memory"]
  },
  messaging: {
    allow: ["group:messaging", "sessions_list", ...]
  },
  full: {}, // 允许所有工具
};
```

**功能**：
- **工具分组**：通过 group:xxx 批量管理
- **allow/deny 策略**：白名单/黑名单
- **配置文件**：预设的工具组合（minimal/coding/messaging/full）
- **别名系统**：bash -> exec

### 3. 插件工具系统

**文件**: `src/plugins/tools.ts`

```typescript
export function resolvePluginTools(params: {
  context: ClawdbotPluginToolContext;
  existingToolNames?: Set<string>;
  toolAllowlist?: string[];
}): AnyAgentTool[]
```

**特性**：
- 动态加载插件工具
- 可选工具（optional）- 需要在 allowlist 中才启用
- 工具名称冲突检测
- 插件 ID 冲突检测

### 4. 工具声明传递

openclaw-cn-ds 的做法：
1. **工具定义**使用 TypeBox Schema（平台无关）
2. **Provider 层**自动转换为平台格式
3. **工具策略**在调用前过滤（allow/deny）
4. **传递给 LLM**时已经是正确的平台格式

## Krebs 整合方案

### 架构设计

```
Krebs/
├── src/agent/tools/
│   ├── types.ts              # ✅ 已有：Tool 接口
│   ├── registry.ts           # ✅ 已有：工具注册表
│   ├── builtin.ts            # ✅ 已有：bash, read, write
│   │
│   ├── policy.ts             # 🆕 新增：工具策略控制
│   ├── profiles.ts           # 🆕 新增：工具配置文件
│   ├── groups.ts             # 🆕 新增：工具分组
│   │
│   └── adapters/             # 🆕 新增：平台适配器
│       ├── base.ts           # 适配器基类
│       ├── deepseek.ts       # DeepSeek 适配器
│       ├── openai.ts         # OpenAI 适配器
│       └── anthropic.ts      # Anthropic 适配器
│
└── config/tools/             # 🆕 新增：工具配置
    ├── deepseek.json         # DeepSeek 格式声明
    ├── openai.json           # OpenAI 格式声明
    └── anthropic.json        # Anthropic 格式声明
```

### 实现步骤

#### 步骤 1: 创建工具策略系统

**文件**: `src/agent/tools/policy.ts`

```typescript
// 工具分组
export const TOOL_GROUPS = {
  "group:fs": ["read", "write", "edit"],
  "group:runtime": ["bash"],
  "group:web": ["web_search", "web_fetch"],
  // ...
};

// 工具配置文件
export const TOOL_PROFILES = {
  minimal: { allow: ["read"] },
  coding: { allow: ["group:fs", "group:runtime"] },
  full: {},
};

// 策略解析
export function resolveToolPolicy(
  profile?: string,
  customAllowlist?: string[],
  customDenylist?: string[]
): { allowed: Set<string>; denied: Set<string> } {
  // 实现策略解析逻辑
}
```

#### 步骤 2: 创建平台适配器

**文件**: `src/agent/tools/adapters/deepseek.ts`

```typescript
import type { Tool } from '../types.js';

export interface DeepSeekToolDeclaration {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
}

export function adaptToolForDeepSeek(tool: Tool): DeepSeekToolDeclaration {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: convertInputSchema(tool.inputSchema),
    },
  };
}

function convertInputSchema(schema: ToolParameterSchema) {
  // 将 ToolParameterSchema 转换为 DeepSeek/OpenAI 格式
  return {
    type: schema.type,
    properties: schema.properties || {},
    required: schema.required || [],
  };
}
```

#### 步骤 3: 更新工具定义

**文件**: `src/agent/tools/builtin.ts`

保持现有工具定义，但添加：
1. **TypeScript 类型**：明确参数类型
2. **工厂函数**：支持配置和条件禁用
3. **分组标签**：用于策略控制

```typescript
export interface BuiltinToolOptions {
  enabled?: boolean;
  config?: ToolConfig;
}

export function createBashTool(options?: BuiltinToolOptions): Tool | null {
  if (options?.enabled === false) return null;

  return {
    name: "bash",
    description: "Execute a bash shell command...",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "..." },
        cwd: { type: "string", description: "..." },
      },
      required: ["command"],
    },
    groups: ["group:runtime"],  // 🆕 新增
    async execute(params) {
      // 现有执行逻辑
    },
  };
}
```

#### 步骤 4: 创建配置文件

**文件**: `config/tools/deepseek.json`

```json
{
  "platform": "deepseek",
  "format": "openai-compatible",
  "tools": [
    {
      "name": "bash",
      "enabled": true,
      "groups": ["group:runtime"]
    },
    {
      "name": "read_file",
      "enabled": true,
      "groups": ["group:fs"]
    }
  ],
  "profiles": {
    "minimal": {
      "allow": ["read_file"]
    },
    "coding": {
      "allow": ["group:fs", "group:runtime"]
    }
  }
}
```

#### 步骤 5: 集成到 Agent

**修改**: `src/agent/core/agent.ts`

```typescript
import { resolveToolPolicy } from '../tools/policy.js';
import { adaptToolsForDeepSeek } from '../tools/adapters/deepseek.js';

export class Agent {
  private async callLLM(messages: Message[]): Promise<any> {
    // 1. 根据策略过滤工具
    const policy = resolveToolPolicy(
      this.config.toolProfile,
      this.config.toolAllowlist,
      this.config.toolDenylist
    );

    const filteredTools = this.deps.tools?.filter(tool =>
      policy.allowed.has(tool.name) && !policy.denied.has(tool.name)
    );

    // 2. 转换为平台格式
    const platform = this.inferProviderFromModel(this.config.model);
    let adaptedTools;

    switch (platform) {
      case 'deepseek':
        adaptedTools = adaptToolsForDeepSeek(filteredTools);
        break;
      case 'openai':
        adaptedTools = adaptToolsForOpenAI(filteredTools);
        break;
      default:
        adaptedTools = filteredTools;
    }

    // 3. 调用 LLM
    return await this.deps.provider.chat(messages, {
      model: this.config.model,
      tools: adaptedTools,  // ✅ 已经是正确的平台格式
    });
  }
}
```

## 当前进度

### 正在设计：整合方案架构

已完成 openclaw-cn-ds 架构学习，正在设计 Krebs 整合方案。

## 下一步行动

1. **创建工具策略文件**：
   - `src/agent/tools/policy.ts`
   - `src/agent/tools/groups.ts`
   - `src/agent/tools/profiles.ts`

2. **创建平台适配器**：
   - `src/agent/tools/adapters/base.ts`
   - `src/agent/tools/adapters/deepseek.ts`
   - `src/agent/tools/adapters/openai.ts`

3. **更新现有工具定义**：
   - 修改 `builtin.ts` 添加工厂函数
   - 添加分组支持

4. **集成到 Agent**：
   - 修改 `agent.ts` 添加策略过滤
   - 添加平台适配逻辑

5. **创建配置文件**：
   - `config/tools/deepseek.json`
   - `config/tools/openai.json`

6. **测试验证**：
   - 测试 DeepSeek 工具调用
   - 测试策略控制（allow/deny）
   - 测试工具分组

## 参考资料

- **openclaw-cn-ds**:
  - `src/agents/tool-policy.ts` - 工具策略
  - `src/plugins/tools.ts` - 插件系统
  - `src/agents/tools/web-search.ts` - 工具定义示例

- **Krebs 现有**:
  - `src/agent/tools/types.ts` - 工具类型定义
  - `src/agent/tools/registry.ts` - 工具注册表
  - `src/agent/tools/builtin.ts` - 内置工具
  - `src/agent/core/agent.ts` - Agent 实现
