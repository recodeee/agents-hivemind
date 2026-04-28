# Keep Hivemind Context Local

## Why

`hivemind_context` should help an agent read its local neighborhood before
editing. Returning every active lane, task, claim, and memory hit globally makes
the tool slow, noisy, and closer to a dashboard than situational awareness.

## What Changes

- Default `hivemind_context` to a compact repo-scoped lane set.
- Keep memory hits, claims, hot files, and attention observation IDs capped by
  explicit limits.
- Include current-session attention counts without embedding observation bodies.
- Preserve explicit expansion through the existing `limit` and new compactness
  knobs.

## Impact

Agents still see useful ownership and blocker signals, but full bodies and
larger result sets require explicit follow-up via `get_observations` or raised
limits.
