## Why

Quota-stopped work can remain visible only through inbox or health surfaces, especially after a relay expires. That leaves replacement agents calling `task_ready_for_agent` with no claimable item even though quota-owned files still need takeover.

## What Changes

- Keep quota relay replacement work in the normal `task_ready_for_agent` scheduler path.
- Add compact `quota_relay_ready` fields for `old_session_id`, `evidence`, and `next`.
- Keep `task_claim_quota_accept` claim args valid for pending, expired, and released `weak_expired` quota claims.
- Rank quota relays above ordinary new work when they still hold active files or block downstream plan work.

## Impact

New agents can pull quota-stopped lanes from the same ready queue they already use for plan subtasks, without browsing stale inbox entries first.
