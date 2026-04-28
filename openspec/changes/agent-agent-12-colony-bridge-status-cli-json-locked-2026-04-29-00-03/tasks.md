# Tasks

## 1. Implementation

- [x] Inspect CLI command registration structure.
- [x] Add `colony bridge status --json`.
- [x] Wire `--repo-root`, `--session-id`, `--agent`, and `--branch`.
- [x] Reuse the MCP bridge-status payload builder for matching output.

## 2. Verification

- [x] Add CLI test coverage.
- [x] Run `pnpm --filter @imdeadpool/colony-cli test -- bridge.test.ts program.test.ts`.
- [x] Run `pnpm --filter @colony/mcp-server test -- bridge-status.test.ts`.
- [x] Run `pnpm --filter @imdeadpool/colony-cli typecheck`.
- [x] Run `pnpm --filter @colony/mcp-server typecheck`.
- [x] Run `pnpm --filter @imdeadpool/colony-cli build`.
- [x] Manually run built `colony bridge status --json` against a temp data dir.

## 3. Cleanup

- [ ] Commit, push, PR, merge, and sandbox cleanup.
- PR URL: pending.
- Merge state: pending.
- Sandbox cleanup: pending.
