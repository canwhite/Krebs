---
name: ExampleBashInstall
description: "示例技能：展示如何使用 bash 安装类型"
metadata: '{"krebs":{"emoji":"🔧","category":"Examples","tags":["example","bash","install"]}}'
install:
  - kind: "bash"
    bashScript: "echo '模拟安装...' && mkdir -p ~/.local/bin && echo '#!/bin/bash' > ~/.local/bin/example-tool && echo 'echo Hello from example-tool' >> ~/.local/bin/example-tool && chmod +x ~/.local/bin/example-tool"
    bins: ["example-tool"]
---

# Example Bash Install

这个技能展示了如何使用 `kind: bash` 来安装依赖。

## 安装方式

### 1. 使用内联脚本（本示例）

```yaml
install:
  - kind: "bash"
    bashScript: "curl -sSL https://example.com/install.sh | bash"
    bins: ["mytool"]
```

### 2. 使用脚本文件

```yaml
install:
  - kind: "bash"
    bashScript: "/path/to/install.sh"
    bashArgs: ["--prefix=/usr/local", "--yes"]
    bins: ["mytool"]
```

生成的命令：
```bash
bash /path/to/install.sh --prefix=/usr/local --yes
```

### 3. 使用远程脚本

```yaml
install:
  - kind: "bash"
    bashScript: "curl -sSL https://raw.githubusercontent.com/user/repo/main/install.sh | bash"
    bins: ["mytool"]
```

## 使用场景

Bash 安装类型适用于：

1. **自定义安装脚本**：项目提供的 `install.sh`
2. **一键安装命令**：`curl ... | bash` 形式的安装
3. **多步骤安装**：需要编译、配置等复杂步骤
4. **非标准包管理器**：不支持 brew/npm 的工具

## 注意事项

1. ✅ 脚本应该有执行权限或可通过 bash 执行
2. ✅ 建议提供 `bins` 字段以便检测安装状态
3. ✅ 复杂脚本可以使用 `bashArgs` 传递参数
4. ⚠️ 确保脚本来源可信（避免安全风险）
5. ⚠️ 脚本应该支持幂等性（多次运行不报错）

## 测试安装

```bash
# 测试安装（不实际执行）
npm run skills install ExampleBashInstall --dry-run

# 实际安装
npm run skills install ExampleBashInstall
```
