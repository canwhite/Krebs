# Krebs 沙箱方案：wasmtime + uutils/coreutils

## 核心思路

**读写分离**：
- **读命令** → 透传到原 bash 工具（无限制）
- **写命令** → 通过 wasmtime + uutils/coreutils 沙箱执行

```
┌─────────────────────────────────────────────────────┐
│  Sandbox Bash Tool                                    │
│                                                      │
│  ls /etc              → 原 bash (透传)              │
│  cat /etc/passwd     → 原 bash (透传)              │
│  grep pattern .       → 原 bash (透传)              │
│                                                      │
│  echo "hi"           → wasmtime + coreutils         │
│  mkdir /tmp/dir      → wasmtime + coreutils         │
│  rm /tmp/file        → wasmtime + coreutils         │
│  cp file1 file2       → wasmtime + coreutils         │
└─────────────────────────────────────────────────────┘
```

---

## 实现架构

### 目录结构

```
server/sandbox/
├── mod.ts                      # 导出
├── executor.ts                 # wasmtime 封装（执行写命令）
└── tools/
    ├── bash.ts                 # 沙箱 bash 工具（读写分离）
    └── types.ts
```

### 核心逻辑

```typescript
// bash.ts
const WRITE_COMMANDS = new Set([
  "echo", "mkdir", "rm", "rmdir", "cp", "mv", "touch", "chmod", "chown",
]);

async execute(command) {
  const parsed = parseCommand(command);

  if (!isWriteCommand(parsed.cmd)) {
    // 读命令 → 透传原 bash
    return passthroughBash(command, cwd);
  }

  // 写命令 → 沙箱执行
  return wasmtime.run(parsed.cmd, parsed.args, { cwd });
}
```

---

## 安全模型

### 读命令
- **无限制** - 通过原 bash 执行
- 可以访问任意路径
- 用于查看文件、搜索等只读操作

### 写命令
- **沙箱限制** - 通过 wasmtime + WASI 执行
- `--dir` 限制只能访问 cwd
- 防止写入 cwd 外的路径

### 沙箱机制

| 层面 | 保护 |
|------|------|
| WASM 沙箱 | 内存隔离，无原生 syscall |
| WASI | 文件系统 capability-based 权限 |
| --dir | 只能访问 cwd |

---

## 已下载的二进制

```
wasm/
├── bin/
│   └── wasmtime              # v45.0.1
└── coreutils/
    └── coreutils-0.9.0-wasm32-wasip1/
        └── coreutils.wasm   # uutils/coreutils
```

---

## 嵌入点

```typescript
// server/session-service.ts
const bashTool = useSandbox
  ? createSandboxBashTool(getDefaultExecutor(), cwd, passthroughBash)
  : createBashTool(join(cwd, "custom"));
```

启用方式：`createRuntime(sessionId, sessionPath, true)`

---

## 命令支持

### 读命令（透传，无限制）

`ls`, `cat`, `head`, `tail`, `grep`, `find`, `wc`, `stat`, `test`, `cd`, `pwd`, etc.

### 写命令（沙箱执行）

`echo`, `mkdir`, `rm`, `rmdir`, `cp`, `mv`, `touch`, `chmod`, `chown`

### 不支持的语法

- 管道: `|`
- 重定向: `>`, `<`, `2>`
- 命令链: `&&`, `||`
- 命令分隔: `;`

---

## 测试验证

```bash
# 读命令 - 透传
ls /etc  → 原 bash，访问任意路径

# 写命令 - 沙箱
echo hello  → wasmtime + coreutils，限制在 cwd

# Type check
bun tsc --noEmit  # 通过
```

---

## 安全性分析

### 当前覆盖的场景

| 威胁 | 保护 |
|------|------|
| 写文件到 cwd 外 | ✅ wasmtime `--dir` 限制 |
| 删除 cwd 外的文件 | ✅ 同上 |
| 执行恶意写操作 | ✅ 白名单命令 |

### 未覆盖的场景

| 威胁 | 现状 |
|------|------|
| 读敏感文件 (/etc/passwd, ~/.ssh/) | ❌ 透传，无限制 |
| 读取 cwd 外的文件 | ❌ 透传，无限制 |
| 网络访问 | ❌ 无限制 |
| 环境变量泄露 | ⚠️ 可能泄露敏感信息 |

### 已知漏洞

| 漏洞 | 严重度 | 缓解 |
|------|--------|------|
| GHSA-2r75-cxrj-cmph | HIGH | 保持 wasmtime 最新 |
| 越界写入 | MODERATE | 保持更新 |
| Spectre | 研究阶段 | 边界检查缓解 |

核心原则：只运行信任的 coreutils，不执行不受信任的 WASM 代码。

---

## 后续扩展

如需更严格的沙箱，可考虑：

1. **读写都进沙箱** - 读命令也通过 wasmtime + coreutils 执行
2. **只读路径白名单** - 限制读命令只能访问特定目录
3. **网络访问限制** - 通过 WASI socket 权限控制
