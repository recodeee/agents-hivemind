## ADDED Requirements

### Requirement: Live File Contention Policy Signal

The Colony bridge SHALL emit `LIVE_FILE_CONTENTION` when PreToolUse detects
another session's file claim on the touched path.

#### Scenario: Default warn mode remains advisory

- **GIVEN** bridge policy mode is `warn`
- **WHEN** PreToolUse detects `LIVE_FILE_CONTENTION`
- **THEN** the runtime bridge receives an allow result with warning context

#### Scenario: Block mode denies strong live contention

- **GIVEN** bridge policy mode is `block-on-conflict`
- **WHEN** PreToolUse detects `LIVE_FILE_CONTENTION`
- **AND** the contention strength is `strong`
- **THEN** the runtime bridge receives a deny result
- **AND** the previous owner keeps the claim

#### Scenario: Weak and expired claims do not block

- **GIVEN** bridge policy mode is `block-on-conflict`
- **WHEN** PreToolUse detects `LIVE_FILE_CONTENTION`
- **AND** the contention strength is `weak`
- **THEN** the runtime bridge receives an allow result
- **AND** the editing session can claim the file

#### Scenario: Audit-only stays silent

- **GIVEN** bridge policy mode is `audit-only`
- **WHEN** PreToolUse detects `LIVE_FILE_CONTENTION`
- **THEN** Colony records telemetry
- **AND** the runtime bridge receives no warning context or deny result

### Requirement: Protected File Contention Escalation

The Colony bridge SHALL expose a default `protected_files` config list containing:

- `packages/storage/src/storage.ts`
- `packages/storage/src/schema.ts`
- `packages/storage/src/types.ts`
- `apps/cli/src/commands/health.ts`
- `packages/hooks/src/auto-claim.ts`

#### Scenario: Protected file contention escalates

- **GIVEN** a protected file is claimed by another live session
- **WHEN** PreToolUse sees a second live session attempt to edit that file
- **THEN** the warning and telemetry code is `PROTECTED_FILE_CONTENTION`

#### Scenario: Block mode denies non-integrator protected edits

- **GIVEN** bridge policy mode is `block-on-conflict`
- **AND** a protected file is claimed by another live session
- **WHEN** a non-integrator session attempts to edit that file
- **THEN** the runtime bridge receives a deny result
- **AND** the editing session does not claim the protected file

#### Scenario: Integrator protected edits are allowed

- **GIVEN** bridge policy mode is `block-on-conflict`
- **AND** a protected file is claimed by another live session
- **WHEN** an integrator session attempts to edit that file
- **THEN** the runtime bridge receives an allow result
- **AND** the warning and telemetry code remains `PROTECTED_FILE_CONTENTION`
