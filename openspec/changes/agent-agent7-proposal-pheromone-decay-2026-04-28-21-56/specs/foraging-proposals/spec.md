## ADDED Requirements

### Requirement: Proposal Strength Evaporates

Foraging proposal strength SHALL decay deterministically from reinforcement age and the configured proposal half-life.

#### Scenario: ignored proposal falls below report threshold

- **GIVEN** a pending proposal with only its initial reinforcement
- **WHEN** enough half-lives pass that its decayed strength is below `foraging.proposalNoiseFloor`
- **THEN** `task_foraging_report` omits that proposal from pending results

### Requirement: Reinforced Proposals Stay Visible

Foraging proposal reports SHALL include pending proposals whose decayed strength remains at or above the configured noise floor.

#### Scenario: later reinforcement refreshes proposal visibility

- **GIVEN** a pending proposal whose first reinforcement has decayed below the noise floor
- **WHEN** another reinforcement is recorded
- **THEN** `task_foraging_report` includes the proposal with current decayed strength

### Requirement: Promoted Proposals Are Durable

Foraging proposal reports SHALL list promoted proposals separately from pending proposals.

#### Scenario: promoted proposal strength later decays

- **GIVEN** a proposal promoted into a task
- **WHEN** its current reinforcement strength decays below the noise floor
- **THEN** `task_foraging_report` still includes it in promoted results
- **AND** omits it from pending results

### Requirement: Reinforcement History Remains Auditable

Colony SHALL preserve each proposal reinforcement event as a raw row.

#### Scenario: same session reinforces twice in one millisecond

- **WHEN** two reinforcement events share `proposal_id`, `session_id`, and `reinforced_at`
- **THEN** both events are stored as separate rows
