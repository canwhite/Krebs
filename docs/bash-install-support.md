# Bash 安装类型支持文档

**日期**: 2026-02-06
**状态**: ✅ 已实现

---

## 概述

为 Skills 系统添加了 `kind: bash` 安装类型支持，允许通过 bash 脚本安装技能依赖。

---

## 支持的安装类型

现在系统支持 **9 种**安装类型：

| 类型 | 说明 | 示例 |
|------|------|------|
| `brew` | Homebrew 包 | `brew install gh` |
| `node` | npm 包 | `npm install -g pkg` |
| `go` | Go 模块 | `go install module@latest` |
| `uv` | uv 工具 | `uv tool install pkg` |
| `python` | Python 包 | `pip install pkg` |
| `ruby` | Ruby gem | `gem install pkg` |
| `cargo` | Cargo crate | `cargo install pkg` |
| `download` | 下载解压 | URL → 文件 |
| **`bash`** | **Bash 脚本** | **`bash install.sh`** ✨ |

---

## Bash 安装类型详解

### 类型定义

```typescript
interface SkillInstallSpec {
  kind: "bash";
  bashScript: string;      // 脚本路径或内联脚本
  bashArgs?: string[];     // 可选参数
  bins?: string[];         // 安装后的二进制文件
  label?: string;          // 描述
}
```

### 两种使用方式

#### 方式 1: 执行脚本文件

```yaml
---
install:
  - kind: "bash"
    bashScript: "/path/to/install.sh"
    bashArgs: ["--yes", "--prefix=/usr/local"]
    bins: ["mytool"]
---
```

**生成的命令**：
```bash
bash /path/to/install.sh --yes --prefix=/usr/local
```

#### 方式 2: 执行内联脚本

```yaml
---
install:
  - kind: "bash"
    bashScript: "curl -sSL https://example.com/install.sh | bash"
    bins: ["mytool"]
---
```

**生成的命令**：
```bash
bash -c "curl -sSL https://example.com/install.sh | bash"
```

---

## 使用场景

### ✅ 适合使用 bash 安装的场景

1. **自定义安装脚本**
   ```yaml
   install:
     - kind: "bash"
       bashScript: "./scripts/install.sh"
       bins: ["mytool"]
   ```

2. **一键安装命令**
   ```yaml
   install:
     - kind: "bash"
       bashScript: "curl -sSL https://raw.githubusercontent.com/user/repo/main/install.sh | bash"
       bins: ["mytool"]
   ```

3. **多步骤编译安装**
   ```yaml
   install:
     - kind: "bash"
       bashScript: |
         git clone https://github.com/user/repo.git /tmp/repo
         cd /tmp/repo
         make && make install
         rm -rf /tmp/repo
       bins: ["mytool"]
   ```

4. **非标准包管理器**
   - 不支持 brew/npm 的工具
   - 需要特殊配置的工具
   - 企业内部工具

### ❌ 不适合使用 bash 安装的场景

1. **简单的包安装** → 用 `brew`、`npm` 等
2. **标准 Python 包** → 用 `python` 类型
3. **Go 工具** → 用 `go` 类型

---

## 完整示例

### 示例技能：安装 MyCustomTool

```markdown
---
name: MyCustomTool
description: "一个需要自定义安装脚本的工具"
metadata: '{"krebs":{"emoji":"🔧","category":"Development"}}'
install:
  - kind: "bash"
    bashScript: "https://raw.githubusercontent.com/example/mytool/main/install.sh"
    bashArgs: ["--release=latest"]
    bins: ["mytool"]
---

# MyCustomTool Skill

...
```

### 执行流程

```
用户执行: npm run skills install MyCustomTool
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  installer.installSkill(skill)                         │
│  - 解析 install 规范                                    │
│  - 检测 kind: "bash"                                   │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  构建命令                                                │
│  bashScript + bashArgs → 命令数组                       │
│  ["bash", script, ...args]                              │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  执行安装                                                │
│  exec(bash /path/to/install.sh --release=latest)        │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  验证安装                                                │
│  which mytool  → 检查 bins 字段                         │
└─────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────┐
│  返回结果                                                │
│  { ok: true, message: "安装成功" }                      │
└─────────────────────────────────────────────────────────┘
```

---

## 代码实现

### 1. 类型定义

```typescript
// src/agent/skills/types.ts
export interface SkillInstallSpec {
  kind: "brew" | "node" | "go" | "uv" | "download" | "python" | "ruby" | "cargo" | "bash";

  // Bash 特定字段
  bashScript?: string;    // 脚本路径或内联脚本
  bashArgs?: string[];     // 可选参数
  bins?: string[];         // 安装后的二进制文件（用于验证）
}
```

### 2. 安装逻辑

```typescript
// src/agent/skills/installer.ts
function buildInstallCommand(
  spec: SkillInstallSpec,
  nodeManager: NodeManager,
  pythonManager: PythonManager
): { argv: string[] | null; error?: string } {
  switch (spec.kind) {
    // ... 其他类型 ...

    case "bash":
      if (!spec.bashScript) {
        return { argv: null, error: "missing bash script" };
      }

      const args = spec.bashArgs || [];
      if (args.length > 0) {
        // 方式1: 执行脚本文件
        return { argv: ["bash", spec.bashScript, ...args] };
      } else {
        // 方式2: 执行内联脚本
        return { argv: ["bash", "-c", spec.bashScript] };
      }

    default:
      return { argv: null, error: "unsupported installer" };
  }
}
```

---

## 安全建议

### ⚠️ 注意事项

1. **脚本来源可信**
   - ✅ 优先使用官方脚本
   - ❌ 避免不明来源的 `curl ... | bash`
   - ✅ 推荐使用 `https://` 和验证签名

2. **脚本幂等性**
   - ✅ 脚本应该支持多次运行
   - ✅ 检测是否已安装
   - ❌ 避免重复下载/编译

3. **错误处理**
   - ✅ 脚本应该有清晰的错误信息
   - ✅ 失败时返回非零退出码
   - ✅ 提供日志输出便于调试

4. **权限管理**
   - ⚠️ 避免需要 `sudo` 的脚本
   - ✅ 优先安装到 `~/.local/bin`
   - ✅ 使用 `--user` 标志（如适用）

---

## 测试

### 测试安装

```bash
# 1. 编译项目
npm run build

# 2. 启动服务器
npm run dev

# 3. 测试 API
curl http://localhost:3000/api/skills | jq '.skills[] | select(.name == "ExampleBashInstall")'

# 4. 执行安装（dry-run）
curl -X POST http://localhost:3000/api/skills/ExampleBashInstall/install \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# 5. 实际安装
curl -X POST http://localhost:3000/api/skills/ExampleBashInstall/install \
  -H "Content-Type: application/json"
```

---

## 对比：何时使用哪种安装类型

| 场景 | 推荐类型 | 理由 |
|------|---------|------|
| macOS 标准工具 | `brew` | 最常用，更新方便 |
| Node.js 工具 | `node` | 集成到 npm 生态系统 |
| Python 工具 | `python` | 使用 pip/uv |
| Go 工具 | `go` | 无需编译 |
| 一键安装 | `bash` | 灵活，支持自定义 |
| 需要编译 | `bash` | 可执行多步骤脚本 |
| 二进制下载 | `download` | 直接下载解压 |

---

## 总结

✅ **已实现**：`kind: bash` 安装类型
✅ **支持两种方式**：脚本文件 / 内联脚本
✅ **支持参数传递**：通过 `bashArgs` 字段
✅ **支持安装验证**：通过 `bins` 字段
✅ **向后兼容**：不影响现有 8 种安装类型

现在 Skills 系统可以灵活支持各种安装方式！
