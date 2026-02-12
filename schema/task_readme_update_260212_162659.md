# Task: 更新 README.md CLI 命令文档

**任务ID**: task_readme_update_260212_162659
**创建时间**: 2026-02-12
**状态**: 已完成

## 任务描述
更新 README.md，添加完整的 CLI 命令使用说明，包括新增的验证命令。

## 已完成内容

### ✅ 验证命令文档

README.md 第 286-288 行已包含：
```bash
# 验证 skills 格式（新增）
krebs validate:skills                 # 验证 skills/bundled 目录
krebs validate:skills <custom-dir>   # 验证自定义目录
```

### ✅ 完整的 CLI 文档

README.md 已包含所有命令：
- **帮助命令**: `krebs help`, `krebs --help`, `krebs -h`
- **版本命令**: `krebs version`, `krebs --version`, `krebs -v`
- **Skills 命令**:
  - `krebs skills create <name>` - 创建新技能
  - `krebs skills add <source>` - 添加技能（目录/URL）
  - `krebs skills remove <name>` - 移除技能
  - `krebs skills package <path>` - 打包技能
  - `krebs skills list` - 列出所有技能
  - `krebs skills list --install` - 列出有安装规范的技能
  - `krebs skills status <name>` - 查看技能状态
  - `krebs skills install <name>` - 安装单个技能依赖
  - `krebs skills install --all` - 安装所有技能依赖
  - `krebs skills install --check` - 检查安装状态
  - `krebs skills install --dry-run` - 预览安装内容
  - `krebs skills install --force` - 强制重新安装
- **验证命令** (新增):
  - `krebs validate:skills` - 验证 skills/bundled 目录
  - `krebs validate:skills <dir>` - 验证自定义目录

## CLI 命令使用示例

### 创建新技能

```bash
# 创建一个新技能目录（交互式，带示例文件）
krebs skills create my-skill --resources scripts,references

# 创建时不带示例文件
krebs skills create my-skill --no-resources
```

### 添加技能

```bash
# 从本地目录添加
krebs skills add ./my-local-skill

# 从 URL 添加（自动克隆）
krebs skills add https://github.com/example/skill.git

# 从 .skill.gz 文件添加
krebs skills add ./my-skill.skill.gz
```

### 验证 Skills

```bash
# 验证默认目录（skills/bundled）
npm run validate:skills

# 或使用 krebs 命令
krebs validate:skills

# 验证自定义目录
krebs validate:skills skills/custom

# 启用严格模式（只加载符合规范的 skills）
SKILLS_VALIDATOR_STRICT=true krebs validate:skills
```

## 构建状态

✅ **构建成功**，无 TypeScript 错误
