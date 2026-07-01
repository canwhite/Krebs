# Bug: `api.appendEntry` 返回 `void`，entry ID 丢失

## 影响范围

- `.pi/extensions/memory/index.ts`
- `.pi/extensions/compact/index.ts`

## 根因

`ExtensionAPI.appendEntry` 的类型签名：

```typescript
// node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts
appendEntry<T = unknown>(customType: string, data?: T): void;
```

实际调用链：
```
api.appendEntry(type, data)
  → agent-session.js: `sessionManager.appendCustomEntry(type, data)`
  → session-manager.js: `appendCustomEntry()` 返回 entry.id
  → 返回值被丢弃
```

底层 `appendCustomEntry` 正确返回 entry ID，但 `AppendEntryHandler` 类型定义为 `void`，导致调用方无法获取。

## 后果

- **memory extension**: 无法获取 consolidation entry 的 ID，invalidation 机制无法实现（需要 entry ID 才能引用要废弃的 consolidation）
- **compact extension**: 无法获取 `summary_anchor` 和 `micro_compact` entry 的 ID

## 修复

改用 `ctx.sessionManager.appendCustomEntry()` 直接调用：

```typescript
// memory/index.ts
const consolidationEntryId = (ctx.sessionManager as any).appendCustomEntry(CUSTOM_ENTRY_TYPE, {
  messageCountAtConsolidation: currentMessageCount,
  tokensAtConsolidation,
  summaryText,
  createdAt: Date.now(),
});

// compact/index.ts - micro_compact
(ctx.sessionManager as any).appendCustomEntry("micro_compact", {
  originalContent: content,
  toolName: target.toolMessage.toolName,
  truncatedAt: Date.now(),
  originalMessageIndex: target.messageIndex,
});

// compact/index.ts - summary_anchor
(ctx.sessionManager as any).appendCustomEntry("summary_anchor", {
  headIndex: boundary.headIndex,
  tailIndex: boundary.tailIndex,
  summary,
  tokensBefore: usage.tokens,
  createdAt: Date.now(),
  layer: "context_collapse",
});
```

注意：需要 `(ctx.sessionManager as any)` 转换，因为 `ctx.sessionManager` 类型为 `ReadonlySessionManager`（不暴露 `appendCustomEntry`），但运行时是完整的 `SessionManager` 实例。

## 未完成：Invalidation entry 创建路径

修复后 `appendCustomEntry` 可以获取 entry ID，但**仍然没有代码主动创建 invalidation entry**。当需要废弃旧的 consolidation 时，没有触发路径。见 `docs/bugs/README.md` 已知局限 #2。

## 验证

- Build ✅
- TypeScript ✅（零错误）
