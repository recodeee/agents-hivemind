## Implementation

- [x] Inspect claim storage, health, rescue, and coordination sweep code.
- [x] Align sweep claim buckets with active/stale/expired health semantics.
- [x] Include git-remote repo-root aliases in the sweep filter.
- [x] Keep dry-run/read-only behavior and retain audit observations.
- [x] Add focused CLI tests for active/stale/expired claim reporting.

## Verification

- [x] `pnpm exec biome check packages/core/src/coordination-sweep.ts packages/core/src/index.ts apps/cli/src/commands/coordination.ts apps/cli/test/coordination.test.ts`
- [x] `pnpm --filter @imdeadpool/colony-cli test -- coordination.test.ts`
- [x] `pnpm --filter @colony/core typecheck`
- [x] `pnpm --filter @imdeadpool/colony-cli typecheck`
- [x] `openspec validate agent-agent-11-stale-claim-sweep-cleanup-actionable-2026-04-29-00-44 --strict`

## Completion / Cleanup

- [ ] Commit changes.
- [ ] Push branch.
- [ ] Open/update PR.
- [ ] Merge PR.
- [ ] Prune sandbox worktree.
- [ ] Record final proof.
