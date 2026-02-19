# 会话上下文问题诊断

## 疑问
你说 Agent "不参考会话上下文"，具体是指：

### 可能的情况1：历史消息没有被加载？
**检查**：第95行 `const history = await this.loadHistory(sessionId);`
- 如果 `history` 是空数组，说明存储有问题
- 如果 `history` 有数据但没有被使用，说明构建 `messagesForLLM` 有问题

### 可能的情况2：历史消息被加载但没有传递给 LLM？
**检查**：第205行 `response = await this.callLLM(currentMessages);`
- `currentMessages` 初始值是 `[...messagesForLLM]`
- `messagesForLLM` 包含 `history`
- 所以历史应该被传递了

### 可能的情况3：存储没有保存历史？
**检查**：第298行 `await this.saveHistory(sessionId, compressedMessages);`
- 这里保存了 `history + allMessages`
- 下次调用 `loadHistory` 应该能获取到

### 可能的情况4：Tool Calling 循环中历史丢失？
**检查**：第261、275行
- 新消息被 push 到 `currentMessages`
- 但初始的历史消息还在
- 所以不应该丢失

## 需要验证的问题

请回答以下问题：

1. **第一次对话**正常吗？
2. **第二次对话**时，Agent 记得第一次的内容吗？
3. **同一个会话中**，多轮工具调用时，上下文是否保持？
4. **不同会话之间**，历史是否正确隔离？

## 测试步骤

### 测试1：基础历史保存
```
用户（会话A）: 你好
Agent: 你好！有什么我可以帮助你的吗？
用户（会话A）: 我刚才说什么了？
Agent 期望: 你刚才说"你好"
Agent 实际: ???
```

### 测试2：多轮工具调用
```
用户（会话A）: 查看当前目录
Agent: [调用 bash 工具] 当前目录是 /Users/xxx
用户（会话A）: 刚才查看的目录下有什么文件？
Agent 期望: [知道之前查看的目录] 列出文件...
Agent 实际: ???
```

### 测试3：会话隔离
```
用户（会话A）: 我叫张三
Agent: 你好张三
用户（会话B）: 我叫什么名字？
Agent 期望: 不知道
Agent 实际: ???
```

## 可能的根本原因

基于代码分析，我怀疑是以下原因之一：

### 原因1：存储实现有问题
**位置**：`deps.storage.loadSession` 和 `deps.storage.saveSession`
**检查**：是否正确实现了文件或数据库存储？

### 原因2：sessionId 不一致
**位置**：每次请求使用不同的 sessionId
**检查**：确保同一个对话使用相同的 sessionId

### 原因3：消息格式问题
**位置**：Message 类型定义
**检查**：存储和加载时消息格式是否一致？

## 建议的诊断步骤

1. **添加日志**：
```typescript
console.log('[Agent] Loaded history:', history.length, 'messages');
console.log('[Agent] Messages for LLM:', messagesForLLM.length, 'messages');
console.log('[Agent] Current messages:', currentMessages.length, 'messages');
```

2. **检查存储**：
```bash
# 查看存储目录
ls -la /Users/zack/Desktop/Krebs/data/

# 查看会话文件
cat /Users/zack/Desktop/Krebs/data/sessions/*.json
```

3. **验证 sessionId**：
```typescript
console.log('[Agent] Session ID:', sessionId);
```

## 请提供以下信息

1. 你的存储实现是什么？（文件系统 / 数据库 / 内存？）
2. sessionId 是如何生成的？
3. 能否提供一个具体的"不参考上下文"的例子？
