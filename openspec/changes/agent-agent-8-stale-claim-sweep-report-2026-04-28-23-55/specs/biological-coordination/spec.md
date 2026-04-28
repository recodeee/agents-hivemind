## MODIFIED Requirements

### Requirement: Signals Decay Unless Intentionally Durable

Colony SHALL make coordination signals expire, decay, or fall below a noise floor unless they are intentionally durable records.

#### Scenario: sweep reports stale claim cleanup candidates

- **WHEN** a user runs `colony coordination sweep --repo-root <path> --dry-run --json`
- **THEN** the sweep reports fresh claims, stale claims, expired/weak claims, top branches with stale claims, and a suggested cleanup action
- **AND** expired/weak claim entries describe what would be expired without deleting audit observations
- **AND** the sweep remains read-only unless a future command exposes an explicit apply path
