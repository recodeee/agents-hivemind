## Why

Stale advisory claims can accumulate long after useful pheromone signals have decayed. Operators need a read-only sweep that shows fresh claims, stale claims, weak claim-expiry candidates, and the branches causing buildup before any cleanup action exists.

## What Changes

- Extend `colony coordination sweep --repo-root <path> --dry-run --json` with fresh/stale/expired-weak claim buckets.
- Add top stale-claim branch rollups and a suggested cleanup action.
- Keep the command read-only and keep audit observations intact.

## Impact

Users can inspect stale claim buildup and understand what would be weakened or expired without mutating task history.
