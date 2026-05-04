# Compact Ready Queue Output

## Problem

Agents call `task_ready_for_agent` on every startup. The tool returns a full `mcp_capability_map` even when no work is ready, so a quiet startup pays for a large diagnostic payload that is rarely used.

## Change

- Keep `task_ready_for_agent` compact by default.
- Return `mcp_capability_map` only when callers pass `include_capability_map: true`.
- Keep claimable ready output and exact claim arguments unchanged.

## Acceptance

- Empty ready output omits `mcp_capability_map`.
- Empty ready output stays under the regression byte budget.
- Opt-in callers still receive the capability map.

## Verification

- `pnpm --filter @colony/mcp-server test -- ready-queue`: 30 passed.
- `pnpm --filter @colony/mcp-server typecheck`: passed.
- `pnpm --filter @colony/mcp-server build`: passed.
- `openspec validate --specs`: 2 passed, 0 failed.
