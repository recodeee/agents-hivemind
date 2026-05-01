## Why

Quota-stopped sessions weaken their claims to `handoff_pending`, but `task_ready_for_agent` only returned ordinary plan subtasks. That left quota-pending claims visible in health as stale signals without giving replacement agents a direct way to claim the work.

## What Changes

- Surface `quota_relay_ready` entries from `task_ready_for_agent`.
- Include task, owner, files, branch, repo, age, expiry, and downstream-blocking context.
- Return `next_tool: task_claim_quota_accept` with exact claim args.
- Add `task_claim_quota_accept` to accept live quota handoffs/relays or claim expired quota-pending files with audit metadata.

## Impact

Agents can grab quota-stopped work from the same ready-work picker they already use, and blocking quota relays rank ahead of ordinary new work.
