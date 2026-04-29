# Tasks

| # | Status | Title | Files | Depends on | Capability | Spec row | Owner |
| - | - | - | - | - | - | - | - |
0|available|Claim/edit correlation diagnostics|`packages/storage/src/storage.ts`<br>`packages/storage/test/coordination-activity.test.ts`|-|api_work|-|-
1|available|Path normalization|`packages/storage/src/claim-path.ts`<br>`packages/storage/test/claim-path.test.ts`|-|api_work|-|-
2|available|Session/branch fallback matching|`packages/core/src/task-thread.ts`<br>`packages/core/src/index.ts`|-|api_work|-|-
3|available|Codex/OMX bridge signals|`apps/mcp-server/src/tools/task.ts`<br>`packages/hooks/src/auto-claim.ts`<br>`packages/hooks/src/handlers/pre-tool-use.ts`<br>`packages/hooks/src/handlers/post-tool-use.ts`|0, 1, 2|infra_work|-|-
4|available|Health verification|`apps/cli/test/queen-health.test.ts`<br>`packages/storage/src/index.ts`|0, 1, 2, 3|test_work|-|-
