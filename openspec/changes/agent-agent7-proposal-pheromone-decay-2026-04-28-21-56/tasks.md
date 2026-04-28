# Tasks

## 1. Proposal Decay

- [x] Inspect `task_propose`, `task_reinforce`, `task_foraging_report`, and proposal storage.
- [x] Add configurable proposal half-life, noise floor, and promotion threshold defaults.
- [x] Compute proposal strength from decayed reinforcement age.

## 2. Report And Audit Behavior

- [x] Omit pending proposals below the noise floor.
- [x] Show decayed strength in pending and promoted report rows.
- [x] Keep promoted proposals in a separate durable bucket.
- [x] Store reinforcement events as append-only auditable rows.

## 3. Tests

- [x] New proposal remains visible.
- [x] Ignored proposal decays below the report threshold.
- [x] Reinforced proposal remains visible.
- [x] Promoted proposal remains durable.
- [x] Same-session same-millisecond reinforcements remain auditable.

## 4. Completion

- [x] Run focused tests and typechecks.
- [ ] Commit, push, PR, merge.
- [ ] Record final `MERGED` evidence and sandbox cleanup.
