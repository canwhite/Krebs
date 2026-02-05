# Prompt 诊断报告：WebSearch 工具失效问题

**任务ID**: task_prompt_diagnosis_260205_212945
**创建时间**: 2026-02-05
**问题**: AI声称无法搜索网络，但实际应该有WebSearch能力

---

## 🔴 问题根因

### 核心问题：工具声明（Function Declarations）缺失

您提取的 prompt **只包含文本指令，缺少工具声明部分**。

---

## 📋 完整的系统提示结构

```
┌─────────────────────────────────────────────────┐
│ 完整的 Claude Code 系统提示 =                    │
├─────────────────────────────────────────────────┤
│ 1. 系统介绍文本                                  │
│    "You are Claude Code, Anthropic's CLI..."   │
├─────────────────────────────────────────────────┤
│ 2. ⭐ 工具声明 <functions> (关键！)              │
│    {                                            │
│      "name": "WebSearch",                       │
│      "parameters": {...}                        │
│    },                                           │
│    {                                            │
│      "name": "Bash",                            │
│      "parameters": {...}                        │
│    },                                           │
│    ... (20+ 工具)                               │
├─────────────────────────────────────────────────┤
│ 3. 用户自定义指令 (您提取的 CLAUDE.md)           │
│    "# Claude Code 执行协议..."                  │
├─────────────────────────────────────────────────┤
│ 4. 环境信息 <env>                               │
│    Working directory: /path/to/project         │
│    Platform: darwin                             │
└─────────────────────────────────────────────────┘
```

---

## ❌ 您可能提取的内容

```markdown
# 只有这部分（来自 CLAUDE.md）

## 核心行为准则
1. **先文档后执行**
2. **强制刷新**
3. **文件驱动**

## 协议详细定义
...
```

**问题**：AI **不知道自己有 WebSearch 工具**，因为工具声明被遗漏了！

---

## ✅ 正确的提取方法

### 方法1：提取完整系统提示

如果使用 Claude Code 官方 CLI，可以这样获取：

```bash
# 在 Claude Code 会话中
# 无法直接导出，但可以手动记录关键部分
```

### 方法2：手动补充工具声明

在您提取的 prompt **开头**添加：

```yaml
---
tools:
  - name: WebSearch
    description: Search the web for recent information
    parameters:
      query: {type: string, required: true}

  - name: Bash
    description: Execute bash commands
    parameters:
      command: {type: string, required: true}

  - name: Read
  - name: Write
  - name: Edit
  - name: TodoWrite
  # ... 其他工具
---
```

### 方法3：使用 API 格式

如果通过 API 调用，需要这样传递：

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "tools": [
    {
      "name": "WebSearch",
      "description": "Search the web...",
      "input_schema": {
        "type": "object",
        "properties": {
          "query": {"type": "string", "minLength": 2}
        },
        "required": ["query"]
      }
    }
    // ... 其他工具
  ],
  "system": "您提取的 CLAUDE.md 内容..."
}
```

---

## 🔧 具体修复步骤

### 步骤1：确认您的使用场景

请告诉我：

1. **您是如何使用这个 prompt 的？**
   - [ ] 通过 Anthropic API 直接调用
   - [ ] 通过其他 AI 平台（如 OpenAI、Gemini）
   - [ ] 通过自定义 AI 代理框架
   - [ ] 其他：__________

2. **您当前传递给 AI 的内容是什么？**
   - 是否包含了工具定义？
   - 使用的是什么格式（JSON/文本/YAML）？

### 步骤2：根据场景修复

#### 场景A：使用 Anthropic API

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-sonnet-4-5-20250929",
    tools=[  # ⭐ 关键：必须声明工具
        {
            "name": "WebSearch",
            "description": "Search the web for recent information",
            "input_schema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "minLength": 2}
                },
                "required": ["query"]
            }
        }
        # ... 其他工具
    ],
    system="""您提取的 CLAUDE.md 内容...""",
    messages=[{"role": "user", "content": "START: 搜索AI新闻"}]
)
```

#### 场景B：使用其他平台（无工具支持）

**问题**：如果平台不支持 function calling，AI 无法执行工具。

**解决方案**：
1. 在 prompt 中明确说明可以使用"模拟搜索"
2. 或者改用支持工具的平台（如 Anthropic API、OpenAI GPT-4）

---

## 📊 诊断总结

| 维度 | 状态 | 说明 |
|------|------|------|
| **文本指令** | ✅ 完整 | CLAUDE.md 内容正确提取 |
| **工具声明** | ❌ **缺失** | 核心问题所在 |
| **环境信息** | ⚠️ 可能缺失 | 视使用场景而定 |
| **API 格式** | ❓ 未知 | 需要您提供更多信息 |

---

## 🎯 下一步行动

请回答以下问题，我帮您生成完整的修复方案：

1. **您使用的是什么平台/框架？**
   - Anthropic API
   - OpenAI API
   - LangChain
   - 自建框架
   - 其他：__________

2. **您想要实现什么功能？**
   - 只是需要搜索功能
   - 需要完整的工具调用能力（文件操作、命令执行等）
   - 其他：__________

3. **您当前的代码片段（如果有的话）**

---

## 📝 参考信息

### Claude Code 完整工具列表

当前会话中可用的工具包括：
1. **Task** - 启动子代理
2. **Bash** - 执行命令
3. **Glob** - 文件搜索
4. **Grep** - 内容搜索
5. **Read** - 读取文件
6. **Write** - 写入文件
7. **Edit** - 编辑文件
8. **NotebookEdit** - 编辑 Jupyter
9. **TodoWrite** - 任务管理
10. **WebSearch** - **网络搜索（本次问题的焦点）**
11. **WebFetch/webReader** - 网页获取
12. **AskUserQuestion** - 向用户提问
13. **SlashCommand** - 执行斜杠命令
14. **Skill** - 执行技能
15. **EnterPlanMode** - 进入计划模式
16. **ExitPlanMode** - 退出计划模式
17. **4.5v_mcp__analyze_image** - 图像分析
18. **BashOutput** - 获取命令输出
19. **KillShell** - 终止命令

### 关键差异

| 组件 | 提取状态 | 实际需要 |
|------|----------|----------|
| 系统介绍文本 | ✅ | ✅ |
| 工具声明 | ❌ **缺失** | ⭐ **必须** |
| 用户指令 (CLAUDE.md) | ✅ | ✅ |
| 环境信息 | ⚠️ | 视场景而定 |

---

## 🎯 正确的架构方案

用户指出的问题非常关键！工具声明配置**不应该是每次 case by case 生成**，而应该作为项目基础设施统一管理。

### ✅ Krebs 项目已有基础

Krebs 已经有完善的工具系统：

```
src/agent/tools/
├── types.ts         # Tool 接口定义
├── registry.ts      # 工具注册表
├── builtin.ts       # 内置工具（bash、read、write）
└── index.ts
```

**工具定义示例**：
```typescript
export const bashTool: Tool = {
  name: "bash",
  description: "Execute a bash shell command...",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "..." },
      cwd: { type: "string", description: "..." },
    },
    required: ["command"],
  },
  async execute(params) { ... }
};
```

### 🏗️ 推荐的统一架构

```
Krebs/
├── src/agent/tools/           # 已有：平台无关的工具定义
│   ├── types.ts
│   ├── registry.ts
│   └── builtin.ts
│
├── config/tools/              # 新增：各平台的工具声明配置
│   ├── deepseek.json         # DeepSeek 格式
│   ├── openai.json           # OpenAI 格式
│   ├── anthropic.json        # Anthropic 格式
│   └── schema.json           # 通用 schema 定义
│
└── src/agent/adapters/        # 新增：平台适配器
    ├── tool-adapter.ts       # 通用适配器接口
    ├── deepseek-adapter.ts   # 转换为 DeepSeek 格式
    ├── openai-adapter.ts     # 转换为 OpenAI 格式
    └── anthropic-adapter.ts  # 转换为 Anthropic 格式
```

### 📝 config/tools/deepseek.json 示例

```json
{
  "platform": "deepseek",
  "format": "openai-compatible",
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "bash",
        "description": "Execute a bash shell command...",
        "parameters": {
          "type": "object",
          "properties": {
            "command": {
              "type": "string",
              "description": "The bash command to execute"
            },
            "cwd": {
              "type": "string",
              "description": "Working directory (optional)"
            }
          },
          "required": ["command"]
        }
      }
    }
  ]
}
```

### 🔧 使用方式

```typescript
import { deepseekAdapter } from '@/agent/adapters/deepseek-adapter.js';
import { getBuiltinTools } from '@/agent/tools/builtin.js';

// 自动生成 DeepSeek 格式的工具声明
const tools = getBuiltinTools();
const deepseekTools = deepseekAdapter.adapt(tools);

// 直接用于 API 调用
const response = await deepseek.chat.completions.create({
  model: "deepseek-chat",
  messages: [...],
  tools: deepseekTools  // ✅ 已经是正确格式
});
```

### 🎯 核心优势

1. **单一真实源（SSOT）**：工具只在 `src/agent/tools/` 定义一次
2. **自动化转换**：适配器自动转换为各平台格式
3. **类型安全**：TypeScript 保证类型一致性
4. **易于扩展**：新增工具或平台都很容易
5. **不再 case by case**：统一的生成流程

---

## ✅ 解决方案已实现

基于 openclaw-cn-ds 架构，已经为 Krebs 实现了完整的工具系统！

### 已创建的核心文件

1. **工具策略系统** (`src/agent/tools/`)
   - `groups.ts` - 工具分组
   - `policy.ts` - allow/deny 策略
   - `profiles.ts` - 配置文件

2. **平台适配器** (`src/agent/tools/adapters/`)
   - `deepseek.ts` - DeepSeek 适配器 ✅
   - `openai.ts` - OpenAI 适配器 ✅
   - `anthropic.ts` - Anthropic 适配器 ✅
   - `base.ts` - 适配器基类 ✅

3. **配置文件** (`config/tools/`)
   - `deepseek.example.json` - DeepSeek 配置示例 ✅

4. **文档** (`docs/`)
   - `TOOLS_SYSTEM.md` - 完整使用指南 ✅

### 使用方法

```typescript
import { getBuiltinTools, resolveToolPolicy, filterToolsByPolicy } from '@/agent/tools/index.js';
import { adaptToolsForDeepSeek } from '@/agent/tools/adapters/deepseek.js';

// 1. 获取工具
const allTools = getBuiltinTools();

// 2. 应用策略
const policy = resolveToolPolicy('coding');
const filteredTools = filterToolsByPolicy(allTools, policy);

// 3. 平台适配
const deepseekTools = adaptToolsForDeepSeek(filteredTools);

// 4. 传递给 LLM
await deepseek.chat.completions.create({
  model: "deepseek-chat",
  messages: [...],
  tools: deepseekTools  // ✅ 正确的 DeepSeek 格式
});
```

### 详细文档

参见：
- **使用指南**: `docs/TOOLS_SYSTEM.md`
- **完成总结**: `schema/task_tools_integration_260205_214500_completed.md`

---

**最终结论**：
1. ✅ 问题已解决 - 工具声明不再需要每次手动生成
2. ✅ 平台适配器已实现 - 支持所有主流平台
3. ✅ 工具策略系统已完成 - allow/deny、分组、配置文件
4. ✅ 文档齐全 - 可立即使用
