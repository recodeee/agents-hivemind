## Why

Colony can read OMX `.omx/state/active-sessions/*.json` telemetry, but task and memory tools still depend on `sessions` rows. Active OMX runtime sessions with a real session key should be materialized into Colony without inventing identities.

## What Changes

- Add a core reconciliation helper for active OMX session sidecars.
- Materialize only sessions with a stable `sessionKey` / `session_key`.
- Preserve CLI, agent, repo, branch, heartbeat, and worktree metadata on the Colony session row.
- Run reconciliation from MCP heartbeat/connect and tool-use paths.

## Impact

OMX runtime sessions become valid Colony session IDs for notes, memory rows, attention, and recall when the sidecar provides a stable identity.
