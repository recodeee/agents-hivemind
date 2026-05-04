# Pathfinder File History (v1)

## Problem

Colony stores the substrate of self-learning (observations, claims, completions) but agents starting a lane have no compact way to ask "did past work on these files hit a known wall?". An agent picking up a sub-task touches a file that previously caused conflicts, takeovers, or quota stops, and pays the same surprise cost the previous lane did.

Ruflo's researcher pattern surfaces this as a feature → files → tasks → outcomes graph. Colony's flat observation log has the data but no derived signal.

## Change

- Add storage method `fileTroubleHistory({ file_paths, since_ts, limit? })` returning compact per-file rows: `{ file_path, completions, conflicts, takeovers, abandonments, last_touched_ts }`.
- Add MCP tool `task_file_history({ file_paths, since_ts? })` that wraps it with progressive-disclosure shape (per-file summary + an aggregate `summary` line).
- Wire the signal into `task_ready_for_agent`'s existing `negative_warnings` array on each ready entry: when a sub-task's `file_scope` overlaps with a file whose `conflicts + takeovers + abandonments` exceeds `completions` in the last 14 days, attach a `pathfinder_file_history` warning naming the troubled files and counts.
- Keep the rank order untouched in v1. Boost/penalty integration is left for v2 once the signal proves itself in the wild.

## Acceptance

- `task_file_history` returns 0 for files Colony has not seen.
- `task_file_history` counts completed `plan-subtask-claim` rows as completions, `claim-conflict` rows as conflicts, `lane-takeover` rows as takeovers, and `quota_handoff`/`quota_relay` rows as abandonments.
- `task_ready_for_agent` ready entries include `pathfinder_file_history` in `negative_warnings` when scope overlaps with troubled files.
- Storage queries use indexed scans only — `task_file_history` p95 < 50 ms on a 50k-observation store.

## Verification

- `pnpm --filter @colony/storage test`: green.
- `pnpm --filter @colony/core test`: green.
- `pnpm --filter @colony/mcp-server test`: green.
- `pnpm --filter @colony/storage --filter @colony/mcp-server typecheck`: green.
- New tests cover empty file scope, single-file completion + conflict mix, and ready-queue warning emission.
