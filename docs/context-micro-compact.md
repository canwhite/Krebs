# Micro Compact 实现计划

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
  keepRecent: number;      // 保留最近 N 个 tool result（默认 8）
  maxAge: number;           // 超过多少轮视为"旧"（默认 15）
  truncateThreshold: number; // 内容长度阈值，超过才 truncate（默认 300）
  enabled: boolean;         // 是否启用
}

// 从 settings.json 读取
const DEFAULT_MICRO_COMPACT_CONFIG: MicroCompactConfig = {
  keepRecent: 8,
  maxAge: 15,
  truncateThreshold: 300,
  enabled: true,
};
```

### 核心算法

```
1. 扫描 messages 中所有 tool_result 类型的 content block
2. 按 age（消息索引）排序，age 越大越旧
3. 保留最近 keepRecent 个
4. 其余超过 truncateThreshold 的 truncate 成占位符
5. 完整内容通过 appendCustomEntry 持久化到 transcript
```

### 占位符格式

```typescript
`[MicroCompact] Previous ${toolName} result (cleared to save tokens, original length: ${originalLength})`
```

### 持久化策略

使用 `appendCustomEntry` 将完整内容写入 transcript（不进入 LLM context）：

```typescript
ctx.appendEntry("micro_compact", {
  originalContent: content,  // 完整内容
  toolName: toolName,
  truncatedAt: Date.now(),
  originalMessageIndex: messageIndex,
});
```

## 实现步骤

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

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { MicroCompactConfig } from "./types.js";

export function createMicroCompact(config: Partial<MicroCompactConfig> = {}) {
  const cfg = { ...DEFAULT_MICRO_COMPACT_CONFIG, ...config };

  return {
    /**
     * 扫描并返回需要 truncate 的 tool results
     */
    findToolResultsToPrune(messages: AgentMessage[]): PruneTarget[] {
      const toolResults: PruneTarget[] = [];

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (msg.role === "user" && Array.isArray(msg.content)) {
          for (let j = 0; j < msg.content.length; j++) {
            const part = msg.content[j];
            if (part.type === "tool_result") {
              const content = typeof part.content === "string"
                ? part.content
                : JSON.stringify(part.content);
              toolResults.push({
                messageIndex: i,
                partIndex: j,
                part,
                age: messages.length - i,
                contentLength: content.length,
              });
            }
          }
        }
      }

      // 按 age 排序，保留最近的
      toolResults.sort((a, b) => b.age - a.age);
      return toolResults.slice(cfg.keepRecent);
    },

    /**
     * 执行 truncate（返回修改后的 messages copy）
     */
    truncateToolResults(
      messages: AgentMessage[],
      toPrune: PruneTarget[]
    ): AgentMessage[] {
      const modified = JSON.parse(JSON.stringify(messages));

      for (const target of toPrune) {
        if (target.contentLength <= cfg.truncateThreshold) continue;

        const part = modified[target.messageIndex].content[target.partIndex];
        const toolName = part.name || "unknown";
        part.content = `[MicroCompact] Previous ${toolName} result (cleared to save tokens, original length: ${target.contentLength})`;
      }

      return modified;
    },

    getConfig() {
      return { ...cfg };
    },
  };
}

interface PruneTarget {
  messageIndex: number;
  partIndex: number;
  part: any;
  age: number;
  contentLength: number;
}
```

### Step 3: 修改扩展钩子实现

```typescript
// .pi/extensions/context/index.ts

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts";
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
      const content = typeof target.part.content === "string"
        ? target.part.content
        : JSON.stringify(target.part.content);
      ctx.appendEntry("micro_compact", {
        originalContent: content,
        toolName: target.part.name || "unknown",
        truncatedAt: Date.now(),
        messageIndex: target.messageIndex,
      });
    }

    // 4. 执行 truncate
    const modifiedMessages = microCompact.truncateToolResults(event.messages, toPrune);

    // 5. 通知用户（可选）
    ctx.ui?.notify?.(`Micro Compact: pruned ${toPrune.length} old tool results`, { type: "info" });

    return { messages: modifiedMessages };
  });
}
```

## 潜在问题

| 问题 | 风险 | 解决方案 |
|------|------|----------|
| **tool_result 结构** | 不确定是 `tool_result` 还是 `toolResult` | 先用 `part.type` 检查 |
| **内容类型** | content 可能是 string 或 array | 用 `typeof` 判断 |
| **多次 truncate** | 同一 message 多次触发 | 检查是否已被 truncate |
| **性能** | 每次 turn 都扫描 | 仅在超过阈值时才处理 |
| **缓存失效** | truncate 可能影响 prompt cache | 不碰 cache 区（头部消息） |

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

## 实现顺序

1. `server/services/compact/types.ts` - 共享类型
2. `server/services/compact/microCompact.ts` - 核心逻辑
3. `.pi/extensions/context/index.ts` - 扩展钩子
4. `server/query.ts` - 集成层（未来与 Context Collapse 共享）

## 参考

- Claude Code Micro Compact 设计（用户提供的文档）
- `types.d.ts:391-394` - ContextEvent 接口
- `types.d.ts:632-634` - ContextEventResult 接口
