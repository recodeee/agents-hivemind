---
"@colony/core": minor
"@colony/mcp-server": minor
---

Add a direct-message primitive on task threads so agents can coordinate in prose without transferring file claims. `task_message` sends a message with explicit addressing (`to_agent: claude | codex | any`, optional `to_session_id`) and an `urgency` (`fyi | needs_reply | blocking`) that controls preface prominence. `task_messages` returns the compact inbox addressed to the caller across every task they participate in; `task_message_mark_read` flips a message to `read` idempotently. Replies (`reply_to`) flip the parent's status to `replied` atomically on the send so resolution is authoritative rather than advisory. Storage reuses the existing observation write path — no schema migration — with lifecycle fields kept in `metadata` alongside the existing `handoff` / `wake_request` primitives.
