# System Prompt 增强改造总结

> **改造时间**: 2026-02-19
> **参考项目**: openclaw-cn-ds
> **改造范围**: System Prompt 构建器完整增强
> **状态**: ✅ Phase 1 + Phase 2 已完成

---

## 📋 目录

- [改造背景](#改造背景)
- [Phase 1: 核心改进](#phase-1-核心改进)
- [Phase 2: 增强功能](#phase-2-增强功能)
- [架构设计](#架构设计)
- [测试覆盖](#测试覆盖)
- [使用指南](#使用指南)
- [性能影响](#性能影响)
- [未来规划](#未来规划)

---

## 改造背景

### 问题分析

在对比分析 openclaw-cn-ds 项目的 system prompt 机制后，发现 Krebs 当前的实现存在以下不足：

1. **工具系统简陋**
   - 工具无优先级排序
   - 无核心工具标准摘要
   - 大小写敏感，容易重复

2. **缺少关键 Section**
   - 无工具调用风格指导
   - 无记忆检索指导
   - 无上下文文件支持

3. **运行时信息不足**
   - 无法检测项目根目录
   - 缺少频道和能力信息

### 改造目标

参考 openclaw-cn-ds 的成熟设计，在保持 Krebs 简洁性的前提下：

- ✅ 增强工具系统智能化
- ✅ 新增关键 prompt sections
- ✅ 支持上下文文件集成
- ✅ 提供完整测试覆盖

---

## Phase 1: 核心改进

### 1.1 增强 Tool System

#### 核心工具摘要

为 14 个常用工具提供标准描述，确保一致性：

```typescript
const CORE_TOOL_SUMMARIES: Record<string, string> = {
  read: "Read file contents",
  write: "Create or overwrite files",
  edit: "Make precise edits to files",
  apply_patch: "Apply multi-file patches",
  grep: "Search file contents for patterns",
  find: "Find files by glob pattern",
  ls: "List directory contents",
  exec: "Run shell commands",
  process: "Manage background exec sessions",
  web_search: "Search the web",
  web_fetch: "Fetch and extract readable content from a URL",
  memory_search: "Search long-term memory",
  memory_save: "Save important information to memory",
  memory_stats: "Get memory statistics",
};
```

#### 工具优先级排序

```typescript
const TOOL_ORDER = [
  "read", "write", "edit", "apply_patch",
  "grep", "find", "ls", "exec", "process",
  "web_search", "web_fetch",
  "memory_search", "memory_save", "memory_stats",
];
```

**价值**：常用工具优先显示，提升查找效率。

#### 大小写不敏感解析

```typescript
// 解析工具名（大小写不敏感）
const resolveToolName = (normalized: string) =>
  canonicalByNormalized.get(normalized) ?? normalized;

// 工具去重（大小写不敏感）
const canonicalByNormalized = new Map<string, string>();
for (const tool of tools) {
  const normalized = tool.name.toLowerCase();
  if (!canonicalByNormalized.has(normalized)) {
    canonicalByNormalized.set(normalized, tool.name);
  }
}
```

**价值**：支持 "Read"、"READ"、"read" 统一处理，避免重复。

---

### 1.2 新增 Tool Call Style Section

```
## Tool Call Style

Default: do not narrate routine, low-risk tool calls (just call the tool).
Narrate only when it helps:
- Multi-step work
- Complex/challenging problems
- Sensitive actions (e.g., deletions)
- When the user explicitly asks

Keep narration brief and value-dense; avoid repeating obvious steps.
Use plain human language for narration unless in a technical context.
```

**价值**：
- 明确指导 Agent 何时叙述工具调用
- 避免啰嗦的"正在读取文件..."等无意义叙述
- 提升用户体验

---

### 1.3 新增 Memory Recall Section

```
## Memory Recall

Before answering anything about prior work, decisions, dates, people, preferences, or todos:
1. Run memory_search on MEMORY.md + memory/*.md
2. Use memory_get to pull only the needed lines
3. If low confidence after search, say you checked

This helps maintain context across conversations and improves response accuracy.
```

**价值**：
- 指导 Agent 在回答前先搜索记忆
- 提供步骤化指导
- 帮助维护跨对话的上下文一致性

---

## Phase 2: 增强功能

### 2.1 上下文文件支持

#### ContextFile 接口

```typescript
export interface ContextFile {
  path: string;
  content: string;
}
```

#### 自动检测 SOUL.md

```typescript
function buildContextFilesSection(contextFiles: ContextFile[]): string {
  // 检查是否有 SOUL.md
  const hasSoulFile = contextFiles.some((file) => {
    const normalizedPath = file.path.trim().replace(/\\/g, "/");
    const baseName = normalizedPath.split("/").pop() ?? normalizedPath;
    return baseName.toLowerCase() === "soul.md";
  });

  if (hasSoulFile) {
    lines.push(
      "If SOUL.md is present, embody its persona and tone.",
      "Avoid stiff, generic replies; follow its guidance."
    );
  }
}
```

#### 生成 Project Context

```
# Project Context

The following project context files have been loaded:

If SOUL.md is present, embody its persona and tone.
Avoid stiff, generic replies; follow its guidance.

## SOUL.md

# Persona
You are a friendly, helpful assistant who loves to code.

## TOOLS.md

# Available Tools
Custom tool definitions here.
```

**价值**：
- Agent 可以"阅读"项目文档（SOUL.md, AGENTS.md, TOOLS.md）
- 提供项目特定的上下文和人格
- 支持多文件同时加载

---

### 2.2 自动检测 git root

#### findGitRoot 函数

```typescript
export function findGitRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  for (let i = 0; i < 12; i += 1) {
    const gitPath = path.join(current, ".git");
    try {
      const stat = fs.statSync(gitPath);
      if (stat.isDirectory() || stat.isFile()) {
        return current;
      }
    } catch {
      // 忽略 .git 不存在的错误
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}
```

**特性**：
- 向上遍历查找 .git 目录
- 支持 .git 目录和 .git 文件（submodule）
- 最多向上查找 12 级目录

**价值**：
- 自动检测项目根目录
- 为 `RuntimeInfo.repoRoot` 提供值
- 提供项目上下文信息

---

### 2.3 增强 Runtime 信息

#### 新增字段

```typescript
export interface RuntimeInfo {
  agentId?: string;
  host?: string;
  os?: string;
  arch?: string;
  node?: string;
  model?: string;
  defaultModel?: string;
  repoRoot?: string;
  environment?: "development" | "production" | "test";
  channel?: string;          // 新增
  capabilities?: string[];   // 新增
}
```

#### 格式化输出

```typescript
function buildRuntimeSection(runtime: RuntimeInfo): string {
  const parts: string[] = [];

  if (runtime.agentId) parts.push(`agent=${runtime.agentId}`);
  if (runtime.host) parts.push(`host=${runtime.host}`);
  if (runtime.repoRoot) parts.push(`repo=${runtime.repoRoot}`);
  if (runtime.os) parts.push(`os=${runtime.os}${runtime.arch ? ` (${runtime.arch})` : ""}`);
  if (runtime.node) parts.push(`node=${runtime.node}`);
  if (runtime.model) parts.push(`model=${runtime.model}`);
  if (runtime.defaultModel) parts.push(`default_model=${runtime.defaultModel}`);
  if (runtime.environment) parts.push(`env=${runtime.environment}`);
  if (runtime.channel) parts.push(`channel=${runtime.channel}`);
  if (runtime.capabilities && runtime.capabilities.length > 0) {
    parts.push(`capabilities=${runtime.capabilities.join(",")}`);
  }

  return `## Runtime\n\nRuntime: ${parts.join(" | ")}`;
}
```

**输出示例**：

```
## Runtime

Runtime: agent=krebs-main | host=server01 | repo=/workspace | os=linux (x64) | node=v22 | model=claude-sonnet-4 | env=production | channel=discord | capabilities=inlineButtons,reactions
```

**价值**：
- Agent 知道当前在哪个频道运行
- Agent 知道频道支持哪些功能
- 更好的上下文感知

---

## 架构设计

### Section 化构建策略

所有 prompt 内容按 section 拆分，每个 section 有独立的构建函数：

```typescript
// 基础 sections
buildBaseSection()
buildToolsSection()
buildToolCallStyleSection()
buildMemorySection()
buildSkillsSection()

// 上下文 sections
buildWorkspaceSection()
buildTimeSection()
buildSandboxSection()
buildUserIdentitySection()
buildRuntimeSection()
buildContextFilesSection()

// 辅助 sections
buildToolCallingGuidance()
```

### PromptMode 模式

```typescript
export type PromptMode = "full" | "minimal" | "none";
```

- **full**: 完整模式，主 Agent 使用
- **minimal**: 精简模式，子 Agent 使用
- **none**: 仅基础身份行

### 类型导出

```typescript
// 导出核心类型和函数
export type PromptMode = "full" | "minimal" | "none";
export interface SandboxInfo { ... }
export interface RuntimeInfo { ... }
export interface ContextFile { ... }
export interface SystemPromptConfig { ... }
export type Tool = ToolType;

// 导出核心函数
export function buildAgentSystemPrompt(config: SystemPromptConfig): string
export function findGitRoot(startDir: string): string | null
```

---

## 测试覆盖

### 测试统计

| 阶段 | 测试数量 | 状态 |
|------|---------|------|
| Phase 1 | 22 | ✅ 全部通过 |
| Phase 2 | 12 | ✅ 全部通过 |
| **总计** | **34** | **✅ 100%** |

### 测试类别

#### Phase 1 测试（22个）

1. **工具系统增强**（6个）
   - 工具优先级排序
   - 核心工具摘要
   - 自定义工具描述
   - 大小写不敏感
   - 工具去重
   - 额外工具排序

2. **Tool Call Style**（3个）
   - full 模式包含
   - minimal 模式不包含
   - 具体指导内容

3. **Memory Recall**（4个）
   - memory_search 可用时
   - memory_get 可用时
   - 无记忆工具时
   - 步骤化指导

4. **Prompt Mode**（5个）
   - none 模式
   - minimal 模式
   - full 模式

5. **Runtime Info**（2个）
   - 详细运行时信息
   - 部分运行时信息

#### Phase 2 测试（12个）

1. **上下文文件**（5个）
   - 包含上下文文件
   - SOUL.md 人格指导
   - 无文件时不包含
   - 大小写不敏感检测
   - minimal 模式支持

2. **findGitRoot**（3个）
   - 当前目录查找
   - 无 git 仓库时
   - 子目录查找

3. **增强 Runtime**（3个）
   - channel 字段
   - capabilities 字段
   - 所有字段组合

4. **集成测试**（1个）
   - 完整功能测试

### 运行测试

```bash
# 运行所有测试
npm test -- test/agent/system-prompt.test.ts

# 运行并退出
npm test -- test/agent/system-prompt.test.ts --run

# 生成覆盖率报告
npm test -- test/agent/system-prompt.test.ts --coverage
```

---

## 使用指南

### 基础用法

```typescript
import {
  buildAgentSystemPrompt,
  type SystemPromptConfig,
} from "@/agent/core/system-prompt";

const config: SystemPromptConfig = {
  promptMode: "full",
  tools: [
    { name: "read", description: "Read files" },
    { name: "write", description: "Write files" },
  ],
  workspaceDir: "/workspace",
  timezone: "America/New_York",
};

const prompt = buildAgentSystemPrompt(config);
```

### 高级用法

#### 1. 使用上下文文件

```typescript
import {
  buildAgentSystemPrompt,
  type ContextFile,
} from "@/agent/core/system-prompt";

const contextFiles: ContextFile[] = [
  {
    path: "SOUL.md",
    content: "# Persona\nYou are a friendly assistant.",
  },
  {
    path: "AGENTS.md",
    content: "# Agents\nMulti-agent system.",
  },
];

const config: SystemPromptConfig = {
  promptMode: "full",
  contextFiles,
};
```

#### 2. 自动检测 git root

```typescript
import {
  findGitRoot,
} from "@/agent/core/system-prompt";

const repoRoot = findGitRoot("/workspace/src/agent");
console.log(repoRoot); // "/workspace"
```

#### 3. 完整配置示例

```typescript
const config: SystemPromptConfig = {
  promptMode: "full",
  basePrompt: "You are Krebs AI assistant.",
  tools: [
    { name: "read", description: "Read files" },
    { name: "memory_search", description: "Search memory" },
  ],
  toolConfig: {
    maxIterations: 10,
  },
  skills: [
    {
      name: "github",
      description: "GitHub integration",
      prompt: "Use GitHub API for operations.",
    },
  ],
  workspaceDir: "/workspace",
  timezone: "America/New_York",
  userIdentity: "Developer: John Doe",
  runtime: {
    agentId: "krebs-main",
    host: "server01",
    os: "linux",
    arch: "x64",
    node: "v22",
    model: "claude-sonnet-4",
    defaultModel: "claude-haiku-4",
    environment: "production",
    channel: "discord",
    capabilities: ["inlineButtons", "reactions"],
    repoRoot: "/workspace",
  },
  contextFiles: [
    {
      path: "SOUL.md",
      content: "# Persona\nBe friendly and helpful.",
    },
  ],
  extraSections: [
    {
      title: "Custom Section",
      content: "Additional instructions here.",
    },
  ],
};

const prompt = buildAgentSystemPrompt(config);
```

---

## 性能影响

### 构建 Performance

- **工具排序**: O(n log n)，n 为工具数量
- **工具去重**: O(n)，使用 Map
- **上下文文件**: O(m)，m 为文件数量
- **总体**: 毫秒级，可忽略

### 内存占用

- 旧版本: ~2KB per prompt
- 新版本: ~5KB per prompt（包含更多 sections）
- 增长: 可接受，提供更强大功能

### Token 使用

- 旧版本: ~500 tokens
- 新版本: ~800-1200 tokens（取决于配置）
- 增长: 通过更智能的 prompt 减少后续 token 消耗

---

## 未来规划

### Phase 3: 可选功能（待定）

1. **Reply Tags**
   - 支持原生回复/引用
   - `[[reply_to_current]]` 语法
   - 适用于多平台支持

2. **Heartbeats**
   - 心跳检测机制
   - `HEARTBEAT_OK` 响应
   - 适用于长连接场景

3. **Reactions**
   - 表情反应指导
   - minimal/extensive 模式
   - 适用于 Discord/Telegram

### 其他改进

1. **缓存机制**
   - 缓存构建的 prompt
   - 减少重复计算

2. **动态加载**
   - 动态加载上下文文件
   - 监听文件变化

3. **Prompt 模板**
   - 支持自定义模板
   - 模板继承和覆盖

---

## 总结

### 核心成就

✅ **Phase 1**: 核心改进
- 工具系统智能化（排序、摘要、去重）
- Tool Call Style Section
- Memory Recall Section

✅ **Phase 2**: 增强功能
- 上下文文件支持（SOUL.md）
- 自动检测 git root
- 增强 Runtime 信息

✅ **质量保证**
- 34 个单元测试（100%通过）
- 构建成功，无类型错误
- 完整的类型定义和导出

### 核心价值

**更智能**：
- 工具按优先级排序
- 大小写不敏感解析
- 自动检测项目根目录

**更一致**：
- 核心工具标准摘要
- 明确的工具调用风格
- 记忆检索指导

**更强大**：
- 上下文文件集成
- 详细的运行时信息
- 完整的 PromptMode 支持

**更可靠**：
- 34 个单元测试
- 类型安全
- 向后兼容

---

## 相关文档

- [production.md](../production.md) - 项目全局文档
- [system-prompt.ts](../src/agent/core/system-prompt.ts) - 源代码
- [system-prompt.test.ts](../test/agent/system-prompt.test.ts) - 测试文件

---

**文档维护**: 本文档应随代码更新同步维护。

**最后更新**: 2026-02-19
