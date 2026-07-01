# NOT A BUG: `generateSummary` Uses `SKIP`

## Summary

This was initially flagged as a stub that should be replaced with a real LLM call, but `SKIP` in `server/services/memory/llm.ts` is **intentional behavior** — it signals that summary generation should be handled by a separate process (the `compact` extension's `contextCollapse` module) rather than by the memory service itself.

## Status

**Not a bug.** No action needed.

## Explanation

The memory service and compact/context-collapse service have distinct responsibilities:

- **Memory service** (`memory/llm.ts`): Handles persisting session transcripts to MEMORY.md
- **Compact extension** (`contextCollapse.ts`): Handles context window compression via summarization

`generateSummary` returns `SKIP` because the memory service is not responsible for summarization — that belongs to the compact extension. This is a deliberate separation of concerns.

## Related

See `docs/architecture/deepening-opportunities.md` Pre-Mortem entry for `generateSummary` stub — entry #7 in the table incorrectly classified this as a bug.
