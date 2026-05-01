# Claim drift detector

## Problem

Agents can reach commit or finish with dirty git files that were never claimed in Colony. Current health surfaces claim discipline from telemetry, but it does not compare the live git worktree against active task claims and cannot print the exact missing `task_claim_file` calls.

## Solution

Add `colony claims drift` to compare unstaged, staged, and untracked git paths against active Colony file claims for a repo, branch, optional task, and optional session. The command reports touched files, covered claims, missing claims, stale covered-only claims, conflicts, ignored generated paths, and copy-ready `mcp__colony__task_claim_file` calls.

## Safety

The detector is read-only. `--fail-on-drift` only sets a non-zero exit code for commit/finish gates; it does not mutate claims or files.
