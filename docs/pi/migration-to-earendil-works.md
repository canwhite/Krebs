# Krebs 迁移到 @earendil-works/pi-coding-agent 计划

## 背景

将 Krebs 从 `@mariozechner/pi-coding-agent@0.66.1` 迁移到 `@earendil-works/pi-coding-agent@0.80.2`，以兼容 `pi-subagents` 扩展。

## 版本信息

| 包 | 当前版本 | 目标版本 |
|----|----------|----------|
| `@mariozechner/pi-coding-agent` | 0.66.1 | - |
| `@earendil-works/pi-coding-agent` | - | 0.80.2 |
| `@mariozechner/pi-ai` | (隐式依赖) | - |
| `@earendil-works/pi-ai` | - | 0.80.2 (compat) |

## API 兼容性分析

### 1. 工具参数类型（高风险）

| 版本 | tools 参数类型 |
|------|---------------|
| mariozechner | `tools?: Tool[]` (Tool 对象数组) |
| earendil-works | `tools?: string[]` + `noTools?` + `excludeTools?` |

**影响**：Krebs 需要重构 `createAgentSession` 调用。

**mariozechner (当前)**:
```typescript
const result = await createAgentSession({
  tools: [
    createReadTool(cwd),
    bashTool as any,      // Tool 对象
    createEditTool(cwd),
  ],
  customTools: TOOLS.map((t) => t.tool),
  ...
});
```

**earendil-works (迁移后)**:
```typescript
const result = await createAgentSession({
  tools: ["read", "bash", "edit"],  // 字符串数组（内置工具），必须含 "bash" 才能让 customTools 中的 sandbox bash 通过过滤
  customTools: [bashTool, ...TOOLS.map((t) => t.tool)],  // sandbox bash 会覆盖内置 bash
  ...
});
```

**注意**：Krebs 的 `bashTool` 是 sandbox 化版本，通过 `customTools` 传入以覆盖内置 bash。需要 `tools` 中包含 "bash" 字符串，否则 custom bash 会被 `isAllowedTool` 过滤机制排除。

### 2. 预制工具常量（低风险）

| 版本 | 预制常量 |
|------|----------|
| mariozechner | `bashTool`, `editTool`, `writeTool`, `readTool`, `grepTool`, `findTool`, `lsTool`, `codingTools`, `readOnlyTools`, `allTools` |
| earendil-works | **无**（只有工厂函数） |

**影响**：Krebs 代码中没有直接使用这些常量（`bashTool` 是局部变量名），风险低。

### 3. SessionManager（兼容）

| 方法 | mariozechner | earendil-works |
|------|-------------|----------------|
| `SessionManager.create()` | ✓ | ✓ |
| `SessionManager.inMemory()` | ✓ | ✓ |
| `SessionManager.open()` | ✓ | ✓ |
| `SessionManager.forkFrom()` | ✓ | ✓ |

### 4. ExtensionAPI 事件（兼容）

earendil-works 新增事件：
- `project_trust`

Krebs 现有扩展使用的事件全部兼容：
- `session_start`, `session_shutdown`, `turn_end`, `context`, `before_agent_start`, `tool_execution_start`, `tool_execution_end`

### 5. AuthStorage API 变更（已验证兼容）

| 方法 | mariozechner | earendil-works |
|------|-------------|----------------|
| `AuthStorage.setRuntimeApiKey()` | ✓ | ✓ **存在** (auth-storage.d.ts:61) |
| `AuthStorage.setFallbackResolver()` | ✓ | ✗ 移除 |

**验证结果**：earendil-works 确实有 `setRuntimeApiKey()` 方法，调用方式完全兼容。

### 6. LLM 调用 API 变更（已验证兼容）

| 函数 | mariozechner | earendil-works |
|------|-------------|----------------|
| `completeSimple` | `completeSimple(model, { systemPrompt, messages }, { maxTokens, signal, apiKey })` | ✓ **兼容** |

**验证结果**：
- Context 接口: `{ systemPrompt?: string; messages: Message[] }`
- SimpleStreamOptions: 包含 `maxTokens`, `signal`, `apiKey`
- UserMessage 定义完全一致

### 7. AgentMessage 类型来源（已验证兼容）

| 类型 | mariozechner | earendil-works |
|------|-------------|----------------|
| `AgentMessage` | `@mariozechner/pi-agent-core` | `@earendil-works/pi-agent-core` |

**验证结果**：Krebs 中 AgentMessage 仅作为类型使用，不依赖具体实现。迁移时只需更新 import 路径。

## 迁移变更清单

### 1. package.json

```diff
- "@mariozechner/pi-coding-agent": "workspace:*",
+ "@earendil-works/pi-coding-agent": "0.80.2",
- "@mariozechner/pi-ai": "workspace:*",
+ "@earendil-works/pi-ai": "0.80.2",
```

### 2. server/session-service.ts

**变更点 A: Import 语句**
```diff
- import { ..., getAgentDir, createAgentSessionServices } from "@mariozechner/pi-coding-agent";
- import { getModel } from "@mariozechner/pi-ai";
+ import { ..., getAgentDir, createAgentSessionServices } from "@earendil-works/pi-coding-agent";
+ import { getModel } from "@earendil-works/pi-ai/compat";
```

**变更点 B: createAgentSession 调用**

**重要**：Krebs 使用自定义的 sandbox bash tool（`createSandboxBashTool` 返回 `{ name: "bash", ... }` 对象），不是 earendil-works 的内置 bash。因此：

- `tools`: 传入内置工具的**字符串**数组（不含 bash，bash 通过 customTools 提供）
- `customTools`: 传入**自定义工具对象**数组，包括自定义 bash tool

```diff
const result = await createAgentSession({
  ...
-  tools: [
-    createReadTool(cwd),
-    bashTool as any,
-    createEditTool(cwd),
-  ],
+  tools: ["read", "bash", "edit"],  // 必须包含 "bash"，才能让 customTools 中的 sandbox bash 通过过滤
+  customTools: [bashTool, ...TOOLS.map((t) => t.tool)],  // 自定义工具（对象），sandbox bash 会覆盖内置 bash
  resourceLoader,
});
```

**关键说明**：earendil-works 中，`customTools` 中的工具同样受 `isAllowedTool` 过滤检查（基于 `tools` 字符串数组）。如果 "bash" 不在 `tools` 中，则 Krebs 的 sandbox bash 会被过滤掉，导致无法执行任何 shell 命令。

**执行流程**：
1. 内置 bash tool 先被注册到 `definitionRegistry`（来自 `_baseToolDefinitions`）
2. customTools 中的 sandbox bash 通过 `isAllowedTool("bash")` 检查后，用相同 name 覆盖内置版本
3. 最终使用的是 Krebs 的 sandbox bash（带沙箱检查逻辑）

**变更点 C: DefaultResourceLoader 构造**
```diff
const resourceLoader = new DefaultResourceLoader({
-  cwd,
-  agentDir: getAgentDir(),
+  cwd: cwd,            // 必需
+  agentDir: getAgentDir(),  // 必需
  ...
});
```

### 3. tools/index.ts

```diff
- import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
+ import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
```

### 4. 其他文件

```diff
# server/ws-context.ts
- import type { AgentSessionRuntime } from "@mariozechner/pi-coding-agent";
+ import type { AgentSessionRuntime } from "@earendil-works/pi-coding-agent";

# server/event-subscription.ts
- import type { AgentSession } from "@mariozechner/pi-coding-agent";
+ import type { AgentSession } from "@earendil-works/pi-coding-agent";

# server/sandbox/tools/types.ts
- import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
+ import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

# tools/lua-tools-registry.ts
- import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
+ import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

# tools/lua-exec.ts
- import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
+ import type { ToolDefinition } from "@earendil-works/pi-coding-agent";

# server/services/memory/engine.ts
- import type { ExtensionContext, ExtensionAPI } from "@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts";
+ import type { ExtensionContext, ExtensionAPI } from "@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts";

# server/services/goal-constraint/engine.ts, llm.ts
- import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
+ import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

# server/services/self-verification/llm.ts
- import type { ExtensionContext } from "@mariozechner/pi-coding-agent";
+ import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

# server/services/memory/llm.ts (已验证兼容)
- import { completeSimple, type Model, type UserMessage } from "@mariozechner/pi-ai";
+ import { completeSimple, type Model, type UserMessage } from "@earendil-works/pi-ai/compat";

# server/services/compact/microCompact.ts
- import type { AgentMessage } from "@mariozechner/pi-agent-core";
- import { type TextContent, type ImageContent, type ToolResultMessage } from "@mariozechner/pi-ai";
+ import type { AgentMessage } from "@earendil-works/pi-agent-core";
+ import { type TextContent, type ImageContent, type ToolResultMessage } from "@earendil-works/pi-ai";

# server/services/goal-constraint/llm.ts
- import { completeSimple, type Model } from "@mariozechner/pi-ai";
+ import { completeSimple, type Model } from "@earendil-works/pi-ai/compat";

# server/services/goal-constraint/engine.ts
- import type { AgentMessage } from "@mariozechner/pi-agent-core";
+ import type { AgentMessage } from "@earendil-works/pi-agent-core";

# server/sandbox/tools/bash.ts
- import type { AgentToolResult } from "@mariozechner/pi-agent-core";
+ import type { AgentToolResult } from "@earendil-works/pi-agent-core";

# lib/session-repository.ts
- import type { AgentSessionRuntime } from "@mariozechner/pi-coding-agent";
+ import type { AgentSessionRuntime } from "@earendil-works/pi-coding-agent";

# .pi/extensions/context/index.ts
- import type { TextContent, ImageContent } from "@mariozechner/pi-ai";
+ import type { TextContent, ImageContent } from "@earendil-works/pi-ai";

# examples/index.ts (遗漏)
- import { ..., createAgentSession, ... } from "@mariozechner/pi-coding-agent";
- import { getModel } from "@mariozechner/pi-ai";
+ import { ..., createAgentSession, ... } from "@earendil-works/pi-coding-agent";
+ import { getModel } from "@earendil-works/pi-ai/compat";
- 同步更新 tools 参数为字符串数组
```

### 8. AuthStorage API（已验证兼容）

**验证结果**：`earendil-works` 的 AuthStorage 确实有 `setRuntimeApiKey()` 方法（auth-storage.d.ts:61），调用方式与 mariozechner 版本完全兼容，无需修改。

### 9. 迁移过程中的类型问题修复

#### 9.1 AgentMessage 导入路径

`AgentMessage` 不在 `@earendil-works/pi-coding-agent` 主包导出中，而需从 `@earendil-works/pi-agent-core` 导入。

**解决**：在 `package.json` 中添加 `@earendil-works/pi-agent-core` 作为直接依赖。

#### 9.2 ContextEventResult 未导出

`ContextEventResult` 在 `earendil-works` 的内部类型定义中存在（`types.d.ts:743`），但未从主包导出。

**解决**：在使用的扩展文件中定义本地类型别名：
```typescript
import type { AgentMessage } from "@earendil-works/pi-agent-core";
type ContextEventResult = { messages?: AgentMessage[] };
```

#### 9.3 BashTool 与 ToolDefinition 类型不兼容

Krebs 的 `createSandboxBashTool` 返回的 `BashTool` 对象，其 `renderCall` 方法签名与 `ToolDefinition` 接口不兼容（具体为参数类型差异）。

**解决**：在 `customTools` 数组中使用 `as any` 强制类型转换：
```typescript
customTools: [bashTool as any, ...TOOLS.map((t) => t.tool)],
```

## Session 隔离设计

### 当前问题

1. **AgentManager 单例**：所有 session 的 agents 共享同一个 Manager
2. **Scheduler 单例**：所有 session 的 scheduled jobs 共享同一个 Scheduler

### 隔离方案

```typescript
// .pi/extensions/subagent/index.ts
export default function (api: ExtensionAPI) {
  // Session 级别状态，使用 sessionId 作为 key
  const sessionState = new Map<string, {
    agentManager: AgentManager;
    scheduler: SubagentScheduler;
    contextCache: ContextCache;
  }>();

  api.on("session_start", async (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();

    // 每个 session 创建独立的子模块实例
    const state = {
      agentManager: new AgentManager(/* sessionId 传入 */),
      scheduler: new SubagentScheduler(),
      contextCache: new ContextCache(),
    };

    sessionState.set(sessionId, state);
  });

  api.on("session_shutdown", async (_event, ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    const state = sessionState.get(sessionId);

    if (state) {
      state.agentManager.abortAll();
      state.scheduler.stop();
      sessionState.delete(sessionId);
    }
  });

  // 工具执行时通过 ctx 获取对应的 session 状态
  const getState = (ctx) => {
    const sessionId = ctx.sessionManager.getSessionId();
    return sessionState.get(sessionId);
  };
}
```

### 隔离保证

| 资源 | 隔离方式 |
|------|----------|
| AgentManager | 每个 session 独立实例，sessionId 区分 |
| Scheduler | 每个 session 独立实例 |
| Context Cache | 每个 session 独立 Map |
| Session Manager | 每个 agent 有独立的 SessionManager |
| Output Files | 按 sessionId 分离目录 |

## 迁移步骤

### Phase 0: API 研究（已完成 ✓）

**以下 API 已验证兼容，可直接迁移：**

1. **AuthStorage.setRuntimeApiKey()** ✓ 已验证存在
   - `auth-storage.d.ts:61` 确认方法存在，调用方式兼容

2. **completeSimple 兼容性** ✓ 已验证
   - `pi-ai/compat/index.d.ts` 确认签名兼容

3. **创建测试分支**（待执行）
   - 在测试分支上验证迁移
   - 确认 API 调用正确

### Phase 1: 依赖更新

1. 更新 `package.json` 依赖
2. 运行 `pnpm install`
3. 验证无依赖冲突

### Phase 2: 代码迁移

1. 更新所有 import 路径
2. 重构 `createAgentSession` 的 tools 参数
3. 更新 `DefaultResourceLoader` 构造参数

### Phase 3: 扩展迁移

1. 更新 Krebs 扩展的 ExtensionContext import 路径
2. 验证扩展事件监听器兼容性
3. 实现 session 隔离机制

### Phase 4: 测试验证

1. `bun run build` 通过
2. `bunx tsc --noEmit` 无错误
3. 启动 Krebs 服务，验证 WebSocket 连接
4. 测试基本工具调用（read, bash, edit）
5. 测试 pi-subagents 功能（Agent 工具）

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| ~~AuthStorage.setRuntimeApiKey()~~ | ~~已验证存在~~ | ✓ |
| ~~completeSimple 签名~~ | ~~已验证兼容~~ | ✓ |
| tools 参数类型不兼容 | 编译错误 | `tools: ["read", "edit"]` + `customTools: [bashTool, ...]` |
| AgentMessage 类型路径变化 | 编译错误 | 更新 import 路径 |
| pi-subagents API 不兼容 | 运行时错误 | 迁移后测试验证 |
| Node.js 版本要求 | 运行时错误 | 检查 >= 22.19.0 (当前 v26 ✓) |

## 验证检查清单

### Phase 0 验证
- [x] AuthStorage.setRuntimeApiKey() 已验证存在
- [x] completeSimple 兼容性已验证
- [x] AgentMessage 类型兼容
- [x] UserMessage 定义一致
- [ ] **仅剩 tools 参数类型需要修改**

### Phase 1 验证
- [ ] `pnpm install` 成功
- [ ] 无依赖冲突

### Phase 2 验证
- [x] `bun run build` 通过
- [x] `bunx tsc --noEmit` 无错误
- [x] 所有 import 路径正确

### Phase 3 验证
- [ ] WebSocket 服务启动成功
- [ ] AuthStorage API Key 设置正确
- [ ] 基本工具调用（read, bash, edit）正常

### Phase 4 验证
- [ ] Memory consolidation 正常
- [ ] Goal constraint 正常
- [ ] Self verification 正常
- [ ] Agent 工具可用
- [ ] Session 隔离正常（多 session 并行）