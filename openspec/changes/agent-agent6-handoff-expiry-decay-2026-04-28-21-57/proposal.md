# Make Handoffs Decay

## Why

Pending handoffs are recruitment signals, not permanent assignments. If nobody accepts them, they should expire so startup and inbox surfaces do not keep advertising stale work forever.

## What Changes

- Ensure handoff metadata always has an effective `expires_at`, including legacy rows that predate explicit expiry metadata.
- Hide expired handoffs from pending inbox, observe, worker, and task-count surfaces while keeping the observation record intact.
- Return stable `HANDOFF_EXPIRED` errors when accepting or declining an expired handoff.
- Document the default TTL and pending-surface behavior.

## Impact

Audit history remains unchanged. Pending handoff surfaces become time-bounded and accepted/declined/expired handoffs stop behaving like active recruitment signals.
