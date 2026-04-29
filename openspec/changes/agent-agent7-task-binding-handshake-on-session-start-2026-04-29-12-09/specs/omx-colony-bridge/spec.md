# OMX-Colony Bridge Delta

## MODIFIED Requirements

### Requirement: Telemetry Flows From OMX Into Colony

Colony SHALL consume OMX telemetry as coordination input, not as a replacement
for Colony task state.

#### Scenario: Runtime telemetry is available

- **WHEN** OMX records active sessions, agent worktree locks, process state, or
  diagnostics that are useful for coordination
- **THEN** Colony may read that telemetry for hivemind and context surfaces
- **AND** Colony keeps coordination decisions in Colony tasks, claims, memory,
  inboxes, proposals, and handoffs

#### Scenario: Session start binds runtime identity

- **WHEN** OMX receives a `SessionStart` hook for a scoped repository session
- **THEN** OMX emits a Colony lifecycle event with `event_name: session_start`,
  `session_id`, `agent`, `cwd`, `repo_root`, `branch`, and `worktree_path` when
  available
- **AND** Colony responds with either a bound task, ambiguous candidates, or no
  active task
- **AND** OMX may cache only `task_id`, `expires_at`, and
  `binding_confidence` for the bound task

#### Scenario: First prompt requests task binding

- **WHEN** OMX receives the first `UserPromptSubmit` for a scoped repository
  session
- **THEN** OMX emits a Colony lifecycle event with `event_name: task_bind`,
  scoped session identity, and a safe short prompt summary when one can be
  derived
- **AND** large or unsafe prompt text is not stored in the OMX cache
- **AND** the response uses the same bound-task, ambiguous-candidates, or
  no-active-task shape as session start

#### Scenario: Pre-tool-use remains canonical and advisory

- **WHEN** a write tool is about to run
- **THEN** Colony resolves current task ownership from canonical task,
  participant, and claim state
- **AND** any OMX task-binding cache is treated as a short-lived hint rather
  than the source of truth
- **AND** missing, ambiguous, expired, or unavailable binding produces a warning
  and continues instead of blocking the edit.
