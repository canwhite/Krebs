# Tools 和 Skills 调用流程完整解析

> 本文档详细说明 Krebs 项目中 Tools 和 Skills 从 System Prompt 开始被调用的完整流程

## 目录

- [Tools 调用流程](#tools-调用流程)
- [Skills 调用流程（新系统）](#skills-调用流程新系统)
- [禁用技能的流程](#禁用技能的流程)
- [核心区别总结](#核心区别总结)

---

## Tools 调用流程

### 1. 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Tool Calling 完整流程                          │
└─────────────────────────────────────────────────────────────────────┘

用户输入: "帮我读取 package.json 文件"
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  1. 构建 System Prompt                                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Agent.buildSystemPrompt()                                │  │
│  │  src/agent/core/agent.ts:488                              │  │
│  │                                                            │  │
│  │  调用 buildAgentSystemPrompt({                            │  │
│  │    tools: [                                               │  │
│  │      { name: "read_file", description: "..." },           │  │
│  │      { name: "write_file", description: "..." },          │  │
│  │      { name: "bash", description: "..." }                 │  │
│  │    ],                                                     │  │
│  │    toolConfig: { maxIterations: 10 }                      │  │
│  │  })                                                       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  2. System Prompt 内容（包含工具列表）                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ## Available Tools                                       │  │
│  │                                                           │  │
│  │  You have access to the following tools:                  │  │
│  │                                                           │  │
│  │  - `read_file`: 读取文件内容                              │  │
│  │  - `write_file`: 写入文件                                 │  │
│  │  - `bash`: 执行 shell 命令                                │  │
│  │                                                           │  │
│  │  ## Tool Calling Guidelines                              │  │
│  │  1. Choose the right tool                                │  │
│  │  2. Provide accurate parameters                          │  │
│  │  3. Maximum iterations: 10                               │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  3. 调用 LLM（带 System Prompt + 用户消息）                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Agent.process()                                          │  │
│  │  src/agent/core/agent.ts:157                              │  │
│  │                                                            │  │
│  │  const response = await this.deps.provider.complete({    │  │
│  │    systemPrompt: this.buildSystemPrompt(),  // 包含工具   │  │
│  │    messages: [{ role: "user", content: userMessage }]    │  │
│  │  })                                                       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  4. LLM 返回 Tool Calls                                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  {                                                        │  │
│  │    content: [                                             │  │
│  │      {                                                    │  │
│  │        type: "tool_use",                                  │  │
│  │        name: "read_file",                                 │  │
│  │        input: { path: "package.json" }                    │  │
│  │      }                                                    │  │
│  │    ]                                                      │  │
│  │  }                                                        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  5. 执行工具调用                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  executeToolCalls()                                       │  │
│  │  src/agent/core/agent.ts:183                              │  │
│  │                                                            │  │
│  │  for (const toolCall of toolCalls) {                      │  │
│  │    const tool = this.findTool(toolCall.name);             │  │
│  │    const result = await tool.handler(toolCall.input);     │  │
│  │    results.push(result);                                  │  │
│  │  }                                                        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  6. 工具执行结果                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  {                                                        │  │
│  │    tool: "read_file",                                     │  │
│  │    result: "{                                            │  │
│  │      \"name\": \"krebs\",                                 │  │
│  │      \"version\": \"1.0.0\"                               │  │
│  │    }"                                                      │  │
│  │  }                                                        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  7. 将结果返回给 LLM 继续处理                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  第二轮 LLM 调用，带着工具结果                              │  │
│  │  LLM 基于结果生成最终回复                                   │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 2. 核心代码展示

#### Step 1: 构建 System Prompt

```typescript
// src/agent/core/agent.ts:488-531
private buildSystemPrompt(): string {
  const sysPromptConfig: SystemPromptConfig = {
    promptMode: this.config.systemPromptMode || "full",
    basePrompt: this.config.systemPrompt,
    tools: this.deps.tools,  // ✅ 传入工具列表
    toolConfig: this.deps.toolConfig,
    // ...
  };

  return buildAgentSystemPrompt(sysPromptConfig);
}
```

#### Step 2: 格式化工具列表

```typescript
// src/agent/core/system-prompt.ts:153-168
function buildToolsSection(tools: Tool[]): string {
  const toolList = tools
    .map(tool => `- \`${tool.name}\`: ${tool.description}`)
    .join("\n");

  return `## Available Tools

You have access to the following tools:

${toolList}

Use these tools to accomplish tasks...`;
}
```

#### Step 3: 调用 LLM

```typescript
// src/agent/core/agent.ts:157-191
async process(userMessage: string, sessionId: string): Promise<AgentResult> {
  const response = await this.deps.provider.complete({
    systemPrompt: this.buildSystemPrompt(),  // ✅ 包含工具列表
    messages: [{ role: "user", content: userMessage }],
    maxTokens: this.config.maxTokens,
    temperature: this.config.temperature,
  });

  // 检查是否有 tool_calls
  if (response.content && Array.isArray(response.content)) {
    const toolCalls = response.content.filter(
      (item: any) => item.type === "tool_use"
    );

    if (toolCalls.length > 0) {
      return await this.executeToolCalls(toolCalls, sessionId);
    }
  }

  return { response: response.content, success: true };
}
```

#### Step 4: 执行工具调用

```typescript
// src/agent/core/agent.ts:183-226
private async executeToolCalls(
  toolCalls: any[],
  sessionId: string
): Promise<AgentResult> {
  const results: any[] = [];

  for (const toolCall of toolCalls) {
    const tool = this.findTool(toolCall.name);
    if (!tool) {
      results.push({
        tool: toolCall.name,
        error: `Tool not found: ${toolCall.name}`
      });
      continue;
    }

    try {
      const result = await tool.handler(toolCall.input);
      results.push({
        tool: toolCall.name,
        result
      });
    } catch (error) {
      results.push({
        tool: toolCall.name,
        error: String(error)
      });
    }
  }

  // ✅ 将结果返回给 LLM 继续处理
  return await this.continueWithToolResults(results, sessionId);
}
```

---

## Skills 调用流程（新系统）

### 1. 整体架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Skills 调用流程（新系统）                          │
└─────────────────────────────────────────────────────────────────────┘

用户输入: "帮我创建一个 GitHub PR"
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  1. 加载 SkillsManager（启动时）                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  src/index.ts:158-159                                      │  │
│  │                                                            │  │
│  │  const skillsManager = createDefaultSkillsManager();      │  │
│  │  await skillsManager.loadSkills();                        │  │
│  │                                                            │  │
│  │  ✅ 加载 3 个技能:                                         │  │
│  │     - Filesystem (enabled: true)                          │  │
│  │     - GitHub (enabled: true)                              │  │
│  │     - WebSearch (enabled: true)                           │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  2. 构建 System Prompt（包含 Skills）                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Agent.buildSystemPrompt()                                │  │
│  │  src/agent/core/agent.ts:488-531                          │  │
│  │                                                            │  │
│  │  if (this.deps.skillsManager) {                           │  │
│  │    skills = this.deps.skillsManager.getSkills();  // ✅   │  │
│  │  }                                                        │  │
│  │                                                            │  │
│  │  buildAgentSystemPrompt({                                 │  │
│  │    skills: [                                              │  │
│  │      {                                                     │  │
│  │        name: "GitHub",                                    │  │
│  │        description: "使用 gh CLI 与 GitHub 交互..."       │  │
│  │      },                                                   │  │
│  │      { name: "Filesystem", ... },                          │  │
│  │      { name: "WebSearch", ... }                            │  │
│  │    ]                                                       │  │
│  │  })                                                       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  3. System Prompt 内容（包含技能信息）                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ## Skills (Available)                                    │  │
│  │                                                           │  │
│  │  You have access to the following specialized skills:     │  │
│  │                                                           │  │
│  │  - `github`: 使用 gh CLI 与 GitHub 交互                   │  │
│  │    支持 issues、PRs、CI runs 和高级查询                     │  │
│  │  - `filesystem`: 文件系统操作技能                          │  │
│  │    支持读取、写入、搜索文件和目录                            │  │
│  │  - `websearch`: 网络搜索技能                               │  │
│  │    使用各种工具搜索网络、获取网页内容                        │  │
│  │                                                           │  │
│  │  These skills provide additional capabilities.            │  │
│  │  Use them when relevant to the task.                      │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  4. 调用 LLM（带 System Prompt + 用户消息）                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Orchestrator.process()                                   │  │
│  │  └─> Agent.process()                                      │  │
│  │                                                            │  │
│  │  const response = await this.deps.provider.complete({    │  │
│  │    systemPrompt: this.buildSystemPrompt(),  // ✅ 包含技能 │  │
│  │    messages: [{ role: "user", content: userMessage }]    │  │
│  │  })                                                       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  5. LLM 自主判断并返回建议                                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  LLM 看到了技能信息，知道有 GitHub skill 可用               │  │
│  │                                                            │  │
│  │  返回回复:                                                 │  │
│  │  "我可以帮你使用 GitHub skill 创建 PR。                     │  │
│  │   请提供以下信息:                                          │  │
│  │   - PR 标题                                                │  │
│  │   - PR 描述                                                │  │
│  │   - 目标分支"                                              │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  6. LLM 决定使用 bash tool 执行 gh 命令                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  LLM 可以自主决定:                                        │  │
│  │  1. 建议用户使用 gh CLI 命令                               │  │
│  │  2. 或者直接调用 bash tool 执行 gh 命令                    │  │
│  │                                                            │  │
│  │  例如:                                                    │  │
│  │  tool_use: bash                                           │  │
│  │  input: {                                                 │  │
│  │    command: "gh pr create --title 'Fix bug' ..."          │  │
│  │  }                                                        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### 2. 核心代码展示

#### Step 1: 初始化 SkillsManager

```typescript
// src/index.ts:158-159
const skillsManager = createDefaultSkillsManager();
await skillsManager.loadSkills();  // ✅ 加载 SKILL.md 文件

// ✅ 传递给 AgentManager
const agentManager = new AgentManager({
  // ...
}, {
  provider: provider!,
  storage: sessionStorage,
  skillsManager,  // ✅ 注入 SkillsManager
});
```

#### Step 2: SkillsManager 加载技能

```typescript
// src/agent/skills/skills-manager.ts:56-77
async loadSkills(): Promise<void> {
  // 从 /skills/bundled/ 加载
  const entries = this.loader.loadFromDir(
    this.config.bundledSkillsDir,
    "bundled"
  );

  // 构建快照
  this.version++;
  this.snapshot = this.loader.buildSnapshot(entries, this.version);

  logger.info(`Loaded ${this.snapshot.count} skills`);
}
```

#### Step 3: 获取启用的技能

```typescript
// src/agent/skills/skills-manager.ts:117-145
getSkills(): Array<{ name: string; description: string; prompt?: string }> {
  if (!this.snapshot) {
    return [];
  }

  // ✅ 只返回启用的技能（enabled !== false）
  const enabledSkills = this.snapshot.skills.filter(
    (entry) => entry.enabled !== false
  );

  // 转换为 Agent 期望的格式
  return enabledSkills.map((entry) => {
    const prompt =
      (entry.skill as any).prompt ||
      (entry.skill as any).instructions ||
      (entry.skill as any).content ||
      (entry.skill as any).body ||
      undefined;

    return {
      name: entry.skill.name,
      description: entry.frontmatter?.description ||
                   entry.skill.description || "",
      prompt  // 可选的详细说明
    };
  });
}
```

#### Step 4: Agent 构建 System Prompt

```typescript
// src/agent/core/agent.ts:488-531
private buildSystemPrompt(): string {
  let skills: Array<{ name: string; description: string; prompt?: string }> = [];

  if (this.deps.skillsManager) {
    // ✅ 从 SkillsManager 获取启用的技能
    skills = this.deps.skillsManager.getSkills();
  }

  const sysPromptConfig: SystemPromptConfig = {
    promptMode: this.config.systemPromptMode || "full",
    basePrompt: this.config.systemPrompt,
    tools: this.deps.tools,
    toolConfig: this.deps.toolConfig,
    skills: skills.length > 0 ? skills : undefined,  // ✅ 注入技能
    // ...
  };

  return buildAgentSystemPrompt(sysPromptConfig);
}
```

#### Step 5: 格式化技能信息

```typescript
// src/agent/core/system-prompt.ts:173-191
function buildSkillsSection(
  skills: Array<{ name: string; description: string; prompt?: string }>
): string {
  const skillList = skills.map(skill => {
    let desc = `- \`${skill.name}\`: ${skill.description}`;
    if (skill.prompt) {
      desc += `\n  ${skill.prompt}`;
    }
    return desc;
  }).join("\n");

  return `## Skills (Available)

You have access to the following specialized skills:

${skillList}

These skills provide additional capabilities. Use them when relevant to the task.`;
}
```

---

## 禁用技能的流程

```
用户在前端点击"禁用" GitHub 技能
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  1. 前端发送 PATCH 请求                                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  PATCH /api/skills/GitHub                                 │  │
│  │  { "enabled": false }                                     │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  2. HTTP Server 处理                                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  handleToggleSkill("GitHub", false)                       │  │
│  │  src/gateway/server/http-server.ts:332-359                │  │
│  │                                                            │  │
│  │  const skillsManager = this.agentManager                  │  │
│  │    .getSkillsManager();                                   │  │
│  │                                                            │  │
│  │  if (skillsManager) {                                     │  │
│  │    skillsManager.disableSkill("GitHub");  // ✅ 禁用     │  │
│  │  }                                                        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  3. SkillsManager 更新状态                                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  src/agent/skills/skills-manager.ts:166-179               │  │
│  │                                                            │  │
│  │  disableSkill(name: string): boolean {                    │  │
│  │    const skill = this.getSkillByName(name);               │  │
│  │    if (!skill) return false;                              │  │
│  │                                                            │  │
│  │    skill.enabled = false;  // ✅ 标记为禁用               │  │
│  │    this.updateSnapshot();  // ✅ 更新快照                 │  │
│  │    return true;                                           │  │
│  │  }                                                        │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  4. 下次 Agent 调用时                                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  getSkills() 方法会过滤掉禁用的技能                         │  │
│  │                                                            │  │
│  │  const enabledSkills = this.snapshot.skills.filter(       │  │
│  │    (entry) => entry.enabled !== false  // ✅ 过滤         │  │
│  │  );                                                       │  │
│  │                                                            │  │
│  │  结果: 只返回 Filesystem 和 WebSearch                     │  │
│  │  GitHub 不会被包含在 System Prompt 中                     │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
      │
      ▼
┌──────────────────────────────────────────────────────────────────┐
│  5. LLM 看到的 System Prompt                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  ## Skills (Available)                                    │  │
│  │                                                           │  │
│  │  - `filesystem`: 文件系统操作技能                          │  │
│  │  - `websearch`: 网络搜索技能                               │  │
│  │                                                           │  │
│  │  ✅ GitHub 技能不在列表中！                                 │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 核心区别总结

| 维度 | Tools（工具调用） | Skills（技能，新系统） |
|------|-------------------|---------------------|
| **触发方式** | LLM 返回 `tool_use` | LLM 在 System Prompt 中看到技能描述 |
| **执行方式** | Agent 直接执行 `tool.handler()` | LLM 建议使用或通过 bash 执行 |
| **结构化输出** | ✅ 是（JSON 格式） | ❌ 否（自然语言建议） |
| **参数传递** | ✅ 精确（input 对象） | ❌ 模糊（建议中说明） |
| **迭代支持** | ✅ 是（maxIterations） | ❌ 否（一次性建议） |
| **禁用机制** | ❌ 无 | ✅ 支持（enabled 字段） |
| **加载方式** | 代码注册 | SKILL.md 文件 |
| **System Prompt** | 包含工具列表和使用指南 | 包含技能描述和说明 |

### 调用流程对比

**Tools 调用**：
1. System Prompt 包含工具列表
2. LLM 返回结构化的 `tool_use`
3. Agent 执行 `tool.handler()`
4. 将结果返回给 LLM
5. 支持多轮迭代（maxIterations）

**Skills 调用**（新系统）：
1. SkillsManager 从 SKILL.md 加载技能
2. `getSkills()` 只返回启用的技能
3. System Prompt 包含技能描述
4. LLM 看到技能信息，自主决定如何使用
5. 可能通过 Tools（如 bash）执行技能相关命令
6. 不支持迭代，一次性建议

### 设计理念

- **Tools**: 精确、可控、结构化的工具调用，适合需要确定输入输出的操作
- **Skills**: 灵活、描述性的能力说明，通过 LLM 的理解自主判断使用场景

---

## 总结

Krebs 项目采用了**双系统架构**：

1. **Tools 系统**：基于 Tool Calling 的结构化工具调用
2. **Skills 系统**：基于 System Prompt 的能力描述

两者通过统一的 `buildAgentSystemPrompt()` 机制集成，为 LLM 提供完整的上下文信息，使其能够自主选择最合适的方式完成任务。
