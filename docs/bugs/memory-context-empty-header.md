# Bug: `memory-context` Empty Header Check Fails Silently

## Summary

`.pi/extensions/memory-context/index.ts` line 18 checks if `MEMORY.md` contains `"## Session:"` to determine if real session data exists. However, if `MEMORY.md` contains only whitespace or invisible characters, this check passes (the file has content) but the content is not meaningful, causing memory injection to fail silently.

## Severity

**Low** — Silent failure, no crash, but memory context not injected when expected.

## Root Cause

String comparison boundary issue — `includes()` does not account for whitespace-only files:

```typescript
// .pi/extensions/memory-context/index.ts line 18
if (!memoryContent || !memoryContent.includes("## Session:")) {
  return {};  // ← Silent failure, no logging
}
```

If `MEMORY.md` is:
- Empty string → `!memoryContent` is true → returns `{}` ✓
- Only whitespace (`"   \n\n  "`) → `!memoryContent` is false (truthy string) → proceeds to `includes()` → returns `{}` ✓
- `"## Session:\n"` (header only, no actual sessions) → passes `includes()` but no sessions to inject

## Affected Files

| File | Line | Issue |
|------|------|-------|
| `.pi/extensions/memory-context/index.ts` | 18 | Silent failure when MEMORY.md is whitespace-only or header-only |

## Impact

If `MEMORY.md` gets corrupted or contains only whitespace (e.g., file was truncated), the extension silently returns empty and no memory is injected. No error is logged, making diagnosis difficult.

## Fix

Count actual session entries rather than checking for header presence:

```typescript
// .pi/extensions/memory-context/index.ts line 18
// Count actual session entries (more robust than header check)
const sessionCount = (memoryContent.match(/^## Session:/gm) || []).length;
if (!memoryContent || sessionCount === 0) {
  return {};  // Silent failure
}

// Optional: log when memory is injected
console.debug(`[MemoryContext] Injecting ${sessionCount} sessions from MEMORY.md`);
```

Or add logging to the current silent failure:

```typescript
if (!memoryContent || !memoryContent.includes("## Session:")) {
  console.debug(`[MemoryContext] No valid sessions in MEMORY.md, skipping injection`);
  return {};
}
```

## Related

See also: Round 3 finding #24 in `docs/architecture/deepening-opportunities.md` — same issue identified independently.
