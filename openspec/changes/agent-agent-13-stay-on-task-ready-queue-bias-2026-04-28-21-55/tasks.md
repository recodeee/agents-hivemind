# Tasks

## 1. Ranking Behavior

- [x] Inspect `task_ready_for_agent` ranking.
- [x] Add stay-on-task bias for the current claimed sub-task.
- [x] Allow urgent blocking messages and significantly higher scores to override.
- [x] Remove stay bias from completed or blocked current sub-tasks.

## 2. Explanation

- [x] Expose compact `reason` values: `continue_current_task`, `urgent_override`, `ready_high_score`.
- [x] Document the ready queue reason contract.

## 3. Tests

- [x] Add regression for current task preferred over slightly higher new work.
- [x] Add regression for blocking urgent message override.
- [x] Add regressions for completed and blocked current work removing stay bias.

## 4. Completion

- [x] Run focused tests and spec validation.
- [ ] Commit, push, PR, merge.
- [ ] Record final `MERGED` evidence and sandbox cleanup.
