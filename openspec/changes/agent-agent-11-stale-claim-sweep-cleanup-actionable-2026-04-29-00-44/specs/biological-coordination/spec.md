## MODIFIED Requirements

### Requirement: Signals Decay Unless Intentionally Durable

Colony SHALL make coordination signals expire, decay, or fall below a noise floor unless they are intentionally durable records.

#### Scenario: sweep reports stale claim cleanup candidates

- **WHEN** a user runs `colony coordination sweep --repo-root <path> --dry-run --json`
- **THEN** the sweep reports active claims, stale claims, expired/weak claims, top branches with stale claims, and a recommended action
- **AND** the repo-root filter includes stored task roots that match the current checkout's git remote repository slug
- **AND** stale claims without pheromone data remain review candidates rather than automatic expired/weak cleanup candidates
- **AND** expired/weak claim entries describe what would be released without deleting audit observations
- **AND** the sweep remains read-only unless a future command exposes an explicit apply path
