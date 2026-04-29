# Worktree Contention Report

## Why

Agents can hold separate managed worktrees while editing the same path. Colony needs a direct command that reports those conflicts before the edits collide at merge time.

## What Changes

- Inspect `.omx/agent-worktrees` and `.omc/agent-worktrees`.
- Collect branch, dirty files, claimed files, and active-session metadata per managed worktree.
- Report dirty-file collisions through `colony worktree contention --json`.

## Verification

- Core unit test uses temp git worktrees across `.omx` and `.omc`.
- CLI test exercises `colony worktree contention --json`.
