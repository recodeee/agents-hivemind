## ADDED Requirements

### Requirement: Local Compact Hivemind Context

`hivemind_context` SHALL default to local situational awareness for the
requested repo rather than a global dashboard.

#### Scenario: huge active-session sets stay compact

- **WHEN** a repo has many active sessions and the caller does not raise limits
- **THEN** `hivemind_context` returns only the default compact lane window
- **AND** reports the total lane count and truncation state
- **AND** memory hits, ownership claims, hot files, and attention observation IDs
  stay capped by default limits.

#### Scenario: explicit limits expand compact windows

- **WHEN** a caller raises `limit`, `memory_limit`, `max_claims`,
  `max_hot_files`, or `attention_id_limit`
- **THEN** `hivemind_context` expands only the requested compact window up to the
  schema maximum.

#### Scenario: blockers remain visible without hydration

- **WHEN** a blocker, handoff, wake, or unread message is addressed to the
  current session within the requested repo
- **THEN** `hivemind_context` includes attention counts and compact observation
  IDs
- **AND** the response does not include observation bodies
- **AND** callers must use `get_observations` to hydrate bodies.
