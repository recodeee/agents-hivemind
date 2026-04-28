# Define Biological Coordination Contract

## Why

Colony already has pheromones, proposals, response-threshold routing, attention
inboxes, rescue, and Queen planning, but the shared model is scattered across
code and docs. Without one durable contract, future work can drift toward
"Queen as commander" or permanent stale state.

## What Changes

- Add a biological coordination capability spec for Colony.
- Define practical mappings from ant coordination to existing Colony
  primitives.
- Record anti-rules for Queen and stale signals.
- Link Queen documentation to the contract.

## Impact

No runtime behavior changes. Future Queen, ready-work, rescue, proposal,
handoff, and message work can cite the spec before changing coordination
semantics.
