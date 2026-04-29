# Proposal

## Why

Live file contention needs a policy signal that the runtime bridge can enforce.
The existing bridge policy blocks strong claim conflicts, but the conflict code
should be the repo-policy signal `LIVE_FILE_CONTENTION`.
High-risk shared files also need a protected escalation so storage/schema/health
core files cannot be silently rewritten by multiple live agents.

## What

- Emit `LIVE_FILE_CONTENTION` for live claim contention warnings and telemetry.
- Add the default `protected_files` list for high-risk shared files.
- Emit `PROTECTED_FILE_CONTENTION` when another live session claims a protected
  file the current session is about to edit.
- In `block-on-conflict`, deny protected-file contention for non-integrator
  sessions while leaving integrator sessions able to reconcile.
- Derive `block-on-conflict` denials from that signal plus strong ownership.
- Keep weak and expired claims advisory only.
- Add regression coverage for warn, block-on-conflict, audit-only, and weak or expired claims.

## Impact

- Runtime bridge behavior stays default-warn.
- Repos that opt into `block-on-conflict` can deny edits only when another live
  agent strongly owns the file.
