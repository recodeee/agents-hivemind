## MODIFIED Requirements

### Requirement: Agents Pull Work By Response Threshold

Colony SHALL expose ready work for agents to pull, ranked by fit and current local context.

#### Scenario: quota-stopped replacement work is scheduler-ready

- **GIVEN** a quota handoff or relay has left file claims in `handoff_pending` or `weak_expired`
- **WHEN** an eligible agent calls `task_ready_for_agent`
- **THEN** Colony surfaces a `quota_relay_ready` item with `task_id`, `old_session_id`, `files`, `evidence`, and `next`
- **AND** the item includes `next_tool: task_claim_quota_accept`
- **AND** the item includes exact `claim_args` for `task_claim_quota_accept`

#### Scenario: active quota files outrank ordinary new work

- **GIVEN** a quota relay still has active `handoff_pending` file claims
- **AND** ordinary ready plan work also exists
- **WHEN** `task_ready_for_agent` ranks available work
- **THEN** the quota relay ranks ahead of ordinary new work

#### Scenario: blocking quota relays outrank ordinary new work

- **GIVEN** a quota relay has released `weak_expired` claims that block downstream plan work
- **AND** ordinary ready plan work also exists
- **WHEN** `task_ready_for_agent` ranks available work
- **THEN** the quota relay ranks ahead of ordinary new work
