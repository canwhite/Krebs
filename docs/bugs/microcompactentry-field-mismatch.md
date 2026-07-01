# Bug: `MicroCompactEntry` Field Name Mismatch

## Summary

`.pi/extensions/compact/index.ts` line 34 writes `originalMessageIndex` as a field in the `micro_compact` entry data, but the type definition for `MicroCompactEntry` in `types.ts` may define a different field name (e.g., `originalMessageIndex` vs `messageIndex`). The TypeScript type system does not validate the data shape passed to `appendCustomEntry`, so this mismatch goes undetected at compile time.

## Severity

**Low** — No runtime crash, but data written with wrong field name is unreadable by consumers expecting the correct field name.

## Root Cause

Interface/implementation field name mismatch — no binding validation between the data being written and the type definition:

```typescript
// compact/index.ts line 30-35
(ctx.sessionManager as any).appendCustomEntry("micro_compact", {
  originalContent: content,
  toolName: target.toolMessage.toolName,
  truncatedAt: Date.now(),
  originalMessageIndex: target.messageIndex,  // ← Field name
});
```

The type `MicroCompactEntry` in `types.ts` defines the field name. If they differ, data is written with wrong key.

## Affected Files

| File | Line | Issue |
|------|------|-------|
| `.pi/extensions/compact/index.ts` | 34 | Writes `originalMessageIndex`, comment says "Fixed: was messageIndex" |

## Note

The comment on line 34 says "Fixed: was messageIndex", suggesting this was already corrected. Verify the type definition in `types.ts` to confirm the field name actually matches.

## Fix

1. Verify the type definition field name in `types.ts`
2. Ensure the field name in the `appendCustomEntry` call matches exactly
3. Add a comment with the type name to make future mismatches obvious:

```typescript
(ctx.sessionManager as any).appendCustomEntry("micro_compact", {
  originalContent: content,
  toolName: target.toolMessage.toolName,
  truncatedAt: Date.now(),
  originalMessageIndex: target.messageIndex,  // MicroCompactEntry.originalMessageIndex
});
```

## Pattern

This is a recurring pattern (see Pre-Mortem finding #3): TypeScript types define a shape but `appendCustomEntry` accepts `any` data. The type system validates the call site but not the data shape. Consider adding a type assertion:

```typescript
const entry: MicroCompactEntry = {
  originalContent: content,
  toolName: target.toolMessage.toolName,
  truncatedAt: Date.now(),
  originalMessageIndex: target.messageIndex,
};
(ctx.sessionManager as any).appendCustomEntry("micro_compact", entry);
```
