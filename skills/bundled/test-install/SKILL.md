---
name: TestInstall
description: "测试技能依赖自动安装功能"
install:
  - kind: node
    id: prettyping
    npmPackage: prettyping
    label: "Prettyping - 美化ping输出"
    bins:
      - prettyping
  # 以下是其他安装类型的示例（已注释）：
  # - kind: python
  #   id: black
  #   pythonPackage: black
  #   pythonInstaller: pipx  # 可选: pip, pipx, poetry, uv
  #   label: "Black - Python代码格式化工具"
  #   bins:
  #     - black
  # - kind: ruby
  #   id: jekyll
  #   gemPackage: jekyll
  #   label: "Jekyll - 静态网站生成器"
  #   bins:
  #     - jekyll
  # - kind: cargo
  #   id: ripgrep
  #   cratePackage: ripgrep
  #   label: "ripgrep - 快速文本搜索工具"
  #   bins:
  #     - rg
---

# Test Install Skill

这是一个用于测试Skills依赖自动安装功能的技能。

## 功能

本技能会自动安装 `pretttyping` - 一个美化ping输出的工具。

## 使用示例

安装后，你可以使用：

```bash
pretttyping google.com
```

这会显示一个美化后的ping输出界面，带有彩色进度条和实时统计信息。

## 安装说明

本技能定义了以下安装规范：

- **kind**: node
- **npmPackage**: prettyping
- **bins**: prettyping（用于检查是否已安装）

系统会自动使用npm/pnpm/yarn全局安装这个包。

### 支持的安装类型

Krebs 支持以下安装类型：

1. **node** - Node.js 包（npm/pnpm/yarn/bun）
2. **brew** - Homebrew formula
3. **go** - Go 模块
4. **uv** - UV/Python 工具
5. **python** - Python 包（pip/pipx/poetry/uv）🆕
6. **ruby** - Ruby gem 🆕
7. **cargo** - Rust crate 🆕
8. **download** - 下载并解压文件

详细示例请参考本文件顶部的注释部分。
