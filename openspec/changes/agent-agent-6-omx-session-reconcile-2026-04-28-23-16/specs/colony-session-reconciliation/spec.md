## ADDED Requirements

### Requirement: Active OMX Sessions Materialize Colony Session Rows

Colony SHALL reconcile active OMX runtime session sidecars into Colony session rows when the sidecar provides a stable session identity.

#### Scenario: Active sidecar has stable identity

- **GIVEN** `.omx/state/active-sessions/*.json` contains an active session with `sessionKey` or `session_key`
- **WHEN** an MCP heartbeat or wrapped tool call runs reconciliation
- **THEN** Colony ensures a matching `sessions` row exists
- **AND** the row preserves `ide`, `cwd`, and metadata for CLI, agent, repo, branch, heartbeat, and worktree path

#### Scenario: Active sidecar lacks stable identity

- **GIVEN** an active-session sidecar is missing `sessionKey` / `session_key`
- **OR** the identity is a placeholder such as `unknown-session`
- **WHEN** reconciliation runs
- **THEN** Colony does not create a session row for that sidecar

#### Scenario: Stale sidecars stay out of live reconciliation

- **GIVEN** an active-session sidecar is classified as dead by heartbeat freshness
- **WHEN** reconciliation runs without stale inclusion
- **THEN** Colony does not materialize that stale runtime session as live coordination state
