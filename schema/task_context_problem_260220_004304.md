# Task: 分析上下文传递问题

**任务ID**: task_context_problem_260220_004304
**创建时间**: 2026-02-20
**状态**: 分析完成，需要测试验证
**目标**: 分析为什么助手说无法看到历史信息

## 问题现象

检查 `data/sessions/user_1771519101117_ezxyb3x0s.md` 文件：

1. **第一轮**：用户"你好" → 助手正常回复
2. **第二轮**：用户"你能看到我之前信息吗" → 助手回复**"我无法看到我们对话历史中的之前信息"**
3. **第三轮**：用户"你能干什么？" → 助手详细回复

**关键问题**：助手在第二轮对话中说无法看到历史信息，但：
- 消息没有重复存储（修复有效）
- 助手在第三轮给出了详细回复（模型工作正常）

## 问题分析

### 1. 代码逻辑检查

**Agent加载历史** (`loadHistory`):
```typescript
const history = await this.deps.storage.loadSession(sessionId);
// 返回 Message[] 或空数组
```

**构建 messagesForLLM** (`processWithTools`):
```typescript
messagesForLLM = [
  ...(systemPrompt ? [system message] : []),
  ...history,  // 历史消息
  { role: "user", content: userMessage },  // 当前用户消息
];
```

**理论上**：历史消息应该被包含在 `messagesForLLM` 中传递给LLM。

### 2. 可能的问题根源

#### A. 历史消息确实没有加载
- `loadHistory` 返回空数组
- 原因：sessionId不匹配、缓存问题、文件读取问题

#### B. 历史消息加载了但没有正确传递
- 消息格式问题
- 消息被截断或过滤

#### C. LLM收到了历史消息但选择忽略
- DeepSeek模型可能被训练为不假设有历史上下文
- 模型诚实地描述它的能力限制
- System prompt没有明确告知模型可以访问历史

#### D. 模型特性问题
- 不同模型对历史上下文的处理方式不同
- 模型可能被设计为"无状态"（每次对话独立）

### 3. 证据分析

**支持C/D假设的证据**：
1. 助手说"我无法看到我们对话历史中的之前信息" - 这听起来像模型在**诚实地回答**
2. 第三轮对话助手给出了详细回复 - 说明模型工作正常
3. 消息没有重复存储 - 说明存储逻辑正确

**反对A/B假设的证据**：
1. 代码逻辑显示历史消息应该被包含
2. 如果是加载问题，第三轮也应该有问题
3. 文件存在且可读（之前测试验证）

## 已实施的修复

### 1. 添加详细调试日志
- `processWithTools` 开始时显示sessionId和用户消息
- `loadHistory` 显示加载的消息数量和内容
- `messagesForLLM` 显示构建的详细内容
- `saveHistory` 显示保存的消息

### 2. 修改默认System Prompt
```typescript
systemPrompt: `你是一个有用的 AI 助手...
重要说明：
1. 你可以访问完整的对话历史...
2. 当用户问"你能看到我之前的信息吗"...`;
```

### 3. SessionStore去重修复（已完成）
- 修复了消息重复存储问题

## 验证步骤

### 1. 启动服务查看调试日志
```bash
npm run build
npm run dev
```

### 2. 观察日志输出
关键日志：
- `[Agent] processWithTools called: sessionId="..."`
- `[Agent] Loaded X messages from session "..."`
- `[Agent] History messages details:`
- `[Agent] messagesForLLM details:`

### 3. 测试多轮对话
发送测试请求，观察：
- 历史消息是否被加载
- messagesForLLM是否包含历史
- 助手回复是否改进

## 如果问题持续

### 方案1：进一步诊断
1. 检查provider调用，确认实际发送的消息
2. 测试不同模型（Anthropic/OpenAI）的行为
3. 验证消息格式是否符合模型期望

### 方案2：System Prompt优化
1. 更明确地告知模型上下文能力
2. 添加具体指令："请参考之前的对话历史"
3. 测试不同的prompt表述

### 方案3：架构调整
1. 考虑添加"上下文摘要"功能
2. 实现智能上下文管理
3. 根据模型特性调整消息构建

## 当前结论

**最可能的原因**：DeepSeek模型被训练为不假设有对话历史，或者system prompt没有明确告知模型可以访问历史。

**已采取的措施**：
1. ✅ 添加详细调试日志
2. ✅ 修改system prompt明确上下文能力
3. ✅ 修复消息重复存储问题

**下一步**：启动服务测试，查看调试日志，验证修复效果。