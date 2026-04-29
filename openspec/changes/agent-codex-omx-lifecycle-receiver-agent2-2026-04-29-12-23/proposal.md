# Add Colony OMX lifecycle receiver

## Problem

The shared `colony-omx-lifecycle-v1` contract now exists, but Colony still needs
a local receiver that consumes those events and routes them into task binding,
claim-before-edit, telemetry, and session audit paths.

## Proposal

Add a Colony-side lifecycle receiver in `@colony/hooks` and expose it through
`colony bridge lifecycle --json`. The receiver validates the shared envelope,
normalizes fields, routes each lifecycle event to the existing Colony handler,
and dedupes retries by `event_id`.

## Scope

- Add parser/validator and routing helper in `@colony/hooks`.
- Add `colony bridge lifecycle --json` stdin entrypoint.
- Use existing local storage and hook paths; no MCP or network dependency.
- Preserve current Claude hook behavior.

## Non-Goals

- No storage schema migration.
- No changes to the existing `colony hook run` protocol.
- No raw tool-content ingestion beyond the sanitized lifecycle summary.
