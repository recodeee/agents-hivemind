## 1. Implementation

- [x] Inspect quota-pending claim storage and `task_ready_for_agent`.
- [x] Add `quota_relay_ready` ready entries for `handoff_pending` quota claims.
- [x] Add exact `task_claim_quota_accept` claim args.
- [x] Rank downstream-blocking quota relays ahead of ordinary ready subtasks.
- [x] Add `task_claim_quota_accept` accept/claim tool.

## 2. Verification

- [x] Add ready-queue tests for live quota handoff, blocking rank, and expired relay claim.
- [x] Update MCP tool registry test.
- [x] Run `pnpm exec biome check apps/mcp-server/src/tools/ready-queue.ts apps/mcp-server/src/tools/bridge.ts apps/mcp-server/test/ready-queue.test.ts apps/mcp-server/test/server.test.ts`.
- [x] Run `pnpm --filter @colony/mcp-server test -- ready-queue.test.ts server.test.ts`.
- [x] Run `pnpm --filter @colony/mcp-server typecheck`.
- [x] Run OpenSpec validation: `openspec validate agent-agent-6-quota-relay-ready-work-2026-05-01-14-57 --type change --strict`.

## 3. Completion / Cleanup

- [ ] Commit changes.
- [ ] Push branch.
- [ ] Open/update PR.
- [ ] Record PR URL.
- [ ] Verify PR state is `MERGED`.
- [ ] Verify sandbox worktree cleanup.
