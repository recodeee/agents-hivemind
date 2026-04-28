## Implementation

- [x] Inspect existing queen sweep, rescue, debrief, and coordination sweep commands.
- [x] Extend coordination sweep JSON with fresh claims, stale claims, expired/weak claims, top stale branches, and suggested cleanup action.
- [x] Render the same claim cleanup signal in human CLI output.
- [x] Keep sweep read-only; no audit observations are deleted.
- [x] Add focused CLI tests for stale-claim buildup reporting.

## Verification

- [x] `pnpm exec biome check packages/core/src/coordination-sweep.ts packages/core/src/index.ts apps/cli/src/commands/coordination.ts apps/cli/test/coordination.test.ts`
- [x] `pnpm --filter @imdeadpool/colony-cli test -- coordination.test.ts`
- [x] `pnpm --filter @colony/core typecheck`
- [x] `pnpm --filter @imdeadpool/colony-cli typecheck`
- [x] `openspec validate agent-agent-8-stale-claim-sweep-report-2026-04-28-23-55 --strict`

## Completion / Cleanup

- [ ] Commit changes.
- [ ] Push branch.
- [ ] Open/update PR.
- [ ] Merge PR.
- [ ] Prune sandbox worktree.
- [ ] Record final proof.
