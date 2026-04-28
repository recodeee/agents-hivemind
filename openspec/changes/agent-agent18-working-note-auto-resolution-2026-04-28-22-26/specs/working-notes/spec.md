## ADDED Requirements

### Requirement: Active Working Note Shortcut

Colony SHALL provide a task-scoped working note tool that lets an agent save current state without manually resolving `task_id`.

#### Scenario: one active task

- **GIVEN** a session is an active participant on exactly one task
- **WHEN** the agent calls the working note tool with that `session_id` and content
- **THEN** Colony posts a task-thread observation with `kind:"note"`
- **AND** returns the observation id and task id

#### Scenario: repo and branch select one task

- **GIVEN** a session is active on multiple tasks
- **WHEN** the agent calls the working note tool with matching `repo_root` and `branch`
- **THEN** Colony posts the note to the matching task
- **AND** does not require the caller to pass `task_id`

#### Scenario: ambiguous active tasks

- **GIVEN** a session is active on multiple tasks that match the provided filters
- **WHEN** the agent calls the working note tool
- **THEN** Colony does not post a note
- **AND** returns compact candidate tasks instead of guessing
