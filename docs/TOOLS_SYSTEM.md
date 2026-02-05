# 工具系统使用指南

## 概述

Krebs 的工具系统已经升级，参考 [openclaw-cn-ds](https://github.com/clawd/openclaw-cn-ds) 的设计，提供了完整的工具声明、控制和适配功能。

### 核心特性

1. **工具策略控制** - allow/deny 白名单/黑名单
2. **工具分组** - 通过 `group:xxx` 批量管理工具
3. **工具配置文件** - 预设的工具组合（minimal/coding/full）
4. **平台适配器** - 自动转换为 DeepSeek/OpenAI/Anthropic 格式
5. **类型安全** - 完整的 TypeScript 类型支持

## 快速开始

### 1. 基本使用

```typescript
import { getBuiltinTools, resolveToolPolicy, filterToolsByPolicy } from '@/agent/tools/index.js';
import { adaptToolsForDeepSeek } from '@/agent/tools/adapters/deepseek.js';

// 1. 获取所有内置工具
const allTools = getBuiltinTools();

// 2. 解析工具策略
const policy = resolveToolPolicy('coding'); // 使用 coding 配置文件

// 3. 过滤工具
const filteredTools = filterToolsByPolicy(allTools, policy);

// 4. 转换为 DeepSeek 格式
const deepseekTools = adaptToolsForDeepSeek(filteredTools);

// 5. 传递给 LLM
const response = await deepseek.chat.completions.create({
  model: "deepseek-chat",
  messages: [...],
  tools: deepseekTools  // ✅ 已经是正确的格式
});
```

### 2. 自定义策略

```typescript
// 自定义 allow/deny 列表
const policy = resolveToolPolicy(
  'coding',                    // 配置文件（可选）
  ['read_file', 'bash'],       // 额外允许的工具
  ['write_file']               // 额外禁止的工具
);

const filteredTools = filterToolsByPolicy(allTools, policy);
```

### 3. 使用工具分组

```typescript
// 允许整个工具组
const policy = resolveToolPolicy(
  undefined,                    // 不使用配置文件
  ['group:fs', 'group:runtime'] // 允许文件和运行时工具
);

const filteredTools = filterToolsByPolicy(allTools, policy);
```

## 工具分组

当前可用的工具分组：

| 分组 | 包含的工具 | 说明 |
|------|-----------|------|
| `group:fs` | read_file, write_file, edit_file | 文件系统操作 |
| `group:runtime` | bash | 命令执行 |
| `group:web` | web_search, web_fetch | 网络操作 |
| `group:builtin` | bash, read_file, write_file | 所有内置工具 |

## 工具配置文件

### minimal

最小配置，只允许基本工具：

```typescript
const policy = resolveToolPolicy('minimal');
// 允许: read_file
// 禁止: 其他所有工具
```

### coding

编程配置，适合开发场景：

```typescript
const policy = resolveToolPolicy('coding');
// 允许: group:fs, group:runtime, group:web
// 禁止: 无
```

### full

完整配置，允许所有工具：

```typescript
const policy = resolveToolProfile('full');
// 允许: 所有工具
```

## 平台适配器

### DeepSeek

```typescript
import { adaptToolsForDeepSeek } from '@/agent/tools/adapters/deepseek.js';

const deepseekTools = adaptToolsForDeepSeek(tools);
```

### OpenAI

```typescript
import { adaptToolsForOpenAI } from '@/agent/tools/adapters/openai.js';

const openaiTools = adaptToolsForOpenAI(tools);
```

### Anthropic

```typescript
import { adaptToolsForAnthropic } from '@/agent/tools/adapters/anthropic.js';

const anthropicTools = adaptToolsForAnthropic(tools);
```

### 自动适配

```typescript
import { globalAdapterRegistry } from '@/agent/tools/adapters/index.js';

// 根据模型名称自动选择适配器
const tools = globalAdapterRegistry.autoAdapt(allTools, 'deepseek-chat');
```

## Agent 集成

### 在 Agent 中使用工具策略

```typescript
import { resolveToolPolicy, filterToolsByPolicy } from '@/agent/tools/index.js';
import { adaptToolsForDeepSeek, adaptToolsForOpenAI } from '@/agent/tools/adapters/index.js';

export class Agent {
  private async callLLM(messages: Message[]): Promise<any> {
    // 1. 解析工具策略
    const policy = resolveToolPolicy(
      this.config.toolProfile,      // 配置文件 ID
      this.config.toolAllowlist,    // 自定义允许列表
      this.config.toolDenylist      // 自定义禁止列表
    );

    // 2. 过滤工具
    const filteredTools = filterToolsByPolicy(this.deps.tools || [], policy);

    // 3. 转换为平台格式
    const platform = this.inferProvider(this.config.model);
    let adaptedTools;

    switch (platform) {
      case 'deepseek':
        adaptedTools = adaptToolsForDeepSeek(filteredTools);
        break;
      case 'openai':
        adaptedTools = adaptToolsForOpenAI(filteredTools);
        break;
      case 'anthropic':
        adaptedTools = adaptToolsForAnthropic(filteredTools);
        break;
      default:
        adaptedTools = filteredTools;
    }

    // 4. 调用 LLM
    return await this.deps.provider.chat(messages, {
      model: this.config.model,
      tools: adaptedTools,
    });
  }

  private inferProvider(model: string): string {
    if (model.startsWith('deepseek')) return 'deepseek';
    if (model.startsWith('gpt')) return 'openai';
    if (model.startsWith('claude')) return 'anthropic';
    return 'openai'; // 默认
  }
}
```

### Agent 配置示例

```typescript
const agent = new Agent({
  id: 'default',
  name: '默认助手',
  model: 'deepseek-chat',

  // 工具策略配置
  toolProfile: 'coding',              // 配置文件
  toolAllowlist: ['web_search'],      // 额外允许
  toolDenylist: [],                   // 额外禁止

  // 其他配置
  temperature: 0.7,
}, {
  provider: deepseekProvider,
  tools: getBuiltinTools(),
});
```

## 工具别名

系统支持工具名称别名：

```typescript
// 以下写法等价
'bash' === 'exec' === 'shell'
'read_file' === 'read' === 'cat'
'write_file' === 'write' === 'save'
```

## 调试和日志

### 查看工具策略

```typescript
import { describeToolPolicy } from '@/agent/tools/index.js';

const policy = resolveToolPolicy('coding');
console.log(describeToolPolicy(policy));
// 输出: "allow: [read_file, write_file, bash] | deny: []"
```

### 检查工具是否允许

```typescript
import { isToolAllowed } from '@/agent/tools/index.js';

const policy = resolveToolPolicy('minimal');
console.log(isToolAllowed('read_file', policy)); // true
console.log(isToolAllowed('bash', policy));      // false
```

### 查看工具所属分组

```typescript
import { getToolGroups } from '@/agent/tools/index.js';

const groups = getToolGroups('bash');
console.log(groups); // ['group:runtime', 'group:builtin']
```

## 配置文件

工具配置文件位于 `config/tools/` 目录：

- `deepseek.example.json` - DeepSeek 配置示例
- `openai.example.json` - OpenAI 配置示例（TODO）
- `anthropic.example.json` - Anthropic 配置示例（TODO）

## 最佳实践

### 1. 始终使用工具策略

```typescript
// ✅ 推荐
const policy = resolveToolPolicy('coding');
const tools = filterToolsByPolicy(allTools, policy);

// ❌ 不推荐
const tools = allTools; // 没有访问控制
```

### 2. 根据场景选择配置文件

```typescript
// 只读场景
const readOnlyPolicy = resolveToolPolicy('minimal');

// 开发场景
const devPolicy = resolveToolPolicy('coding');

// 生产环境（禁用危险操作）
const prodPolicy = resolveToolPolicy(undefined, [], ['bash', 'write_file']);
```

### 3. 使用分组简化管理

```typescript
// ✅ 推荐
const policy = resolveToolPolicy(undefined, ['group:fs']);

// ❌ 不推荐
const policy = resolveToolPolicy(undefined, [
  'read_file',
  'write_file',
  'edit_file',
  'apply_patch'
]);
```

### 4. 平台适配在最后一步

```typescript
// ✅ 正确的顺序
const policy = resolveToolProfile('coding');
const filtered = filterToolsByPolicy(tools, policy);
const adapted = adaptToolsForDeepSeek(filtered);

// ❌ 错误的顺序（先适配再过滤）
const adapted = adaptToolsForDeepSeek(tools);
const filtered = filterToolsByPolicy(adapted, policy); // 无法工作
```

## 常见问题

### Q: 如何添加新工具？

A: 在 `src/agent/tools/builtin.ts` 中定义：

```typescript
export const myNewTool: Tool = {
  name: "my_new_tool",
  description: "Description for LLM",
  inputSchema: {
    type: "object",
    properties: {
      param1: { type: "string", description: "Parameter 1" }
    },
    required: ["param1"]
  },
  async execute(params) {
    // 工具执行逻辑
    return { success: true, data: "..." };
  }
};

// 在 getBuiltinTools() 中添加
export function getBuiltinTools(): Tool[] {
  return [bashTool, readTool, writeTool, myNewTool];
}
```

### Q: 如何为特定 Agent 配置工具？

A: 在 Agent 配置中设置：

```typescript
const agent = new Agent({
  toolProfile: 'minimal',        // 使用 minimal 配置
  toolAllowlist: ['custom_tool'], // 额外允许
  toolDenylist: ['bash'],         // 额外禁止
}, deps);
```

### Q: DeepSeek 和 OpenAI 格式有什么区别？

A: 实际上它们使用相同的格式（OpenAI 兼容），所以适配器可以互换：

```typescript
// 两者完全相同
adaptToolsForDeepSeek(tools) === adaptToolsForOpenAI(tools)
```

### Q: 如何禁用所有工具？

A:

```typescript
const policy = resolveToolPolicy(undefined, []); // 空 allow 列表
// 或
const policy = { allowed: new Set(), denied: new Set() };
```

## 相关文档

- [工具类型定义](../src/agent/tools/types.ts)
- [工具策略系统](../src/agent/tools/policy.ts)
- [工具分组](../src/agent/tools/groups.ts)
- [平台适配器](../src/agent/tools/adapters/)
- [openclaw-cn-ds](https://github.com/clawd/openclaw-cn-ds) - 参考项目
