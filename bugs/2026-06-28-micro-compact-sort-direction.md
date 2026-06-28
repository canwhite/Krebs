# Bug: Micro Compact Sort Direction Error

**Date**: 2026-06-28
**Component**: `server/services/compact/microCompact.ts`
**Function**: `findToolResultsToPrune`
**Severity**: High (logic error, would have pruned wrong tool results)

## Problem

The sort direction in `findToolResultsToPrune` was incorrect, causing the wrong tool results to be selected for pruning.

## Root Cause

```typescript
// BEFORE (wrong):
toolResults.sort((a, b) => b.age - a.age);  // descending sort
return toolResults.slice(cfg.keepRecent);    // takes NEWEST, not oldest
```

The intent was:
- Sort by age descending (oldest first)
- `slice(keepRecent)` to skip the newest `keepRecent` items

But the logic was backwards:
- `b.age - a.age` sorts oldest first (descending)
- `slice(keepRecent)` on a descending array takes the **newest** items (not oldest!)

Additionally, JavaScript's `Array.sort()` sorts in-place and the input array happened to be in descending age order (age = 4,3,2,1), so the sort didn't actually swap anything - the bug was masked.

## Fix

```typescript
// AFTER (correct):
toolResults.sort((a, b) => a.age - b.age);  // ascending sort
return toolResults.slice(cfg.keepRecent);    // takes OLDEST, not newest
```

With ascending sort (newest first: age 1,2,3,4):
- `slice(keepRecent)` takes the first `keepRecent` items (newest)
- The remaining items are the oldest, which we want to prune

## How to Reproduce

```typescript
const mc = createMicroCompact({ keepRecent: 2, truncateThreshold: 100 });
const messages = [
  makeToolResultMessage("Read", "result 1"), // index 0, age 4 (oldest)
  makeToolResultMessage("Read", "result 2"), // index 1, age 3
  makeToolResultMessage("Read", "result 3"), // index 2, age 2
  makeToolResultMessage("Read", "result 4"), // index 3, age 1 (newest)
];

// With keepRecent=2, we should keep indices 2 and 3 (ages 2 and 1)
// So toPrune should be indices 0 and 1 (ages 4 and 3)

const toPrune = mc.findToolResultsToPrune(messages);
console.log(toPrune.map(t => t.messageIndex));
// Before fix: [2, 3] (wrong - newest!)
// After fix:  [0, 1] (correct - oldest!)
```

## Detection

Unit tests caught this bug. Without tests, the bug would have:
1. Pruned the newest tool results instead of oldest
2. Caused data loss for recent important tool outputs
3. Left old large tool results in context, defeating the purpose of Micro Compact

## Lessons

1. **Always test sort logic** with pre-sorted data that doesn't match the sort direction
2. **Use explicit expectations** - don't rely on implicit ordering
3. **Test edge cases** where input data happens to be in expected output order
