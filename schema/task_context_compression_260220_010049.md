# Task: 上下文压缩与摘要机制研究

**任务ID**: task_context_compression_260220_010049
**创建时间**: 2026-02-20
**状态**: 进行中
**目标**: 实现不丢失关键信息的上下文压缩机制，解决长对话中的注意力和 token 消耗问题

## 最终目标
设计并实现一个高效的上下文压缩系统，在保留关键信息的前提下，将长对话历史压缩为简洁的摘要或关键消息列表。

## 问题背景

### 当前问题
1. **token 消耗大**：每次对话都传入完整历史（已验证：第3轮对话传入6条消息）
2. **注意力分散**：LLM 需要处理大量无关信息
3. **成本高**：长对话中 token 使用量线性增长
4. **性能差**：超过模型上下文窗口时会出错

### 参考项目分析（基于 production.md）

**openclaw-cn-ds** 项目的解决方案：
- 使用 `transcript.ts` 管理会话（JSONL 格式）
- 自动压缩：当接近 token 限制时触发
- 智能摘要：保留最近 N 条消息 + 历史摘要
- 参考 `src/agent/core/agent.ts` 第 605-633 行的 `compactIfNeeded` 方法

**当前项目已有的基础**：
- ✅ `compactMessages` 工具函数（`src/utils/compaction.ts`）
- ✅ `estimateMessagesTokens` 工具函数（`src/utils/token-estimator.ts`）
- ✅ `getModelContextWindow` 工具函数（`src/utils/model-context.ts`）
- ✅ Agent 中已实现 `compactIfNeeded` 方法

## 技术方案研究

### 方案 1：滑动窗口（Sliding Window）
**原理**：只保留最近的 N 条消息

**优点**：
- 实现简单
- 性能可预测
- 成本可控

**缺点**：
- ❌ 丢失早期重要信息
- ❌ 无法处理长程依赖

**代码示例**：
```typescript
const keepRecentCount = 20;
const messagesForLLM = [
  ...history.slice(-keepRecentCount),  // 只保留最近20条
  userMessage,
];
```

### 方案 2：智能摘要（Summarization）
**原理**：将旧消息摘要为一条 system 消息

**优点**：
- ✅ 保留关键信息
- ✅ 显著减少 token 数量
- ✅ 保持上下文连贯性

**缺点**：
- 需要额外的 LLM 调用（成本）
- 摘要质量取决于模型
- 实现复杂度中等

**代码示例**：
```typescript
// 1. 分割消息
const recentMessages = history.slice(-20);  // 最近20条
const oldMessages = history.slice(0, -20);  // 旧消息

// 2. 生成摘要
const summary = await llm.summarize(oldMessages);

// 3. 构建消息列表
const messagesForLLM = [
  systemMessage,
  { role: "system", content: `[历史对话摘要]\n${summary}` },
  ...recentMessages,
  userMessage,
];
```

### 方案 3：语义检索 + 关键消息（Semantic Retrieval）
**原理**：基于当前查询检索相关的历史消息

**优点**：
- ✅ 上下文相关性高
- ✅ 只传递相关信息
- ✅ 可与 Memory System 结合

**缺点**：
- 需要嵌入模型（成本）
- 实现复杂度高
- 可能遗漏重要细节

**代码示例**：
```typescript
// 1. 将历史消息向量化
const historyEmbeddings = await embedMessages(history);

// 2. 检索相关消息
const relevantMessages = await retrieveRelevant(
  userMessage,
  historyEmbeddings,
  topK=10
);

// 3. 构建消息列表
const messagesForLLM = [
  systemMessage,
  ...relevantMessages,
  userMessage,
];
```

### 方案 4：分层压缩（Hybrid Approach）⭐ 推荐
**原理**：结合多种策略的混合方案

**策略**：
1. **System 级别**：项目信息、用户偏好（很少变化）
2. **Summary 级别**：旧对话摘要（定期更新）
3. **Recent 级别**：最近 N 条完整消息（保持细节）
4. **Current 级别**：当前用户消息

**优点**：
- ✅ 平衡性能和信息完整性
- ✅ 可根据 token 预算动态调整
- ✅ 参考 openclaw-cn-ds 的设计

**代码结构**：
```typescript
const contextWindow = getModelContextWindow(model);
const tokenBudget = contextWindow * 0.8;  // 预留 20%

// 分层构建
const layers = {
  system: buildSystemPrompt(),         // 固定
  summary: await summarizeOld(history), // 压缩
  recent: history.slice(-20),           // 完整
  current: userMessage,                 // 完整
};

// 动态调整
const compressed = compactToFitBudget(layers, tokenBudget);
```

## 拆解步骤

### Phase 1: 研究与设计
- [ ] 1.1 研究 openclaw-cn-ds 的压缩实现
- [ ] 1.2 分析当前 `compactIfNeeded` 方法的实现
- [ ] 1.3 设计适合 Krebs 的压缩策略
- [ ] 1.4 定义压缩触发条件

### Phase 2: 核心实现
- [ ] 2.1 实现 `summarizeMessages` 方法（调用 LLM 生成摘要）
- [ ] 2.2 优化 `compactIfNeeded` 方法（支持分层压缩）
- [ ] 2.3 实现智能缓存机制（摘要缓存，避免重复生成）
- [ ] 2.4 添加压缩决策逻辑（何时触发压缩）

### Phase 3: 集成与优化
- [ ] 3.1 集成到 Agent.process 方法
- [ ] 3.2 添加监控和日志（压缩率、token 节省）
- [ ] 3.3 性能优化（异步摘要、缓存）

### Phase 4: 测试与验证
- [ ] 4.1 单元测试（压缩逻辑）
- [ ] 4.2 集成测试（长对话场景）
- [ ] 4.3 验证信息不丢失（关键信息保留）
- [ ] 4.4 性能测试（token 使用量对比）

## 研究成果总结

### openclaw-cn-ds 的压缩策略

**核心机制**：
1. **Compaction（压缩）**：将旧对话摘要为紧凑条目，保留最近消息
   - 持久化到 JSONL 历史中
   - 自动触发（接近上下文窗口时）
   - 手动触发（`/compact` 命令）

2. **Session Pruning（会话修剪）**：仅修剪旧的工具结果（in-memory）
   - 不修改 JSONL 历史
   - 每次请求时动态执行
   - 减少 token 但保留消息结构

3. **Memory Flush（内存刷新）**：压缩前自动保存重要信息到磁盘
   - 在压缩前执行 agentic turn
   - 确保关键信息不丢失

**配置选项**：
```typescript
AgentCompactionConfig {
  mode: AgentCompactionMode;  // 压缩模式
  reserveTokensFloor: number;  // 最小保留 token
  memoryFlush: {
    enabled: boolean;
    softThresholdTokens: number;  // 触发阈值
    prompt: string;  // 内存刷新提示
  };
}
```

### 当前 Krebs 项目的实现分析

**已有的基础**：
- ✅ `compactMessages` 工具（`src/utils/compaction.ts`）
- ✅ `compactIfNeeded` 方法（`src/agent/core/agent.ts`）
- ✅ Token 估算工具
- ✅ 模型上下文窗口查询

**当前实现的问题**：
1. ⚠️ `generateSimpleSummary` 是**简单摘要**（统计消息数，截取内容）
2. ⚠️ **没有调用 LLM 生成智能摘要**
3. ⚠️ 压缩只在保存时触发，不在发送给 LLM 前触发
4. ⚠️ 缺少缓存机制（摘要会重复生成）

### 推荐方案：智能分层压缩

基于 openclaw-cn-ds 的设计，结合 Krebs 的实际情况，推荐**分层压缩 + LLM 摘要**方案。

**分层结构**：
```
Layer 1 (固定): System Prompt
  - 工具列表、技能列表、运行时信息
  - Token 数：相对固定

Layer 2 (压缩): 历史对话摘要
  - 旧对话的智能摘要（由 LLM 生成）
  - 缓存摘要，定期更新
  - Token 数：可配置（默认 500-1000）

Layer 3 (完整): 最近 N 条消息
  - 保持完整的对话细节
  - 可配置数量（默认 10-20 条）
  - Token 数：动态

Layer 4 (完整): 当前用户消息
  - 完整保留
```

## 当前进度

### 正在进行
设计智能分层压缩策略

### 已完成
- ✅ 创建任务文档
- ✅ 分析问题背景
- ✅ 列出技术方案选项
- ✅ 研究 openclaw-cn-ds 的压缩实现
- ✅ 分析当前 Krebs 的压缩实现
- ✅ 确定推荐方案

## 下一步行动
1. 实现 `summarizeMessages` 方法（调用 LLM）
2. 实现摘要缓存机制
3. 优化 Agent 的上下文构建逻辑
4. 编写测试用例

## 技术约束

### Token 限制
- Claude 3.5 Sonnet: 200K tokens
- GPT-4: 128K tokens
- DeepSeek: 64K tokens

### 性能要求
- 摘要生成时间：< 5 秒
- 压缩决策时间：< 100ms
- 内存占用：最小化

### 质量要求
- **关键信息不丢失**：用户名称、偏好、重要结论
- **可追溯性**：能够理解"为什么得出这个结论"
- **自然性**：对话连贯，不突兀

## 决策矩阵

| 方案 | 信息完整性 | Token节省 | 实现复杂度 | 性能 | 推荐度 |
|------|----------|----------|----------|------|--------|
| 滑动窗口 | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ | ⭐⭐⭐⭐⭐ | ❌ 不推荐 |
| 智能摘要 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ✅ 可选 |
| 语义检索 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ✅ 可选 |
| **分层压缩** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ **强烈推荐** |

## 参考资源

1. **openclaw-cn-ds**:
   - `src/agent/core/transcript.ts` - 会话管理
   - Agent 的上下文压缩逻辑

2. **当前项目**:
   - `src/utils/compaction.ts` - 消息压缩工具
   - `src/agent/core/agent.ts` - Agent 实现
   - `test/agent/agent-context.test.ts` - 上下文测试（如果存在）

3. **最佳实践**:
   - Anthropic Context Management Guide
   - OpenAI Long Context Management
