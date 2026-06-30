# Markdown 渲染问题修复计划

## 问题描述

Markdown 特殊符号（`**`、`` ` ``、`##` 等）显示为原始文本而非渲染后的格式。

## 根因分析

**已确认根因**：`response_end` 先于 `turn_end` 到达，导致内容替换被跳过。

### 事件顺序问题

```
正常顺序:
  text_delta (多次) → message_end → turn_end → response_end

问题顺序 (大多数回合):
  text_delta (多次) → message_end → response_end → turn_end
                                    ↑
                              这里 ref 被清空!
```

### 代码分析

```typescript
// frontend/chat.tsx

// response_end - 先到达，清除 ref
case "response_end":
  streamingMessageIdRef.current = null;  // ← ref 被清除
  setMessages((prev) => prev.map(msg => ({ ...msg, isStreaming: false })));
  break;

// turn_end - 后到达，但 ref 已为 null，替换被跳过
case "turn_end":
  if (data.content && streamingMessageIdRef.current) {  // ← 条件不满足
    // 替换逻辑
  } else if (!streamingMessageIdRef.current) {
    console.log('[DEBUG-turn_end] SKIPPED - no streaming ref');
  }
  break;
```

### 日志证据

```
[DEBUG-resp_end] ref cleared, isStreaming set false  ← response_end FIRST
[DEBUG-turn_end] content_len: 211 ref_exists: false isStreaming_msgs: 0  ← turn_end SKIPPED
[DEBUG-turn_end] SKIPPED - no streaming ref, content_len: 211
```

## 事前验尸 (Pre-Mortem)

### 修复方案：turn_end 不依赖 ref

**方案 A**：不依赖 `streamingMessageIdRef.current`，直接查找最后一条 assistant 消息

```typescript
case "turn_end":
  if (data.content) {
    setMessages((prev) => {
      // 找到最后一条 isStreaming=true 的 assistant 消息
      const idx = prev.findLastIndex(m => m.role === "assistant" && m.isStreaming);
      if (idx !== -1) {
        return prev.map((msg, i) =>
          i === idx ? { ...msg, content: data.content, isStreaming: false } : msg
        );
      }
      return prev;
    });
  }
  break;
```

**方案 B**：保留 ref 正常职责，response_end 不清除 ref

```typescript
case "response_end":
  // 不再清除 streamingMessageIdRef
  setMessages((prev) => prev.map(msg => ({ ...msg, isStreaming: false })));
  // streamingMessageIdRef 保持不变，让 turn_end 完成替换
  break;
```

### 风险评估

| 方案 | 风险 | 理由 |
|------|------|------|
| 方案 A | 低 | 直接查找，不依赖时序 |
| 方案 B | 中 | response_end 后 turn_end 之前可能有空档期 |

### 潜在副作用

1. **方案 A**：如果同时有多个 assistant 消息在流式，会替换错误的消息 → 可通过 `findLastIndex` 缓解
2. **方案 B**：如果 `turn_end` 永远不来（服务器崩溃），ref 会泄漏 → 可接受（毕竟是异常情况）

## 实施步骤

### Step 1: 修复 turn_end 逻辑（方案 A）

修改 `frontend/chat.tsx` 中的 `turn_end` 处理：

```typescript
case "turn_end":
  if (data.content) {
    setMessages((prev) => {
      const idx = prev.findLastIndex(m => m.role === "assistant" && m.isStreaming);
      if (idx !== -1) {
        return prev.map((msg, i) =>
          i === idx ? { ...msg, content: data.content, isStreaming: false } : msg
        );
      }
      return prev;
    });
  }
  break;
```

### Step 2: 移除 response_end 中对 ref 的清除（保持 ref 仅用于识别当前流式消息）

实际上方案 A 不需要修改 response_end，因为 turn_end 不再依赖 ref。

### Step 3: 验证

1. 启动服务器 `bun run server/index.ts`
2. 打开前端 `http://localhost:3333`
3. 发送消息，观察日志
4. 确认 `**bold**` 等格式正确渲染

### Step 4: 清理调试日志

修复完成后，移除所有 `[DEBUG-...]` 日志：

```bash
grep -r "\[DEBUG-" frontend/
```

## 回归风险

- 无：turn_end 替换逻辑的修改不影响正常流程
- 如果没有流式消息（idx = -1），prev 直接返回，不产生任何变化
