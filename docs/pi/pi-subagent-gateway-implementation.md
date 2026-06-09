# Krebs 智能子代理网关增强计划 - 实施总结

## 目标

将 Krebs 网关从单一 Agent 模式升级为**智能任务调度中心**，支持：
- 自动任务拆分（Task DAG）
- 并行子代理执行
- 依赖自动 cascade

## 实施步骤

### 1. 安装依赖

```bash
bun add @tintinweb/pi-subagents @tintinweb/pi-tasks
```

安装版本：
- `@tintinweb/pi-subagents@0.5.2`
- `@tintinweb/pi-tasks@0.4.2`

### 2. 修改 server.ts

**导入扩展：**
```ts
import subagents from "@tintinweb/pi-subagents/dist/index.js";
import tasks from "@tintinweb/pi-tasks/dist/index.js";
```

**加载扩展（在 createSession 的 resourceLoader 中）：**
```ts
resourceLoader: {
  getExtensions: () => ({
    extensions: [subagents as any, tasks as any],
    errors: [],
    runtime: createExtensionRuntime(),
  }),
  // ... 其余保持不变
}
```

### 3. 修改 prompts/index.ts

增强系统提示词，添加任务管理和子代理相关的能力说明：

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

### 4. 修复 TypeScript 配置

- 创建 `types/pi-extensions.d.ts` 解决模块类型声明
- 添加 `/// <reference types="bun-types" />` 到 server.ts 解决 Bun 类型问题
- 添加参数类型注解解决隐式 any 问题

## 遇到的问题

### 版本兼容性问题

**错误信息：**
```
[WebSocket] Session 创建失败: undefined is not an object (evaluating 'ext.tools.values')
```

**原因：**
- `@tintinweb/pi-subagents@0.5.2` 依赖 `@mariozechner/pi-coding-agent@^0.62.0`
- 当前项目使用的是 `@mariozechner/pi-coding-agent@^0.66.1`
- API 变更导致扩展初始化失败

**解决方案（临时）：**
禁用扩展加载，保持服务正常运行：

```ts
resourceLoader: {
  getExtensions: () => ({
    extensions: [],  // 暂时禁用
    errors: [],
    runtime: createExtensionRuntime(),
  }),
}
```

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `package.json` | 修改 | 添加 @tintinweb/pi-subagents 和 @tintinweb/pi-tasks 依赖 |
| `server.ts` | 修改 | 导入并加载扩展（暂时禁用） |
| `prompts/index.ts` | 修改 | 增强系统提示词 |
| `tsconfig.json` | 修改 | 优化 TypeScript 配置 |
| `types/pi-extensions.d.ts` | 新增 | 扩展类型声明 |

## 后续计划

1. **等待扩展更新**：等待 @tintinweb/pi-subagents 和 @tintinweb/pi-tasks 更新支持 pi-coding-agent 0.66.x 版本
2. **自行实现**：参考扩展源码，自行实现兼容版本的任务管理和子代理功能
3. **降级版本**：考虑降级 pi-coding-agent 到 0.62.x 以兼容扩展

## 相关文档

- [pi-subagent-gateway-plan.md](./pi-subagent-gateway-plan.md) - 原始方案
- [architecture-overview.md](./architecture-overview.md) - 整体架构
- [extension-system.md](./extension-system.md) - 扩展系统
