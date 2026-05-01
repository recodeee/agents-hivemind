# Tasks

- [x] Add MCP schemas and handlers for quota claim accept, decline, and expired release.
- [x] Add core lifecycle operations for accepting quota-pending claims.
- [x] Keep declined quota relays/handoffs visible to other agents and record reason metadata.
- [x] Add `weak_expired` claim state and migration support.
- [x] Add tests for accepted, declined, expired release, already accepted, missing task, no permission, and conflict paths.
- [x] Run focused verification.
  - MCP tests: `pnpm --filter @colony/mcp-server test -- task-threads` passed.
  - Storage tests: `pnpm --filter @colony/storage test` passed.
  - Typecheck: `pnpm --filter @colony/storage typecheck`, `pnpm --filter @colony/core typecheck`, and `pnpm --filter @colony/mcp-server typecheck` passed.
  - Lint/format: `pnpm exec biome check apps/mcp-server/src/tools/task.ts packages/core/src/task-thread.ts packages/core/src/claim-age.ts packages/storage/src/types.ts packages/storage/src/schema.ts packages/storage/src/storage.ts apps/mcp-server/test/task-threads.test.ts` passed.
  - OpenSpec: `openspec validate agent-codex-quota-pending-claim-tools-2026-05-01-14-57 --strict` passed.

## Cleanup

- [x] Finish PR, merge, and sandbox cleanup; record PR URL and `MERGED` evidence.
  - PR: https://github.com/recodeee/colony/pull/331
  - State: `MERGED`
  - Merge commit: `75439a5f6309f227bc009db2bf5c47f8cbc1175f`
  - Merged at: `2026-05-01T13:17:37Z`
  - Source worktree: pruned by `gx branch finish --branch agent/codex/quota-pending-claim-tools-2026-05-01-14-57 --base main --via-pr --wait-for-merge --cleanup`
