# Bug: `memory-context` 空 header 检测逻辑不严密

## 影响范围

`.pi/extensions/memory-context/index.ts`

## 根因

原文检测逻辑：

```typescript
if (!memoryContent || memoryContent.trim() === "# Memory\n\n") {
  return {};
}
```

`readMemorySync` 返回文件原始内容。当文件仅包含 header `"# Memory\n\n"` 时：

```javascript
" # Memory\n\n".trim()  // → "# Memory"  (去掉了末尾的 \n)
"# Memory" === "# Memory\n\n"  // → false
```

条件为 `false`，错误地将空内容注入到 systemPrompt。

正常路径（`appendMemory` 写入）首次 consolidation 会立即追加 session 条目，不会触发此 bug。仅有 header 的文件会被漏检。

## 修复

```typescript
// 检查是否有真实的 session 条目（仅 header 时不注入）
if (!memoryContent || !memoryContent.includes("## Session:")) {
  return {};
}
```

直接检查是否有真实 session 条目，更健壮：

| 场景 | `!memoryContent` | `!includes("## Session:")` | 结果 |
|------|-----------------|---------------------------|------|
| 文件不存在/空 | `true` | — | `{}` ✅ |
| 仅 header `"# Memory\n\n"` | `false` | `true` | `{}` ✅ |
| 有 session 条目 | `false` | `false` | 正常注入 ✅ |

## 验证

```javascript
node -e "
const header = '# Memory\n\n';
const withSession = '# Memory\n\n## Session: abc | 2026-06-30\n...';
console.log('header only:', !header || !header.includes('## Session:'));  // true (skip)
console.log('with session:', !withSession || !withSession.includes('## Session:'));  // false (inject)
"
```

- Build ✅
- TypeScript ✅（零错误）
