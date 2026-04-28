## Why

`colony health` already separates active, stale, and expired/weak claims, but the coordination sweep used fresh/stale wording and treated every stale claim without pheromone data as weak. That makes dry-run cleanup look broader than the health signal operators are trying to act on.

## What Changes

- Align `colony coordination sweep --repo-root <path> --dry-run --json` with health-style active, stale, and expired/weak claim buckets.
- Resolve git-remote repo aliases so current checkout paths still find claims recorded under an older local path for the same repository.
- Keep backward-compatible `fresh_*` and `suggested_cleanup_action` JSON aliases while adding `active_*` and `recommended_action`.
- Keep the sweep read-only; cleanup remains advisory unless an explicit apply path is added later.

## Impact

Operators can identify stale ownership and expired/weak cleanup candidates without deleting audit observations or over-counting claims that simply lack pheromone data.
