# Tasks

## 1. Inspect Current Hivemind Context

- [x] Inspect `hivemind_context` MCP registration and payload shaping.
- [x] Inspect core lane discovery, file-lock previews, and attention inbox task
      scoping.
- [x] Inspect existing MCP tests for compact memory and hydration behavior.

## 2. Compact Local Defaults

- [x] Scope explicit `repo_root` reads so env roots do not turn the result into
      a global dashboard.
- [x] Default `hivemind_context` lanes to a compact repo-local limit.
- [x] Keep compact default limits for memory hits, claims, hot files, and
      attention observation IDs.
- [x] Add compact ownership and hot-file summaries without observation bodies.
- [x] Add current-session attention counts and observation IDs for hydration.

## 3. Verification

- [x] Run targeted core and MCP tests.
- [x] Run typecheck or the narrowest available compile check for touched
      packages.
- [x] Run OpenSpec validation.

## 4. Completion

- [ ] Commit, push, PR, merge.
- [ ] Record final `MERGED` evidence and sandbox cleanup.
