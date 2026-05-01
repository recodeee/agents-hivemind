## ADDED Requirements

### Requirement: Quota Relays Surface As Ready Work

Colony SHALL expose quota-stopped claim ownership through `task_ready_for_agent` so replacement agents can claim the work without browsing inboxes or health output.

#### Scenario: quota-pending claim is ready

- **GIVEN** a task has files in `handoff_pending` ownership from a quota handoff or relay
- **WHEN** another agent calls `task_ready_for_agent`
- **THEN** the response includes a `quota_relay_ready` item
- **AND** the item includes `task_id`, `old_owner`, `files`, `age`, `repo_root`, `branch`, `expires_at`, and `blocks_downstream`
- **AND** the item includes `next_tool: task_claim_quota_accept`
- **AND** the item includes exact `claim_args` for `task_claim_quota_accept`

#### Scenario: quota relay blocks downstream work

- **GIVEN** quota-stopped work blocks a later plan subtask
- **AND** ordinary ready subtasks also exist
- **WHEN** `task_ready_for_agent` ranks available work
- **THEN** the quota relay ranks ahead of ordinary new work

#### Scenario: expired quota relay remains claimable

- **GIVEN** quota-pending claims still exist after the quota handoff or relay TTL expires
- **WHEN** an agent calls `task_claim_quota_accept` with ready-queue claim args
- **THEN** Colony claims the files for the accepting session
- **AND** it records audit metadata instead of leaving the expired quota signal as blocking residue
