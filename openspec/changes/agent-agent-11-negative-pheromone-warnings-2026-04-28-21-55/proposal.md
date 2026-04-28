# Add Negative Pheromone Warnings

## Why

Agents can already leave positive traces and blockers, but they need compact
avoidance signals for paths that should not be repeated blindly.

## What Changes

- Add explicit negative task-post kinds for failed approaches, blocked paths,
  conflict warnings, and reverted solutions.
- Surface relevant warnings through compact search, `hivemind_context`, and
  `task_ready_for_agent`.
- Document advisory use cases so normal failed experiments do not become fear
  signals.
