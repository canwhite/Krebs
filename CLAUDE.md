# CLAUDE.md

**All experience summaries in this file are general principles. Future summaries should follow general patterns, avoiding case-by-case specifics.**

## Debug Principle 1: Log Immediately at Framework Boundaries

When data crosses a framework boundary (router → handler, middleware → handler, etc.), **log immediately on the receiving side**—don't trust that the framework passed it correctly.

- Framework primitives (params, context, etc.) may return unexpected values
- Use curl to bypass the client and verify server behavior directly

## New Dependencies / SDK Migration: Always Read Source First

**Before introducing a new library or migrating versions:**
1. Read the key source implementation (`node_modules/{package}/dist/`)
2. Verify exports, function signatures, calling conventions, and data formats
3. Documentation ≠ source code—docs may be wrong or outdated

## Debug Principle 2: Check Logs First, Don't Guess

When encountering issues, the first response should be to check logs, not to try things repeatedly.

- The beginning of a log often contains the root cause clue
- Use `docker inspect` to check ExitCode, not just `docker logs`

## Verification (Required After Any Change)

After any change (no matter how small):
1. `bun run build` — must pass
2. `bunx tsc --noEmit` — **entire project**, no grep filtering, fix all errors
3. Runtime verification (server starts + API responses correct)

**Definition of done:**
- Build passes
- `bunx tsc --noEmit` zero errors across entire project
- Runtime verification passed
- No TODO left behind unless explicitly tracked

## Logic Correctness Check

**Any code change must verify logic correctness in addition to running `bunx tsc --noEmit` for type checking.**

### Verification Method
1. List all execution paths affected by the change (normal + edge cases)
2. Confirm each path's return value matches expectations
3. Manually test critical paths with curl (unauthenticated / unauthorized / empty data)
4. Find logic issue → fix → re-verify all paths until complete

### Self-Check Checklist
- [ ] What execution paths does this change have?
- [ ] What is the return value of each path?
- [ ] Are edge cases (empty data, unauthenticated, unauthorized) handled correctly?
- [ ] Does anything else depend on this logic that needs updating?

## Frontend Change Verification

**Must use browser verification, not just curl.** curl doesn't trigger CORS and may miss cross-origin issues.

### Verification Steps
1. `bun run build`
2. Restart server
3. Open browser and walk through the affected user flows
4. Check DevTools Console for errors

## React Rendering Optimization

### useEffect with Function Dependencies Can Cause Infinite Loops

```tsx
// ❌ Wrong: function dependencies are unstable, new reference each render
useEffect(() => {
  fetchProjects();
}, [fetchProjects]);
```

### Alternatives

| Scenario | Solution |
|----------|----------|
| Initial data fetch | `useMount(() => store.getState().fetchX())` |
| User-triggered request | Call directly in event handler |
| List refresh | `key` change triggers re-render |
| Third-party requests | TanStack Query |
| Global initialization | Execute once at module load |

### useMount Hook
```tsx
function useMount(fn: () => void) {
  const called = useRef(false);
  if (!called.current) {
    called.current = true;
    fn();
  }
}
```

## Debug Output Methodology

**Core principle: Add output upstream of the assumed problem location, not downstream**

### Output Levels
```typescript
// Level 1: Confirm execution flow - log at function entry/exit
console.log("[DEBUG] Entering functionName", { relatedVars });

// Level 2: Confirm key variables - output actual values
console.log("[DEBUG] variableName:", actualValue);

// Level 3: Structured output
console.log("[DEBUG] result:", { field1, field2 });
```

### Log Prefix Convention
- `grep -r "\[DEBUG-" src/` to clear all debug logs at once
- Use consistent prefix within the same session

### General Problem Localization Order
1. Assume "A" is the root cause
2. Add logs at A's upstream (caller) to confirm "does execution reach A?"
3. If not reached, problem is further upstream
4. If reached, add logs at A's output/return to confirm "is output correct?"
5. Repeat until root cause found

## Compact Instructions

When compressing, preserve in priority order:

1. Architecture decisions (NEVER summarize)
2. Modified files and their key changes
3. Current verification status (pass/fail)
4. Open TODOs and rollback notes
5. Tool outputs (can delete, keep pass/fail only)
