---
"@colony/hooks": patch
---

Make PreToolUse auto-claim work for fresh sessions in real worktrees.
Previously, sessions that hadn't joined any Colony task (e.g. external
agents in `agent/...` worktrees that share Colony as a memory backend)
hit `ACTIVE_TASK_NOT_FOUND` on every edit, leaving the
`claim-before-edit` health metric stuck at 0% even when PreToolUse
signals fired correctly. PreToolUse now mirrors the existing PostToolUse
fallback: when the session has no candidate task and the working tree
resolves to a real `(repo_root, branch)`, it materializes a TaskThread
on that branch and joins the session before retrying the auto-claim.
Sessions without a real checkout keep the existing
`ACTIVE_TASK_NOT_FOUND` warning so callers still see actionable
guidance instead of silent synthetic-task creation.
