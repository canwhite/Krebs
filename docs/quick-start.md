# 快速入门指南

## 安装和运行

### 1. 克隆项目
```bash
git clone <repository-url>
cd agent-study
```

### 2. 安装依赖
```bash
bun install
```

### 3. 配置 API 密钥
```bash
# 设置 DeepSeek API 密钥（推荐）
export DEEPSEEK_API_KEY=your_deepseek_api_key_here

# 或设置 Anthropic API 密钥
export ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 4. 运行交互式模式
```bash
bun start
```

### 5. 运行示例
```bash
bun run example
```

## 基本使用

### 启动后界面
```
============================================================
🤖 Simple Agent 已启动！
输入 'exit' 或 'quit' 退出
============================================================

👤 你: 
```

### 可用命令
- 输入自然语言指令与 AI 交互
- 输入 `exit` 或 `quit` 退出程序

### 示例指令
```
👤 你: 创建一个 TypeScript 函数计算斐波那契数列

🤖 Agent: 我会帮你创建一个 TypeScript 函数来计算斐波那契数列...

👤 你: 查看当前目录的文件列表

🤖 Agent: 正在执行 ls 命令...
```

## 项目结构

```
agent-study/
├── index.ts              # 主程序入口
├── package.json          # 项目配置
├── tsconfig.json         # TypeScript 配置
├── .env.example          # 环境变量示例
├── docs/                 # 文档目录
│   ├── extension-system.md      # Extension 系统详解
│   ├── architecture-overview.md # 架构概述
│   └── quick-start.md           # 本快速入门指南
└── node_modules/         # 依赖包
```

## 核心概念

### 1. Agent Session (代理会话)
- 管理单个对话会话
- 维护对话历史
- 处理工具调用

### 2. 工具系统
框架提供了多种工具：

#### 内置工具
- `read` - 读取文件
- `write` - 写入文件
- `bash` - 执行 shell 命令

#### 自定义工具（在本项目中）
- `web_search` - 网络搜索（模拟）
- `get_current_time` - 获取当前时间

### 3. Extension 系统
- 插件化架构，支持功能扩展
- 可以添加新工具、命令、事件处理器
- 支持热重载

## 开发自定义工具

### 1. 创建新工具
在 `index.ts` 中添加：

```typescript
const myTool: ToolDefinition = {
  name: "my_tool",
  label: "My Tool",
  description: "这是我的自定义工具",
  parameters: Type.Object({
    param1: Type.String({ description: "参数1" }),
    param2: Type.Optional(Type.Number({ description: "参数2" })),
  }),
  execute: async (_toolCallId, params, _signal, _onUpdate, _ctx) => {
    const { param1, param2 } = params as {
      param1: string;
      param2?: number;
    };
    
    // 工具逻辑
    const result = `参数1: ${param1}, 参数2: ${param2 || "未提供"}`;
    
    return {
      content: [
        { type: "text" as const, text: result },
      ],
      details: {},
    };
  },
};
```

### 2. 注册工具
在 `createAgentSession` 的 `customTools` 数组中添加：

```typescript
const result = await createAgentSession({
  // ... 其他配置
  customTools: [webSearchTool, getCurrentTimeTool, myTool], // 添加新工具
  // ... 其他配置
});
```

## 配置说明

### 环境变量
```bash
# 必须设置其中一个 API 密钥
DEEPSEEK_API_KEY=your_key_here      # 使用 DeepSeek 模型
ANTHROPIC_API_KEY=your_key_here     # 使用 Claude 模型

# 可选配置
DEBUG=pi:*                          # 启用调试日志
```

### 系统提示
系统提示定义在 `index.ts` 的 `systemPrompt` 变量中，控制 AI 的行为模式。

## 故障排除

### 1. API 密钥错误
```
错误：未设置 API Key 环境变量
请设置以下之一：
  export DEEPSEEK_API_KEY=your_key_here  # 使用 DeepSeek
  export ANTHROPIC_API_KEY=your_key_here  # 使用 Claude
```

**解决方案**：
```bash
# 设置环境变量
export DEEPSEEK_API_KEY=your_actual_key

# 或编辑 .env 文件
echo "DEEPSEEK_API_KEY=your_actual_key" > .env
```

### 2. 依赖安装失败
**解决方案**：
```bash
# 清理并重新安装
rm -rf node_modules bun.lock
bun install
```

### 3. TypeScript 编译错误
**解决方案**：
```bash
# 检查 TypeScript 配置
bun tsc --noEmit

# 或直接运行（Bun 会自动编译）
bun run index.ts
```

## 高级功能

### 1. 使用不同的 AI 模型
默认使用 DeepSeek（如果设置了 `DEEPSEEK_API_KEY`），否则使用 Claude。

要强制使用特定模型，可以修改代码：

```typescript
// 强制使用 Claude
const useDeepSeek = false; // 改为 false
```

### 2. 添加 Extension
参考 `docs/extension-system.md` 了解如何创建和加载扩展。

### 3. 自定义系统提示
修改 `index.ts` 中的 `systemPrompt` 变量来改变 AI 的行为模式。

## 示例任务

### 示例 1：创建文件
```
👤 你: 创建一个 hello.ts 文件，包含一个简单的 hello 函数

🤖 Agent: 我会帮你创建 hello.ts 文件...
```

### 示例 2：执行命令
```
👤 你: 查看当前目录的 git 状态

🤖 Agent: 正在执行 git status 命令...
```

### 示例 3：搜索信息
```
👤 你: 搜索最新的 TypeScript 特性

🤖 Agent: 正在搜索最新的 TypeScript 特性...
```

## 下一步

1. **阅读详细文档**：
   - `docs/extension-system.md` - Extension 系统详解
   - `docs/architecture-overview.md` - 架构概述

2. **探索代码**：
   - 查看 `index.ts` 了解实现细节
   - 研究工具定义和执行逻辑

3. **扩展功能**：
   - 添加新的自定义工具
   - 创建 Extension 插件
   - 集成第三方 API

4. **部署使用**：
   - 配置生产环境 API 密钥
   - 添加身份验证
   - 设置日志和监控

## 获取帮助

- 查看项目 README.md 文件
- 阅读代码注释
- 参考 pi-coding-agent 官方文档
- 在项目中创建 Issue 提问

## 许可证

本项目基于 pi-coding-agent 构建，遵循相应的开源协议。