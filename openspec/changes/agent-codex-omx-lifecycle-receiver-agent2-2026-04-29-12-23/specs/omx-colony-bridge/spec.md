# OMX-Colony Bridge Delta

## ADDED Requirements

### Requirement: Colony Receives OMX Lifecycle Envelopes

Colony SHALL accept `colony-omx-lifecycle-v1` lifecycle envelopes from a local
CLI stdin receiver and route them through Colony coordination primitives.

#### Scenario: OMX sends pre-tool-use telemetry

- **WHEN** OMX sends a `pre_tool_use` envelope with `session_id`, `agent`, `cwd`,
  `repo_root`, `branch`, `tool_name`, `tool_input`, and `source`
- **THEN** Colony normalizes those fields
- **AND** routes the event to the claim-before-edit path
- **AND** stores a lifecycle audit row keyed by `event_id`

#### Scenario: Duplicate lifecycle event arrives

- **WHEN** Colony receives another lifecycle envelope with an already-seen
  `event_id`
- **THEN** Colony treats the event as a duplicate
- **AND** does not run the handler a second time
- **AND** does not create duplicate claim or lifecycle audit rows

#### Scenario: Lifecycle event binds task context

- **WHEN** Colony receives a `session_start` or `task_bind` envelope with repo
  and branch context
- **THEN** Colony materializes the session and active task binding locally
- **AND** the receiver does not require MCP availability for that safety path
