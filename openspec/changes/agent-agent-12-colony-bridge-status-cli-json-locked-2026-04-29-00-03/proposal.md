# Add bridge status CLI JSON

## Why

Some OMX HUD/status surfaces can call a local CLI more easily than an MCP tool,
but they still need the same compact Colony coordination payload.

## What Changes

- Add `colony bridge status --json`.
- Accept `--repo-root`, `--session-id`, `--agent`, and `--branch`.
- Reuse the bridge-status payload builder used by the MCP tool.
- Keep the output shape aligned with `bridge_status`.

## Impact

- HUD consumers can render Colony coordination state without starting an MCP
  request path.
- MCP `bridge_status` remains the same contract and delegates through the
  shared builder.
