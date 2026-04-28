# Tasks

- [x] Inspect existing `bridge_status` implementation, tests, and bridge docs.
- [x] Add explicit compact `hivemind`, `attention_counts`, `claimed_file_count`,
  `claimed_file_preview`, and `next_action` fields.
- [x] Preserve existing `next` and `claimed_files` fields for compatibility.
- [x] Update `.omx` active-session fixture coverage.
- [x] Update docs and bridge spec.
- [x] Run focused tests, typecheck, and OpenSpec validation.
  - `pnpm --filter @colony/mcp-server test -- test/bridge-status.test.ts` -> 1 passed.
  - `pnpm --filter @colony/mcp-server test -- test/server.test.ts` -> 16 passed.
  - `pnpm --filter @colony/mcp-server typecheck` -> passed.
  - `pnpm exec biome check apps/mcp-server/src/tools/bridge.ts apps/mcp-server/test/bridge-status.test.ts ...` -> passed.
  - `openspec validate --specs` -> 2 passed.
  - `openspec validate agent-agent-11-compact-colony-bridge-status-shape-2026-04-28-23-50 --strict` -> passed.
- [x] Commit, PR, merge, and cleanup.

## Completion / Cleanup

- PR URL: https://github.com/recodeee/colony/pull/201
- Merge state: MERGED (`gh pr view agent/agent-11/compact-colony-bridge-status-shape-2026-04-28-23-50 --repo recodeee/colony --json number,url,state,mergeCommit,headRefName,baseRefName` -> `state=MERGED`, `mergeCommit=d59da747cb642fa83f1238e096ef6a74553e6b5b`)
- Sandbox cleanup: source worktree pruned (`worktree_exists=1` from `test -d .../colony__agent-11__compact-colony-bridge-status-shape-2026-04-28-23-50; printf "worktree_exists=%s\n" "$?"`), local and remote tracking branches absent.
