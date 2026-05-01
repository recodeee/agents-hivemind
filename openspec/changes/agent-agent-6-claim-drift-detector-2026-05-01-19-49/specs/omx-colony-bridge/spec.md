# omx-colony-bridge Specification Delta

## ADDED Requirements

### Requirement: Claim drift detection before finish

Colony CLI SHALL provide a read-only claim drift detector that compares the current git worktree's unstaged, staged, and untracked files against active Colony file claims for the selected repo and branch.

#### Scenario: Missing touched claim is actionable

- **GIVEN** a repo has a dirty, staged, or untracked file
- **AND** the selected Colony task/session does not actively claim that file
- **WHEN** an operator runs `colony claims drift`
- **THEN** the output SHALL include the file in `unclaimed_touched_files`
- **AND** include the exact `mcp__colony__task_claim_file` call needed to claim it when task and session inputs are known.

#### Scenario: Generated files can be ignored

- **GIVEN** a generated path is configured as ignored
- **WHEN** that path is touched in git
- **THEN** claim drift SHALL exclude it from `unclaimed_touched_files`
- **AND** report it under ignored files for auditability.
