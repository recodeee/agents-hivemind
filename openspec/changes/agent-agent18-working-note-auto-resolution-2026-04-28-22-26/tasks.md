# Tasks

## 1. Inspect Existing APIs

- [x] Inspect `task_post` MCP registration.
- [x] Inspect `TaskThread.post` and task lookup APIs.
- [x] Inspect task-thread tests and ToolSearch description tests.

## 2. Implementation

- [x] Add Colony-native working note tool.
- [x] Resolve active task from session plus optional repo/branch.
- [x] Return compact candidates on ambiguity.
- [x] Keep notes task/session scoped through `MemoryStore`.

## 3. Tests And Docs

- [x] Add tests for single active task resolution.
- [x] Add tests for repo/branch disambiguation.
- [x] Add tests for ambiguous candidate response.
- [x] Add ToolSearch-friendly description test.
- [x] Update README and MCP docs.

## 4. Verification

- [x] `pnpm exec vitest run apps/mcp-server/test/task-threads.test.ts apps/mcp-server/test/server.test.ts`
- [x] `pnpm --filter @colony/mcp-server typecheck`
- [x] `pnpm exec biome check apps/mcp-server/src/tools/task.ts apps/mcp-server/test/task-threads.test.ts apps/mcp-server/test/server.test.ts README.md docs/mcp.md`
- [x] `openspec validate agent-agent18-working-note-auto-resolution-2026-04-28-22-26 --strict`
- [x] `git diff --check`

## 5. Completion

- [ ] Commit changes.
- [ ] Push branch.
- [ ] Open/update PR.
- [ ] Merge PR and record final `MERGED` evidence.
- [ ] Confirm sandbox worktree cleanup.
