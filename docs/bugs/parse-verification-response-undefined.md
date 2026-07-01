# Bug: `parseVerificationResponse` Called on Potentially `undefined` Value

## Summary

`server/services/self-verification/llm.ts` line 74 calls `.trim()` on `data.choices[0]?.message?.content` without a null check. If the LLM API response structure is unexpected (e.g., missing `message` field, empty `choices` array), this throws a TypeError before `parseVerificationResponse` is even called. The undefined check at line 84 becomes unreachable in the crash case.

## Severity

**Medium** — TypeError crashes the verification flow. If the LLM returns an unexpected response shape, the entire self-verification pipeline throws instead of gracefully falling back to `passed: true`.

## Root Cause

Missing defensive programming — no guard on the LLM response structure before calling `.trim()`:

```typescript
// server/services/self-verification/llm.ts line 73-76
const data = await response.json();
const content = data.choices[0]?.message?.content?.trim();  // ← .trim() on potentially undefined

return parseVerificationResponse(content);  // content could be undefined here
```

```typescript
// server/services/self-verification/llm.ts line 83-86
function parseVerificationResponse(content: string | undefined): VerificationResult {
  if (!content) {  // ← This guard never reached if content is undefined at line 74
    console.warn('[SelfVerification] Empty verification response');
    return { passed: true };
  }

  if (content.startsWith("PASS")) {  // ← TypeError if content is undefined
```

## Affected Files

| File | Line | Issue |
|------|------|-------|
| `server/services/self-verification/llm.ts` | 74 | `.trim()` called on potentially undefined `content` |
| `server/services/self-verification/llm.ts` | 89 | `content.startsWith("PASS")` — unreachable if undefined at line 74 |

## Fix

Use optional chaining so `.trim()` returns `undefined` rather than throwing:

```typescript
// server/services/self-verification/llm.ts line 73-74 — FIX
const data = await response.json();
const content = data.choices[0]?.message?.content?.trim();  // undefined if missing

return parseVerificationResponse(content);
```

Now `parseVerificationResponse(undefined)` is called, the `!content` guard at line 84 catches it, and verification gracefully defaults to `{ passed: true }`.

## Note

The function signature already correctly typed `content: string | undefined`:

```typescript
function parseVerificationResponse(content: string | undefined): VerificationResult
```

The intent was there — the missing optional chaining on line 74 is what prevented the guard from ever being reached.
