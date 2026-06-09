# extractFromSessionText 重构计划

## 问题描述

当前 `extractFromSessionText` 函数无法正确提取 assistant 消息内容。

## 根因分析

PI SDK `agent_end` 事件中 `messages` 数组的结构：

```typescript
{ type: "agent_end"; messages: AgentMessage[] }
```

`AgentMessage` 结构：
```typescript
{
  type: string;      // e.g. "message"
  id: string;
  parentId: string | null;
  timestamp: string;
  message: {
    role: "user" | "assistant" | "tool";
    content: Array<{ type: "text" | "thinking" | "toolCall"; text?: string; thinking?: string }>;
  };
}
```

**问题**：`role` 在嵌套的 `message.role` 里，不是在顶层。

当前错误代码：
```typescript
messages.filter((m) => m.role === "assistant")  // ❌ m.role 是 undefined
```

## 修复方案

### 1. lib/session-content-extractor.ts

```typescript
export function extractFromSessionText(
  messages: any[],
  logger?: { log: (msg: string) => void },
): string {
  const assistantMessages = messages.filter((m) => m.message?.role === "assistant");
  const lastMessage = assistantMessages[assistantMessages.length - 1];

  if (!lastMessage?.content) {
    logger?.log("[EXTRACT] 无 assistant 消息或 content 为空");
    return "";
  }

  const textParts =
    lastMessage.content
      .filter((c: any) => c.type === "text")
      .map((c: any) => c.text) || [];

  const result = textParts.join("");
  logger?.log(`[EXTRACT] 提取到 ${textParts.length} 段 text，共 ${result.length} 字符`);
  return result;
}
```

### 2. 无需修改的文件

- `server/session-service.ts`: `getLastAssistantMessageFromFile` 返回的是 `data.message`（已是扁平结构），调用方直接传 messages 数组即可
- `server/routes/messages.ts`: 直接传 `sessionMessages` 数组给 `extractFromSessionText`
- `server/event-subscription.ts`: 直接传 messages 数组给 `extractFromSessionText`

## 执行步骤

1. 修改 `lib/session-content-extractor.ts` - 将 `m.role` 改为 `m.message?.role`
2. 验证构建通过
3. 测试验证