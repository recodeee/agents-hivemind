# Cap Attention Inbox Stalled Lanes

## Why

`attention_inbox` can return every stalled/dead lane for a repo. In active
multi-agent repos this turns a startup coordination check into a large payload
even when the caller only needs the count and the newest few rows.

## What Changes

- Cap returned stalled lane rows by default.
- Preserve the total stalled lane count and truncation signal.
- Let MCP and CLI callers raise the stalled lane row limit explicitly.

## Impact

Agents still see that stalled lanes exist and can request more rows, while the
default inbox payload stays compact.
