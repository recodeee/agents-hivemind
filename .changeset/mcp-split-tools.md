---
'@colony/mcp-server': patch
---

Split `apps/mcp-server/src/server.ts` into eight per-tool-group modules
under `src/tools/` (search, hivemind, task, handoff, proposal, profile,
wake, plus shared/context/heartbeat helpers). `buildServer()` is now a
small registration list that calls `register(server, ctx)` on each
group in the same order the tools appeared in the pre-split file.
Behavior is unchanged — all 17 mcp-server tests (InMemory MCP client
hitting every tool + task-thread suites) pass without modification.
