# Krebs Skills 系统技术文档

> **版本**: v1.0.0  
> **更新时间**: 2026-02-13  
> **作者**: Krebs Team

---

## 目录

- [系统概述](#系统概述)
- [核心概念](#核心概念)
- [架构设计](#架构设计)
- [工作原理](#工作原理)
- [Skill 开发指南](#skill-开发指南)
- [高级特性](#高级特性)
- [最佳实践](#最佳实践)
- [FAQ](#faq)

---

## 系统概述

### 什么是 Skills 系统？

Krebs 的 Skills 系统是一个**基于文档驱动、LLM 理解**的智能能力扩展框架。它通过将技能文档（SKILL.md）注入到 LLM 的 System Prompt 中，让 LLM 能够理解并自主决定何时使用哪些技能。

### 核心特点

- 📝 **文档驱动**：技能通过 Markdown 文档定义，而非硬编码
- 🤖 **LLM 自主决策**：LLM 理解文档后自主选择使用时机
- 🔌 **热加载**：文件变化自动重新加载，无需重启
- 📦 **模块化**：支持多个技能目录，优先级清晰
- 🏷️ **类型安全**：完整的 TypeScript 类型定义

### 与旧系统的区别

| 维度 | 旧系统（已移除） | 新系统（当前） |
|------|------------------|--------------|
| **触发方式** | 硬编码关键词匹配 | LLM 理解文档 |
| **扩展方式** | 编写代码 | 编写 SKILL.md |
| **维护成本** | 需要修改代码 | 只需更新文档 |
| **灵活性** | 固定行为 | LLM 自主决策 |
| **组合能力** | 单个技能执行 | 多技能 + 工具组合 |

---

## 核心概念

### 1. SKILL.md 文件

每个技能都是一个独立的 Markdown 文件，包含两个部分：

#### Frontmatter（元数据）

\`\`\`yaml
---
name: GitHub
description: "使用 gh 命令行工具与 GitHub 交互"
metadata: '{"krebs":{"emoji":"🐙","category":"Development","tags":["github","git"]}}'
---
\`\`\`

**字段说明**：
- `name`：技能名称（唯一标识符）
- `description`：技能描述（LLM 理解的关键）
- `metadata`：扩展元数据（Krebs 特定字段）
  - `emoji`：技能图标
  - `category`：分类
  - `tags`：标签数组
  - `homepage`：主页链接

#### 内容区域（技能文档）

\`\`\`markdown
# GitHub Skill

使用 \`gh\` CLI 工具与 GitHub 进行交互...

## Pull Requests

检查 PR 的 CI 状态：
\`\`\`bash
gh pr checks 55 --repo owner/repo
\`\`\`

## Issues

列出仓库的 issues...
\`\`\`

**这部分内容会被注入到 System Prompt**，LLM 通过阅读理解技能能力。

### 2. PI（Prompt Injection）

**PI = Prompt Injection（提示注入）**

新 Skills 系统的核心机制是将技能文档"注入"到 LLM 的上下文中：

\`\`\`typescript
// 1. 加载所有 SKILL.md 文件
const skills = loadSkillsFromDirs();

// 2. 格式化为 Prompt
const prompt = formatSkillsForPrompt(skills);
// 输出类似：
// # Available Skills
// ## GitHub
// 使用 gh 命令行工具...
// ### Pull Requests
// 检查 PR 的 CI 状态...
// ## Issues
// 列出仓库的 issues...

// 3. 注入到 System Prompt
systemPrompt = \`
  You are an AI assistant with access to skills.
  
  \${prompt}  ◄─── PI 在这里！
  
  When user asks for help, use the appropriate skill.
\`;
\`\`\`

### 3. LLM 理解和决策

LLM 收到包含技能文档的 System Prompt 后：

\`\`\`
用户: "帮我检查 GitHub 上最近的 PR"

LLM 思考过程:
1. 我看到 System Prompt 中有 "GitHub Skill"
2. GitHub Skill 的文档说明：可以检查 PR 的 CI 状态
3. 用户要检查 PR
4. -> 决定使用 GitHub Skill
5. -> 输出: tool_calls 调用 gh 命令
\`\`\`

**关键点**：没有硬编码的 `if (message.includes("github"))`，完全依赖 LLM 的理解！

---

## 架构设计

### 组件关系图

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                     Skills 系统架构                        │
└─────────────────────────────────────────────────────────────┘

SkillsManager (Facade 层)
  ├─ SkillsLoader (加载器)
  │   └─ loadFromDirs() → SkillEntry[]
  │
  ├─ SkillsFormatter (格式化器)
  │   └─ formatForPrompt() → string
  │
  ├─ SkillsHotReload (热加载)
  │   ├─ watch() → 监听文件变化
  │   └─ onChange() → 自动重新加载
  │
  └─ SkillInstaller (安装器)
      └─ install() → 安装依赖

↓ 被 Agent 使用

Agent
  ├─ buildSystemPrompt()
  │   └─ skillsManager.buildSkillsPrompt()
  │
  └─ process()
      └─ provider.chat(messages, { tools })
          ↓
      LLM 理解技能 + 自主决策
\`\`\`

### 核心类说明

#### SkillsManager

**职责**：统一的管理接口（Facade 模式）

\`\`\`typescript
class SkillsManager {
  // 加载所有技能
  async loadSkills(): Promise<void>
  
  // 构建技能 Prompt
  buildSkillsPrompt(options?): string
  
  // 获取技能快照
  getSnapshot(): SkillSnapshot
  
  // 获取所有技能
  getAllSkills(): SkillEntry[]
  
  // 重新加载
  async reloadSkills(): Promise<void>
}
\`\`\`

#### SkillsLoader

**职责**：从文件系统加载技能

\`\`\`typescript
class SkillsLoader {
  // 从目录加载
  loadFromDir(dir: string, source: string): SkillEntry[]
  
  // 从多个目录加载（支持覆盖）
  loadFromDirs(dirs: Array<{dir, source}>): SkillEntry[]
  
  // 构建快照
  buildSnapshot(entries: SkillEntry[], version: number): SkillSnapshot
  
  // 重新加载单个技能
  reloadSkill(filePath: string): SkillEntry | null
}
\`\`\`

**加载优先级**（从低到高）：
1. Extra Skills（最低优先级）
2. Bundled Skills（内置技能）
3. Managed/Local Skills（本地技能）
4. Workspace Skills（最高优先级，会覆盖其他）

#### SkillsFormatter

**职责**：格式化技能为 Prompt

\`\`\`typescript
class SkillsFormatter {
  // 格式化为 Prompt
  formatForPrompt(entries: SkillEntry[], options?): string
  
  // 过滤技能
  filterSkills(entries: SkillEntry[], filter: SkillFilterOptions): SkillEntry[]
}
\`\`\`

**使用 pi-coding-agent 的 `formatSkillsForPrompt` 函数**。

#### SkillsHotReload

**职责**：监听文件变化并自动重载

\`\`\`typescript
class SkillsHotReload {
  // 启用热加载
  async enable(): Promise<void>
  
  // 禁用热加载
  async disable(): Promise<void>
  
  // 事件监听
  onChange(callback: () => void): void
  onSkillChange(callback: (event) => void): void
}
\`\`\`

**使用 chokidar 监听文件变化**。

---

## 工作原理

### 完整流程

\`\`\`
1. 系统启动
   ↓
   SkillsManager.loadSkills()
   ↓
   从多个目录加载 SKILL.md 文件
   ↓
   解析 Frontmatter 和内容
   ↓
   构建 SkillEntry[]
   ↓
   保存快照


2. 用户发送消息
   ↓
   Agent.process(message)
   ↓
   Agent.buildSystemPrompt()
   ↓
   SkillsManager.buildSkillsPrompt()
   ↓
   SkillsFormatter.formatForPrompt(skills)
   ↓
   生成类似：
   # Available Skills
   
   ## GitHub
   使用 gh 命令...
   
   ## Filesystem
   文件操作...
   
   注入到 System Prompt


3. LLM 收到消息
   ↓
   System Prompt: "你有这些技能..."
   User Message: "帮我检查 PR"
   ↓
   LLM 理解：
   - 用户要检查 PR
   - 我有 GitHub Skill
   - GitHub Skill 可以检查 PR
   ↓
   LLM 决策：使用 GitHub Skill
   ↓
   输出：tool_calls
   {
     name: "execute_bash",
     arguments: {
       command: "gh pr checks ..."
     }
   }
\`\`\`

### 关键：不是"Trigger"，是"理解"

\`\`\`
旧系统:
  if (message.includes("github") || message.includes("pr")) {
    return executeGitHubSkill();
  }
  
新系统:
  // 没有硬编码判断！
  // LLM 自己看到文档，理解能力，自己决定
  
  System Prompt 告诉 LLM:
  "你有 GitHub Skill，可以检查 PR..."
  
  LLM 理解后自主要说：
  "那我就用 GitHub Skill 检查这个 PR"
\`\`\`

---

## Skill 开发指南

### 创建新 Skill

#### 步骤 1：创建 SKILL.md

\`\`\`bash
# 在 workspace/skills 目录创建
mkdir -p workspace/skills/my-skill
vim workspace/skills/my-skill/SKILL.md
\`\`\`

#### 步骤 2：编写内容

\`\`\`markdown
---
name: MySkill
description: "我的第一个技能"
metadata: '{"krebs":{"emoji":"✨","category":"Utility","tags":["demo"]}}'
---

# My Skill

这是一个示例技能，用于演示如何创建自定义技能。

## 功能

- 功能 1
- 功能 2

## 使用示例

\`\`\`bash
my-skill-command --option value
\`\`\`
\`\`\`

#### 步骤 3：热加载自动生效

保存文件后，SkillsHotReload 会自动检测变化并重新加载：
\`\`\`
[INFO] SkillsHotReload: File changed: workspace/skills/my-skill/SKILL.md
[INFO] SkillsManager: Reloading skills...
[INFO] SkillsLoader: Loaded 1 skills from workspace (version 42)
[INFO] SkillsFormatter: Formatted prompt for 1 skills
\`\`\`

### 最佳实践

#### 1. 文档质量

**✅ 好的文档**：
\`\`\`markdown
# GitHub Skill

使用 \`gh\` CLI 工具与 GitHub 进行交互。支持 issues、PRs、CI runs 和高级查询。

## Pull Requests

检查 PR 的 CI 状态：
\`\`\`bash
gh pr checks 55 --repo owner/repo
\`\`\`

**列出最近的 workflow 运行**：
\`\`\`bash
gh run list --repo owner/repo --limit 10
\`\`\`
\`\`\`

**❌ 差的文档**：
\`\`\`markdown
这是一个 GitHub 工具。可以用 gh 命令。
\`\`\`

#### 2. Frontmatter 完整性

\`\`\`yaml
---
name: GitHub
description: "使用 gh 命令行工具与 GitHub 交互。支持 issues、PRs、CI runs 和高级查询。"
metadata: '{"krebs":{"emoji":"🐙","category":"Development","tags":["github","git","devops"],"homepage":"https://cli.github.com/"}}'
---
\`\`\`

必填字段：
- \`name\`：唯一标识符
- \`description\`：LLM 理解的关键

可选字段：
- \`metadata.krebs\`：扩展信息
  - \`emoji\`：图标
  - \`category\`：分类
  - \`tags\`：标签

#### 3. 实用性

\`\`\`markdown
## 实用场景

### 场景 1：检查 PR 状态

用户请求："帮我看看 PR #123 的状态"

执行：
\`\`\`bash
gh pr view 123 --repo owner/repo
\`\`\`

### 场景 2：列出最近的 Issues

用户请求："最近有什么新的 issues？"

执行：
\`\`\`bash
gh issue list --repo owner/repo --limit 10
\`\`\`
\`\`\`

---

## 高级特性

### 1. 技能过滤

\`\`\`typescript
// 在构建 Prompt 时过滤
const prompt = skillsManager.buildSkillsPrompt({
  filter: {
    allowList: ["github", "filesystem"],  // 只包含这些
    denyList: ["experimental"],          // 排除这些
    enabledOnly: true,                    // 只启用的
    category: ["Development"],             // 按分类
    tags: ["git"]                        // 按标签
  },
  maxSkills: 10,  // 最多 10 个技能
});
\`\`\`

### 2. 技能统计

\`\`\`typescript
const stats = skillsManager.getStats();
console.log(stats);
// {
//   total: 25,
//   enabled: 23,
//   disabled: 2,
//   byCategory: {
//     "Development": 10,
//     "Utility": 8,
//     "Web": 7
//   },
//   bySource: {
//     "bundled": 5,
//     "workspace": 15,
//     "extra": 5
//   }
// }
\`\`\`

### 3. 热加载监控

\`\`\`typescript
skillsManager.hotReload.onChange(() => {
  console.log("Skills reloaded!");
});

skillsManager.hotReload.onSkillChange((event) => {
  console.log(\`Skill \${event.skillName} changed: \${event.change}\`);
  // event.change = "added" | "removed" | "updated"
});
\`\`\`

### 4. 依赖安装

\`\`\`markdown
---
name: ComplexSkill
description: "需要外部依赖的技能"
metadata: '{"krebs":{"requires":{"bins":["gh","jq"],"anyBins":["curl"],"env":["GITHUB_TOKEN"]}}'
---
\`\`\`

Krebs 会自动检查：
- \`bins\`：必需的命令行工具
- \`anyBins\`：至少需要一个
- \`env\`：必需的环境变量

---

## 最佳实践

### 1. 技能设计原则

#### 单一职责
每个 Skill 只做一件事，做好：
- ✅ GitHub Skill：只处理 GitHub 操作
- ❌ AllInOne Skill：处理 GitHub、Filesystem、Web...

#### 文档先行
先写好文档，让 LLM 能理解：
- ✅ 详细的用法说明
- ✅ 丰富的示例
- ✅ 常见场景

#### 保持更新
随外部工具更新同步：
- 定期检查 \`gh\` 命令的变化
- 更新 SKILL.md 文档

### 2. 组织结构

\`\`\`
workspace/skills/
├── development/
│   ├── github/SKILL.md
│   └── docker/SKILL.md
├── utility/
│   ├── filesystem/SKILL.md
│   └── text/SKILL.md
└── web/
    ├── search/SKILL.md
    └── scraper/SKILL.md
\`\`\`

### 3. 测试技能

#### 手动测试
1. 重启服务或等待热加载
2. 发送测试消息
3. 观察 LLM 是否正确使用技能

#### 验证文档
\`\`\`bash
# 使用内置验证器
npm run skills:validate

# 或启用严格模式
export SKILLS_VALIDATOR_STRICT=true
npm run dev
\`\`\`

---

## FAQ

### Q1: 为什么我的 Skill 没有被触发？

**A**: 检查以下几点：
1. ✅ SKILL.md 文件格式是否正确（Frontmatter + 内容）
2. ✅ \`description\` 是否清晰描述了技能能力
3. ✅ 文档是否有足够的示例和使用说明
4. ✅ LLM 是否能理解文档（试试更详细的说明）
5. ✅ 查看日志：\`[SkillsManager] Loaded N skills\`

**记住：不是"触发"，是"理解"！**

### Q2: 如何调试 Skill？

**A**: 
1. 查看加载日志
2. 检查 System Prompt 是否包含你的技能
3. 测试 LLM 是否理解
4. 添加更多示例和说明

### Q3: 技能之间可以依赖吗？

**A**: 当前不支持，但可以：
- 在文档中说明"需要先使用 X Skill"
- 让 LLM 理解并分步执行

### Q4: 热加载不工作？

**A**: 检查：
1. SkillsHotReload 是否启用
2. 文件路径是否正确
3. 文件权限是否正确

### Q5: 如何禁用某个 Skill？

**A**: 
\`\`\`markdown
---
enabled: false  # 添加这个字段
---
\`\`\`

---

## 总结

Krebs 的新 Skills 系统：
- ✅ **文档驱动**：而非代码驱动
- ✅ **LLM 理解**：而非关键词匹配
- ✅ **热加载**：无需重启
- ✅ **模块化**：清晰的目录结构
- ✅ **可扩展**：易于添加新技能

从"规则"到"理解"，这是 AI 时代的开发方式！
