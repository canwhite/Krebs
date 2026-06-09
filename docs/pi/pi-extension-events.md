# Pi Extension Events - 扩展事件体系

> 基于 `pi-coding-agent@0.66.1` 源码验证

## 概述

Pi 是一个**事件驱动的扩展治理系统**，通过 `api.on(event, handler)` 注册处理器，订阅各种生命周期事件。

---

## 一、Session 事件 ✅ 已验证

| 事件 | 源码位置 | 说明 | 可取消/可自定义 |
|------|----------|------|----------------|
| `session_start` | agent-session.js:1896 | 会话启动 | - |
| `session_before_switch` | agent-session-runtime.js:52-56 | 切换会话前 | ✅ 可取消 |
| `session_before_fork` | agent-session-runtime.js:64-68 | Fork 会话前 | ✅ 可取消 |
| `session_before_compact` | agent-session.js:1256, 1479 | **压缩上下文前** | ✅ 可取消/可自定义 |
| `session_compact` | agent-session.js:1302, 1539 | 压缩完成后 | - |
| `session_before_tree` | agent-session.js:2165 | 树导航前 | ✅ 可取消 |
| `session_tree` | agent-session.js:2275 | 树导航后 | - |
| `session_shutdown` | agent-session.js:1882 | 进程退出 | - |

---

## 二、Agent Loop 事件 ✅ 已验证

| 事件 | 源码位置 | 说明 |
|------|----------|------|
| `before_agent_start` | agent-session.js:752, runner.js:581 | Agent 循环开始前（可修改 prompt） |
| `agent_start` | agent-session.js:374 | Agent 循环开始 |
| `agent_end` | agent-session.js:377 | Agent 循环结束 |
| `before_provider_request` | sdk.js:182-187 | 发送请求给 LLM 前（可替换 payload） |
| `context` (transformContext) | sdk.js:190-194 | 每次 LLM 调用前的上下文（可修改 messages） |

---

## 三、消息/对话事件 ✅ 已验证

| 事件 | 源码位置 | 说明 |
|------|----------|------|
| `input` | runner.js:669 | 用户输入时（可 transform/handled） |
| `message_start` | agent-session.js:955 | 消息开始 |
| `message_update` | agent-session.js:406 | 流式输出中 |
| `message_end` | agent-session.js:956 | 消息结束 |
| `turn_start` | agent-session.js:381 | Turn 开始 |
| `turn_end` | agent-session.js:389 | Turn 结束 |

---

## 四、Tool 工具事件 ✅ 已验证

| 事件 | 源码位置 | 说明 |
|------|----------|------|
| `tool_call` | runner.js:474, agent-session.js:173 | 工具调用前 |
| `tool_result` | runner.js:427, agent-session.js:192 | 工具结果后（可修改） |
| `tool_execution_start` | agent-session.js:421 | 工具开始执行 |
| `tool_execution_update` | agent-session.js:430 | 工具执行中（流式） |
| `tool_execution_end` | agent-session.js:440 | 工具执行结束 |

---

## 五、其他事件 ✅ 已验证

| 事件 | 源码位置 | 说明 |
|------|----------|------|
| `model_select` | agent-session.js:1042 | 模型切换时 |
| `user_bash` | interactive-mode.js:3920, runner.js:493 | 用户执行 bash 命令时 |
| `resources_discover` | agent-session.js:1616,1619, runner.js:630 | 资源发现时 |

---

## 六、UI 交互接口 ✅ 已验证

通过 `ctx.ui` 提供：

```typescript
ctx.ui.select(title, options[])     // 选择对话框
ctx.ui.confirm(title, message)      // 确认对话框
ctx.ui.input(title, placeholder)    // 文本输入
ctx.ui.notify(message, type)        // 通知
ctx.ui.setStatus(key, text)         // 状态栏
ctx.ui.setWidget(key, content)      // 挂件
ctx.ui.custom(factory)               // 自定义组件
```

---

## 七、工具注册 ✅ 已验证

```typescript
api.registerTool({
  name: "my_tool",
  description: "...",
  parameters: TSchema,
  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    return { content: [...] };
  }
});
```

---

## 关键事件详解

### session_before_compact（人工介入压缩）

**源码位置**: agent-session.js:1479-1500

```typescript
if (this._extensionRunner?.hasHandlers("session_before_compact")) {
    const extensionResult = await this._extensionRunner.emit({
        type: "session_before_compact",
        preparation,        // 要压缩的消息范围
        branchEntries: pathEntries,
        customInstructions: undefined,
        signal: this._autoCompactionAbortController.signal,
    });
    if (extensionResult?.cancel) {
        return;  // 取消压缩
    }
    if (extensionResult?.compaction) {
        // 提供自定义压缩结果
    }
}
```

### context（上下文修改）

**源码位置**: sdk.js:190-194

```typescript
transformContext: async (messages) => {
    const runner = extensionRunnerRef.current;
    if (!runner) return messages;
    return runner.emitContext(messages);  // 触发 context 事件
},
```

---

## 验证方法

```bash
# 验证 Session 事件
grep -n "session_before_compact\|session_compact" agent-session.js

# 验证 Tool 事件
grep -n "emitToolCall\|emitToolResult" extensions/runner.js

# 验证 Agent 事件
grep -n "agent_start\|agent_end" agent-session.js
```

---

## 源码文件

| 文件 | 用途 |
|------|------|
| `dist/core/agent-session.js` | Agent Session 主逻辑 |
| `dist/core/sdk.js` | SDK 初始化 |
| `dist/core/agent-session-runtime.js` | Runtime 会话管理 |
| `dist/core/extensions/runner.js` | Extension Runner |
| `dist/modes/interactive/interactive-mode.js` | 交互模式 |
