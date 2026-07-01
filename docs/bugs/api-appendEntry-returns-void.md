# Bug: `api.appendEntry` Returns Void

## Summary

`AppendEntryHandler` in `pi-coding-agent` returns `void`, making it impossible for extensions to obtain the entry ID of newly created entries. This blocks implementation of features that need to reference or invalidate previously created entries.

## Severity

**Medium** — Workaround exists but creates fragile coupling across all extensions.

## Root Cause

Extension API design flaw in `pi-coding-agent`:

```typescript
// pi-coding-agent types.d.ts
appendEntry<T = unknown>(customType: string, data?: T): void;  // ← returns void
```

## Affected Files

| File | Line | Issue |
|------|------|-------|
| `.pi/extensions/compact/index.ts` | 29–35 | Uses `appendCustomEntry` workaround to get entry ID for `micro_compact` |
| `.pi/extensions/compact/index.ts` | 73–81 | `summary_anchor` entry ID not captured (future use blocked) |
| `.pi/extensions/memory/index.ts` | — | Same workaround pattern |

## Impact

- `memory` extension cannot implement invalidation (no entry ID to reference)
- `compact` extension cannot reference `summary_anchor` entries for future operations
- All extensions share this API contract flaw

## Fix

**Upstream fix** (requires `pi-coding-agent` change):

```typescript
// types.d.ts
appendEntry<T = unknown>(customType: string, data?: T): string;  // return entry ID
```

**Current workaround** (already in place):

```typescript
// compact/index.ts line 29-35
// Use appendCustomEntry to get entry ID back (api.appendEntry returns void)
const entryId = (ctx.sessionManager as any).appendCustomEntry("micro_compact", {
  originalContent: content,
  toolName: target.toolMessage.toolName,
  truncatedAt: Date.now(),
  originalMessageIndex: target.messageIndex,
});
```

## TODO for Future

When `pi-coding-agent` is fixed, replace all `(ctx.sessionManager as any).appendCustomEntry(...)` calls with `api.appendEntry(...)` and capture the returned entry ID.

Add this comment above each workaround:

```typescript
// TODO(pi-coding-agent): Replace with api.appendEntry() once it returns entry ID
```
