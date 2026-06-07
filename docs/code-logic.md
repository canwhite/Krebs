# Simple Agent 代码逻辑详解

## 架构总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           架构总览                                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐             │
│   │   工具定义    │    │  配置/模型    │    │  资源加载器   │             │
│   │  (Tools)     │    │  (Config)    │    │(ResourceLoader)│            │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘             │
│          │                   │                   │                      │
│          └───────────────────┼───────────────────┘                      │
│                              ▼                                          │
│                    ┌──────────────────┐                                 │
│                    │ createAgentSession │                               │
│                    └────────┬─────────┘                                 │
│                             ▼                                           │
│                    ┌──────────────────┐                                 │
│                    │   AgentSession   │◄──── subscribe() 监听事件       │
│                    │    (核心会话)     │◄──── prompt()   发送消息       │
│                    └──────────────────┘                                 │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 五个核心模块

### 1. 工具定义 (ToolDefinition)

**位置**: 第 15-91 行

```typescript
const webSearchTool: ToolDefinition = {
  name: "web_search",           // 工具名称 (LLM 调用时使用)
  label: "Web Search",          // UI 显示名称
  description: "...",           // 描述 (LLM 根据这个决定何时调用)
  parameters: Type.Object({}),  // 参数 schema (TypeBox 格式)
  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    // 执行逻辑
    return { content: [...], details: {} };
  },
};
```

**关键点**:
- `parameters` 用 TypeBox 定义 JSON Schema
- `execute` 返回 `{ content: TextContent[], details: any }`
- LLM 根据 `description` 决定何时调用此工具

---

### 2. 模型配置 (Model Config)

**位置**: 第 93-121 行

```typescript
// API Key 选择
const apiKey = process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY;

// 自定义模型定义 (DeepSeek 不在内置列表中)
function createDeepSeekModel(): Model<"openai-completions"> {
  return {
    id: "deepseek-chat",
    api: "openai-completions",  // 使用 OpenAI 兼容 API
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    // ... 其他配置
  };
}
```

**两种模型来源**:

| 方式 | 说明 |
|------|------|
| `getModel("anthropic", "claude-sonnet-4-20250514")` | 内置模型，直接获取 |
| `createDeepSeekModel()` | 自定义模型，手动定义配置 |

---

### 3. 会话创建 (Create Session)

**位置**: 第 140-184 行

```typescript
async function createSession() {
  // 1. 认证存储 - 管理 API Key
  const authStorage = new AuthStorage();
  authStorage.setRuntimeApiKey("deepseek", apiKey);  // 运行时注入
  
  // 2. 模型注册表 - 发现可用模型
  const modelRegistry = new ModelRegistry(authStorage);
  
  // 3. 创建会话
  const result = await createAgentSession({
    cwd,                                    // 工作目录
    model,                                  // 使用的模型
    tools: [createReadTool(cwd), ...],     // 内置工具
    customTools: [webSearchTool, ...],     // 自定义工具
    sessionManager: SessionManager.inMemory(),  // 内存会话
    resourceLoader: {...},                  // 资源加载器
  });
  
  return result.session;
}
```

**资源加载器 (ResourceLoader)** 提供扩展能力:

```typescript
resourceLoader: {
  getExtensions: () => ({ extensions: [], runtime: createExtensionRuntime() }),
  getSkills: () => ({ skills: [] }),
  getSystemPrompt: () => systemPrompt,  // 系统提示词
  // ...
}
```

---

### 4. 事件订阅 (Event Subscription)

**位置**: 第 194-209 行

```typescript
session.subscribe((event) => {
  // 工具开始执行
  if (event.type === "tool_execution_start") {
    console.log(`调用工具: ${event.toolName}`);
  }
  
  // 工具执行结束
  else if (event.type === "tool_execution_end") {
    console.log(event.isError ? "失败" : "成功");
  }
  
  // 消息流式更新 (打字机效果)
  else if (event.type === "message_update") {
    if (event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }
  }
});
```

**事件类型**:

| 事件 | 说明 |
|------|------|
| `tool_execution_start` | 工具开始执行 |
| `tool_execution_end` | 工具执行结束 |
| `message_update` | 消息流式更新 |
| `agent_start` / `agent_end` | Agent 开始/结束 |
| `turn_start` / `turn_end` | 对话轮次开始/结束 |

---

### 5. 交互循环 (Interactive Loop)

**位置**: 第 186-240 行

```typescript
async function runInteractive() {
  const session = await createSession();
  
  // 订阅事件 (只订阅一次!)
  session.subscribe((event) => { ... });
  
  while (true) {
    // 1. 读取用户输入
    const input = await readFromStdin();
    
    // 2. 检查退出命令
    if (input === "exit") break;
    
    // 3. 发送给 Agent
    await session.prompt(input);
    
    // Agent 会自动:
    // - 分析用户意图
    // - 决定调用哪些工具
    // - 执行工具并获取结果
    // - 根据结果继续处理或给出最终答案
  }
  
  session.dispose();  // 清理资源
}
```

---

## 数据流 (Data Flow)

```
用户输入: "帮我创建 math-utils.ts"
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│  session.prompt(input)                                        │
│       │                                                        │
│       ▼                                                        │
│  ┌─────────────┐                                               │
│  │ LLM 思考    │  分析: 需要创建文件 → 选择 write_file 工具     │
│  └─────┬───────┘                                               │
│        │                                                        │
│        ▼                                                        │
│  ┌─────────────────┐                                           │
│  │ tool_execution  │  事件: tool_execution_start               │
│  │    _start       │  工具: write_file                          │
│  └────────┬────────┘  参数: { path: "math-utils.ts", ... }     │
│           │                                                    │
│           ▼                                                    │
│  ┌─────────────────┐                                           │
│  │  执行工具       │  writeTool.execute(...)                   │
│  └────────┬────────┘  → 创建文件                               │
│           │                                                    │
│           ▼                                                    │
│  ┌─────────────────┐                                           │
│  │ tool_execution  │  事件: tool_execution_end                 │
│  │    _end         │  结果: { success: true }                  │
│  └────────┬────────┘                                           │
│           │                                                    │
│           ▼                                                    │
│  ┌─────────────┐                                               │
│  │ LLM 继续    │  "文件已创建成功，包含以下函数..."             │
│  └─────┬───────┘                                               │
│        │                                                        │
│        ▼                                                        │
│  ┌─────────────────┐                                           │
│  │ message_update  │  流式输出文本                              │
│  └─────────────────┘                                           │
└───────────────────────────────────────────────────────────────┘
        │
        ▼
输出: "我已经创建了 math-utils.ts 文件..."
```

---

## 核心概念总结

| 概念 | 作用 |
|------|------|
| **Tool** | 定义 Agent 可执行的操作 (读文件、执行命令等) |
| **Model** | 定义使用的 LLM (API、baseUrl、配置) |
| **AuthStorage** | 管理 API Key |
| **SessionManager** | 管理对话历史 |
| **ResourceLoader** | 加载扩展、技能、系统提示词 |
| **AgentSession** | 核心: 管理整个 Agent 生命周期 |
| **subscribe** | 监听 Agent 事件 (工具调用、消息更新) |
| **prompt** | 发送用户消息给 Agent |

---

## 文件结构

```
index.ts
├── 工具定义
│   ├── webSearchTool      - 网络搜索工具 (模拟)
│   └── getCurrentTimeTool - 获取当前时间
│
├── 配置
│   ├── apiKey / useDeepSeek - API Key 选择
│   ├── createDeepSeekModel  - 自定义模型
│   └── systemPrompt         - 系统提示词
│
├── createSession() - 创建 Agent 会话
│
├── runInteractive() - 交互模式
│   ├── 订阅事件
│   ├── 读取输入循环
│   └── session.prompt()
│
├── runExample() - 示例模式
│
└── main() - 入口
```
