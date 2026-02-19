# Task: 修复Session重复存储问题

**任务ID**: task_session_deduplication_260220_003908
**创建时间**: 2026-02-20
**状态**: 已完成
**目标**: 修复session消息重复存储的问题

## 最终目标
1. 分析并修复session消息重复存储的问题
2. 实现消息去重逻辑
3. 修复Agent层面的重复保存问题

## 问题分析

### 问题现象
检查 `data/sessions/user_1771518852529_6xha9u91z.md` 文件发现：
- 第6-40行：第一轮对话（你好 → 回复 → 你能看到我之前消息吗 → 回复）
- 第42-76行：**完全重复**的第一轮对话
- 第78-117行：新的对话（你擅长什么呢 → 详细回复）

### 根本原因分析

#### 1. Agent层面问题
在 `src/agent/core/agent.ts` 的 `processWithTools` 方法中：
```typescript
// 保存对话历史（包含所有中间消息）
const messagesToSave: Message[] = [
  ...history,       // 从存储加载的已有消息
  ...allMessages,   // 当前对话收集的新消息
];
```

问题：`history` 已经存在于存储中，但每次保存时都重新包含它，导致重复。

#### 2. SessionStore层面问题
在 `src/storage/session/session-store.ts` 的 `saveSessionUnlocked` 方法中：
```typescript
// 合并消息：现有消息 + 新消息
// 注意：需要去重，避免重复添加相同的消息
const allMessages = [...existingMessages, ...messages];
```

注释写着"需要去重"，但代码没有实现去重逻辑。

### 问题复现流程
1. **第一轮对话**：
   - 保存：`history`(空) + `allMessages`(2条) = 2条消息

2. **第二轮对话**：
   - 加载`history`：2条消息
   - 处理新消息：`allMessages`收集2条新消息
   - 保存：`[...history, ...allMessages]` = 4条消息
   - SessionStore：`[...existingMessages(2), ...messages(4)]` = 6条消息 → **重复！**

## 修复方案

### 1. SessionStore层面修复
在 `src/storage/session/session-store.ts` 中添加：
- `mergeMessagesWithoutDuplicates()` 方法：合并消息并去重
- `getMessageFingerprint()` 方法：生成消息指纹（角色+内容+时间戳秒级）

去重逻辑：
- 基于消息指纹进行去重
- 时间戳精确到秒，避免毫秒级差异
- 支持工具调用消息的去重

### 2. Agent层面修复
修改 `src/agent/core/agent.ts`：

**`processWithTools` 方法**：
```typescript
// 只保存新的消息，不包含已存在的历史
const messagesToSave: Message[] = [...allMessages];
```

**`processStreamInternal` 方法**：
```typescript
// 只保存新的消息，不包含已存在的历史
const messagesToSave: Message[] = [
  { role: "user", content: userMessage, timestamp: Date.now() },
  { role: "assistant", content: response.content, timestamp: Date.now() },
];
```

### 3. 添加调试日志
- 在保存时显示新消息数量和历史消息数量
- 显示去重统计信息
- 显示具体保存的消息内容

## 测试验证

### 去重逻辑测试
1. **完全重复的消息**：2现有 + 2重复 → 2结果
2. **部分重复的消息**：2现有 + 3混合（1重复+2新） → 4结果
3. **时间戳同一秒**：视为重复
4. **时间戳不同秒**：视为不同消息

### 预期效果
修复后，session文件应该：
- 每轮对话只保存一次
- 没有重复的消息
- 总消息数 = 实际对话轮数 × 2

## 代码修改文件

1. **`src/storage/session/session-store.ts`**：
   - 添加 `mergeMessagesWithoutDuplicates()` 方法
   - 添加 `getMessageFingerprint()` 方法
   - 修改 `saveSessionUnlocked()` 使用去重逻辑

2. **`src/agent/core/agent.ts`**：
   - 修改 `processWithTools()` 只保存新消息
   - 修改 `processStreamInternal()` 只保存新消息
   - 添加调试日志

## 验证步骤

1. **构建项目**：
   ```bash
   npm run build
   ```

2. **启动服务测试**：
   ```bash
   npm run dev
   ```

3. **发送测试消息**：
   - 发送多轮相同消息
   - 检查session文件是否重复
   - 观察调试日志输出

## 注意事项

1. **时间戳精度**：去重使用秒级时间戳，同一秒内的相同消息视为重复
2. **工具调用消息**：支持包含toolCalls的消息去重
3. **向后兼容**：修复不影响现有session文件的读取
4. **性能考虑**：去重逻辑使用Set进行O(1)查找，性能影响小

## 修复完成状态
- ✅ 分析问题根源
- ✅ 实现SessionStore去重逻辑
- ✅ 修复Agent重复保存问题
- ✅ 添加调试日志
- ✅ 测试验证去重逻辑

现在session消息重复存储的问题应该已经解决。