---
"@colony/storage": minor
"@colony/core": minor
"@colony/mcp-server": minor
"colonyq": minor
---

ICM slice 3 — observation importance + temporal decay.

Every observation now carries an `importance` tier
(`critical | high | medium | low`, default `medium`), a rolling
`access_count`, a `last_accessed_at` timestamp, and a `weight` value.
Critical/high pin their weight to the base value and never decay;
medium/low decay as `baseWeight / (1 + access_count * 0.1)` whenever
they are read. Read paths (`MemoryStore.search`, `getObservations`,
`semanticSearch`) coalesce ids into a debounced 50ms batch and flush
the access bookkeeping in one transactional UPDATE, so heavy read
loops trade at most one extra write per ~50ms window.

Search and `get_observations` MCP responses now include `importance`
and `weight` on each row (additive — older callers ignore them).
`task_post` accepts an optional `importance` parameter forwarded to
the underlying observation insert.

New CLI subcommand `colony memory prune` deletes near-zero-weight
medium/low rows; `--min-weight <n>` overrides the default 0.1
threshold and `--dry-run` reports the candidate count without
deleting. Critical/high are never affected.

Storage: schema bumped to version 15 with four additive columns on
`observations` and two new indexes. `Storage.recordAccess`,
`Storage.pruneLowDecay`, and `Storage.countLowDecayCandidates` are
the public primitives.
