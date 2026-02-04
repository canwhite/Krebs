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
