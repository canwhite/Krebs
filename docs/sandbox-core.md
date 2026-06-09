# 沙箱实现核心

## 设计目标

在不修改 pi-coding-agent 的前提下，为 Krebs 提供可选的 bash 命令沙箱能力。

---

## 核心思路

### 1. 工具替换

pi-coding-agent 在创建 session 时接收 `tools` 数组：

```typescript
createAgentSession({
  tools: [
    createReadTool(cwd),
    createBashTool(join(cwd, "custom")), // 替换这个
    createEditTool(cwd),
  ],
});
```

**关键点**：传入自定义的 bash 工具实现，完全替代 pi 原生的 bash 工具。

### 2. 读写分离

bash 命令分为读和写两类：

| 类型 | 命令 | 路由 |
|------|------|------|
| 读 | `ls`, `cat`, `grep`, `find` | 透传到原 bash |
| 写 | `echo`, `mkdir`, `rm`, `cp`, `mv` | wasmtime 沙箱 |

**关键点**：读命令无限制，写命令才进沙箱。

### 3. 沙箱执行器

通过 wasmtime 运行预编译的 uutils/coreutils：

```bash
wasmtime --dir=<cwd> coreutils.wasm <command> [args]
```

- `--dir` 参数限制只能访问 cwd
- coreutils.wasm 是单文件，命令名作为参数传入

**关键点**：利用 WASM 沙箱 + WASI capability-based security 实现隔离。

### 4. 透传机制

读命令需要回退到原 bash 执行：

```typescript
const passthroughBash = async (command, cwd) => {
  // 直接 spawn 原 bash 进程
  return new Promise((resolve) => {
    const proc = spawn("/bin/sh", ["-c", command], { cwd });
    // ...
  });
};
```

**关键点**：沙箱 bash 工具内部判断命令类型，读命令透传，写命令沙箱。

---

## 架构图

```
┌─────────────────────────────────────────────────────────┐
│  pi-coding-agent                                        │
│  createAgentSession({ tools: [customBashTool] })        │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│  Sandbox Bash Tool (server/sandbox/tools/bash.ts)        │
│                                                          │
│  execute(command) {                                     │
│    if (读命令) return passthroughBash(command)          │
│    if (写命令) return wasmtime.run(command)            │
│  }                                                      │
└─────────────────────────────────────────────────────────┘
                    │                    │
                    ▼                    ▼
         ┌─────────────────┐   ┌─────────────────────┐
         │  /bin/sh        │   │  wasmtime           │
         │  (原 bash)      │   │  --dir=<cwd>        │
         │                  │   │  coreutils.wasm     │
         └─────────────────┘   └─────────────────────┘
```

---

## 关键实现细节

### 命令解析

只支持简单命令，不支持管道、重定向、命令链：

```typescript
function parseCommand(command) {
  // 检查不支持的语法
  if (/[|><&]/.test(command)) return null;

  // 简单分割
  const [cmd, ...args] = command.trim().split(/\s+/);
  return { cmd, args };
}
```

### 写命令白名单

只有明确允许的写命令才能在沙箱执行：

```typescript
const WRITE_COMMANDS = new Set([
  "echo", "mkdir", "rm", "rmdir",
  "cp", "mv", "touch", "chmod", "chown",
]);
```

### wasmtime 调用

```typescript
function runWriteCommand(wasmtime, wasmFile, command, args, cwd) {
  return new Promise((resolve) => {
    const proc = spawn(wasmtime, [
      "--dir", cwd,           // 限制只能访问 cwd
      wasmFile,
      command,                // coreutils.wasm 单文件，命令名作为参数
      ...args,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "", stderr = "";
    proc.stdout.on("data", (d) => stdout += d);
    proc.stderr.on("data", (d) => stderr += d);
    proc.on("close", (code) => resolve({ stdout, stderr, exitCode: code }));
  });
}
```

---

## 安全性分析

### WASM 沙箱

- 无原生系统调用访问
- 内存隔离（线性地址空间）
- 所有 I/O 必须通过 WASI imports

### WASI Capability

- 目录必须 preopened 才能访问
- `--dir` 强制只允许访问 cwd

### 已知漏洞

保持 wasmtime 最新可缓解大部分问题。

---

## 扩展点

1. **新增写命令白名单** - 在 `WRITE_COMMANDS` 中添加
2. **自定义沙箱路径** - 修改 `wasmtime` 调用时的 `--dir` 参数
3. **不同权限级别** - 实现 `SandboxConfig.permissions` 控制读写权限
