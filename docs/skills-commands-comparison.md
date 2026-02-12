# Skills Add 和 Skills Create 命令对比

## 核心区别

### `skills add` - 添加现有技能
**用途**：将**已存在**的技能添加到系统
**来源**：
- 本地目录（如 `./my-local-skill/`）
- URL（自动从 GitHub/GitLab 克隆）
- 打包文件（`.skill.gz` 或 `.tar.gz`）

**目标位置**：`skills/managed/`（默认）或 `skills/workspace/`

**典型流程**：
1. 接收 source 参数（目录、URL 或打包文件）
2. 解压/复制到目标位置
3. 验证 SKILL.md 是否存在
4. 可选：自动安装依赖
5. 可选：覆盖已存在的技能

**示例**：
```bash
# 添加本地目录
krebs skills add ./my-local-skill

# 从 GitHub 添加
krebs skills add https://github.com/example/skill.git

# 从打包文件添加
krebs skills add ./my-skill.skill.gz

# 添加到 workspace 而非 managed
krebs skills add ./my-skill --target=workspace

# 添加并自动安装依赖
krebs skills add ./my-skill --install
```

---

### `skills create` - 创建新技能模板
**用途**：创建一个**全新**的技能目录结构（带模板文件）
**名称**：自动规范化为连字符格式（如 `my-skill`）
**位置**：`skills/bundled/`（默认）或通过 `--path` 指定

**典型流程**：
1. 接收技能名称
2. 规范化名称（转大写为连字符）
3. 在指定位置创建目录
4. 生成 SKILL.md 模板（包含 TODO 占位符）
5. 可选：创建资源目录（`scripts/`、`references/`、`assets/`）
6. 可选：在资源目录中生成示例文件
7. 打印下一步指导

**示例**：
```bash
# 创建基本技能
krebs skills create my-skill

# 创建带资源的技能
krebs skills create my-skill --resources scripts,references

# 创建带示例文件的技能
krebs skills create my-skill --resources scripts --examples

# 指定自定义路径
krebs skills create my-skill --path skills/custom

# 创建不带资源
krebs skills create my-skill --no-resources
```

---

## 使用场景对照

| 场景 | skills add | skills create |
|--------|-------------|----------------|
| **已有技能**，想添加到系统 | ✅ `krebs skills add` | ❌ 不适用 |
| **全新技能**，从头创建 | ❌ 不适用 | ✅ `krebs skills create` |
| 从 GitHub 下载技能 | ✅ `krebs skills add <url>` | ❌ 不适用 |
| 从本地目录复制 | ✅ `krebs skills add <dir>` | ❌ 不适用 |
| 交互式创建模板 | ❌ 不适用 | ✅ `krebs skills create` |

## 关键特性

### `skills add` 特性
- ✅ 支持 URL 克隆
- ✅ 支持 `.skill.gz` 和 `.tar.gz` 解压
- ✅ 本地目录直接复制
- ✅ 验证已有技能（检查 SKILL.md）
- ✅ 可选自动安装依赖
- ✅ 目标到 managed/workspace
- ⚠️ 要求技能必须已存在（包含 SKILL.md）

### `skills create` 特性
- ✅ 创建完整目录结构
- ✅ 自动规范化名称（大写 → 连字符）
- ✅ 生成 SKILL.md 模板
- ✅ 可选创建资源目录
- ✅ 可选生成示例文件
- ✅ 目标到 bundled
- ✅ 包含 TODO 指导（方便后续填写）
- ✅ 打印详细使用指导

## 技术细节

### Skills Add 实现要点
- 支持 `.gz`、`.tar.gz`、`.tgz` 解压
- 使用 `tar` 命令处理归档
- 使用 `gunzip` 处理 gzip
- 递归处理目录结构
- 严格的 SKILL.md 验证（name + description 字段）

### Skills Create 实现要点
- 名称规范化：`MySkill` → `my-skill`
- 标题生成：`my-skill` → `My Skill`
- 支持自定义输出路径（`--path`）
- 支持三种资源类型（scripts、references、assets）
- 示例脚本使用 shebang 和占位符系统
