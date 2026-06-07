# Extension 系统详解

## 概述

Extension（扩展）是 pi-coding-agent 框架的**插件系统**，允许开发者扩展框架的功能。类似于 VS Code 的扩展机制，它提供了模块化、可插拔的架构设计。

## Extension 能做什么？

从类型定义可以看到，Extension 可以：

- **注册工具** (`tools`) - 添加新的 AI 可调用工具
- **注册命令** (`commands`) - 添加 CLI 命令或 UI 命令
- **注册快捷键** (`shortcuts`) - 添加快捷键绑定
- **注册标志** (`flags`) - 添加命令行标志
- **注册消息渲染器** (`messageRenderers`) - 自定义消息显示
- **监听事件** (`handlers`) - 响应框架的各种事件

## Extension 的生命周期事件

Extension 可以监听多种事件：

```typescript
// 会话相关事件
"session_start", "session_switch", "session_fork", "session_shutdown"
// 代理相关事件  
"agent_start", "agent_end", "turn_start", "turn_end"
// 工具相关事件
"tool_call", "tool_result"
// 上下文事件
"context", "before_agent_start"
// 模型选择事件
"model_select"
// 资源发现事件
"resources_discover"
```

## Extension 定义示例

```typescript
import { Type } from "@sinclair/typebox";

// extension 工厂函数
const githubExtension: ExtensionFactory = (pi) => {
  // 1. 注册 GitHub 工具
  pi.tool("github_search_repos", {
    label: "GitHub Search Repositories",
    description: "Search GitHub repositories",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      limit: Type.Optional(Type.Number({ description: "Max results" })),
    }),
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      // 调用 GitHub API
      const repos = await searchGitHubRepos(params.query, params.limit);
      return {
        content: [{ type: "text", text: JSON.stringify(repos, null, 2) }],
        details: { api: "GitHub", count: repos.length },
      };
    },
  });

  // 2. 注册 GitHub 命令
  pi.command("github.login", {
    description: "Login to GitHub",
    handler: async (ctx) => {
      const token = await ctx.ui.input("Enter GitHub token");
      if (token) {
        // 保存 token
        await saveGitHubToken(token);
        ctx.ui.notify("GitHub login successful", "info");
      }
    },
  });

  // 3. 监听会话开始事件
  pi.on("session_start", async (event, ctx) => {
    console.log(`Session started in ${event.cwd}`);
  });
};
```

## Extension 的加载过程

在 `resourceLoader.reload()` 中：

```typescript
async reload() {
  // 1. 加载扩展文件
  const extensionsResult = await loadExtensions(extensionPaths, this.cwd, this.eventBus);
  
  // 2. 执行扩展工厂函数
  for (const ext of extensionsResult.extensions) {
    // 创建 ExtensionAPI 对象
    const api = createExtensionAPI(ext, runtime, cwd, eventBus);
    
    // 执行工厂函数，注册所有内容
    await factory(api);
    
    // 现在 ext 对象包含了：
    // - ext.tools: Map<工具名, RegisteredTool>
    // - ext.commands: Map<命令名, RegisteredCommand>
    // - ext.handlers: Map<事件名, HandlerFn[]>
  }
}
```

## Extension 的调用机制

### 1. 工具的调用流程

当 AI 模型决定调用一个工具时：

```typescript
// 在 agent-loop.js 中
async function executeToolCalls(tools, assistantMessage, signal, stream, getSteeringMessages) {
  const toolCalls = assistantMessage.content.filter(c => c.type === "toolCall");
  
  for (const toolCall of toolCalls) {
    // 1. 查找工具
    const tool = tools?.find(t => t.name === toolCall.name);
    
    // 2. 验证参数
    const validatedArgs = validateToolArguments(tool, toolCall);
    
    // 3. 执行工具
    result = await tool.execute(
      toolCall.id,
      validatedArgs,
      signal,
      (partialResult) => {
        // 进度更新回调
        stream.push({ type: "tool_execution_update", ... });
      }
    );
  }
}
```

### 2. Extension 工具如何被集成到工具列表中

在 `createAgentSession` 中：

```typescript
async function createAgentSession(options) {
  // 1. 加载资源（包括扩展）
  const resourceLoader = options.resourceLoader || new DefaultResourceLoader();
  await resourceLoader.reload();
  
  // 2. 获取所有工具
  const builtInTools = options.tools || [];  // 内置工具
  const customTools = options.customTools || [];  // 自定义工具
  const extensionTools = resourceLoader.getExtensions().extensions
    .flatMap(ext => Array.from(ext.tools.values()))
    .map(registeredTool => registeredTool.definition);
  
  // 3. 合并所有工具
  const allTools = [...builtInTools, ...customTools, ...extensionTools];
  
  // 4. 传递给 agent
  const agentConfig = {
    tools: allTools,
    // ... 其他配置
  };
}
```

### 3. 命令的调用机制

命令通常通过 UI 或 CLI 调用：

```typescript
// 在交互式模式中
class InteractiveMode {
  async handleCommand(input: string) {
    if (input.startsWith("/")) {
      const commandName = input.slice(1);
      
      // 查找命令
      const command = this.getAllCommands().find(cmd => cmd.name === commandName);
      
      if (command) {
        // 创建命令上下文
        const ctx = this.createCommandContext();
        
        // 执行命令处理器
        await command.handler(ctx);
      }
    }
  }
  
  getAllCommands() {
    // 合并所有来源的命令：
    // 1. 内置命令
    // 2. Extension 注册的命令
    // 3. 其他来源的命令
    const extensionCommands = this.resourceLoader.getExtensions().extensions
      .flatMap(ext => Array.from(ext.commands.values()));
    
    return [...builtInCommands, ...extensionCommands];
  }
}
```

### 4. 事件处理器的调用

事件通过 EventBus 系统调用：

```typescript
// EventBus 实现
class EventBus {
  private listeners = new Map<string, Function[]>();
  
  emit(eventName: string, data: any) {
    const listeners = this.listeners.get(eventName) || [];
    
    // 调用所有监听器
    for (const listener of listeners) {
      try {
        listener(data);
      } catch (error) {
        console.error(`Error in event listener for ${eventName}:`, error);
      }
    }
  }
  
  on(eventName: string, listener: Function) {
    const listeners = this.listeners.get(eventName) || [];
    listeners.push(listener);
    this.listeners.set(eventName, listeners);
  }
}

// Extension 事件处理器的注册
pi.on("session_start", async (event, ctx) => {
  console.log("Extension: Session started!");
});

// 事件的触发
// 在 session 启动时
eventBus.emit("session_start", {
  type: "session_start",
  cwd: process.cwd(),
  sessionId: session.id,
});
```

## reload 方法的作用

`reload` 方法是 `ResourceLoader` 接口的核心方法，负责**重新发现和加载所有可用的资源**。

### 核心功能

```typescript
async reload() {
  // 1. 重新解析包管理器中的资源路径
  const resolvedPaths = await this.packageManager.resolve();
  
  // 2. 加载扩展 (extensions)
  const extensionsResult = await loadExtensions(extensionPaths, this.cwd, this.eventBus);
  
  // 3. 加载技能 (skills)
  this.updateSkillsFromPaths(skillPaths);
  
  // 4. 加载提示模板 (prompts)
  this.updatePromptsFromPaths(promptPaths);
  
  // 5. 加载主题 (themes)
  this.updateThemesFromPaths(themePaths);
  
  // 6. 加载代理文件 (agents files)
  const agentsFiles = { agentsFiles: loadProjectContextFiles(...) };
  
  // 7. 加载系统提示 (system prompt)
  const baseSystemPrompt = resolvePromptInput(...);
  
  // 8. 加载附加系统提示 (append system prompt)
  const baseAppend = resolvedAppend ? [resolvedAppend] : [];
}
```

### 为什么需要 reload？

`reload` 方法的存在是为了支持**动态资源发现和热重载**：

#### 场景1：开发时添加新扩展
```typescript
// 开发者在开发过程中创建了新扩展
// 调用 reload() 可以重新发现并加载这个新扩展
await resourceLoader.reload();
```

#### 场景2：安装新包后
```typescript
// 用户通过包管理器安装了新的扩展包
// 调用 reload() 可以加载新安装的扩展
await resourceLoader.reload();
```

#### 场景3：配置文件变更
```typescript
// 用户修改了配置文件（如 .pi/config.json）
// 调用 reload() 可以应用新的配置
await resourceLoader.reload();
```

### 完整的 DefaultResourceLoader 的 reload 流程

```typescript
async reload() {
  // 步骤1：从包管理器解析路径
  // - 从 package.json 的 dependencies/devDependencies 发现扩展
  // - 从 node_modules 发现已安装的扩展
  
  // 步骤2：处理命令行参数指定的路径
  // - 用户通过 --extension、--skill 等参数指定的路径
  
  // 步骤3：加载扩展
  // - 从文件系统加载扩展模块
  // - 执行扩展工厂函数
  // - 注册工具、命令、快捷键等
  
  // 步骤4：检测扩展冲突
  // - 检查是否有同名工具/命令/标志
  // - 如果有冲突，记录错误并过滤掉冲突的扩展
  
  // 步骤5：加载技能 (SKILL.md 文件)
  // - 从指定路径加载技能文件
  // - 解析技能内容
  
  // 步骤6：加载提示模板
  // - 从指定路径加载提示模板文件
  // - 解析模板内容
  
  // 步骤7：加载主题
  // - 从指定路径加载主题文件
  // - 解析主题配置
  
  // 步骤8：加载代理文件 (AGENTS.md, CLAUDE.md)
  // - 从项目目录和全局目录发现代理文件
  
  // 步骤9：加载系统提示
  // - 从文件或配置加载系统提示
  
  // 步骤10：更新元数据
  // - 记录所有资源的来源和范围
}
```

## 完整的调用示例

```typescript
// 1. 用户启动应用
const { session } = await createAgentSession({
  cwd: process.cwd(),
  model: getModel("anthropic", "claude-opus"),
});

// 2. 加载了 GitHub extension
// extension 注册了：
// - 工具: "github_search"
// - 命令: "/github.login"
// - 事件处理器: "session_start"

// 3. 用户输入命令
await session.prompt("搜索 GitHub 上的 TypeScript 项目");

// 4. AI 决定调用工具
// AI 返回: { type: "toolCall", name: "github_search", arguments: { query: "TypeScript" } }

// 5. 框架执行工具
// 查找工具 -> 找到 github_search (来自 extension)
// 调用 tool.execute(...)
// 返回结果给 AI

// 6. AI 继续处理

// 7. 用户输入命令
await session.prompt("/github.login");

// 8. 框架执行命令
// 查找命令 -> 找到 github.login (来自 extension)
// 调用 command.handler(ctx)
// 显示登录对话框
```

## Extension 的优先级

工具可能有多个来源，优先级通常是：
1. **自定义工具** (`customTools`) - 最高优先级
2. **Extension 工具** - 中等优先级
3. **内置工具** - 最低优先级

如果有同名工具，高优先级的会覆盖低优先级的。

## Extension 的隔离性

每个 Extension 运行在相对隔离的环境中：
- **独立的错误处理**：一个 Extension 崩溃不会影响其他 Extension
- **独立的上下文**：每个 Extension 有自己的状态
- **权限控制**：Extension 只能访问通过 `ctx` 提供的 API

## Extension 的热重载

```typescript
// 开发时，可以监听文件变化并重新加载
fs.watch(extensionPath, async () => {
  // 1. 重新加载扩展
  await resourceLoader.reload();
  
  // 2. 更新会话中的工具列表
  session.updateTools(resourceLoader.getAllTools());
  
  console.log("Extension reloaded!");
});
```

## 总结

**Extension 系统**是 pi-coding-agent 框架的核心扩展机制，提供了：

1. **模块化架构**：功能可以独立开发和测试
2. **可插拔设计**：用户可以选择安装需要的扩展
3. **完整的事件系统**：可以响应框架的各种生命周期事件
4. **灵活的调用机制**：工具由 AI 调用，命令由用户触发，事件由框架触发
5. **动态资源管理**：通过 `reload` 方法支持热重载和动态发现

这个设计使得框架核心保持简洁，同时提供了强大的扩展能力，支持第三方开发者和用户根据需求定制功能。