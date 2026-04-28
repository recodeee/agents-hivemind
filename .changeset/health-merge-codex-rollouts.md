---
"@imdeadpool/colony-cli": minor
---

`colony health` now merges Codex CLI rollout `mcp_tool_call_end` events from `~/.codex/sessions/` into its share view, matching the recodee dashboard's existing ingest path. Codex doesn't fire colony's PostToolUse hook, so previously every Codex-side MCP call was invisible to `colony health` — `0 / 0 (n/a)` even when the dashboard counted hundreds. The reader honours `CODEX_CLI_SESSIONS_ROOT` like the dashboard backend, and the formatter prints a `sources` line whenever any rollout event was folded in so the breakdown stays auditable.
