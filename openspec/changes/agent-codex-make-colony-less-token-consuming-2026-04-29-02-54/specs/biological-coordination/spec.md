## MODIFIED Requirements

### Requirement: Compact Attention Inbox

`attention_inbox` SHALL surface pending work and coordination risk without
embedding unbounded row sets by default.

#### Scenario: stalled lane rows stay capped

- **WHEN** a repo has more stalled or dead lanes than the default row limit
- **THEN** `attention_inbox.summary.stalled_lane_count` reports the total count
- **AND** `attention_inbox.stalled_lanes` returns only the capped row set
- **AND** `attention_inbox.stalled_lanes_truncated` is true.

#### Scenario: callers can expand stalled lane rows

- **WHEN** a caller passes an explicit stalled lane row limit
- **THEN** `attention_inbox` returns up to that many stalled lane rows
- **AND** the total count still reflects every stalled or dead lane in scope.
