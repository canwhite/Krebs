# Krebs 智能子代理网关增强计划

## 目标

将 Krebs 网关从单一 Agent 模式升级为**智能任务调度中心**，支持：
- 自动任务拆分（Task DAG）
- 并行子代理执行
- 依赖自动 cascade

## 依赖包

```bash
npm install @tintinweb/pi-subagents @tintinweb/pi-tasks
```

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                     Krebs Gateway                            │
│                                                                  │
│  HTTP/WS 请求                                                     │
│      ↓                                                            │
│  [主 Session] ← 加载 pi-subagents + pi-tasks 扩展               │
│      ↓                                                            │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ 主 Agent (智能调度中心)                                   │    │
│  │                                                          │    │
│  │  工具: TaskCreate, TaskUpdate, TaskExecute, TaskList    │    │
│  │  工具: Agent, get_subagent_result, steer_subagent       │    │
│  │                                                          │    │
│  │  自主决策流程:                                            │    │
│  │  1. 分析用户任务 → 2. 拆分 Tasks → 3. 执行 Agent        │    │
│  │                                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 实施步骤

### Step 1: 修改 `server.ts` - 导入扩展

**文件**: `server.ts`

```ts
// 文件顶部添加 import
import subagents from "@tintinweb/pi-subagents";
import tasks from "@tintinweb/pi-tasks";
```

### Step 2: 修改 `createSession` 函数 - 加载扩展

**文件**: `server.ts:348-352`

```ts
resourceLoader: {
  getExtensions: () => ({
    extensions: [subagents, tasks],  // ← 改动在这里，顺序重要
    errors: [],
    runtime: createExtensionRuntime(),
  }),
  // ... 其余保持不变
}
```

**注意**: 扩展加载顺序 - subagents 必须在前，tasks 依赖 subagents

### Step 3: 增强系统提示词

**文件**: `prompts/index.ts`

```ts
export const systemPrompt = `你是一个专业的编程助手，也是智能任务调度中心。

== 核心能力 ==
- 基础工具: 执行 shell、读写文件、编辑、网络搜索、获取时间
- 任务管理: TaskCreate(创建任务)、TaskUpdate(更新状态)、TaskList(查看任务)
- 子代理: Agent(启动子代理)、get_subagent_result(获取结果)、steer_subagent(干预)

== 任务拆分原则 ==
当遇到复杂任务时（3+ 步骤），优先使用 Task 工具拆分：
1. 用 TaskCreate 创建结构化任务，指定 agentType（如 "general-purpose"）
2. 用 TaskUpdate 设置 blockedBy 依赖关系
3. 用 TaskExecute 启动并行执行

== 子代理使用原则 ==
- 独立子任务 → 使用 run_in_background: true 并行执行
- 有依赖任务 → 设置依赖后自动串行 cascade
- 需要中途干预 → 使用 steer_subagent
- 使用默认并发数 4，必要时可通过 agentType 调整

== 输出规范 ==
- 任务进行中时，主动报告进度
- 子代理完成后，汇总结果给用户
- 遇到错误，说明原因和尝试的解决方式

请始终使用中文回复用户。`;
```

---

## 核心工具说明

### pi-tasks 工具

| 工具 | 功能 |
|------|------|
| `TaskCreate` | 创建任务，支持 `agentType` 参数指定子代理类型 |
| `TaskUpdate` | 更新状态，设置 `blockedBy` 依赖 |
| `TaskExecute` | 作为子代理执行任务（需要先设置 agentType） |
| `TaskList` | 查看所有任务状态 |
| `TaskGet` | 查看任务详情 |

### pi-subagents 工具

| 工具 | 功能 |
|------|------|
| `Agent` | 启动子代理，支持 foreground/background 模式 |
| `get_subagent_result` | 获取后台代理状态/结果 |
| `steer_subagent` | 中途干预运行中的代理 |

---

## 关键配置

| 配置项 | 位置 | 说明 |
|--------|------|------|
| `autoCascade` | 扩展自动 | 依赖任务完成后自动执行后续任务 |
| `taskScope` | 环境变量 `PI_TASKS` | `session` / `memory` / `project` |
| 并发数 | 扩展默认 | 默认 4，可通过 Agent 参数调整 |
| `agentType` | TaskCreate 参数 | 指定子代理类型 |

### 设置 pi-tasks 自动 cascade

在 `server.ts` 启动前添加：

```ts
process.env.PI_TASKS_AUTO_CASCADE = "true";
// 或
process.env.PI_TASKS = "/path/to/tasks.json";
```

---

## 自定义 Agent 类型（可选）

创建 `.pi/agents/researcher.md`:

```markdown
# Researcher Agent

You are a research agent. Your job is to:
- Search and gather information
- Analyze and summarize findings
- Provide detailed reports

Tools available:
- web_search
- get_current_time
- read
```

Agent 文件放置位置（按优先级）：
1. `.pi/agents/<name>.md` (项目级)
2. `~/.pi/agent/agents/<name>.md` (全局)

---

## 验证方式

1. 启动服务：
   ```bash
   bun run server.ts
   ```

2. 发送复杂任务（通过 HTTP 或 WS）：
   ```
   实现一个用户认证系统，包括登录、注册、JWT 令牌验证，并编写单元测试
   ```

3. 观察预期行为：
   - 主 Agent 自动创建多个 Task
   - 独立任务并行执行（后台 Agent）
   - 有依赖任务自动串行（等待前置完成）
   - 完成后自动汇总结果

---

## 预期效果

- **任务拆分**: 主 Agent 自主识别复杂任务并拆分为结构化 Tasks
- **并行加速**: 无依赖任务并行执行，显著提升处理速度
- **依赖保障**: 有依赖任务自动串行，确保执行顺序正确
- **智能调度**: 通过 pi-tasks 的 auto-cascade 实现自动流程控制
- **全程可见**: 通过事件通知实时了解子代理状态

---

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `server.ts` | 修改 | 导入并加载扩展 |
| `prompts/index.ts` | 修改 | 增强系统提示词 |

---

## 相关文档

- [architecture-overview.md](./architecture-overview.md) - 整体架构
- [extension-system.md](./extension-system.md) - 扩展系统
