# Markdown 渲染不完整问题分析

## 问题描述

Markdown 渲染时有不完整的残留符号，如 `**`、`##`、` ``` `、`<think>` 等 markdown 语法本身没有被正确渲染，显示为原始文本。

## 渲染流水线

```
Agent 生成文本（含 think 标签）
    ↓
event-subscription.ts: parseThinkTagsFromDelta() 剥离 think 标签
    ↓
text_delta → 前端（不含 think 标签）
    ↓
前端: msg.content 累积 streaming delta
    ↓
StreamingMarkdown 组件:
    preprocessMarkdown() 修复 3 种格式问题（##标题、-列表、1.列表）
    ↓
unified pipeline: remark-parse → remark-gfm → remark-rehype → rehype-highlight → rehype-react
    ↓
React 渲染
    ↓
turn_end: extractFromTurnEvent() 提取完整内容 → msg.content 替换
    ↓
StreamingMarkdown 重新渲染
```

## 关键文件

| 文件 | 作用 |
|------|------|
| `server/event-subscription.ts` | 剥离 think 标签，发送 text_delta |
| `server/think-parser.ts` | 流式解析 `<think>``</think>` 标签 |
| `server/lib/session-transcript.ts` | turn_end 提取完整内容 |
| `frontend/chat.tsx` | StreamingMarkdown 组件 + preprocessMarkdown() |
| `frontend/chat.html` | CSS 样式 |

## 潜在问题点

### 1. Think Parser 边界情况（最可疑）

`think-parser.ts` 查找 `<think` 后跟 `>` 的标签。但可能存在以下边界情况：

- **跨 delta 的标签**：`<think` 在 delta A，`>` 在 delta B
- **不完整的开始标签**：`<think` 后面没有 `>`，会保留到下次处理
- **think 标签未关闭**：LLM 输出了 `<think>...` 但没有 `</think>`，所有后续内容都被当作 think

如果 think 标签没有正确闭合，标签内容会被当作普通文本发送，**带着 `<think>` 符号显示在前端**。

### 2. preprocessMarkdown 覆盖不足

目前只处理 3 种格式问题：

```typescript
.replace(/^(#{1,6})([^\s#])/gm, '$1 $2')   // ##标题 → ## 标题
.replace(/^([*\-])([^\s])/gm, '$1 $2')     // -项目 → - 项目
.replace(/^(\d+\.)([^\s])/gm, '$1 $2')     // 1.项目 → 1. 项目
```

**未处理的常见问题**：
- 代码块：单 ```` ``` ```` 没有闭合
- 行内代码：`` ` `` 没有配对
- 链接：`[text](` 没有闭合
- 粗体/斜体：`**text` 或 `**text*` 没有配对
- 转义字符：`*` 被当作 markdown 但实际应该是普通字符

### 3. Unified Pipeline 解析错误处理

```typescript
try {
  const result = markdownProcessor.processSync({ value: processedContent }).result;
  astCache.set(processedContent, result);
  return result;
} catch (e) {
  console.error('Markdown parse error:', e);
  return <span className="error">{content}</span>;  // 显示原始内容
}
```

当 unified 解析失败时，显示原始内容——**残留的 markdown 符号就会直接可见**。

### 4. 加载历史 session 时 think 内容丢失

`extractFromTurnEvent` 和 `extractFromMessages` 都过滤 `type === 'thinking'` 的内容。如果 session 存储了 think 内容但没有正确重建，**`<think>` 和 `</think>` 标签会直接显示**。

## 验证方案

### Step 1: 观察具体残留模式

请用户截图或提供具体例子，观察：
- 残留的是哪些符号？（`**`、#>、` ``` `、`<think>`）
- 出现在什么位置？（标题前、列表前、代码块、思考标签）

### Step 2: 检查 think-parser 的边界情况

在 `think-parser.ts` 中添加临时日志，观察：
- 是否有 `<think` 没有配对 `>` 的情况
- 是否有 think 标签未关闭导致后续内容被当作 think

### Step 3: 扩大 preprocessMarkdown 的覆盖范围

增加更多格式修复正则，覆盖常见的 markdown 问题。

### Step 4: 改进 unified 解析错误处理

区分"轻微错误"（某些块级元素不完整）和"严重错误"（几乎无法解析），对前者尝试部分渲染。

## 事前验尸：潜在失效模式

### 问题场景分类

**A. 实时对话时出现** — 问题在流式渲染流水线
**B. 加载历史 session 时出现** — 问题在内容重建逻辑
**C. 两者都出现** — 多重问题

#### 1. think-parser 状态机边界问题（P0）

```typescript
// 问题代码（think-parser.ts 第 57-62 行）
} else {
  result.thinkDelta = remaining;
  this.state.currentThinkContent += remaining;
  this.state.pendingContent = "";  // ← 立即返回，但 pendingContent 清空了
  return result;
}
```

当在 think 标签内且找不到结束标签时：
- 立即返回 `thinkDelta`
- 下个 delta 到来时，`isInThinkTag` 仍为 `true`
- 但 `pendingContent` 已被清空

**更严重的问题**：当在标签外遇到不完整的 `<think`（没有 `>`）时：

```typescript
const startTagIndex = remaining.indexOf("<think");
if (startTagIndex !== -1) {
  result.textDelta += remaining.substring(0, startTagIndex);
  const tagEndIndex = remaining.indexOf(">", startTagIndex);
  if (tagEndIndex !== -1) {
    // 正常处理
  } else {
    // 不完整的开始标签，保留到下次
    this.state.pendingContent = remaining.substring(0, startTagIndex);
    return result;  // ← 此时 textDelta 可能为空！
  }
}
```

**如果这是根因**：当 LLM 生成跨越多个 delta 的 `<think>` 标签时，如果 `>` 在下一个 delta 才到达，前一个 delta 可能返回空的 `textDelta`。但这本身是正确的——真正的问题可能在别处。

#### 2. 快速 delta 淹没 unified pipeline（P0）

```
高频 text_delta（每秒几十个）
    ↓
前端：msg.content 快速累积
    ↓
每次 setMessages 都触发 StreamingMarkdown 重渲染
    ↓
unified pipeline 处理未完成的 markdown
    ↓
AST 缓存住不完整的内容
```

**关键问题**：如果 markdown 语法元素（如代码块、链接、粗体）**跨越多个 delta 到达**，unified pipeline 可能在收到不完整的语法时就开始解析：

- Delta A: "`````\n code"  → 收到不完整的代码块开始
- Delta B: "more code\n`````" → 代码块完成
- 但 unified 可能缓存了 Delta A 的中间状态

**验证方法**：观察残留符号是否主要集中在跨越 delta 边界的语法元素上。

#### 3. turn_end 内容替换失败（P0）

```typescript
// 前端 chat.tsx 第 237-248 行
case "turn_end":
  if (data.content && streamingMessageIdRef.current) {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === streamingMessageIdRef.current
          ? { ...msg, content: data.content, isStreaming: false }
          : msg,
      ),
    );
  }
  break;
```

**潜在问题**：如果 `streamingMessageIdRef.current` 在 `turn_end` 到达前被重置（如 stop 操作、session 切换），`turn_end` 的完整内容不会更新到消息上。残留的增量内容（可能不完整）继续显示。

**Race condition**：
1. text_delta 持续到达，msg.content 累积
2. 用户点击 stop → `streamingMessageIdRef.current = null`
3. turn_end 到达 → 条件不满足，不替换
4. 最终显示的是停止时的增量内容（可能不完整）

#### 4. 累积内容与 delta 总和不一致（P0）

服务端：
```typescript
textDeltas.push(rawDelta);  // 累积所有 delta
```

`extractFromTurnEvent` 从 `event.message.content` 提取完整内容，这是模型最终输出的 message object。

但 `text_delta` 是经过 think-parser 过滤的。如果：
- think-parser 在某个 delta 中丢失了部分内容
- 或者 event.message.content 与 delta 总和不完全一致

会导致 `turn_end` 发送的 `completeContent` 与前端累积的 `msg.content` 不同。

**前端处理**：用 `completeContent` 替换 `msg.content`。如果两者不同，前端显示 `completeContent`。

但如果替换失败（streamingMessageIdRef.current 为 null），前端继续显示增量累积内容——可能不完整。

#### 5. preprocessMarkdown 覆盖不足（P1）

当前只处理 3 种格式。LLM 可能生成更多变体：

- `**粗体**` 缺少闭合
- `[链接](` 缺少 URL 和 `)`
- `[链接](url` 缺少 `)`
- ``` `行内代码` ` ``` 中间有空格
- `> 引用` 多行不完整
- 表格语法不完整

#### 6. 缓存键冲突（低）

缓存 key = `processedContent`。流式累积时每次 content 不同，不会冲突。

#### 新发现1: isProcessingMessageEnd 逻辑完全失效

```typescript
// event-subscription.ts 第 196-207 行
} else if (event.type === "message_end") {
  if (isProcessingMessageEnd) {
    logger.log("[SESSION] message_end 已在处理中，跳过重复事件");
    return;
  }
  isProcessingMessageEnd = true;   // ← 设置为 true
  logger.log("[SESSION] message_end 收到，等待 turn_end");
  isProcessingMessageEnd = false;  // ← 立即设回 false！完全没有保护作用
}
```

**这是 bug**：如果 `message_end` 事件并发到达（服务器同时发送多个 `message_end`），第二个会设置 `isProcessingMessageEnd = true` 后立即又设回 false，第三个 `message_end` 仍然会通过检查并继续处理。

#### 新发现2: extractFromTurnEvent 内容类型过滤

```typescript
// session-transcript.ts 第 81-85 行
const textParts =
  message?.content
    ?.filter((c: any) => c.type === "text" || c.type === "thinking")
    .map((c: any) => (c.type === "thinking" ? c.thinking : c.text)) || [];
```

**风险**：如果 event.message.content 的实际类型值与预期不符（如 `"type": "output"`），过滤后返回空字符串。但这是低概率问题。

#### 新发现3: turn_end 触发时机不确定性

如果 Agent 执行中崩溃或被强制终止，`turn_end` 可能不发送。前端只有 `text_delta` 累积的不完整内容。

更严重：即使 `turn_end` 发送了，如果 `streamingMessageIdRef.current` 为 null（stop 操作后被重置），替换不执行。

#### 新发现4: 前端错误处理直接显示原始内容

```typescript
} catch (e) {
  console.error('Markdown parse error:', e);
  return <span className="error">{content}</span>;  // 原始内容 + markdown 符号全部显示
}
```

**如果 unified 解析失败**，所有 markdown 符号直接显示给用户。常见原因：
- 嵌套的代码块
- 不匹配的 MDX/JSX 语法
- 未闭合的 HTML 标签

### 再验尸 V3：新的边界问题

#### 新发现5: text_delta 与 turn_end 的竞态

```typescript
// 前端 text_delta 处理
case "text_delta":
  if (!streamingMessageIdRef.current) {
    const newId = crypto.randomUUID();
    streamingMessageIdRef.current = newId;
    setMessages((prev) => [...prev, { id: newId, role: "assistant", content: data.delta, isStreaming: true }]);
  } else {
    setMessages((prev) => prev.map(msg => msg.id === streamingMessageIdRef.current ? { ...msg, content: msg.content + data.delta } : msg));
  }
  break;
```

`setMessages` 是异步的。如果 React 状态还未更新时 `turn_end` 到达，`streamingMessageIdRef.current` 仍然指向旧 ID，此时替换仍然有效。

**但真正的问题是**：如果此时有多条 `text_delta` 正在队列中等待处理，`turn_end` 先到达并用 `completeContent` 替换了 `content`。之后这些排队的 delta 继续被处理：
- `msg.content + data.delta` → 新的增量内容被追加到刚替换完的 `completeContent` 后面
- 结果：内容被追加了两次（一次是 turn_end 的完整内容，一次是后续的 delta）

这会导致**重复内容 + 可能不完整的 markdown 拼接**。

#### 新发现6: extractFromTurnEvent 返回空字符串

```typescript
// session-transcript.ts
const textParts = message?.content?.filter((c: any) => c.type === "text" || c.type === "thinking")...
```

如果 `event.message.content` 的实际结构不是预期格式（`type` 字段不存在或值不对），过滤后 `textParts` 为空数组，返回空字符串。

`turn_end` 发送 `{ type: "turn_end", content: "" }`，前端 `data.content` 为空，`if (data.content && streamingMessageIdRef.current)` 条件不满足，**不执行替换**。前端继续显示累积的增量内容——可能不完整。

#### 新发现7: response_end 早于 turn_end 到达

```typescript
case "response_end":
  setMessages((prev) => prev.map((msg) => ({ ...msg, isStreaming: false })));
  streamingMessageIdRef.current = null;  // ← ref 被清
  currentThinkMessageRef.current = { id: null };
  break;
```

如果 `response_end` 先于 `turn_end` 到达：
1. `streamingMessageIdRef.current` 被设为 `null`
2. `turn_end` 到达时条件不满足，不替换
3. 前端继续显示 `isStreaming=false` 的旧内容（可能不完整）

#### 新发现8: think-parser 对大小写敏感

```typescript
const startTagIndex = remaining.indexOf("<think");
```

只匹配 `<think`（小写）。如果 LLM 输出 `<THINK>` 或 `<Think>`，不会被识别为 think 标签，`<think>` 会作为普通文本发送出去。

但这应该显示为 `<think>` 本身，不是其他 markdown 符号。

#### 新发现9: message_update vs message_end 事件顺序

```typescript
// event-subscription.ts
if (event.type === "message_update") {
  if (event.assistantMessageEvent.type === "text_delta") {
    // 发送 text_delta
  }
}
if (event.type === "turn_end") { ... }
if (event.type === "agent_end") { ... }
```

事件处理是线性的。如果 `message_update` 还在处理中时 `turn_end` 到达，`turn_end` 会被排队等待。但 JavaScript 单线程执行，事件是串行处理的。

#### 新发现10: extractFromMessages 的类型过滤

```typescript
const textParts = lastMessage.content
  .filter((c: any) => c.type === "text" || c.type === "thinking")
  .map((c: any) => (c.type === "thinking" ? c.thinking : c.text)) || [];
```

**关键问题**：如果 session 文件中存储的消息结构与预期不符（如 `type` 字段是 `"output"` 而非 `"text"`，或者 `thinking` 内容存在但类型是 `"content"`），过滤后 `textParts` 为空。

这会导致从 session 文件读取历史时，内容为空或 markdown 标签直接暴露。

### 第三次验尸总结

**最可能的根因组合**：

1. **P0**: `response_end` 先于 `turn_end` 到达，导致 `streamingMessageIdRef` 被清空，`turn_end` 替换条件不满足
2. **P0**: `turn_end` 的 `extractFromTurnEvent` 返回空字符串（类型过滤失效），导致不替换
3. **P0**: 快速 delta 期间 markdown 语法元素跨越 delta 边界，unified 解析失败

**最容易验证的修复**：
1. 在 `turn_end` 中不依赖 ref，而是直接找到 assistant 消息并替换
2. 在 `StreamingMarkdown` 的 catch 中暴露完整错误信息
3. 预处理阶段不依赖 unified，而是先用启发式方法修复明显格式问题

### 风险优先级矩阵（最终版）

| 风险 | 可能性 | 严重性 | 优先级 |
|------|--------|--------|--------|
| response_end 先于 turn_end 到达，ref 被清空导致替换不执行 | **高** | **高** | **P0** |
| extractFromTurnEvent 返回空字符串（类型过滤失效）导致不替换 | **高** | **高** | **P0** |
| 快速 delta 导致 markdown 语法元素跨越边界，unified 解析失败 | 高 | 高 | P0 |
| turn_end 到达后排队的 delta 继续追加到已替换内容 | 中 | **高** | **P0** |
| unified 解析失败直接显示原始内容 | 中 | **高** | **P0** |
| isProcessingMessageEnd 逻辑失效（并发 message_end 未保护） | 中 | 高 | P1 |
| LLM 生成跨越 delta 边界的残缺 markdown | 中 | 高 | P1 |
| think-parser 对 `<THINK>`（大写）不敏感，think 标签泄漏 | 低 | 中 | P1 |
| preprocessMarkdown 覆盖不足 | 中 | 中 | P1 |
| 历史 session 加载时 extractFromMessages 类型过滤失效 | 低 | 高 | P1 |

### 诊断方案

#### 诊断 A: 观察 delta 频率和渲染时机

在前端添加临时日志：
```typescript
// chat.tsx text_delta 处理
console.log(`[DELTA] len=${data.delta.length}, time=${Date.now()}`);
```

观察：
- 残留符号出现时，相邻 delta 的时间间隔
- 是否存在大量 delta 集中在短时间内

#### 诊断 B: 检查 unified 解析错误

```typescript
// StreamingMarkdown catch 中暴露错误
catch (e) {
  console.error('[Markdown Error]', { content: content.substring(0, 100), error: e.message });
  return <span className="error">{content}</span>;
}
```

#### 诊断 C: 检查 think-parser 边界日志

```typescript
// think-parser.ts parse 中
if (this.state.isInThinkTag && !remaining.includes("</think>")) {
  console.log('[ThinkParser] Incomplete think tag, pending cleared:', remaining.substring(0, 50));
}
```

### 建议：先修复高优先级问题

1. **turn_end 替换保护**：在 `turn_end` 处理中增加更健壮的内容替换逻辑，不依赖 `streamingMessageIdRef.current`
2. **preprocessMarkdown 扩展**：增加更多 markdown 格式修复
3. **unified 错误日志**：暴露解析错误详情供诊断

## 实施计划

### Phase 1: 诊断（只读工具）

1. **添加 delta 频率日志**：在 `text_delta` 处理时记录时间戳和长度
2. **暴露 unified 解析错误**：catch 块中输出 content 前100字符和错误信息
3. **观察 think-parser 边界**：记录不完整标签情况

### Phase 2: 高优先级修复

1. **turn_end 内容替换重构**：不再依赖 `streamingMessageIdRef.current`，而是遍历 messages 找到对应的 assistant 消息并替换
2. **preprocessMarkdown 扩展**：增加粗体、链接、代码块等格式修复
3. **stop 操作保护**：确保 stop 时保留完整内容

### Phase 3: 验证

1. 重现问题场景（快速发送消息、stop 操作）
2. 观察残留符号是否消失
3. 回归测试：正常 markdown 渲染不受影响
