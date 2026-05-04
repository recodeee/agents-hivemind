---
"@colony/storage": patch
"@colony/core": patch
"@colony/mcp-server": patch
---

Five colony-health improvements:

- `claimBeforeEditStats` now strips the managed agent-worktree prefix (`.omx/agent-worktrees/<lane>/` and `.omc/agent-worktrees/<lane>/`) when comparing edit and claim file paths. Edits recorded inside a worktree now line up with claims posted on canonical repo-relative paths, so the claim-before-edit metric stops reporting `path_mismatch` for the same logical file.
- `task_ready_for_agent` now defaults `auto_claim` to true: when there is a single unambiguous ready sub-task assigned to the caller, the server runs the claim transaction in the same call and reports outcome via `auto_claimed`. Browse-only callers can pass `auto_claim: false` to opt out.
- The plan auto-archive sweep reconciles plans whose change directory was already moved to `openspec/changes/archive/<date>-<slug>/` on disk: it records a `plan-archived` observation referencing the archive path instead of looping forever as completed-but-unarchived. The sweep also strips a deleted agent-worktree segment from the parent task's `repo_root` before opening `SpecRepository`, so plans whose lane was pruned still archive cleanly.
- `task_plan_complete_subtask` now writes the sub-task's `capability_hint` into the completion observation metadata, enabling per-capability outcome attribution.
- New core helpers `outcomeBoostScore`/`loadOutcomeBoost` and storage method `agentCapabilityCompletions` add a small (≤0.2) rolling fit-score boost in `rankSubtask` for agents who have recently completed work in the same capability dimension. Diminishing returns and a 14-day window keep stale or one-off completions from dominating routing.
