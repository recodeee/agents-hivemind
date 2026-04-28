## ADDED Requirements

### Requirement: Biological Coordination Contract

Colony SHALL define its coordination model as ant-style local coordination:
stigmergic marks, pheromone reinforcement, evaporation, response thresholds,
pull-based work, and Queen as a plan publisher rather than a commander.

#### Scenario: future coordination work cites the contract

- **WHEN** Queen, ready-work, proposal, handoff, message, rescue, or attention
  behavior changes
- **THEN** the change can cite
  `openspec/specs/biological-coordination/spec.md`
- **AND** the change preserves the anti-rules that Queen must not launch
  agents, assign exact agents as commands, monitor shells as a scheduler, or
  keep live signals alive without decay
