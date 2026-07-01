# Bug: `extractFromTurnEvent` Excludes `thinking` Content

## Summary

`lib/session-transcript.ts` has two functions that extract text from assistant messages:

- `extractFromMessages` (line 33) — **includes** `thinking` type content
- `extractFromTurnEvent` (line 84) — **excludes** `thinking` type content

This means the same LLM response yields different content depending on which extraction path is used (HTTP API vs WebSocket `turn_end` event).

## Severity

**Low** — API design inconsistency, not a crash. Content length may differ between HTTP and WebSocket paths.

## Root Cause

Data filtering logic — `type === "thinking"` is handled differently in two functions:

```typescript
// lib/session-transcript.ts line 33-34 (extractFromMessages — HTTP API path)
.filter((c: any) => c.type === "text" || c.type === "thinking")
.map((c: any) => (c.type === "thinking" ? c.thinking : c.text))

// lib/session-transcript.ts line 84 (extractFromTurnEvent — WebSocket turn_end path)
.filter((c: any) => c.type === "text")
.map((c: any) => c.text)
```

## Affected Files

| File | Line | Role |
|------|------|------|
| `lib/session-transcript.ts` | 33-34 | `extractFromMessages` — includes `thinking` |
| `lib/session-transcript.ts` | 84 | `extractFromTurnEvent` — excludes `thinking` |

## Impact

- HTTP API callers get `thinking` content merged into `response.text`
- WebSocket `turn_end.content` gets only pure `text`, no `thinking`
- Frontend receives `think_block` events separately (WebSocket) but `turn_end.content` won't contain thinking text
- These two paths are inconsistent by design (see Pre-Mortem #13), but if `thinking` should be visible in `turn_end.content`, this is a bug

## Clarification

This may be **intentional design** (see Pre-Mortem #13):
- WebSocket: `thinking` sent as separate `think_block` events (frontend controls rendering position)
- HTTP: `thinking` merged into `response.text` (simpler, no separate field)

If the design decision is to keep them separate (Strategy B), then `extractFromTurnEvent` is correct as-is. If the intent is for `turn_end.content` to match HTTP API content, then the filter on line 84 needs to be updated.

## Fix (if unified content desired)

```typescript
// lib/session-transcript.ts line 82-85 — update extractFromTurnEvent
const textParts =
  message?.content
    ?.filter((c: any) => c.type === "text" || c.type === "thinking")
    .map((c: any) => (c.type === "thinking" ? c.thinking : c.text)) || [];
```

This makes `extractFromTurnEvent` consistent with `extractFromMessages`.
