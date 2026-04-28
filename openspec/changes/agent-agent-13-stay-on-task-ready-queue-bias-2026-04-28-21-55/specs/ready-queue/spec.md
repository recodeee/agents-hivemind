## ADDED Requirements

### Requirement: Ready Queue Task Persistence

Colony SHALL prefer an agent's currently claimed sub-task over marginally higher scoring new ready work.

#### Scenario: continue current task

- **GIVEN** an agent has an active claimed sub-task
- **AND** another ready sub-task has only a slightly higher fit score
- **WHEN** the agent calls `task_ready_for_agent`
- **THEN** the claimed sub-task appears first
- **AND** its compact `reason` is `continue_current_task`

### Requirement: Urgent Override

Colony SHALL let blocking unread task messages override stay-on-task bias.

#### Scenario: blocking message overrides current task

- **GIVEN** an agent has an active claimed sub-task
- **AND** another ready sub-task has an unread blocking message addressed to the agent
- **WHEN** the agent calls `task_ready_for_agent`
- **THEN** the urgent sub-task appears before the current claimed sub-task
- **AND** its compact `reason` is `urgent_override`

### Requirement: Terminal Current Work Releases Bias

Colony SHALL NOT apply stay-on-task bias to completed or blocked sub-tasks.

#### Scenario: completed or blocked current task

- **GIVEN** an agent's current sub-task is completed or blocked
- **WHEN** the agent calls `task_ready_for_agent`
- **THEN** ready work is ranked normally
- **AND** the selected ready work uses compact `reason` `ready_high_score`
