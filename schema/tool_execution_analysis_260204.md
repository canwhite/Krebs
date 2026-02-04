# Task: Tool/Builtin 执行机制分析

**任务ID**: tool_execution_analysis_260204
**创建时间**: 2026-02-04
**状态**: 已完成
**目标**: 理解 Krebs 项目中 LLM 如何实际执行技能和工具

## 最终目标
1. ✅ 完全理解 Tool/Builtin 执行机制
2. ✅ 分析 Agent 执行流程中的 tool calls 处理
3. ✅ 理解 Skills 与 Tools 的关系
4. ✅ 提供关键代码片段和执行流程说明

## 拆解步骤
### 1. 查找 Tool 相关的实现 ✅
- [x] 查找 src/agent/tools/ 目录下的文件
- [x] 分析 createBashTool, createReadTool 等实现
- [x] 查找 Tool 注册机制

### 2. 分析 Agent 执行流程 ✅
- [x] 查看 src/agent/core/agent.ts 中的执行逻辑
- [x] 查看 src/agent/core/orchestrator.ts 中的技能调度
- [x] 查找 tool calls 处理机制

### 3. 查找 Agent Session 实现和 tool calls 处理 ✅
- [x] 查找 agent session 相关文件
- [x] 分析 tool 结果反馈机制
- [x] 理解循环执行机制

### 4. 分析 Skills 与 Tools 的关系 ✅
- [x] 查看 skills 目录实现
- [x] 分析 LLM 如何触发工具执行
- [x] 查找技能系统与工具系统的配合

## 关键发现

### 1. 项目架构基础
**Krebs 使用的是 `@mariozechner/pi-coding-agent` 而不是 openclaw-cn-ds**

### 2. Tool 系统现状
- **简化实现**: src/agent/tools/ 中的工具都是占位符实现
- **未真正执行**: 没有实际的 bash、read 等工具执行能力
- **注册机制**: 通过 ToolRegistry 注册，但缺乏具体实现

### 3. Agent 执行流程
```
用户消息 → Orchestrator → Agent → LLM Provider → 响应
     ↓
技能检查 (旧系统) 直接执行
     ↓
无技能 → 注入 Skills Prompt → LLM 处理
```

### 4. Skills 系统 (基于 pi-coding-agent)
- **Skills 加载**: 从 SKILL.md 文件加载，包含 bash 命令示例
- **Prompt 注入**: 通过 SkillsManager 构建技能 prompt 注入到 LLM
- **热加载**: 支持 chokidar 监听文件变化
- **技能分类**: System, Research, Development 等分类

### 5. 关键问题
- **无实际工具执行**: Skills 只是提供 bash 命令示例，LLM 需要自行执行
- **缺乏 Tool Calls**: 没有类似 OpenAI 的 tool calling 机制
- **依赖外部**: 完全依赖 pi-coding-agent 的实现

## 技术栈和依赖
- **核心**: `@mariozechner/pi-coding-agent@^0.51.5`
- **技能系统**: 基于 pi-coding-agent 的 Skills 系统
- **工具系统**: 自定义的 ToolRegistry（简化版）
- **执行模式**: LLM Prompt 注入，而非真正的 Tool Calling

## 结论
Krebs 是一个基于 pi-coding-agent 的框架，Skills 系统通过 Prompt 注入的方式让 LLM 知道可用的技能和命令，但**没有实际的工具执行机制**。真正的工具执行需要 LLM 自行执行 bash 命令或依赖外部的执行器。

