## Compact Instructions

When compressing, preserve in priority order:

1. Architecture decisions (NEVER summarize)
2. Modified files and their key changes
3. Current verification status (pass/fail)
4. Open TODOs and rollback notes
5. Tool outputs (can delete, keep pass/fail only)

## type check
1. if testing， do not forget to do type check
2. if type checking， plase use bun type check tool


## Verification

For backend changes:

- Run build or if available, run lint 
- For API changes, update contract tests under `tests/contracts/`

For UI changes:

- Capture before/after screenshots if visual

Definition of done:

- All tests pass
- Lint passes
- No TODO left behind unless explicitly tracked