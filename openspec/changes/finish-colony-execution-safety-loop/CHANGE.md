---
base_root_hash: 3bfe1540
slug: finish-colony-execution-safety-loop
---

# CHANGE · finish-colony-execution-safety-loop

## §P  proposal
# Finish Colony execution-safety loop

## Problem

Colony health currently reports zero Queen plan readiness even though execution-safety work needs claimable, wave-based subtasks. Publish an active plan so task_ready_for_agent can surface first-wave task_plan_claim_subtask arguments and the health surface can prove nonzero readiness.

## Acceptance criteria

- Colony health reports active plans > 0.
- Colony health reports plan subtasks > 0.
- Colony health reports ready to claim > 0.
- task_ready_for_agent returns a ready first-wave item with task_plan_claim_subtask args.
- Active plan health has regression coverage.

## Sub-tasks

### Sub-task 0: Claim/edit correlation diagnostics

Tighten diagnostics that correlate file claims with edits so execution-safety health can explain missing or mismatched claim coverage.

File scope: packages/storage/src/storage.ts, packages/storage/test/coordination-activity.test.ts

### Sub-task 1: Path normalization

Normalize claim and edit paths consistently before matching so equivalent repo-relative paths do not fragment readiness or safety diagnostics.

File scope: packages/storage/src/claim-path.ts, packages/storage/test/claim-path.test.ts

### Sub-task 2: Session/branch fallback matching

Add fallback matching between session and branch identities when exact ownership metadata is incomplete, while preserving explicit conflict signals.

File scope: packages/core/src/task-thread.ts, packages/core/src/index.ts

### Sub-task 3: Codex/OMX bridge signals (depends on: 0, 1, 2)

Expose Codex/OMX bridge signals into the execution-safety loop so health and readiness can route work without stale zero counts.

File scope: apps/mcp-server/src/tools/task.ts, packages/hooks/src/auto-claim.ts, packages/hooks/src/handlers/pre-tool-use.ts, packages/hooks/src/handlers/post-tool-use.ts

### Sub-task 4: Health verification (depends on: 0, 1, 2, 3)

Verify active plan health and ready-work reporting end to end, including task_ready_for_agent conversion args for the first wave.

File scope: apps/cli/test/queen-health.test.ts, packages/storage/src/index.ts


## §S  delta
op|target|row
-|-|-

## §T  tasks
id|status|task|cites
-|-|-|-

## §B  bugs
id|status|task|cites
-|-|-|-
