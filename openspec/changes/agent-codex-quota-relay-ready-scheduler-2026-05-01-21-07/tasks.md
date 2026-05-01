## 1. Implementation

- [x] Inspect `task_ready_for_agent` ranking.
- [x] Add/complete `quota_relay_ready` ready item metadata.
- [x] Include exact `task_claim_quota_accept` `claim_args`.
- [x] Rank quota relays above new work when they have active files or block downstream plans.
- [x] Keep expired/released quota claim args acceptable through `task_claim_quota_accept`.

## 2. Verification

- [x] Add ready-queue regression tests.
- [x] Run `pnpm --filter @colony/mcp-server test -- ready-queue.test.ts`.
- [x] Run `pnpm --filter @colony/core test -- task-thread.test.ts`.
- [x] Run `pnpm exec biome check apps/mcp-server/src/tools/ready-queue.ts apps/mcp-server/test/ready-queue.test.ts packages/core/src/task-thread.ts`.
- [x] Run `pnpm --filter @colony/mcp-server typecheck`.
- [x] Run `pnpm --filter @colony/core typecheck`.
- [x] Run `openspec validate agent-codex-quota-relay-ready-scheduler-2026-05-01-21-07 --strict`.
- [x] Run `openspec validate --specs`.

## 3. Completion / Cleanup

- [ ] Commit changes.
- [ ] Push branch.
- [ ] Open/update PR.
- [ ] Record PR URL.
- [ ] Verify PR state is `MERGED`.
- [ ] Verify sandbox worktree cleanup.
