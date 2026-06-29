# Sandbox 实现总结

> 更新时间：2026-06-29

## 概述

Sandbox 的核心目标是**对写命令进行沙箱隔离执行**，防止恶意或错误的写操作破坏系统。读命令则透传到原生 bash，保留完整能力。

---

## 设计思路

pi-coding-agent 在创建 session 时接收自定义 tools 数组。Krebs 传入自定义的 `SandboxBashTool` 替代原生 bash 工具，实现完全替换。

### 读写分离

bash 命令分为两类：

| 类型 | 命令 | 处理方式 |
|:-----|:-----|:--------|
| 读 | `ls`, `cat`, `grep`, `find` 等 | 透传到原生 bash |
| 写 | `echo`, `mkdir`, `rm`, `cp`, `mv`, `touch`, `chmod`, `chown` | 进入 WASM 沙箱 |

读命令不修改系统状态，风险低；写命令才是隔离的重点。

---

## 沙箱执行器

沙箱基于 **wasmtime + uutils/coreutils**：

```bash
wasmtime --dir=<cwd> coreutils.wasm <command> [args]
```

| 组件 | 作用 |
|:-----|:-----|
| wasmtime | WebAssembly 运行时，提供沙箱执行环境 |
| `--dir=<cwd>` | 将文件系统访问限制在项目目录 |
| coreutils.wasm | Unix 基础命令的 WASM 编译版本（uutils/coreutils） |

`coreutils.wasm` 是单文件 WASM 程序，通过不同的命令名参数调用不同功能：

| 用户输入 | 实际执行 |
|:---------|:---------|
| `echo hello` | `wasmtime coreutils.wasm echo hello` |
| `mkdir test` | `wasmtime coreutils.wasm mkdir test` |
| `rm file` | `wasmtime coreutils.wasm rm file` |

---

## 架构图

```
┌─────────────────────────────────────────────────────────┐
│  pi-coding-agent                                        │
│  createAgentSession({ tools: [SandboxBashTool] })     │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  SandboxBashTool (server/sandbox/tools/bash.ts)        │
│                                                          │
│  execute(command) {                                     │
│    if (读命令) return passthroughBash(command)          │
│    if (写命令) return wasmtime.run(command)            │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
                    │                    │
                    ▼                    ▼
         ┌─────────────────┐   ┌─────────────────────┐
         │  /bin/sh         │   │  wasmtime           │
         │  (原生 bash)     │   │  --dir <cwd>       │
         │                  │   │  coreutils.wasm     │
         └─────────────────┘   └─────────────────────┘
```

---

## 命令解析限制

由于 wasm32-wasip1 的限制，只支持简单命令，不支持：

- 管道 `|`
- 重定向 `>` `<` `2>`
- 命令链 `&&` `||`
- 命令分隔符 `;`

解析时检查这些模式，不支持则返回错误。

---

## 透传机制

读命令需要回退到原生 bash 执行：

```typescript
const passthroughBash = async (command: string, cwd: string) => {
  return new Promise((resolve, reject) => {
    const proc = spawn("/bin/sh", ["-c", command], { cwd });
    // stdout, stderr 收集后 resolve
  });
};
```

SandboxBashTool 内部判断命令类型，读命令透传，写命令沙箱。

---

## 文件结构

```
server/sandbox/
├── mod.ts           # 模块导出
├── executor.ts      # wasmtime + coreutils 执行器
└── tools/
    ├── bash.ts      # SandboxBashTool 实现
    └── types.ts     # 类型定义

wasm/
├── bin/wasmtime     # wasmtime 可执行文件
└── coreutils/       # coreutils.wasm 及相关文件
```

---

## 安全性

| 防护层 | 机制 |
|:-------|:-----|
| WASM 沙箱 | 无原生系统调用，内存隔离 |
| WASI Capability | 目录必须 preopened 才能访问 |
| --dir 限制 | 强制只允许访问 cwd |

---

## 扩展点

1. **新增写命令白名单** - 在 `WRITE_COMMANDS` 中添加
2. **自定义沙箱路径** - 修改 `wasmtime` 调用时的 `--dir` 参数
3. **不同权限级别** - 实现 `SandboxConfig.permissions` 控制读写权限
