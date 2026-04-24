---
"@colony/foraging": minor
"@colony/storage": minor
"@colony/config": minor
---

Add the foraging indexer and a storage-aware `scanExamples` wrapper.

`indexFoodSource(food, store, opts)` converts a discovered `FoodSource`
into 1–N `foraged-pattern` observations (manifest, README,
entrypoints, filetree), scrubs env-assignment secrets through
`redact`, and persists via `MemoryStore` so compression and the
`<private>` tag stripper both run on the write path.

`scanExamples({ repo_root, store, session_id, limits?, extra_secret_env_names? })`
walks `<repo_root>/examples/*`, compares each discovered source's
`content_hash` against `storage.getExample(...)`, and only re-indexes
when the hash has shifted. Before re-indexing it calls the new
`Storage.deleteForagedObservations(repo_root, example_name)` so the
observation set never duplicates across scans.

Two helpers on `Storage` to let the indexer (and the forthcoming MCP
tool) work without opening the DB themselves:

- `deleteForagedObservations(repo_root, example_name): number`
- `listForagedObservations(repo_root, example_name): ObservationRow[]`

New `settings.foraging` block (defaults: enabled, `maxDepth: 2`,
`maxFileBytes: 200_000`, `maxFilesPerSource: 50`,
`scanOnSessionStart: true`, `extraSecretEnvNames: []`). `colony config
show` and `settingsDocs()` pick it up automatically.

No MCP tools, CLI commands, or hook wiring yet — those arrive in the
next PR.
