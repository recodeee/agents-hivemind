# Tasks

## 1. Plan Workspace

- [x] Add reusable plan workspace helpers under `@colony/spec`.
- [x] Generate `plan.md`, `tasks.md`, `checkpoints.md`, role files, and `plan.json`.
- [x] Keep status sync structured through JSON, not markdown table parsing.

## 2. CLI Surface

- [x] Add `colony plan create`.
- [x] Add `colony plan status`.
- [x] Add `colony plan publish`.
- [x] Add `colony plan close`.

## 3. MCP Integration

- [x] Make `task_plan_publish` create `openspec/plans/<slug>`.
- [x] Sync subtask completion back into plan workspace artifacts.
- [x] Preserve existing dependency and overlap validation behavior.

## 4. Tests And Docs

- [x] Add workspace helper tests.
- [x] Add CLI command tests.
- [x] Update MCP plan tests.
- [x] Document the new commands in `README.md`.

## 5. Completion

- [x] Run focused tests and typechecks.
- [ ] Commit, push, PR, merge.
- [ ] Record final `MERGED` evidence and sandbox cleanup.

BLOCKED: `git add` failed because the sandbox cannot write `.git/worktrees/.../index.lock`, and the required escalation was rejected by the approval quota. Implementation and verification are complete in the agent worktree, but commit/PR/merge/cleanup cannot proceed until git index write approval is available.
