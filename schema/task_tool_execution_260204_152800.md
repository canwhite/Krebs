# Task: 实现完整的 Tool Calling 执行机制

**任务ID**: task_tool_execution_260204_152800
**创建时间**: 2026-02-04 15:28:00
**状态**: 进行中

## 问题分析

### 当前问题
用户测试发现：当问"帮我搜索百度"时，AI 回复说无法搜索，虽然 Skills 已加载但 LLM 无法真正执行命令。

**根本原因**：
1. ❌ Skills 只是作为文本注入到 prompt（LLM 看到了命令但无法执行）
2. ❌ 缺少真正的 Tool Calling 机制
3. ❌ 没有工具执行循环（LLM → Tool Call → 执行 → 结果 → LLM）

### openclaw-cn-ds 的解决方案
1. ✅ 使用 Anthropic/OpenAI 的 Tool Calling API
2. ✅ 工具注册系统（bash, read, write 等）
3. ✅ 循环执行机制
4. ✅ 工具结果反馈给 LLM

## 目标

实现完整的 Tool Calling 执行机制，让 LLM 能够真正执行命令和工具。

## 技术方案

### 方案 1: 使用 Anthropic Tool Calling API（推荐）

**优点**：
- ✅ 原生支持，官方实现
- ✅ 自动处理 tool calling 流程
- ✅ 支持并行 tool calls

**实现步骤**：
1. 在 Provider 层添加 tool calling 支持
2. 定义工具 schema（bash, read, write）
3. 在 Agent 中实现循环执行逻辑
4. 工具执行器（实际执行 bash/read/write）

### 方案 2: 简化版（手动解析）

**优点**：
- ✅ 不依赖特定的 tool calling API
- ✅ 更灵活的控制

**缺点**：
- ❌ 需要手动解析 LLM 输出
- ❌ 不够可靠

## 实施计划

### Phase 1: Tool Calling 基础设施
- [ ] 1.1 定义 Tool Schema（TypeScript 接口）
- [ ] 1.2 在 Anthropic Provider 中添加 tools 参数
- [ ] 1.3 在 OpenAI Provider 中添加 tools 参数
- [ ] 1.4 定义基础工具（bash, read, write）

### Phase 2: 工具执行器
- [ ] 2.1 实现 BashTool（执行 shell 命令）
- [ ] 2.2 实现 ReadTool（读取文件）
- [ ] 2.3 实现 WriteTool（写入文件）
- [ ] 2.4 工具注册表（ToolRegistry）

### Phase 3: 循环执行逻辑
- [ ] 3.1 修改 Agent.process() 支持多轮对话
- [ ] 3.2 检测 tool_calls 响应
- [ ] 3.3 执行工具并收集结果
- [ ] 3.4 将工具结果反馈给 LLM
- [ ] 3.5 循环直到没有 tool_calls

### Phase 4: 集成和测试
- [ ] 4.1 更新 Orchestrator
- [ ] 4.2 更新 AgentManager
- [ ] 4.3 测试 bash 命令执行
- [ ] 4.4 测试文件读写
- [ ] 4.5 测试多轮工具调用

## 工具定义示例

### Bash Tool
```typescript
const bashTool = {
  name: "bash",
  description: "Execute a bash shell command and return the output",
  inputSchema: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "The bash command to execute"
      }
    },
    required: ["command"]
  }
};
```

### Read Tool
```typescript
const readTool = {
  name: "read_file",
  description: "Read the contents of a file",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "The path to the file to read"
      }
    },
    required: ["path"]
  }
};
```

## 执行流程

```
用户消息: "帮我搜索百度"
    ↓
Agent + Tools → LLM
    ↓
LLM 返回 tool_calls: [{name: "bash", args: {command: "curl https://baidu.com"}}]
    ↓
执行 BashTool
    ↓
获取结果: "<html>...</html>"
    ↓
将结果反馈给 LLM
    ↓
LLM 生成最终回复: "根据搜索结果..."
    ↓
返回给用户
```

## 参考代码（openclaw-cn-ds）

关键文件：
- `src/agents/pi-embedded-runner/run/attempt.ts` - 循环执行逻辑
- `src/core/sdk.ts` - 工具定义（createBashTool, createReadTool）
- `src/core/agent-session.ts` - Session 管理

## 下一步

开始实现 Phase 1: Tool Calling 基础设施
