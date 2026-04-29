# Tasks

## 1. Lifecycle Receiver

- [x] Add parser/validator for `colony-omx-lifecycle-v1`.
- [x] Normalize `session_id`, `agent`, `cwd`, `repo_root`, `branch`, `tool_name`,
  `tool_input`, and `source`.
- [x] Route `session_start`, `task_bind`, `pre_tool_use`, `post_tool_use`,
  `claim_result`, `stop_intent`, and `finish_result`.
- [x] Add idempotency by `event_id`.

## 2. CLI Surface

- [x] Add `colony bridge lifecycle --json` stdin entrypoint.
- [x] Preserve current Claude hook behavior by leaving `hook run` unchanged.

## 3. Verification

- [x] Add duplicate `event_id` regression coverage.
- [x] Add task-bind routing coverage.
- [x] Run focused typecheck/tests.
  - `pnpm --filter @colony/hooks typecheck`
  - `pnpm --filter @colony/hooks test -- lifecycle-envelope`
  - `pnpm --filter @imdeadpool/colony-cli typecheck`
  - `pnpm --filter @imdeadpool/colony-cli test -- bridge.test.ts`
  - `pnpm exec biome check apps/cli/src/commands/bridge.ts apps/cli/test/bridge.test.ts packages/hooks/src/index.ts packages/hooks/src/lifecycle-envelope.ts packages/hooks/test/lifecycle-envelope.test.ts`
  - `openspec validate --specs`
- [ ] Record PR URL, `MERGED` state, and sandbox cleanup evidence.
