# DeepSeek 使用指南

## 为什么选择 DeepSeek？

DeepSeek 是国内领先的 AI 模型提供商，具有以下优势：

1. **性价比高** - 价格远低于 Claude 和 GPT
2. **中文优秀** - 对中文理解和使用效果极佳
3. **API 兼容** - 完全兼容 OpenAI API 格式
4. **无需翻墙** - 国内可直接访问

## 快速配置

### 1. 获取 API Key

访问 [DeepSeek 开放平台](https://platform.deepseek.com/)，注册并创建 API Key。

### 2. 配置环境变量

在 `.env` 文件中添加：

```env
DEEPSEEK_API_KEY=your_api_key_here
```

### 3. 启动服务

```bash
npm run dev
```

## 支持的模型

### deepseek-chat
通用对话模型，适用于大多数场景。

### deepseek-coder
代码专用模型，特别适合编程任务。

## 价格对比

| 模型 | 输入价格 | 输出价格 |
|------|---------|---------|
| DeepSeek Chat | ¥1/百万tokens | ¥2/百万tokens |
| DeepSeek Coder | ¥1/百万tokens | ¥2/百万tokens |
| GPT-4o | ~¥30/百万tokens | ~¥60/百万tokens |
| Claude 3.5 Sonnet | ~¥25/百万tokens | ~¥75/百万tokens |

## 使用示例

### 默认配置

系统已默认使用 DeepSeek，无需额外配置：

```typescript
const agent = agentManager.createAgent({
  id: "default",
  name: "默认助手",
  model: "deepseek-chat",  // 默认模型
  temperature: 0.7,
});
```

### 代码专用模型

```typescript
const coderAgent = agentManager.createAgent({
  id: "coder",
  name: "代码助手",
  model: "deepseek-coder",  // 代码模型
  systemPrompt: "你是一个专业的编程助手...",
});
```

## 切换到其他 Provider

如果你想使用其他 Provider，修改 `.env` 文件：

```env
# 使用 Anthropic
AGENT_DEFAULT_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key

# 或使用 OpenAI
AGENT_DEFAULT_PROVIDER=openai
OPENAI_API_KEY=your_key
```

## 常见问题

### Q: DeepSeek 和 GPT/Claude 有什么区别？
A: DeepSeek 在中文场景下表现优秀，且价格仅为它们的 1/20-1/30。

### Q: 可以同时使用多个 Provider 吗？
A: 可以！系统支持同时配置多个 Provider，可以为不同 Agent 使用不同的模型。

### Q: DeepSeek API 有调用限制吗？
A: 免费用户有一定限制，付费用户限制更宽松。详情请查看官方文档。

## 相关链接

- [DeepSeek 官网](https://www.deepseek.com/)
- [开放平台](https://platform.deepseek.com/)
- [API 文档](https://platform.deepseek.com/api-docs/)
