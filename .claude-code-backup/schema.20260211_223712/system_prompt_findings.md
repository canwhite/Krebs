# System Prompt 机制探索总结（进行中）

## openclaw-cn-ds 的 System Prompt 机制

### 1. 核心文件

- **`/Users/zack/Desktop/openclaw-cn-ds/src/agents/system-prompt.ts`** - 主构建函数
  - `buildAgentSystemPrompt()` - 构建完整的 system prompt
  - 接受大量参数：workspaceDir, tools, skills, timezone, sandboxInfo 等
  - 返回动态生成的 system prompt 字符串

### 2. System Prompt 的构成

从代码分析，system prompt 包含以下部分：

```typescript
// 基础身份
"You are a personal assistant running inside Clawdbot."

// 然后动态添加多个部分：
- ## Tooling - 工具列表
- ## Tool Call Style - 工具调用风格
- ## Clawdbot CLI Quick Reference - CLI 快速参考
- ## Skills (mandatory) - 技能提示（如果有）
- ## Memory Recall - 记忆检索（如果有 memory 工具）
- ## Clawdbot Self-Update - 自更新指南
- ## Model Aliases - 模型别名
- ## Workspace - 工作目录
- ## Documentation - 文档路径
- ## Sandbox - 沙盒信息（如果有）
- ## User Identity - 用户身份
- ## Current Date & Time - 时间信息
- ## Workspace Files (injected) - 注入的工作区文件
- ## Reply Tags - 回复标签
- ## Messaging - 消息传递
- ## Voice (TTS) - 语音提示
- ## Reactions - 反应指导
- ## Reasoning Format - 推理格式
- ## Project Context - 项目上下文
- ## Silent Replies - 静默回复
- ## Heartbeats - 心跳检测
- ## Runtime - 运行时信息
```

### 3. PromptMode 三种模式

- **"full"** - 完整模式（默认）：包含所有部分
- **"minimal"** - 精简模式（子 agent）：只保留核心部分
- **"none"** - 无模式：只返回基础身份行

### 4. 关键发现

✅ **System Prompt 是动态构建的**
- 每次对话时根据当前状态重新生成
- 不保存到会话历史中
- 总是使用最新的配置和上下文

✅ **System Prompt 不持久化**
- 只在内存中使用
- 不写入 session 文件
- 每次对话都是全新构建

### 5. 与 Krebs 的对比

| 特性 | openclaw-cn-ds | Krebs (当前) |
|------|---------------|-------------|
| System prompt 构建 | ✅ 动态构建，每次都重新生成 | ✅ `buildSystemPrompt()` 简单版 |
| System prompt 持久化 | ❌ 不持久化，只内存使用 | ❌ 我们刚修复：不持久化 ✅ |
| 配置来源 | 代码参数 + 配置文件 | AgentConfig.systemPrompt |
| Skills 支持 | ✅ 动态注入 skills prompt | ✅ SkillsManager.buildSkillsPrompt() |
| 工具列表 | ✅ 动态生成工具描述 | ❓ 需要检查 |
| 模式切换 | ✅ full/minimal/none | ❓ 没有这个机制 |

### 6. 下一步探索

需要了解：
1. systemPrompt 变量如何传递给 LLM？
2. SessionManager 如何处理 system prompt？
3. 是否有 system prompt 版本管理？
