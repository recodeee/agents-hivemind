## ADDED Requirements

### Requirement: Handoff Expiry

Colony SHALL treat pending handoffs as time-bounded recruitment signals.

#### Scenario: live handoff appears pending

- **GIVEN** a handoff whose effective `expires_at` is in the future
- **WHEN** the target agent checks `attention_inbox`
- **THEN** the handoff appears in `pending_handoffs`

#### Scenario: expired handoff no longer appears pending

- **GIVEN** a handoff whose effective `expires_at` is in the past
- **WHEN** pending handoff surfaces are read
- **THEN** the handoff does not appear as pending
- **AND** the original observation remains stored for audit

#### Scenario: accept expired handoff

- **GIVEN** a pending handoff whose effective `expires_at` is in the past
- **WHEN** a recipient accepts it
- **THEN** the tool returns stable error code `HANDOFF_EXPIRED`
- **AND** the handoff metadata status becomes `expired`

#### Scenario: decline expired handoff

- **GIVEN** a pending handoff whose effective `expires_at` is in the past
- **WHEN** a recipient declines it
- **THEN** the tool returns stable error code `HANDOFF_EXPIRED`
- **AND** the handoff metadata status becomes `expired`
