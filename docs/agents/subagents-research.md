# @tintinweb/pi-subagents & @tintinweb/pi-tasks 调研

## 概述

两个 pi extension，**不重叠，互补**：

| Extension | 职责 | 注册的工具 |
|-----------|------|-----------|
| pi-subagents | 子 agent 执行能力 | `Agent` |
| pi-tasks | 任务跟踪管理 | `TaskCreate`, `TaskList`, `TaskGet`, `TaskUpdate`, `TaskOutput`, `TaskStop`, `TaskExecute` |

---

## @tintinweb/pi-subagents

## 核心结构

```
dist/
├── index.js                      # 入口，注册 Agent 工具
├── agent-manager.js              # 子 agent 生命周期管理
├── agent-runner.js               # 子 agent 执行引擎
├── agent-types.js                # 类型定义
├── custom-agents.js              # 自定义 agent 注册
├── default-agents.js             # 内置默认 agent
├── group-join.js                 # 子 agent 结果合并
├── invocation-config.js          # 调用配置
├── model-resolver.js             # 模型解析
├── output-file.js                # 输出文件处理
├── memory.js                     # 子 agent 记忆/上下文
├── skill-loader.js               # skill 加载
├── worktree.js                   # 工作目录隔离
├── context.js                    # 上下文构建
├── cross-extension-rpc.js        # extension 间 RPC
└── ui/
    ├── AgentToolResult.jsx       # Agent 工具结果 UI
    └── AgentToolInput.jsx        # Agent 工具输入 UI
```

## 工作原理

1. **注册为 pi extension**：通过 `pi.registerTool()` 注册 `Agent` 工具
2. **Agent 工具**：AI 在推理时调用此工具，传入指令让子 agent 执行
3. **子 agent 独立运行**：每个子 agent 有独立 session、tool 调用能力、上下文窗口
4. **结果合并**：子 agent 完成后，结果返回给主 agent

## 在本项目中的作用

Krebs 通过 `DefaultResourceLoader.extensionFactories` 加载 subagents：

```ts
// server/session-service.ts
const resourceLoader = new DefaultResourceLoader({
  extensionFactories: [subagents as any, tasks as any],
  // ...
});
```

这给运行的 AI agent 注入了 **`Agent` 工具**，效果：

| 能力 | 说明 |
|------|------|
| **子 agent 生成** | AI 可 spawn 子 agent 执行子任务 |
| **并行任务** | 主 agent 派子 agent 干耗时活，自己继续处理 |
| **上下文隔离** | 子 agent 有独立 context window，不会撑爆主 agent |
| **类似 Claude Code /agent** | 实现类似功能，让 AI 能委派任务 |

没有 subagents，AI 只能串行执行工具调用。有了 subagents，AI 可以像团队领导一样分配任务。

---

## @tintinweb/pi-tasks

### 核心结构

```
dist/
├── index.js                   # 入口，注册 7 个 Task 工具
├── auto-clear.js              # 完成任务自动清理
├── process-tracker.js         # 后台进程跟踪
├── task-store.js              # 任务存储（JSON 文件）
├── tasks-config.js            # 配置加载
├── types.js                   # 类型定义
└── ui/
    ├── settings-menu.js       # 设置菜单 UI
    └── task-widget.js         # 任务列表 UI
```

### 注册的工具

| 工具 | 作用 |
|------|------|
| `TaskCreate` | 创建任务（id, subject, description, blockedBy, agentType） |
| `TaskList` | 列出所有任务及状态 |
| `TaskGet` | 查看任务详情 |
| `TaskUpdate` | 更新状态、字段、依赖 |
| `TaskOutput` | 获取后台子 agent 输出 |
| `TaskStop` | 停止运行中的子 agent |
| `TaskExecute` | 派子 agent 执行任务（**依赖 pi-subagents**） |

### pi-subagents 集成

pi-tasks 通过 pi extension 的 event bus RPC 与 pi-subagents 通信：

```
pi-tasks                          pi-subagents
   │                                    │
   │── subagents:rpc:spawn ────────────>│  spawn 子 agent
   │<── subagents:rpc:spawn:reply ──────│  返回 agentId
   │                                    │
   │   subagents:completed <────────────│  子 agent 完成
   │   subagents:failed  <──────────────│  子 agent 失败
```

关键集成点（`index.js`）：
- **`spawnSubagent()`** — 通过 `subagents:rpc:spawn` 请求 subagents 创建子 agent
- **`subagents:completed` 事件** — 子 agent 完成后自动更新任务为 `completed`
- **`subagents:failed` 事件** — 子 agent 失败后记入 `lastError`
- **auto-cascade** — 任务有 `blockedBy` 依赖链时，前置完成自动触发下游任务

### 在本项目中的作用

给 AI agent 注入 **任务跟踪管理能力**。AI 可以：
1. 用 `TaskCreate` 把复杂需求拆解为多个子任务
2. 用 `TaskList`/`TaskGet` 跟踪进度
3. 用 `TaskUpdate` 标记完成/进行中
4. 结合 subagents：用 `TaskExecute` 让子 agent 实际执行任务

---

## 对比总结

| 维度 | pi-subagents | pi-tasks |
|------|-------------|----------|
| **核心能力** | 执行子 agent | 管理任务 |
| **注册工具** | `Agent` | 7 个 Task 工具 |
| **是否可独立使用** | 可 | 可（但 TaskExecute 需要 subagents）|
| **协作方式** | 提供执行能力 | 提供管理 + 通过 RPC 调用 subagents |
| **类比** | 工人 | 项目经理 + 工人（当 subagents 也在时）|
