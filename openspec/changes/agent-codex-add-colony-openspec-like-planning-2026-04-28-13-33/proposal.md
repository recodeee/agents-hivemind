# Add Colony-Native OpenSpec-Like Planning

## Why

Colony can publish multi-agent task plans through MCP, but the planning state is not visible as a durable local workspace. Agents and humans need a readable `openspec/plans/<slug>` folder that mirrors the task-plan lifecycle without creating a separate planning system.

## What Changes

- Add reusable `@colony/spec` plan workspace helpers.
- Add `colony plan create/status/publish/close` CLI commands.
- Make `task_plan_publish` create `openspec/plans/<slug>` alongside `openspec/changes/<slug>/CHANGE.md`.
- Sync completed subtask status back into `tasks.md`, `checkpoints.md`, and `plan.json`.

## Impact

Planning remains local-first and backed by existing Colony task threads. Small tasks can still skip plan workspaces; medium and large plans gain visible files, role prompts, checkpoints, and completion gates.
