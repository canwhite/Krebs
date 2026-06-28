# Micro Compact 实现文档

## 概述

Micro Compact 是一种**轻量级、无感知、自动执行**的上下文清理机制，灵感来自 Claude Code 的 Micro Compact。

### 核心特性

| 特性 | 说明 |
|------|------|
| **触发时机** | 每次 `context` hook（发消息给 LLM 之前） |
| **是否调 LLM** | 否，只是 truncate 内容 |
| **是否破坏** | 否，完整内容持久化到 transcript |
| **性能影响** | 极低，字符串替换 |
| **用户感知** | 无，自动执行 |

### 与其他层的关系

```
Micro Compact        → truncate 旧 tool results（轻量，最先触发）
Context Collapse     → 用已有摘要替换旧消息段（中等）
AutoCompact (库)    → 调 LLM 生成新摘要（重量，最后手段）
```

## 目标

在 Krebs 项目中实现 Micro Compact：
1. 清理超过 N 轮的旧 tool results
2. 将完整内容持久化到 transcript（不丢失）
3. 用占位符替换原内容（节省 tokens）
4. 通过 `context` hook 自动执行

## 现有系统分析

### context hook 现状

- **位置**：`.pi/extensions/context/index.ts`
- **当前状态**：TODO stub，未实现
- **返回类型**：`ContextEventResult { messages?: AgentMessage[] }`

### context hook 接口

```typescript
// types.d.ts:391-394
interface ContextEvent {
  type: "context";
  messages: AgentMessage[];
}

// types.d.ts:632-634
interface ContextEventResult {
  messages?: AgentMessage[];
}
```

### Extension 注册方式

```typescript
// .pi/extensions/context/index.ts
api.on("context", async (event, ctx) => {
  // event.messages 是 deep copy，可安全修改
  // 返回 { messages: modifiedMessages } 替换原消息
  // 返回 {} 则保持原样
});
```

## 实际类型结构（验证）

### ToolResultMessage 结构

```typescript
// pi-ai/dist/types.d.ts:134-142
interface ToolResultMessage<TDetails = any> {
  role: "toolResult";  // 重要：不是 "user"，是独立的 "toolResult"
  toolCallId: string;
  toolName: string;
  content: (TextContent | ImageContent)[];  // 重要：是数组，不是 string
  details?: TDetails;
  isError: boolean;
  timestamp: number;
}

// TextContent 结构
interface TextContent {
  type: "text";
  text: string;
}
```

### AgentMessage 类型

```typescript
// types.d.ts:214
export type AgentMessage = Message | CustomAgentMessages[keyof CustomAgentMessages];
export type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

## 实现设计

### 文件结构

```
server/
├── services/compact/
│   ├── types.ts              # 共享类型（复用 Context Collapse 的）
│   ├── microCompact.ts       # Micro Compact 核心逻辑
│   ├── contextCollapse.ts    # Context Collapse（未来）
│   └── autoCompact.ts        # AutoCompact（未来）
└── query.ts                  # 集成层

.pi/extensions/
└── context/
    └── index.ts              # 扩展钩子实现
```

### Micro Compact 配置

```typescript
interface MicroCompactConfig {
  keepRecent: number;        // 保留最近 N 个 tool result（默认 8）
  maxAge: number;           // 超过多少轮视为"旧"（默认 15）
  truncateThreshold: number; // 内容长度阈值，超过才 truncate（默认 300）
  enabled: boolean;          // 是否启用
}

export const DEFAULT_MICRO_COMPACT_CONFIG: MicroCompactConfig = {
  keepRecent: 8,
  maxAge: 15,
  truncateThreshold: 300,
  enabled: true,
};
```

### 核心算法

```
1. 扫描 messages 中所有 role === "toolResult" 的消息
2. 按 age（消息索引）排序，age 越大越旧
3. 过滤：跳过已包含 [MicroCompact] 占位符的（防止重复处理）
4. 保留最近 keepRecent 个
5. 其余超过 truncateThreshold 的 truncate 成占位符
6. 完整内容通过 appendEntry 持久化到 transcript
```

### 占位符格式

```typescript
`[MicroCompact] Previous ${toolName} result (cleared to save tokens, original length: ${originalLength})`
```

### 持久化策略

使用 `appendEntry` 将完整内容写入 transcript（不进入 LLM context）：

```typescript
ctx.appendEntry("micro_compact", {
  originalContent: content,  // 完整内容
  toolName: toolName,
  truncatedAt: Date.now(),
  originalMessageIndex: messageIndex,
});
```

## 实现代码

### Step 1: 创建 types.ts（共享类型）

```typescript
// server/services/compact/types.ts

export interface MicroCompactConfig {
  keepRecent: number;
  maxAge: number;
  truncateThreshold: number;
  enabled: boolean;
}

export const DEFAULT_MICRO_COMPACT_CONFIG: MicroCompactConfig = {
  keepRecent: 8,
  maxAge: 15,
  truncateThreshold: 300,
  enabled: true,
};
```

### Step 2: 创建 microCompact.ts（核心逻辑）

```typescript
// server/services/compact/microCompact.ts

import type { AgentMessage, ToolResultMessage } from "@mariozechner/pi-agent-core";
import type { TextContent } from "@mariozechner/pi-ai";
import type { MicroCompactConfig } from "./types.js";

export function createMicroCompact(config: Partial<MicroCompactConfig> = {}) {
  const cfg = { ...DEFAULT_MICRO_COMPACT_CONFIG, ...config };

  const MICRO_COMPACT_PREFIX = "[MicroCompact]";

  /**
   * 从 content 数组中提取纯文本
   */
  function extractTextContent(content: (TextContent | ImageContent)[]): string {
    return content
      .filter((part): part is TextContent => part.type === "text")
      .map(part => part.text)
      .join("");
  }

  /**
   * 检查内容是否已被 MicroCompact 处理
   */
  function isAlreadyTruncated(content: (TextContent | ImageContent)[]): boolean {
    const text = extractTextContent(content);
    return text.includes(MICRO_COMPACT_PREFIX);
  }

  return {
    /**
     * 扫描并返回需要 truncate 的 tool results
     */
    findToolResultsToPrune(messages: AgentMessage[]): PruneTarget[] {
      const toolResults: PruneTarget[] = [];

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        // tool_result 是独立的 role，不是嵌套在 user 消息中
        if (msg.role === "toolResult") {
          const toolMsg = msg as ToolResultMessage;
          const content = extractTextContent(toolMsg.content);

          // 跳过已处理的
          if (isAlreadyTruncated(toolMsg.content)) {
            continue;
          }

          toolResults.push({
            messageIndex: i,
            toolMessage: toolMsg,
            age: messages.length - i,
            contentLength: content.length,
          });
        }
      }

      // 按 age 排序，保留最近的
      toolResults.sort((a, b) => b.age - a.age);
      return toolResults.slice(cfg.keepRecent);
    },

    /**
     * 执行 truncate（返回修改后的 messages copy）
     * 使用 immutable 更新，避免深拷贝
     */
    truncateToolResults(
      messages: AgentMessage[],
      toPrune: PruneTarget[]
    ): AgentMessage[] {
      // 记录需要修改的 index
      const truncateMap = new Map<number, string>();
      for (const target of toPrune) {
        if (target.contentLength <= cfg.truncateThreshold) continue;

        const toolMsg = target.toolMessage;
        const placeholder = `[MicroCompact] Previous ${toolMsg.toolName} result (cleared to save tokens, original length: ${target.contentLength})`;

        // 将原 content 数组替换为只包含占位符文本的数组
        truncateMap.set(target.messageIndex, placeholder);
      }

      // 如果没有需要修改的，直接返回原数组
      if (truncateMap.size === 0) {
        return messages;
      }

      // 构建新数组（immutable 方式）
      return messages.map((msg, i) => {
        const placeholder = truncateMap.get(i);
        if (placeholder === undefined) {
          return msg;
        }

        // 创建新的 ToolResultMessage with placeholder
        return {
          ...msg,
          content: [{ type: "text", text: placeholder }] as (TextContent | ImageContent)[],
        } as ToolResultMessage;
      });
    },

    getConfig() {
      return { ...cfg };
    },
  };
}

interface PruneTarget {
  messageIndex: number;
  toolMessage: ToolResultMessage;
  age: number;
  contentLength: number;
}
```

### Step 3: 修改扩展钩子实现

```typescript
// .pi/extensions/context/index.ts

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts";
import type { TextContent, ImageContent } from "@mariozechner/pi-ai";
import { createMicroCompact } from "../../../server/services/compact/microCompact.js";

const microCompact = createMicroCompact();

export default function (api: ExtensionAPI) {
  api.on("context", async (event, ctx) => {
    // 1. 检查是否启用
    const config = microCompact.getConfig();
    if (!config.enabled) return {};

    // 2. 找到需要 prune 的 tool results
    const toPrune = microCompact.findToolResultsToPrune(event.messages);
    if (toPrune.length === 0) return {};

    // 3. 持久化完整内容到 transcript
    for (const target of toPrune) {
      const content = target.toolMessage.content
        .filter((part): part is TextContent => part.type === "text")
        .map(part => part.text)
        .join("");

      ctx.appendEntry("micro_compact", {
        originalContent: content,
        toolName: target.toolMessage.toolName,
        truncatedAt: Date.now(),
        messageIndex: target.messageIndex,
      });
    }

    // 4. 执行 truncate（immutable 方式）
    const modifiedMessages = microCompact.truncateToolResults(event.messages, toPrune);

    // 5. 通知用户（可选）
    if (ctx.ui) {
      ctx.ui.notify(`Micro Compact: pruned ${toPrune.length} old tool results`, "info");
    }

    return { messages: modifiedMessages };
  });
}
```

## 事前验尸 - 发现的问题及解决方案

| 问题 | 原设计风险 | 解决方案 |
|------|----------|----------|
| **tool_result 结构错误** | 原文档假设 tool_result 在 `user` role 消息的 content 数组中 | 修正：`ToolResultMessage` 是独立的 `role: "toolResult"` 消息 |
| **content 类型错误** | 原文档假设 content 是 string | 修正：content 是 `(TextContent \| ImageContent)[]`，需要提取 text |
| **重复 truncate** | 同一消息多次触发会重复处理 | 增加检查：`isAlreadyTruncated()` 过滤已处理的 |
| **深拷贝性能** | `JSON.parse(JSON.stringify)` 开销大 | 改用 immutable map 方式：先记录要修改的 index，再 map 构建新数组 |
| **UI notify 可能不存在** | `ctx.ui` 在某些模式下为 undefined | 加 `if (ctx.ui)` 检查 |
| **配置来源** | 文档说从 settings.json 读取但未实现 | 保持简单：配置通过 createMicroCompact() 参数传入 |
| **执行顺序** | 与 Context Collapse 等其他层顺序不清 | 明确：Micro Compact 在 context hook 中执行，是第一道关卡 |

## 边界测试用例

```typescript
// 测试用例应覆盖：
const testCases = [
  // 1. 空 messages
  { messages: [], expected: "直接返回空数组" },
  // 2. 无 toolResult
  { messages: [userMsg, assistantMsg], expected: "返回原数组" },
  // 3. 少于 keepRecent
  { messages: [toolResult(100)], expected: "不 truncate" },
  // 4. 超过阈值
  { messages: [toolResult(500)], expected: "truncate" },
  // 5. 已被 truncate 的内容
  { messages: [truncatedToolResult(500)], expected: "跳过，不重复处理" },
  // 6. 混合：新的 + 旧的
  { messages: [toolResult(100), toolResult(500), toolResult(500)], expected: "只 truncate 旧的" },
];
```

## 验证计划

1. **编译验证**：`bun run build` + `bunx tsc --noEmit` 无错误
2. **功能验证**：
   - 创建长会话，触发 Micro Compact
   - 验证 tool results 被正确 truncate
   - 验证完整内容持久化到 transcript
   - 验证返回的 messages 包含占位符
3. **边界验证**：
   - 内容小于阈值时不 truncate
   - 不超过 keepRecent 时不 truncate
   - 连续多次触发不重复 truncate
   - 无 UI 模式下不报错

## 实现顺序

1. `server/services/compact/types.ts` - 共享类型
2. `server/services/compact/microCompact.ts` - 核心逻辑
3. `.pi/extensions/context/index.ts` - 扩展钩子
4. `server/query.ts` - 集成层（未来与 Context Collapse 共享）

## 参考

- Claude Code Micro Compact 设计（用户提供的文档）
- `types.d.ts:391-394` - ContextEvent 接口
- `types.d.ts:632-634` - ContextEventResult 接口
- `pi-ai/dist/types.d.ts:134-142` - ToolResultMessage 实际结构
