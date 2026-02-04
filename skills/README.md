# Skills 编写指南

## 概述

Krebs 的 Skills 系统基于 [Agent Skills](https://agentskills.io) 标准，使用 Markdown 文件定义可扩展的技能能力。

## Skill 文件结构

每个 Skill 都是一个 Markdown 文件，包含以下部分：

### 1. Frontmatter（必需）

文件开头的 YAML 格式元数据：

```yaml
---
name: SkillName
description: "简短描述技能的功能"
metadata: '{"krebs":{"emoji":"🔧","category":"Category","tags":["tag1","tag2"]}}'
---
```

**字段说明**：
- `name`（必需）：技能名称，应简洁且描述性强
- `description`（必需）：技能描述，说明技能的功能
- `metadata`（可选）：Krebs 特定的元数据（JSON 字符串）
  - `emoji`：技能图标
  - `category`：技能分类（Development、System、Research 等）
  - `tags`：技能标签数组
  - `homepage`：相关链接

### 2. 技能内容（必需）

Frontmatter 之后的 Markdown 内容，包含：
- 技能详细说明
- 使用示例
- 最佳实践
- 注意事项

## Skill 文件位置

### Bundled Skills（内置技能）

位置：`skills/bundled/{skill-name}/SKILL.md`

这些技能随 Krebs 一起分发，是核心技能集。

示例：
```
skills/bundled/github/SKILL.md
skills/bundled/filesystem/SKILL.md
```

### 其他位置（未来支持）

- **Managed Skills**：`~/.config/krebs/skills/`
- **Workspace Skills**：`./skills/`
- **Extra Skills**：配置文件中指定的自定义目录

## 编写最佳实践

### 1. 清晰的命名

✅ 好的名称：
- `GitHub`
- `Filesystem`
- `WebSearch`

❌ 不好的名称：
- `tool`
- `helper`
- `stuff`

### 2. 详细的描述

描述应该说明：
- 技能做什么
- 何时使用
- 主要功能

```yaml
---
description: "使用 `gh` CLI 工具与 GitHub 交互。支持 issues、PRs、CI runs 和高级查询。"
---
```

### 3. 丰富的示例

提供实际可用的代码示例：

````markdown
## Pull Requests

检查 PR 的 CI 状态：
```bash
gh pr checks 55 --repo owner/repo
```

列出最近的 workflow 运行：
```bash
gh run list --repo owner/repo --limit 10
```
````

### 4. 合理的分类

使用标准分类：
- `Development`：开发工具（git、github、npm）
- `System`：系统操作（filesystem、process）
- `Research`：搜索和信息获取（web-search、documentation）
- `Data`：数据处理（json、csv、database）
- `Utilities`：通用工具（time、math、text）

### 5. 相关标签

添加相关标签帮助发现：

```yaml
tags: ["github", "git", "devops", "ci-cd"]
```

## 技能格式规范

### Markdown 语法

使用标准 Markdown 语法：
- 标题：`##`、`###` 等
- 代码块：``` ` ``` 语言
- 列表：`-` 或 `1.`
- 强调：`**bold**`、`*italic*`

### 代码示例

所有代码示例应该指定语言：

````markdown
```bash
command here
```

```typescript
const code = "here";
```
````

### 文件路径

使用清晰的文件路径示例：

```markdown
读取文件：
```bash
cat path/to/file.txt
```

创建目录：
```bash
mkdir -p path/to/nested/directory
```
```

## 高级功能（预留）

以下字段在当前版本中保留，用于未来实现：

### 依赖规范

```yaml
metadata: '{"krebs":{"requires":{"bins":["gh","git"]}}}'
```

### 安装规范

```yaml
metadata: '{"krebs":{"install":[{"kind":"brew","formula":"gh"}]}}'
```

### 环境变量

```yaml
metadata: '{"krebs":{"primaryEnv":"GITHUB_TOKEN"}}'
```

## 测试你的 Skill

### 1. 创建 Skill 文件

在 `skills/bundled/your-skill/SKILL.md` 创建文件

### 2. 验证格式

确保 YAML 格式正确：

```bash
npm run build
```

### 3. 查看加载的技能

启动 Krebs 并检查技能是否正确加载：

```bash
npm start
```

查看日志中的技能加载信息。

### 4. 测试技能使用

在对话中测试技能是否被正确调用和执行。

## 常见问题

### Q: 技能文件应该放在哪里？

A: 当前版本只支持 `skills/bundled/` 目录。未来版本将支持更多位置。

### Q: 如何禁用某个技能？

A: 可以通过配置中的 `denyList` 排除技能，或在代码中调用 `disableSkill()`。

### Q: 技能可以调用外部工具吗？

A: 可以。技能描述中可以包含任何命令行工具的使用说明。未来的版本将支持自动安装依赖。

### Q: 技能会被自动执行吗？

A: 不会。技能内容会被注入到 LLM 的 system prompt 中，由 LLM 决定是否使用。

## 示例技能

查看现有的示例技能：
- [`skills/bundled/github/SKILL.md`](./bundled/github/SKILL.md)
- [`skills/bundled/filesystem/SKILL.md`](./bundled/filesystem/SKILL.md)
- [`skills/bundled/web-search/SKILL.md`](./bundled/web-search/SKILL.md)

## 参考资源

- [Agent Skills 标准](https://agentskills.io)
- [Frontmatter 规范](https://jekyllrb.com/docs/front-matter/)
- [Markdown 语法指南](https://www.markdownguide.org/)
