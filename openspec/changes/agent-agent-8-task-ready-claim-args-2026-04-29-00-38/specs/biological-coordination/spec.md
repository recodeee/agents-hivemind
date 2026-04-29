## ADDED Requirements

### Requirement: Ready Queue Gives Claim Guidance

Colony SHALL make `task_ready_for_agent` explicit about whether a plan subtask
can be claimed.

#### Scenario: claimable subtask

- **GIVEN** a plan has an available subtask for the caller
- **WHEN** the agent calls `task_ready_for_agent`
- **THEN** the response includes `next_tool: "task_plan_claim_subtask"`
- **AND** the response includes top-level `plan_slug` and `subtask_index`
- **AND** the response includes top-level `reason`
- **AND** the response includes `claim_args` with `plan_slug`,
  `subtask_index`, `session_id`, and `agent`
- **AND** the response includes a copy-paste Codex MCP call snippet

#### Scenario: no claimable plan subtasks

- **GIVEN** no plan subtasks are currently claimable by the caller
- **WHEN** the agent calls `task_ready_for_agent`
- **THEN** the response includes `empty_state: "No claimable plan subtasks. Publish a Queen/task plan for multi-agent work, or use task_list only for browsing."`
- **AND** the response does not fabricate claim arguments

#### Scenario: future subtasks are blocked

- **GIVEN** a plan has future subtasks but their dependencies are not completed
- **AND** no other plan subtask is claimable
- **WHEN** the agent calls `task_ready_for_agent`
- **THEN** the response includes the same no-claimable-subtasks `empty_state`
- **AND** the response does not include `next_tool`

#### Scenario: subtask already claimed by caller

- **GIVEN** a plan subtask is already claimed by the caller
- **AND** no other plan subtask should override it
- **WHEN** the agent calls `task_ready_for_agent`
- **THEN** the response keeps that subtask in `ready` with `reason: "continue_current_task"`
- **AND** the response does not include `next_tool`
- **AND** the response does not include `claim_args`
- **AND** the response does not include a copy-paste claim call
