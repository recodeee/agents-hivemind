## ADDED Requirements

### Requirement: Hivemind Context Adoption Nudges

`hivemind_context` SHALL include compact adoption nudges when recent local
telemetry shows the coordination loop is drifting away from preferred Colony
tools.

#### Scenario: task_list overuse suggests ready work

- **WHEN** recent local tool telemetry shows `task_list` usage outpacing
  `task_ready_for_agent` usage below the target ratio
- **THEN** `hivemind_context` summary includes an adoption nudge for
  `task_ready_for_agent`
- **AND** the nudge explains that `task_list` is inventory, not the work picker.

#### Scenario: OMX notepad overuse suggests Colony working notes

- **WHEN** recent local tool telemetry shows OMX notepad writes outpacing Colony
  task working notes below the target share
- **THEN** `hivemind_context` summary includes an adoption nudge for
  `task_note_working`
- **AND** the nudge keeps the guidance compact.

#### Scenario: low claim-before-edit coverage suggests file claims

- **WHEN** recent local edit-tool telemetry with file paths shows
  claim-before-edit coverage below the target ratio
- **THEN** `hivemind_context` summary includes an adoption nudge for
  `task_claim_file`
- **AND** the nudge does not block the normal context response.

#### Scenario: telemetry failure does not block context

- **WHEN** local telemetry cannot be read
- **THEN** `hivemind_context` still returns normal context
- **AND** adoption nudges are omitted.
