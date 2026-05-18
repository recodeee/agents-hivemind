---
"@colony/storage": minor
"@colony/core": minor
"@colony/mcp-server": minor
---

ICM slice 2 — feedback `record`, `search`, and `stats` MCP tools.

Adds a new `feedback` lane that records "AI predicted X, real answer
was Y" corrections so a future agent can search prior mistakes by
topic before repeating them. Migration 015 introduces the `feedback`
table plus a porter-unicode61 `feedback_fts` virtual table mirrored
by the standard `ai/ad/au` triggers; importance is a four-level enum
defaulting to `medium`. `prediction`, `correction`, and the optional
`context` flow through `MemoryStore.recordFeedback`, which routes each
body through `prepareMemoryText` — the same redact-then-compress path
observations use — so the compression invariant holds at the write
boundary.

MCP surface (progressive disclosure):

- `feedback_record({ topic, prediction, correction, context?, importance?, created_by? })` → `{ id }`
- `feedback_search({ query, topic?, limit? })` → compact hits (`id`, `topic`, `importance`, `score`, `snippet`, `created_at`)
- `feedback_stats({ topic? })` → per-topic counts and `last_created_at`

Follow-up (separate PR): a pre-tool-use hook that surfaces prior
corrections on inbound prompts. This PR keeps the slice scoped to the
storage + search surface so it can ship behind a manual query first.

Reference: `docs/icm-integration-plan.md` slice 2.
