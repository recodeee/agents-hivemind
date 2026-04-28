# Tasks

## 1. Inspect Metrics

- [x] Inspect `colony health` adoption thresholds and local storage counters.
- [x] Confirm `toolCallsSince()` and `claimBeforeEditStats()` provide cheap
      local telemetry without scanning rollout logs.

## 2. Live Nudges

- [x] Add compact optional adoption nudges to `hivemind_context` summary.
- [x] Suggest `task_ready_for_agent` when task-list usage outpaces ready-work
      selection.
- [x] Suggest `task_note_working` when OMX notepad writes outpace Colony working
      notes.
- [x] Suggest `task_claim_file` when claim-before-edit coverage is below target.
- [x] Keep metric reads non-blocking if local telemetry is unavailable.

## 3. Verification

- [x] Add MCP tests with synthetic telemetry.
- [x] Run targeted MCP tests.
      Evidence: `pnpm --filter @colony/mcp-server test -- server.test.ts`
      passed, 18 tests.
- [x] Run typecheck or the narrowest available compile check.
      Evidence: `pnpm --filter @colony/mcp-server typecheck` passed.
- [x] Run OpenSpec validation.
      Evidence:
      `openspec validate agent-agent-16-live-health-nudges-2026-04-29-00-17 --type change --strict`
      passed.

## 4. Completion

- [ ] Commit, push, PR, merge.
- [ ] Record final `MERGED` evidence and sandbox cleanup.
