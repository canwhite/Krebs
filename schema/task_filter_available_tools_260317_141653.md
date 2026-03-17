# Task: 过滤不可用的工具

**任务ID**: task_filter_available_tools_260317_141653
**创建时间**: 2026-03-17 14:16:53
**状态**: 进行中
**目标**: 在工具传递给 LLM 之前，过滤掉缺少必要配置的工具

## 实现方案

**在 Agent 调用 Provider 之前，动态过滤工具列表**

### 实现位置
`src/agent/core/agent.ts` - `processWithToolsAndStreaming()` 方法

### 实现逻辑

1. 检查每个工具的 `requiresApiKey` 标记
2. 如果需要 API key，使用 `apiKeyManager.hasApiKey()` 检查
3. 只将可用的工具传递给 Provider
4. 记录被过滤的工具和原因

### 检查条件

```typescript
function isToolAvailable(tool: Tool): boolean {
  // 如果工具不需要 API key，直接可用
  if (!tool.requiresApiKey) {
    return true;
  }

  // 如果工具需要 API key，检查是否已配置
  const apiKeyName = tool.apiKeyName || tool.name;
  return apiKeyManager.hasApiKey(apiKeyName);
}
```

### 工具过滤

```typescript
// 在调用 Provider 之前
const availableTools = this.deps.tools?.filter(isToolAvailable);
const filteredTools = this.deps.tools?.filter(t => !isToolAvailable(t));

// 记录被过滤的工具
if (filteredTools && filteredTools.length > 0) {
  console.log(`[Agent] Filtered ${filteredTools.length} unavailable tools:`,
    filteredTools.map(t => t.name).join(", "));
}

// 只传递可用工具给 Provider
const response = await this.deps.provider.chatStream(
  allMessages,
  {
    ...
    tools: availableTools,  // ← 只传递可用工具
  },
  ...
);
```

## 实现步骤

1. ✅ 理解当前架构
2. ✅ 创建工具可用性检查函数
3. ✅ 在 `processStreamInternal` 中集成过滤逻辑
4. ✅ 在 `processWithToolsAndStreaming` 中集成过滤逻辑
5. ⏳ 测试效果

## 当前进度

### 正在进行
等待测试结果

## 已完成的修改

### 1. 添加了工具可用性检查函数

**位置**：`src/agent/core/agent.ts`

```typescript
function isToolAvailable(tool: Tool): boolean {
  // 如果工具不需要 API key，直接可用
  if (!tool.requiresApiKey) {
    return true;
  }

  // 如果工具需要 API key，检查是否已配置
  const apiKeyName = tool.apiKeyName || tool.name;
  return apiKeyManager.hasApiKey(apiKeyName);
}

function filterAvailableTools(tools?: Tool[]): Tool[] {
  const availableTools = tools.filter(isToolAvailable);
  const filteredTools = tools.filter(t => !isToolAvailable(t));

  if (filteredTools.length > 0) {
    console.log(`[Agent] 🚫 Filtered ${filteredTools.length} unavailable tools:`,
      filteredTools.map(t => `"${t.name}"`).join(", "));
  }

  return availableTools;
}
```

### 2. 在 `processStreamInternal` 中集成

- 在判断 `hasToolsAvailable` 之前过滤工具
- 只将可用工具传递给 LLM

### 3. 在 `processWithToolsAndStreaming` 中集成

- 在方法开始时过滤工具
- 使用 `availableTools` 替代 `this.deps.tools`

## 预期效果

当 web_search 缺少 API key 时：
1. 启动时日志显示：`🚫 Filtered 1 unavailable tools: "web_search"`
2. LLM 只看到 6 个可用工具（bash, read_file, write_file, edit_file, spawn_subagent, web_fetch）
3. LLM 不会尝试调用 web_search
4. 避免陷入"尝试 → 失败 → 再尝试"的循环

## 下一步

测试并观察日志输出，确认：
- web_search 是否被正确过滤
- LLM 是否只收到可用工具
- 是否避免了工具调用失败的循环
