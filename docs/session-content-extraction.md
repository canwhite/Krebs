# Session 内容提取改造文档

## 背景

本次改造的目标是完全移除 write 工具依赖，改用基于 Session 事件流的实时内容提取机制。

### 改造原因

1. **简化工具链**：write 工具增加了一层复杂度，需要解析工具调用参数
2. **统一数据流**：所有 AI 输出都在 session 事件中，统一处理更清晰
3. **减少依赖**：不依赖文件系统写入，纯内存处理更高效

### 核心原理

AI 输出的所有内容都通过 session 事件流传输：
- `message_update` + `text_delta`：流式文本输出
- `message_end`：表示输出完成

通过收集 `text_delta` 事件累积完整文本，在 `message_end` 时触发智能提取。

## 实现内容

### 1. 新建内容提取器

**文件**: `/Users/zack/Desktop/Krebs/lib/session-content-extractor.ts`

核心函数 `extractFromSessionText()` 支持多种内容类型提取：

#### 提取优先级

1. **JSON 代码块** - 提取 ```json 包裹的 JSON
2. **纯 JSON 对象** - 提取文本中的有效 JSON（带验证）
3. **文章/章节内容** - 提取带标记的正文（去除创作过程等）
4. **完整文本后备** - 长文本直接使用

#### 辅助函数

- `extractArticleContent()` - 提取文章正文，去除创作过程总结
- `extractChapterContent()` - 提取章节正文
- `isProcessText()` - 判断是否为过程描述文本

### 2. 修改服务器端

**文件**: `/Users/zack/Desktop/Krebs/server.ts`

#### 移除 write 工具

```typescript
// 移除导入
import { createWriteTool } from "...";  // ❌ 删除

// 移除工具注册
tools: [
  createReadTool(cwd),
  createBashTool(join(cwd, "custom")),
  // createWriteTool(join(cwd, "custom")),  // ❌ 删除
  createEditTool(cwd),
]
```

#### 更新 systemPrompt

移除所有关于 write 工具的指令：
- 移除 "写新文件时必须使用 write 工具"
- 移除 "完成任何创作任务后，必须使用 write 工具保存"
- 改为 "当用户要求生成内容时，直接输出内容，系统会自动提取"

#### 修改 API 消息处理 (handleApiMessage)

```typescript
// 收集 session 事件和文本
let isWriting = true;
const textDeltas: string[] = [];

session.subscribe((event) => {
  // 收集文本输出
  if (event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta") {
    textDeltas.push(event.assistantMessageEvent.delta);
  }

  // 写入完成标志
  if (event.type === "message_end") {
    isWriting = false;
    logger.log("[SESSION] 写入完成");
  }
});

await session.prompt(message);

// 等待写入完成
const maxWaitTime = 5000;
while (isWriting && Date.now() - startTime < maxWaitTime) {
  await new Promise(resolve => setTimeout(resolve, 50));
}

// 提取最终内容
const textResponse = textDeltas.join("");
const generatedContent = extractFromSessionText(textResponse, logger);
```

#### 修改 WebSocket 处理

```typescript
const textDeltas: string[] = [];

session.subscribe((event) => {
  if (event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta") {
    textDeltas.push(event.assistantMessageEvent.delta);
  }

  if (event.type === "message_end") {
    const fullText = textDeltas.join("");
    const generatedContent = extractFromSessionText(fullText, logger);

    ws.send(JSON.stringify({
      type: "response_end",
      generatedContent: generatedContent,
    }));

    textDeltas.length = 0;  // 清空缓存
  }
});
```

## 测试验证

### API 测试

```bash
# 1. 认证
curl -X POST http://localhost:3333/api/auth/internal -c cookies.txt

# 2. 测试 JSON 生成
curl -X POST http://localhost:3333/api/messages -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"message": "生成一个JSON，包含title和content字段"}' \
  | jq '.generatedContent'

# 3. 测试章节生成
curl -X POST http://localhost:3333/api/messages -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{"message": "写一个简短的章节：雨夜中的邂逅"}' \
  | jq '.generatedContent'
```

### 验证结果

- ✅ JSON 代码块正确提取
- ✅ 章节内容正确提取（自动去除创作过程）
- ✅ 过程描述正确过滤
- ✅ 无 write 工具依赖

## 关键文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `lib/session-content-extractor.ts` | 新建 | 内容提取核心逻辑 |
| `server.ts` | 修改 | 移除 write 工具，实现 session 提取 |
| `lib/write-extractor.ts` | 保留（已废弃） | 原 write 工具提取逻辑 |

## 后续优化建议

1. **错误处理**：增加更详细的日志和错误信息
2. **提取策略**：可根据用户 prompt 类型选择不同的提取策略
3. **性能优化**：对大文本进行流式处理，避免内存堆积
