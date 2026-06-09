# Write Tool Loading 状态问题排查与解决

## 问题：为什么 loading 不显示？

### 用户反馈的现象

用户发送"帮我写一个 Python 快速排序"后，会经历：

1. 漫长的等待（大约 12 秒）
2. 突然直接显示"写入完成"
3. 中间的"正在写入..." loading 状态完全看不到

### 用户的期望

- **写入开始** → 显示"写入中..."
- **写入进行中** → 显示 loading 样式（动画）
- **内容出现后** → loading 消失

## 排查过程

### 第一步：添加日志追踪

在 `server.ts` 中添加了日志系统，把所有事件记录到 `monitor.log` 文件。

通过分析日志，发现了关键的时间线：

```
[03:08:44.495] message_update  开始
[03:08:56.489] tool_execution_start  ← write 工具开始
[03:08:56.490] tool_execution_end    ← write 工具结束（只用了 1 毫秒！）
```

### 第二步：发现真相

**原来那 12 秒的等待不是在"写入"，而是在"思考"！**

更准确的时间线：

```
03:08:44 - 03:08:56  （约 12 秒）
    ↓ LLM 在生成代码内容
    ↓ 这段时间只有 message_update 事件
    ↓ 事件类型：toolcall_delta（工具调用增量生成）

03:08:56.489
    ↓ tool_execution_start（工具开始执行）

03:08:56.490
    ↓ tool_execution_end（工具执行结束）
    ↓ 只用了 1 毫秒！
```

### 对比其他工具

看看 bash 工具需要多长时间：

```
03:08:58.944  tool_execution_start
03:08:59.146  tool_execution_end
```

bash 工具花了 202 毫秒，足够显示 loading 状态。

但 write 工具只花了 1 毫秒，前端还没来得及显示 loading，工具就执行完了！

### 结论

**问题根源**：write 工具执行太快（1 毫秒），但用户等待的"漫长时间"实际上是 LLM 生成代码的过程（12 秒）。

## 解决方案

### 原来的错误做法

```typescript
// 只在 tool_execution_start 时显示 loading
case "tool_execution_start":
  showLoading("正在写入...");
```

问题：此时工具几乎立即就完成了，loading 根本来不及显示。

### 正确的解决方案

在 LLM **开始生成工具调用**时就显示 loading：

```typescript
// 监听 toolcall_start 事件
case "toolcall_start":
  if (data.tool === "write") {
    showLoading("准备写入文件...");
  }
```

然后在工具参数解析完成后更新：

```typescript
// 监听 tool_execution_start 事件
case "tool_execution_start":
  if (data.tool === "write") {
    updateLoading(`写入文件: ${fileName}\n\n正在写入...`);
  }
```

### 完整的时间线（修复后）

1. **03:08:44** - LLM 开始思考
2. **03:08:56.489** - LLM 开始生成工具调用 → 立即显示"准备写入文件..."（loading）
3. **03:08:56.490** - 工具执行完成 → 更新为"写入完成"（loading 消失）

现在用户在 LLM 开始生成代码时就能看到 loading 提示！

## 技术细节

### 事件类型解释

| 事件                   | 何时触发             | 用途             |
| ---------------------- | -------------------- | ---------------- |
| `tool_call_start`      | LLM 开始生成工具调用 | 显示"准备中"     |
| `tool_call_delta`      | LLM 增量生成参数     | 可以实时显示进度 |
| `tool_call_end`        | LLM 完成工具调用生成 | -                |
| `tool_execution_start` | 工具真正开始执行     | 显示"执行中"     |
| `tool_execution_end`   | 工具执行完成         | 显示"完成"       |

### 代码修改点

**服务器端（server.ts）**：

```typescript
// 添加 toolcall_start 事件处理
if (event.assistantMessageEvent.type === "toolcall_start") {
  const toolCall = partial.content?.[event.assistantMessageEvent.contentIndex];
  if (toolCall?.type === "toolCall") {
    ws.send(
      JSON.stringify({
        type: "tool_call_start",
        tool: toolCall.name,
      }),
    );
  }
}
```

**前端（chat.tsx）**：

```typescript
// 处理 tool_call_start 事件
case "tool_call_start":
  if (data.tool === "write") {
    setMessages((prev) => [
      ...prev,
      {
        content: `📝 准备写入文件...`,
        isLoading: true,
      },
    ]);
  }
```

## 经验总结

1. **快操作也需要 loading**
   - 即使操作本身很快（1 毫秒）
   - 如果用户等待时间很长（12 秒）
   - 也需要在等待开始时就显示 loading

2. **区分两个阶段**
   - LLM 生成阶段（toolcall）：慢，需要显示进度
   - 工具执行阶段（tool_execution）：快，可能来不及显示

3. **日志是调试的利器**
   - 通过详细的事件日志
   - 才能准确找出性能瓶颈和时间线

## 相关文件

- `server.ts` - 服务器端事件处理
- `frontend/chat.tsx` - 前端状态管理
- `monitor.log` - 事件日志（运行时生成，LOG_LEVEL=DEBUG 时创建）
- `docs/write-tool-streaming-display.md` - 流式内容显示优化
