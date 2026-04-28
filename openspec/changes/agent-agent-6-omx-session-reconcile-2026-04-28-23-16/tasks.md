## 1. Implementation

- [x] Inspect active-session normalization, `MemoryStore.startSession`, and MCP heartbeat wiring.
- [x] Add a safe active OMX session reconciliation helper.
- [x] Wire reconciliation into MCP heartbeat/connect and tool-use paths.
- [x] Preserve CLI, agent, repo, branch, heartbeat, and worktree metadata.
- [x] Reject missing or invalid session identities.

## 2. Verification

- [x] Add fixture tests for `.omx/state/active-sessions/*.json`.
- [x] Run targeted core and MCP tests: `pnpm --filter @colony/core test -- omx-session-reconcile`; `pnpm --filter @colony/mcp-server test -- server.test.ts`.
- [x] Run typecheck or equivalent focused build check: `pnpm --filter @colony/core typecheck`; `pnpm --filter @colony/mcp-server typecheck`.
- [x] Run OpenSpec validation: `openspec validate agent-agent-6-omx-session-reconcile-2026-04-28-23-16 --type change --strict`.

## 3. Completion / Cleanup

- [ ] Commit changes.
- [ ] Push branch.
- [ ] Open/update PR.
- [ ] Record PR URL.
- [ ] Verify PR state is `MERGED`.
- [ ] Verify sandbox worktree cleanup.
