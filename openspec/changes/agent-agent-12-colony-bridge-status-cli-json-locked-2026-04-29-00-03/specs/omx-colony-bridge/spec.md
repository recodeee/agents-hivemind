## MODIFIED Requirements

### Requirement: Colony Exposes an OMX HUD Status Shape

Colony SHALL expose one compact bridge status payload for OMX HUD and status
overlays so OMX does not parse multiple independent Colony tools.

#### Scenario: OMX renders coordination state through MCP

- **WHEN** OMX needs a HUD-sized coordination card for a session
- **THEN** OMX can call the Colony MCP `bridge_status` tool
- **AND** the response uses schema `colony.omx_hud_status.v1`
- **AND** the response includes compact hivemind, attention, ready-work,
  claim-preview, latest-note, evidence, and next-action fields.

#### Scenario: OMX renders coordination state through CLI JSON

- **WHEN** OMX cannot or should not use MCP for HUD status
- **THEN** OMX can call `colony bridge status --json`
- **AND** the command accepts `--repo-root`, `--session-id`, `--agent`, and
  `--branch`
- **AND** the JSON output uses the same compact `colony.omx_hud_status.v1`
  payload shape as the MCP `bridge_status` tool.

#### Scenario: HUD keeps bodies out of the hot path

- **WHEN** `bridge_status` or `colony bridge status --json` returns blocker or
  evidence references
- **THEN** it returns compact counts, IDs, and the latest task note preview
- **AND** full observation bodies stay behind `get_observations`.
