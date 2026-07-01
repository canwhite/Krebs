# Bug: `ContextCollapse.generateSummary` 是 stub，无实际 LLM 调用

## 影响范围

`server/services/compact/contextCollapse.ts`

## 根因

原实现：

```typescript
async generateSummary(...): Promise<string> {
  // ...
  // TODO: 实现实际的 LLM 调用
  // 目前返回占位符
  return `[摘要 - ${rangeMessages.length} 条消息被压缩]`;
}
```

Context Collapse 在 75% token 触发时，用假摘要替换真实消息历史。投影中的"摘要"是静态占位符，不是 LLM 生成的实际内容。

## 修复

接入 `completeSimple`（与 `memory/llm.ts` 相同）：

```typescript
import { completeSimple } from "@earendil-works/pi-ai/compat";

async generateSummary(
  messages: AgentMessage[],
  headIndex: number,
  tailIndex: number,
  model?: Model<any>,
  apiKey?: string,
  signal?: AbortSignal
): Promise<string> {
  const rangeMessages = messages.slice(headIndex, tailIndex);
  if (rangeMessages.length === 0) return "[empty range]";
  if (!model || !apiKey) return `[摘要 - ${rangeMessages.length} 条消息被压缩]`;

  try {
    const response = await completeSimple(model, {
      systemPrompt: "你是一个简洁的摘要生成器。",
      messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
    }, { maxTokens: 1024, signal, apiKey });

    const text = response.content.find((c): c is TextContent => c.type === "text");
    return text?.text?.trim() || `[摘要 - ${rangeMessages.length} 条消息被压缩]`;
  } catch (err: any) {
    console.error("[ContextCollapse] LLM call failed:", err.message);
    return `[摘要 - ${rangeMessages.length} 条消息被压缩]`;
  }
}
```

**同时修复**：`shouldCollapse` 增加除零保护。

## 验证

- Build ✅
- TypeScript ✅（零错误）
