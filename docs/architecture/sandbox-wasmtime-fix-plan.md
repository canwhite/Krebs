# Plan: Bash Sandbox wasmtime `--dir` 修复

> Status: Done (P0 已修复)

---

## 关键验证结果

### wasmtime 根因确认（实测）

```bash
# ❌ 错误格式 — 根因
wasmtime --dir /path coreutils.wasm mkdir dir
# → "failed to find a pre-opened file descriptor"

# ✅ 正确格式 — 只需加 ::/
wasmtime --dir /path::/ coreutils.wasm mkdir dir
# exit: 0
```

**根因**：wasmtime 45.x 需要 `--dir <host_path>::/` 格式才能将 host 路径映射到 guest 根目录 `/`。原代码只用 `--dir <cwd>`，guest 内部 cwd 在 `/` 但找不到对应 fd。

`echo`、`touch`、`rm` 等命令加 `::/` 后均正常工作。

---

## Pre-Mortem

| # | 如果... | 后果 | 概率 |
|---|--------|------|------|
| F1.1 | 只修复 `--dir <cwd>::/`，其他命令（`cp`, `mv`, `chmod`）仍失败 | 部分写命令卡死 | 中 |
| F1.2 | `::/` 映射后 guest 内部路径解析仍有子目录问题 | 深层目录写操作失败 | 低 |
| F1.3 | wasmtime 版本升级后 `--dir::/` 行为改变 | 未来兼容性问题 | 低 |

---

## 解法：修正 `--dir` 参数格式

```typescript
// executor.ts — 只需改一行
const proc = spawn(wasmtimePath, [
  "--dir", `${opts.cwd}::/`,  // ← 加 ::/ 映射
  wasmFile,
  command,
  ...args
], { ... });
```

## 验证

```bash
# 单行验证
wasmtime --dir /tmp::/ \
  /path/coreutils.wasm \
  mkdir verify_works && echo "✅ wasmtime OK" && rm -rf verify_works
```

---

## 验证标准

| 条件 |
|------|
| `mkdir -p test_$$` 成功，exitCode 0，无 "pre-opened fd" 错误 |

---

## 优先级

| 优先级 | 解法 | Impact | Effort | 备注 |
|--------|------|--------|--------|------|
| P0 | wasmtime `::/` 修复 | 解除当前卡死 | 极低 | 只改一个参数 |
| P4 | 验证其他 wasmtime 命令（cp/mv/chmod） | 完整沙箱恢复 | 中 | 逐一测试 |
