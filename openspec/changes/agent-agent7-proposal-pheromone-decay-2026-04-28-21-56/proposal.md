# Make Foraging Proposals Evaporate

## Why

Foraging proposals should be useful weak signals, not a permanent backlog. Ignored proposals need deterministic pheromone-style decay, while reinforced and promoted proposals must remain visible through auditable reinforcement history.

## What Changes

- Make proposal half-life, noise floor, and promotion threshold configurable defaults.
- Compute report strength from decayed reinforcement rows without deleting history.
- Keep promoted proposals in a separate durable report bucket even after current strength decays.
- Preserve reinforcement events as append-only rows.

## Impact

Agents see fresh or reinforced proposals in `task_foraging_report`; ignored proposals fall below the live report threshold without a daemon or cleanup pass.
