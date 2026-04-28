# Add Active Working Note Resolution

## Why

Agents need a Colony-native way to save current working state without first resolving a task id by hand. `task_post` already persists notes through task/session-scoped `MemoryStore`, but requiring `task_id` keeps agents falling back to generic notepad writes.

## What Changes

- Add `task_note_working` as a ToolSearch-friendly shortcut for working notes.
- Resolve the target task from `session_id` plus optional `repo_root` and `branch`.
- Post `kind:"note"` on the resolved task and return both observation id and task id.
- Return compact candidate tasks instead of guessing when multiple active tasks match.

## Impact

No generic key-value notepad is introduced. Working notes remain task-thread observations, searchable and timeline-visible like existing `task_post` notes.
