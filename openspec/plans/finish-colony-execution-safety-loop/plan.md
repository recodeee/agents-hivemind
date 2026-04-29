# Finish Colony execution-safety loop

Plan slug: `finish-colony-execution-safety-loop`

## Problem

Colony health currently reports zero Queen plan readiness even though execution-safety work needs claimable, wave-based subtasks. Publish an active plan so task_ready_for_agent can surface first-wave task_plan_claim_subtask arguments and the health surface can prove nonzero readiness.

## Acceptance Criteria

- Colony health reports active plans > 0.
- Colony health reports plan subtasks > 0.
- Colony health reports ready to claim > 0.
- task_ready_for_agent returns a ready first-wave item with task_plan_claim_subtask args.
- Active plan health has regression coverage.

## Roles

- [planner](./planner.md)
- [architect](./architect.md)
- [critic](./critic.md)
- [executor](./executor.md)
- [writer](./writer.md)
- [verifier](./verifier.md)

## Operator Flow

1. Refine this workspace until scope, risks, and tasks are explicit.
2. Publish the plan with `colony plan publish finish-colony-execution-safety-loop` or the `task_plan_publish` MCP tool.
3. Claim subtasks through Colony plan tools before editing files.
4. Close only when all subtasks are complete and `checkpoints.md` records final evidence.
