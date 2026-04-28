## ADDED Requirements

### Requirement: Local Plan Workspaces

Colony SHALL provide a local `openspec/plans/<slug>` workspace for medium and large task planning.

#### Scenario: create plan workspace

- **WHEN** an operator runs `colony plan create add-widget-page`
- **THEN** Colony creates `openspec/plans/add-widget-page/plan.md`
- **AND** creates `tasks.md`, `checkpoints.md`, role files, and `plan.json`

### Requirement: Published Plans Create Visible Artifacts

Colony SHALL create a readable plan workspace when a plan is published into task threads.

#### Scenario: publish through MCP

- **WHEN** an agent calls `task_plan_publish` for slug `add-widget-page`
- **THEN** Colony creates `openspec/changes/add-widget-page/CHANGE.md`
- **AND** creates `openspec/plans/add-widget-page`
- **AND** returns both the spec change path and plan workspace path

### Requirement: Completion Sync

Colony SHALL keep the local plan workspace aligned with completed Colony subtasks.

#### Scenario: complete subtask

- **GIVEN** a published plan with subtask `0`
- **WHEN** the owning session calls `task_plan_complete_subtask`
- **THEN** `openspec/plans/<slug>/plan.json` marks the subtask `completed`
- **AND** `checkpoints.md` shows the completed subtask as checked
