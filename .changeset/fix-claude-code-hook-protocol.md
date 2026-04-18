---
"cavemem": patch
"@cavemem/hooks": patch
"@cavemem/storage": patch
"@cavemem/installers": patch
---

Fix Claude Code hook integration so the memory system actually works end-to-end:

- **Hook input fields:** handlers now read the field names Claude Code actually sends (`tool_name`, `tool_response`, `last_assistant_message`, `source`, `reason`) while keeping the legacy aliases (`tool`, `tool_output`, `turn_summary`) for non-Claude IDEs and existing tests.
- **Hook stdout protocol:** the CLI no longer dumps internal telemetry JSON onto stdout — that JSON was being injected verbatim into the agent's context as `additionalContext` for `SessionStart` / `UserPromptSubmit`. Telemetry is now written to stderr; stdout carries Claude Code's `{ "hookSpecificOutput": { "hookEventName": "...", "additionalContext": "..." } }` shape only when there is real context to surface.
- **Resume / clear / compact no longer crash:** `Storage.createSession` switched to `INSERT OR IGNORE`, and `SessionStart` skips the prior-session preface for non-startup sources.
- **IDE attribution:** the Claude Code installer now writes `cavemem hook run <name> --ide claude-code`, and the CLI's `hook run` accepts `--ide` so handlers know who invoked them (Claude Code itself never sends an `ide` field).
- **Publishable artifact:** `cavemem` no longer lists the private `@cavemem/mcp-server` and `@cavemem/worker` packages as runtime dependencies. Tsup already bundles every `@cavemem/*` module via `noExternal`, so the workspace deps moved to `devDependencies`. `npm install cavemem` will now resolve cleanly.
