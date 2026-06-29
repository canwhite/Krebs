# Plan: MEMORY.md 参与 Agent 决策

## Context

当前 MEMORY.md 只写不读，只是人工参考的"死"文件。用户希望这些沉淀的自我认知（key decisions, open questions, context）能参与 agent 决策。

## 目标

在 Session 开始时，将 MEMORY.md 内容注入到 agent context 中。

## 决策

**注入时机**：Session 开始时一次（before_agent_start），避免 messages 膨胀

## 方案选择

**方案 A（推荐）：通过 systemPrompt 注入**
```typescript
return { systemPrompt: MEMORY_CONTEXT_HEADER + memoryContent };
```
- 优点：简单，不会重复累积
- 缺点：替换整个 system prompt

**方案 B：通过 message 注入**
```typescript
return { 
  message: {
    customType: "memory_context",
    content: MEMORY_CONTEXT_HEADER + memoryContent,
    display: false,
  }
};
```
- 优点：不影响 system prompt
- 缺点：需要防重复机制

---

## 实现步骤（方案 A）

### 1. 修改 storage.ts - 添加同步读取函数

文件：`server/services/memory/storage.ts`

```typescript
// 添加同步读取函数（用于 before_agent_start hook 同步调用）
export function readMemorySync(cwd: string): string {
  const path = join(cwd, MEMORY_FILE_NAME);
  if (existsSync(path)) {
    return readFileSync(path, "utf-8");
  }
  return "";
}
```

### 2. 创建新的 before_agent_start hook 注入点

文件：`.pi/extensions/memory-context/index.ts`（新文件）

```typescript
import type { ExtensionAPI, BeforeAgentStartEvent } from "@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts";
import { readMemorySync } from "../../../server/services/memory/storage.js";

const MEMORY_CONTEXT_HEADER = "【历史记忆】以下是你之前会话中沉淀的重要信息，请参考：\n\n";

export default function (api: ExtensionAPI) {
  api.on("before_agent_start", async (event: BeforeAgentStartEvent, ctx) => {
    // 检查是否有 MEMORY.md
    const memoryContent = readMemorySync(ctx.cwd);

    if (!memoryContent || memoryContent.trim() === "# Memory\n\n") {
      return {};  // 没有 memory 内容，跳过
    }

    // 重要：每次都返回 systemPrompt，否则会被重置回 base
    return {
      systemPrompt: MEMORY_CONTEXT_HEADER + memoryContent,
    };
  });
}
```

### 3. 注册新 extension

文件：`server/session-service.ts`

```typescript
import memoryContextExtension from "../.pi/extensions/memory-context/index.js";

// 添加到 extensionFactories
extensionFactories: [
  subagents as any,
  tasks as any,
  memoryExtension as any,
  contextExtension as any,
  memoryContextExtension as any,  // 新增
],
```

---

## 事前验尸发现的问题

### 问题 1：`before_agent_start` 返回格式

`BeforeAgentStartEventResult` 定义：
```typescript
{
  message?: Pick<CustomMessage, "customType" | "content" | "display" | "details">;
  systemPrompt?: string;
}
```

**注意**：不支持 `{ messages: [...] }` 格式，只能添加单个 message 或替换 systemPrompt。

### 问题 2：触发时机

`before_agent_start` 在每次 agent loop **开始**时触发。如果 session 多轮对话，systemPrompt 会每次都被替换/更新。但由于我们只注入一次（检测到已有就不注入），不会重复累积。

### 问题 3：systemPrompt 行为（关键修复）

**初始理解**：`before_agent_start` 返回 `systemPrompt` 后会持久化。

**实际情况**：每次 agent loop 开始时，都会调用 `emitBeforeAgentStart(_baseSystemPrompt, ...)`，然后：
```javascript
if (result?.systemPrompt) {
    agent.state.systemPrompt = result.systemPrompt;
} else {
    agent.state.systemPrompt = _baseSystemPrompt;  // ← 被重置！
}
```

**结论**：
- 如果某轮返回 `{}`，systemPrompt 会被**重置回 base**
- Memory 内容第一轮后就会丢失！

**解决方案**：每次都返回 memory systemPrompt（只要存在），不要返回 `{}`。

### 问题 4：多轮对话行为

由于每次都返回 memory systemPrompt，多轮对话时：
- ✅ Memory 始终存在
- ✅ 不需要防重复机制
- ⚠️ 每轮都有文件 I/O（可接受）

---

## Files to Modify

- `server/services/memory/storage.ts` - 添加 `readMemorySync()`
- `server/session-service.ts` - 注册新 extension
- `.pi/extensions/memory-context/index.ts` - 新文件，memory context injector

## Verification Steps

1. 创建测试用 MEMORY.md（填充一些测试内容）
2. 启动 session，观察日志
3. 检查 agent 是否能"记住"之前沉淀的信息
4. 验证 Session 切换/fork 后行为是否正确
5. 验证多轮对话后 memory 内容是否正确传递
