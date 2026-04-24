---
"@imdeadpool/colony-cli": minor
"@colony/hooks": minor
---

Finish the foraging loop: users get a `colony foraging` command group
and SessionStart auto-scans in the background.

CLI (`@imdeadpool/colony-cli`):

- `colony foraging scan [--cwd <path>]` — synchronous scan of
  `<cwd>/examples` that re-indexes changed food sources and leaves
  unchanged ones alone. Respects every field in `settings.foraging.*`.
- `colony foraging list [--cwd <path>]` — prints the cached example
  rows (name, manifest kind, observation count, last-scanned date).
- `colony foraging clear [--example <name>] [--cwd <path>]` — drops
  example rows and their foraged-pattern observations.

Hooks (`@colony/hooks`):

- `sessionStart` now detach-spawns `colony foraging scan --cwd <cwd>`
  via `@colony/process#spawnNodeScript` when `settings.foraging.enabled`
  and `scanOnSessionStart` are both true. The hook never waits on it —
  the synchronous preface only surfaces state from previous scans,
  keeping the 150 ms p95 budget intact.
- New `buildForagingPreface(store, input)` injects a compact
  "## Examples indexed (foraging)" block when cached examples exist
  for the current cwd: lists up to 5 example names with an overflow
  count, and points agents at `examples_query` /
  `examples_integrate_plan`.

Closes the foraging roadmap: agents can now discover, query, and plan
integrations against `<repo_root>/examples` without a manual step.
