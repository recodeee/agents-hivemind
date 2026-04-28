---
"@colony/core": minor
---

Add `buildSuggestionPayload` — sub-system 3 of the predictive-
suggestions brief. Turns a list of similar past tasks (from
`findSimilarTasks`) into structured hints an agent or human can act
on: which files to claim early, which failure patterns showed up
before, what resolution timing to expect.

`packages/core/src/suggestion-payload.ts`:

- `first_files_likely_claimed` ranks files that appeared early in
  similar tasks (default: first 3 unique claims per task) and weights
  more recent tasks higher via a 30-day exponential decay. Confidence
  uses a Wilson lower-bound approximation so a "1 of 1" appearance
  scores ~0.5 instead of 1.0 — without that dampening, small samples
  would dominate the ranking and train agents to distrust it.
- `patterns_to_watch` surfaces up to 5 prior trouble signals
  (`expired-handoff`, `cancelled-handoff`, `plan-archive-blocked`,
  `stalled-subtask`) with truncated descriptions and the source
  task_id for follow-up.
- `resolution_hints` returns null when fewer than 2 completed similar
  tasks exist (insufficient data for a median); otherwise computes
  median elapsed minutes, median accepted-handoff count, and median
  sub-task count (null when no completed sample used a plan).
- `insufficient_data_reason` is the load-bearing honesty field. Set
  when the corpus is below `MIN_CORPUS_SIZE` or fewer than
  `MIN_SIMILAR_TASKS_FOR_SUGGESTION` similar tasks were surfaced.
  When set, the structured fields above are empty/null. The
  suggestion surface (next PR) reads this first and refuses to make
  a suggestion at all rather than emitting low-confidence noise.

11 new tests cover both honesty gates, the 1/2/3-of-3 ranking shape,
the first-N-claims cap, all three pattern kinds with the cap honored,
the `<2 completed`-returns-null path, and the median computation.

Refs: sub-system 3 of the predictive-suggestions brief. Sub-system 4
(MCP `task_suggest_approach` + CLI `colony suggest` + SessionStart
preface integration) ships next.

Built atop sub-system 2 (`findSimilarTasks`, `SimilarTask`) — this
PR's branch is based on `agent/claude/task-similarity-search-...`,
so the diff against main shows the union of sub-systems 2, 3, 5 if
that branch hasn't merged yet.
