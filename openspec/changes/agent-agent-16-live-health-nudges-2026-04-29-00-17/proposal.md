# Surface Live Adoption Nudges

## Why

`colony health` already shows that `task_list` and OMX notepad usage can drift
above the intended Colony loop. Reports help after the fact, but the highest
traffic coordination read should carry compact live hints while agents are
choosing work.

## What Changes

- Read recent local tool telemetry from the existing health counters used by
  the local database.
- Add compact optional nudges to `hivemind_context` when task selection,
  working-note, or claim-before-edit adoption drops below targets.
- Keep the nudges non-blocking and small: tool, current metric, and one hint.

## Impact

Agents using `hivemind_context` get immediate direction toward
`task_ready_for_agent`, `task_note_working`, or `task_claim_file` without turning
the payload into a health report.
