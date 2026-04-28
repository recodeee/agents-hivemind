# Add Stay-On-Task Ready Queue Bias

## Why

Agents currently treat every ready-work read as a fresh global ranking. Slightly newer or hotter signals can pull them away from a sub-task they already claimed, fragmenting work.

## What Changes

- Add deterministic persistence bias to `task_ready_for_agent`.
- Keep the current claimed sub-task ahead of marginally better ready work.
- Allow switching for blocking messages, completed or blocked current work, or significantly higher scoring ready work.
- Expose compact selection reasons for agents and tests.

## Impact

Ready-work selection behaves more like biological task inertia while still avoiding traps on blocked or completed work.
