---
'@colony/core': minor
'@imdeadpool/colony': minor
---

Bridge the foraging proposal system to the Plans page: when a proposal crosses the promotion threshold (strength ≥ 2.5), `ProposalSystem.maybePromote` now also synthesizes a "lite" plan via `synthesizePlanFromProposal`. The synthesized plan opens a parent task on `spec/proposal-<id>` plus one sub-task per file in `touches_files` (capped at 20 to match `task_plan_publish`), stamps `plan-config` and `plan-subtask` observations matching the explicit-publish wire shape, and co-stamps a `proposal-promoted` event observation that the Plans page side feed renders as "Proposal #N <summary> crossed strength 2.5 and auto-promoted to a plan with N sub-tasks."

Two intentional differences from `task_plan_publish`:

1. No `openspec/changes/<slug>/CHANGE.md` is written. The lite plan exists entirely in the observation timeline so the autonomous foraging code path has no filesystem side effects. Humans can scaffold OpenSpec docs later if the auto-promoted plan proves out.
2. `auto_archive` defaults to `false`. The first wave of auto-published plans needs human review before silent state transitions on final sub-task completion.

Empty-`touches_files` proposals still promote to a `TaskThread` as before; plan synthesis is skipped (returns `skipped_reason: 'no_touches_files'`) because there's no meaningful sub-task partition without file scope. The promoted thread is the load-bearing contract; the plan is a bonus.

Idempotency: synthesis runs exactly once per proposal because `proposal.status` flips from `'pending'` to `'active'` *before* the bridge is invoked, and `maybePromote` short-circuits at the status guard for any subsequent reinforcement-driven entry. Failures inside synthesis are caught and logged as a `plan-synthesis-failed` observation on the promoted task so a buggy bridge cannot unwind a successful promotion.

New exports from `@colony/core`:

- `synthesizePlanFromProposal(store, proposal, options?)`
- `type SynthesizedPlan`
- `type ProposalForSynthesis`

New observation kinds emitted on the spec root task:

- `proposal-promoted` — drives the Plans page side feed
- `plan-synthesis-failed` — diagnostic only, fires when the bridge throws
