---
"@colony/mcp-server": minor
---

Add `task_suggest_approach` MCP tool — sub-system 4a of the
predictive-suggestions brief. The tool is the MCP-side surface of
the suggestion pipeline: takes a free-text task description, embeds
it via the existing lazy-singleton embedder, runs `findSimilarTasks`
+ `buildSuggestionPayload` from `@colony/core`, and returns the
structured payload (similar tasks + first-files ranking + patterns
to watch + resolution hints, OR an explicit
`insufficient_data_reason` when the corpus is too sparse).

The honesty discipline lives at the tool boundary: when the embedder
is unavailable or fails, when the corpus is below `MIN_CORPUS_SIZE`,
or when fewer than `MIN_SIMILAR_TASKS_FOR_SUGGESTION` similar tasks
were surfaced, the tool returns an empty payload with a one-sentence
reason. Callers (the upcoming CLI command and SessionStart preface
integration in 4b/4c) branch on `insufficient_data_reason` first and
refuse to show suggestions when set, rather than rendering low-
confidence noise that would erode trust in the surface.

5 new integration tests via the MCP client/inMemory transport pair
cover: embedder unavailable, corpus too small, happy path with
mixed-axis tasks, `current_task_id` self-exclusion, `repo_root`
scoping. Plus the tools-list snapshot in `server.test.ts` is
extended with the new entry.

Refs: sub-system 4a of the predictive-suggestions brief. CLI
`colony suggest` (4b) and SessionStart preface integration (4c)
follow as separate PRs.
