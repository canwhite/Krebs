# Task: Session 上下文传递问题分析与解决

**任务ID**: task_session_context_260220_005141
**创建时间**: 2026-02-20
**状态**: 进行中
**目标**: 分析并解决 Session 存储后 LLM 无法正确读取上下文的问题

## 最终目标
修复 Session 存储逻辑与 LLM 上下文读取之间的数据传递问题，确保多轮对话中 LLM 能正确获取历史消息。

## 问题分析（基于代码审查）

### 初步发现的问题

1. **Agent.ts 中的消息构建逻辑** (src/agent/core/agent.ts:106-194)
   - `messagesForLLM` 的构建存在两种不同的路径
   - 有 MemoryService 时：使用 `injectRelevantMemories` 增强
   - 无 MemoryService 时：直接拼接 `[system, ...history, userMessage]`
   - ⚠️ **问题**：日志显示 messagesForLLM 被正确构建，但需要验证是否真的发送给 LLM

2. **SessionStore 存储逻辑** (src/storage/session/session-store.ts:244-303)
   - `mergeMessagesWithoutDuplicates` 方法实现去重
   - 保存时会合并现有消息 + 新消息
   - ⚠️ **问题**：去重逻辑可能过于严格，导致消息被误判为重复

3. **Agent 保存逻辑** (src/agent/core/agent.ts:315-328)
   - 只保存 `allMessages`（当前对话的新消息）
   - 不包含已存在的历史（`history`）
   - ✅ **正确**：这避免了重复保存

### 需要验证的假设

1. **假设 1：去重逻辑问题**
   - `getMessageFingerprint` 可能过于严格
   - 时间戳精确到秒，但毫秒级差异可能导致匹配失败
   - 内容相同的消息可能被错误去重

2. **假设 2：消息加载问题**
   - `loadSession` 返回的消息格式可能有问题
   - 解析 Markdown 时可能丢失某些消息

3. **假设 3：LLM 调用问题**
   - `messagesForLLM` 构建正确，但 `callLLM` 时未正确传递
   - Provider 层可能有问题

## 拆解步骤

### 1. 验证问题现象
- [ ] 1.1 查看实际运行日志，确认问题表现
- [ ] 1.2 检查存储的 Session 文件内容
- [ ] 1.3 确认 LLM 是否真的没有收到历史消息

### 2. 定位根本原因
- [ ] 2.1 检查 `loadSession` 返回的消息
- [ ] 2.2 检查 `saveSession` 保存的消息
- [ ] 2.3 检查 `callLLM` 接收的消息

### 3. 实施修复方案
- [ ] 3.1 根据根因选择合适的修复方案
- [ ] 3.2 代码修改
- [ ] 3.3 单元测试

### 4. 集成测试
- [ ] 4.1 本地测试多轮对话
- [ ] 4.2 验证修复效果

## 当前进度

### 正在进行
✅ 任务完成

### 已完成
- ✅ 读取 Agent.ts 核心代码
- ✅ 读取 SessionStore.ts 存储逻辑
- ✅ 读取 ChatService.ts 接口层
- ✅ 初步分析可能的问题点
- ✅ 创建测试脚本复现问题
- ✅ **定位根本原因**：`injectRelevantMemories` 方法只接收当前消息，丢失历史
- ✅ **实施修复**：修改 Agent.ts 传递完整的消息列表
- ✅ **验证修复效果**：测试通过，LLM 能正确读取上下文
- ✅ **编写单元测试**：创建 `context-passing.test.ts`，4个测试全部通过
- ✅ **清理调试日志**：移除 DeepSeek Provider 中的调试日志

## 问题根因总结

**根本原因**：
1. `injectRelevantMemories` 方法接收的第一个参数只包含当前用户消息
2. 当搜索不到相关记忆时，直接返回该参数，导致历史消息丢失
3. 最终 `messagesForLLM` 只有 `[system, userMessage]`，缺少历史对话

**修复方案**：
- 修改 Agent.ts 第 115-124 行
- 在调用 `injectRelevantMemories` 之前，先构建完整的消息列表（`history + userMessage`）
- 这样无论是否找到相关记忆，都能保留完整的对话历史

**修复代码**：
```typescript
// 修复前（错误）
const enhanced = await this.deps.memoryService.injectRelevantMemories(
  [{ role: "user", content: userMessage, timestamp: Date.now() }],
  recentMessages
);

// 修复后（正确）
const fullMessages = [
  ...history,
  { role: "user", content: userMessage, timestamp: Date.now() },
];
const enhanced = await this.deps.memoryService.injectRelevantMemories(
  fullMessages,
  recentMessages
);
```

## 下一步行动
1. 清理调试日志（DeepSeek Provider）
2. 编写单元测试覆盖此场景
3. 提交代码

## 问题清单

### 关键问题
1. **消息去重逻辑是否正确？**
   - `getMessageFingerprint` 方法
   - 基于角色、内容、时间戳（秒级）
   - 可能问题：工具调用消息的 toolCalls 序列化不稳定

2. **消息解析是否完整？**
   - `parseMessages` 方法
   - 正则表达式：`/## (\w+)\n(\n?)([\s\S]*?)(?=\n## |\n*$)/g`
   - 可能问题：最后一条消息无法匹配

3. **LLM 调用是否正确？**
   - `callLLM` 方法
   - Provider 层传递
   - 可能问题：Provider 实现有问题

### 次要问题
1. 日志输出过多，影响性能
2. 缓存机制可能导致读取到旧数据
3. 并发写入锁机制可能导致性能问题

## 技术方案选项

### 方案 1：修复消息去重逻辑
**优点**：治本，彻底解决问题
**缺点**：可能影响现有逻辑
**实施难度**：中等

### 方案 2：修复消息解析逻辑
**优点**：解决解析丢失问题
**缺点**：需要仔细测试边界情况
**实施难度**：中等

### 方案 3：增加调试日志定位问题
**优点**：不影响现有逻辑
**缺点**：增加日志噪音
**实施难度**：低

## 决策
暂不决策，等待验证结果后选择最合适的方案
