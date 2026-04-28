---
'@colony/storage': patch
'@imdeadpool/colony-cli': patch
---

Add `Storage.toolInvocationDistribution(since_ts, limit?)` and surface it as Section 5 of `colony debrief` (the timeline becomes Section 6). Each `tool_use` observation already carries the tool name in `metadata.tool`, so this is a pure read-side aggregation — no new write path or worker state file. The output lists every tool that fired in the window with call count and percent share, sorted descending; `mcp__*` tools are tinted cyan so MCP-vs-builtin signal stands out at a glance. The point is empirical: if `mcp__colony__task_post` fires once and `mcp__colony__task_propose` fires zero times in a week, that's a real signal about which mechanism is doing the work.
