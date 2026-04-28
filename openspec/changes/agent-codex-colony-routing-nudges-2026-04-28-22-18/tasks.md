## 1. Runtime Routing Nudges

- [x] Add `hivemind_context.summary.next_action`, `summary.suggested_tools`, compact attention counts, and state-tool replacement hints.
- [x] Add `task_list` response hint and stronger repeated-use nudge when the caller has not used `task_ready_for_agent`.
- [x] Add `task_note_working` for task-scoped working notes without `task_id`.
- [x] Add health/adoption threshold signals for task selection, inbox use, claim use, and notepad replacement.

## 2. Verification

- [x] Add MCP tests for hivemind hints, task_list hints, and task_note_working resolution.
- [x] Add CLI health tests for adoption thresholds.
- [x] Run targeted test suites.
- [x] Run OpenSpec validation.

## 3. Completion / Cleanup

- [x] Commit changes: `ebf989815a41db4e06cc42ba3542cd566feb80d5`.
- [x] Push branch: `origin/agent/codex/colony-routing-nudges-2026-04-28-22-18`.
- [x] Open/update PR: https://github.com/recodeee/colony/pull/175.
- [x] Record PR URL: https://github.com/recodeee/colony/pull/175.
- [x] Verify PR state is `MERGED`: `gh pr view 175 --json number,url,state,mergedAt,mergeCommit,headRefName,baseRefName` returned `state:"MERGED"`, `mergedAt:"2026-04-28T20:49:22Z"`, merge commit `50c7e0f829811597bf7ecdbaa5bc721406939d81`.
- [x] Verify sandbox worktree cleanup: `/tmp/colony-routing-nudges-2026-04-28-22-18` removed, local branch deleted, and remote branch deletion verified with empty `git ls-remote --heads origin agent/codex/colony-routing-nudges-2026-04-28-22-18`.
