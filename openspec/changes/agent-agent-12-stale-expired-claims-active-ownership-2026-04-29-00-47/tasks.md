## Implementation

- [x] Inspect `hivemind_context`, `attention_inbox`, `task_claim_file`, health classifiers, and related resume ownership paths.
- [x] Keep expired claims out of the health stale bucket and active ownership count.
- [x] Restrict relay inherited claims to fresh active ownership.
- [x] Add regression tests with stale and expired claim timestamps.
- [x] Update MCP docs for weak stale ownership behavior.

## Verification

- [x] `pnpm install --offline --frozen-lockfile --config.confirmModulesPurge=false`
- [x] `pnpm --filter @colony/core test -- task-thread.test.ts`
- [x] `pnpm --filter @imdeadpool/colony-cli test -- health.test.ts`
- [x] `pnpm --filter @colony/core test -- claim-graph.test.ts attention-inbox.test.ts task-thread.test.ts`
- [x] `pnpm --filter @colony/mcp-server test -- task-threads.test.ts server.test.ts plan-validate.test.ts ready-queue.test.ts`
- [x] `pnpm --filter @colony/core typecheck`
- [x] `pnpm --filter @imdeadpool/colony-cli typecheck`
- [x] `pnpm exec biome check apps/cli/src/commands/health.ts apps/cli/test/health.test.ts packages/core/src/task-thread.ts packages/core/test/task-thread.test.ts docs/mcp.md`
- [x] `git diff --check`
- [x] `openspec validate agent-agent-12-stale-expired-claims-active-ownership-2026-04-29-00-47 --strict`

## Completion / Cleanup

- [x] Commit changes: `0c1175a` on `agent/agent-12/stale-expired-claims-active-ownership-2026-04-29-00-47`.
- [x] Push branch: `origin/agent/agent-12/stale-expired-claims-active-ownership-2026-04-29-00-47`.
- [x] Open/update PR: https://github.com/recodeee/colony/pull/224.
- [x] Merge PR: `MERGED` at `2026-04-28T22:57:14Z`, merge commit `f447cb725bd11af5d4fe5b21aa92b9eae5dffc78`.
- [x] Prune sandbox worktree: `colony__agent-12__stale-expired-claims-active-ownership-2026-04-29-00-47` absent from `git worktree list`.
- [x] Record final proof: local and remote `agent/agent-12/stale-expired-claims-active-ownership-2026-04-29-00-47` refs absent after cleanup.
