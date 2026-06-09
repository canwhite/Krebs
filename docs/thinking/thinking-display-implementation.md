# 思考过程（Thinking）流式显示实现文档

## 背景介绍

在 Claude 的流式响应中，模型会产生 `<think>...</think>` 标签包裹的"思考过程"。这些内容是模型的内部推理过程，不应该直接作为普通文本显示给用户，而是应该以特殊的视觉样式（如可折叠的灰色区域）单独展示。

### 问题定义

**原始问题**：
- `<think>` 标签内容和普通文本混在一起，都作为普通文本显示
- 用户看到的流式输出包含 `&lt;think&gt;` 这样的标签，体验很差

**目标效果**：
1. 思考过程显示在独立的、可折叠的灰色区域
2. 思考过程支持流式显示（边思考边显示，而不是等全部思考完才显示）
3. 思考过程默认展开
4. 普通文本正常流式显示，不受影响

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Claude API 响应                          │
│                    (包含 <think> 标签的文本流)                    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      服务器端 (server.ts)                         │
│                                                                       │
│  1. 接收原始 text_delta 事件                                         │
│  2. 解析 <think> 标签，分离思考内容和普通内容                         │
│  3. 发送两种不同的事件：                                             │
│     - think_block: 思考内容（增量）                                  │
│     - text_delta: 普通文本（增量）                                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     前端 (frontend/chat.tsx)                      │
│                                                                       │
│  1. 接收 WebSocket 消息                                             │
│  2. 根据 type 区分事件类型：                                         │
│     - think_block: 创建/更新思考消息                                │
│     - text_delta: 创建/更新 AI 回复消息                             │
│  3. 渲染不同类型的消息                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 服务器端实现详解

### 核心思路

**状态机解析**：为每个 WebSocket 连接维护一个解析状态，追踪是否处于 `<think>` 标签内部。

### 代码实现

#### 1. 定义类型和状态

```typescript
// 解析结果类型
interface ParsedDelta {
  textDelta: string;      // 普通文本内容
  thinkDelta?: string;    // 思考内容（如果有）
}

// 解析器状态
interface ThinkParserState {
  isInThinkTag: boolean;      // 是否在 <think> 标签内
  pendingContent: string;     // 待处理的缓存内容
  currentThinkContent: string; // 当前 think 块的累积内容
}

// 为每个 WebSocket 连接维护独立的解析状态
const thinkParserStates = new Map<WebSocket, ThinkParserState>();
```

#### 2. 解析函数

**关键逻辑**：

```typescript
function parseThinkTagsFromDelta(
  delta: string,
  ws: WebSocket,
): ParsedDelta {
  // 1. 获取该连接的解析状态（如果不存在则初始化）
  let state = thinkParserStates.get(ws);
  if (!state) {
    state = {
      isInThinkTag: false,
      pendingContent: "",
      currentThinkContent: ""
    };
    thinkParserStates.set(ws, state);
  }

  // 2. 将新的增量添加到缓存
  state.pendingContent += delta;

  const result: ParsedDelta = { textDelta: "" };
  let remaining = state.pendingContent;

  // 3. 状态机处理
  while (remaining.length > 0) {
    if (state.isInThinkTag) {
      // ─────────────────────────────────────────────────────────
      // 状态 A: 在 <think> 标签内部
      // ─────────────────────────────────────────────────────────

      // 查找结束标签 </think>
      const endTagIndex = remaining.indexOf("</think>");

      if (endTagIndex !== -1) {
        // 找到结束标签：发送最后一段增量，退出标签状态
        const thinkContent = remaining.substring(0, endTagIndex);
        result.thinkDelta = thinkContent; // 只发送增量

        remaining = remaining.substring(endTagIndex + "</think>".length);
        state.isInThinkTag = false;
        state.currentThinkContent = "";
      } else {
        // 没找到结束标签：发送所有内容作为增量（流式显示）
        result.thinkDelta = remaining;
        state.currentThinkContent += remaining;
        state.pendingContent = "";
        return result;
      }
    } else {
      // ─────────────────────────────────────────────────────────
      // 状态 B: 在 <think> 标签外部
      // ─────────────────────────────────────────────────────────

      // 查找开始标签 <think
      const startTagIndex = remaining.indexOf("<think");

      if (startTagIndex !== -1) {
        // 找到开始标签：发送标签之前的普通文本
        result.textDelta += remaining.substring(0, startTagIndex);

        // 跳过整个 <think> 标签（包括可能的属性）
        const tagEndIndex = remaining.indexOf(">", startTagIndex);
        if (tagEndIndex !== -1) {
          remaining = remaining.substring(tagEndIndex + 1);
          state.isInThinkTag = true; // 进入标签状态
        }
      } else {
        // 没找到标签：所有内容都是普通文本
        result.textDelta += remaining;
        remaining = "";
      }
    }
  }

  // 4. 更新缓存
  state.pendingContent = remaining;
  return result;
}
```

**状态图解**：

```
                    接收到新的 delta
                           │
                           ▼
                    ┌─────────────┐
                    │ 是否在标签内？ │
                    └──────┬──────┘
                      Yes  │  No
                         ┌┴┐
        ┌────────────────┘ └────────────────┐
        ▼                                    ▼
┌───────────────────┐           ┌───────────────────┐
│   在 <think> 内    │           │   在 <think> 外    │
├───────────────────┤           ├───────────────────┤
│ 查找 </think>     │           │ 查找 <think       │
│                   │           │                   │
│ 找到了？          │           │ 找到了？          │
│  Yes: 发送最后一段│           │  Yes: 发送之前的  │
│       退出标签状态│           │       普通文本    │
│                   │           │       进入标签状态│
│  No: 发送全部     │           │                   │
│      作为增量     │           │ No: 发送全部作为  │
│                   │           │     普通文本      │
└───────────────────┘           └───────────────────┘
```

#### 3. 集成到流式处理

在 `text_delta` 事件处理中调用解析函数：

```typescript
if (event.assistantMessageEvent.type === "text_delta") {
  const rawDelta = event.assistantMessageEvent.delta;

  // 解析 think 标签
  const { textDelta, thinkDelta } = parseThinkTagsFromDelta(rawDelta, ws);

  // 发送普通文本内容（过滤空内容）
  if (textDelta && textDelta.trim().length > 0) {
    ws.send(JSON.stringify({
      type: "text_delta",
      delta: textDelta,
    }));
  }

  // 发送思考内容（如果有）
  if (thinkDelta) {
    ws.send(JSON.stringify({
      type: "think_block",
      content: thinkDelta,
    }));
  }
}
```

#### 4. 清理资源

```typescript
// 在 WebSocket 关闭时清理状态
function cleanupThinkParserState(ws: WebSocket) {
  thinkParserStates.delete(ws);
}

// 在 ws.onclose 中调用
ws.onclose = () => {
  cleanupThinkParserState(ws);
};
```

---

## 前端实现详解

### 核心思路

**独立消息类型**：将思考过程作为一种特殊的消息类型（`role: "thinking"`），独立于普通 AI 回复。

### 代码实现

#### 1. 类型定义

```typescript
// 消息类型（添加 "thinking"）
type Message = {
  id: string;
  role: "user" | "assistant" | "tool" | "thinking";
  content: string;
  isStreaming?: boolean;
  // ... 其他字段
};

// WebSocket 消息类型（添加 "think_block"）
type WSMessage =
  | { type: "think_block"; content: string }
  | { type: "text_delta"; delta: string }
  | { type: "message_start" }
  | { type: "response_end" }
  // ... 其他类型
```

#### 2. 状态管理

```typescript
// 追踪当前流式消息的 ID
const streamingMessageIdRef = useRef<string | null>(null);

// 追踪当前思考消息的 ID
const currentThinkMessageRef = useRef<{ id: string | null }>({ id: null });
```

#### 3. 事件处理

**message_start：重置状态**

每个新的消息轮次（message/turn）开始时，重置所有流式状态：

```typescript
case "message_start":
  setIsResponding(true);
  streamingMessageIdRef.current = null;      // 重置文本流式消息引用
  currentThinkMessageRef.current = { id: null };  // 重置 think 消息引用
  break;
```

**think_block：处理思考内容**

```typescript
case "think_block":
  // 创建或更新 think 消息
  if (!currentThinkMessageRef.current.id) {
    // 第一次有内容时才创建消息（避免显示空的思考框）
    if (data.content) {
      const newId = crypto.randomUUID();
      currentThinkMessageRef.current = { id: newId };
      setMessages((prev) => [
        ...prev,
        {
          id: newId,
          role: "thinking",
          content: data.content,
          isStreaming: true,
        },
      ]);
    }
  } else {
    // 更新现有的 think 消息 - 累积内容
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === currentThinkMessageRef.current?.id
          ? { ...msg, content: msg.content + data.content }
          : msg,
      ),
    );
  }
  break;
```

**text_delta：处理普通文本**

```typescript
case "text_delta":
  if (!streamingMessageIdRef.current) {
    // 创建新流式消息（服务器端已确保有内容）
    const newId = crypto.randomUUID();
    streamingMessageIdRef.current = newId;
    setMessages((prev) => [
      ...prev,
      { id: newId, role: "assistant", content: data.delta, isStreaming: true },
    ]);
  } else {
    // 更新现有的流式消息
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === streamingMessageIdRef.current
          ? { ...msg, content: msg.content + data.delta }
          : msg,
      ),
    );
  }
  break;
```

**response_end：清理状态**

```typescript
case "response_end":
  setIsResponding(false);
  streamingMessageIdRef.current = null;
  currentThinkMessageRef.current = { id: null };
  setMessages((prev) =>
    prev.map((msg) => ({ ...msg, isStreaming: false })),
  );
  break;
```

#### 4. 渲染组件

```typescript
{messages.map((msg) =>
  msg.role === "thinking" ? (
    // 思考过程：独立的可折叠区域
    <div
      key={msg.id}
      class="mx-auto max-w-3xl rounded-lg bg-gray-100 p-4 my-2 border border-gray-200"
    >
      <details class="group" open={true}>
        <summary class="cursor-pointer font-semibold text-gray-700 flex items-center gap-2 hover:text-gray-900">
          <span>💭 思考过程</span>
          <span class="text-xs text-gray-500">（点击展开/折叠）</span>
        </summary>
        <div class="mt-3 text-sm text-gray-600 whitespace-pre-wrap bg-white p-3 rounded border border-gray-200">
          {msg.content}
        </div>
      </details>
    </div>
  ) : (
    // 其他消息：正常渲染
    <div class={`message ${msg.role}`} key={msg.id}>
      <div class="avatar">
        {msg.role === "user" ? "U" : msg.role === "tool" ? "T" : "AI"}
      </div>
      <div class="message-content" dangerouslySetInnerHTML={{...}} />
    </div>
  )
)}
```

**样式说明**：
- 外层容器：灰色背景、圆角、边框
- `<details open={true}>`：默认展开
- `<summary>`：标题栏，点击可折叠/展开
- 内容区：白色背景、保留换行、小字体

---

## 关键设计决策

### 1. 为什么在 `message_start` 重置状态？

**问题**：最初只在 `response_end` 重置状态，导致新消息被错误地追加到旧消息。

**解决方案**：在 `message_start` 重置状态，因为每个消息轮次（turn）应该有自己独立的消息。

```
时间线：
message_start → 重置状态 → text_delta → 创建新消息 ✓
               而不是继续更新旧消息 ✗
```

### 2. 为什么服务器端只发送增量？

**问题**：如果发送累积内容，前端会重复显示。

**解决方案**：服务器端每次只发送新的增量部分，前端负责累积显示。

```typescript
// 服务器端：只发送增量
result.thinkDelta = remaining; // 不是 currentThinkContent

// 前端：累积显示
content: msg.content + data.content
```

### 3. 为什么要过滤空内容？

**问题**：如果只有 `<think>` 内容没有普通文本，会创建空的 AI 消息。

**解决方案**：服务器端检查 `textDelta.trim().length > 0`，前端检查 `data.content` 是否存在。

### 4. 为什么使用 Map 存储解析状态？

**原因**：每个 WebSocket 连接有独立的解析状态，避免不同用户的状态混淆。

```typescript
const thinkParserStates = new Map<WebSocket, ThinkParserState>();
```

---

## 完整数据流示例

### 场景：用户问"今天天气怎么样？"

**假设 AI 的内部思考过程是**：
```


今天天气不错！请问您在哪个城市？
```

### 服务器端处理流程

```
接收到的 text_delta 事件序列：

1. delta: "<think>"
   → state.isInThinkTag = true
   → 无输出（在标签开始处）

2. delta: "我需要查询天气信息。\n"
   → result.thinkDelta = "我需要查询天气信息。\n"
   → 发送 { type: "think_block", content: "我需要查询天气信息。\n" }

3. delta: "用户没有指定地点，我应该问一下。"
   → result.thinkDelta = "用户没有指定地点，我应该问一下。"
   → 发送 { type: "think_block", content: "用户没有指定地点，我应该问一下。" }

4. delta: "</think>\n\n今天天气不错！请问您在哪个城市？"
   → result.thinkDelta = ""（已经结束了）
   → result.textDelta = "\n\n今天天气不错！请问您在哪个城市？"
   → 发送 { type: "text_delta", delta: "\n\n今天天气不错！请问您在哪个城市？" }
```

### 前端显示结果

```
┌─────────────────────────────────────────┐
│ 💭 思考过程 （点击展开/折叠）             │
├─────────────────────────────────────────┤
│ 我需要查询天气信息。                     │
│ 用户没有指定地点，我应该问一下。         │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ AI                                       │
│ 今天天气不错！请问您在哪个城市？         │
└─────────────────────────────────────────┘
```

---

## 调试技巧

### 服务器端日志

```typescript
console.log(`[THINK_PARSER] isInTag: ${state.isInThinkTag}, textDelta: ${result.textDelta.length}, thinkDelta: ${result.thinkDelta?.length || 0}`);
```

### 前端日志

```typescript
case "think_block":
  console.log(`[THINK_BLOCK] 内容长度: ${data.content.length}, 前50字符: ${data.content.substring(0, 50)}`);
  break;
```

### 测试用例

1. **纯思考内容**：只有 `<think>` 没有 normal text
2. **纯普通文本**：没有 `<think>` 标签
3. **混合内容**：think → normal → think → normal
4. **跨 delta 的标签**：`<th` 和 `ink>` 分开到达
5. **多个 think 块**：多个独立的 `<think>` 标签

---

## 常见问题

### Q1: 思考内容不显示

**可能原因**：
- 服务器端没有正确解析 think 标签
- 前端 `currentThinkMessageRef` 没有正确设置

**排查**：检查服务器端是否发送 `think_block` 事件

### Q2: 思考内容重复显示

**可能原因**：
- 服务器端发送了累积内容而非增量
- 前端没有使用 `msg.content + data.content`

**排查**：检查 `parseThinkTagsFromDelta` 返回值

### Q3: 显示空的 AI 消息

**可能原因**：
- 服务器端发送了空的 `text_delta`（如纯空格）
- 前端没有检查内容是否为空

**解决**：添加 `textDelta.trim().length > 0` 检查

### Q4: 多轮对话消息顺序混乱

**可能原因**：
- `streamingMessageIdRef` 没有在 `message_start` 重置

**解决**：确保在 `message_start` 时重置状态

---

## 相关文件

- **服务器端**：`/Users/zack/Desktop/Krebs/server.ts`
  - 第 49-126 行：`parseThinkTagsFromDelta` 函数
  - 第 956-981 行：text_delta 事件处理

- **前端**：`/Users/zack/Desktop/Krebs/frontend/chat.tsx`
  - 第 34 行：Message 类型定义
  - 第 62 行：WSMessage 类型定义
  - 第 139 行：currentThinkMessageRef 定义
  - 第 169-173 行：message_start 处理
  - 第 274-298 行：think_block 处理
  - 第 253-272 行：text_delta 处理
  - 第 671-692 行：thinking 消息渲染

---

## 总结

这个实现的核心思想是：

1. **分离关注点**：在服务器端分离思考内容和普通内容，前端独立处理
2. **状态管理**：使用状态机模式解析跨 delta 的标签
3. **流式优先**：增量发送、增量显示，而不是等待完整内容
4. **防御性编程**：过滤空内容、重置状态、清理资源

通过这种方式，用户可以看到 AI 的"思考过程"，同时不影响正常的流式对话体验。
