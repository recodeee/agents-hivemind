# Tasks

- [x] Inspect `task_note_working`, `task_post`, pointer config, and existing bridge tests.
- [x] Update AGENTS bridge guidance so working state tries `task_note_working` first.
- [x] Update MCP docs with pointer/fallback semantics.
- [x] Add contract tests for the first-write-path guidance.
- [x] Run focused docs/contract tests.
- [x] Run OpenSpec validation.
- [ ] Finish branch through PR merge and sandbox cleanup.

## Verification

- `node --test test/agents-contract.test.js` - pass, 3 tests.
- `pnpm --filter @colony/mcp-server test -- task-threads.test.ts server.test.ts` - pass, 38 tests.
- `pnpm --filter @colony/config test` - pass, 5 tests.
- `openspec validate agent-agent-5-task-note-working-first-write-path-2026-04-29-00-39 --type change --strict` - pass.
- `pnpm exec biome check AGENTS.md docs/mcp.md test/agents-contract.test.js openspec/changes/agent-agent-5-task-note-working-first-write-path-2026-04-29-00-39/proposal.md openspec/changes/agent-agent-5-task-note-working-first-write-path-2026-04-29-00-39/tasks.md openspec/changes/agent-agent-5-task-note-working-first-write-path-2026-04-29-00-39/specs/omx-colony-bridge/spec.md` - pass for the checkable touched file.
- `pnpm lint` - blocked by pre-existing Biome formatting errors in `packages/hooks/src/auto-claim.ts` and `packages/hooks/src/handlers/post-tool-use.ts`, both untouched by this lane.
