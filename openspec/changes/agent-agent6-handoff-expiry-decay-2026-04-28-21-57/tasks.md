# Tasks

## 1. Handoff Expiry Semantics

- [x] Inspect `task_hand_off`, `task_accept_handoff`, `task_decline_handoff`, and `attention_inbox`.
- [x] Ensure new handoffs carry `expires_at` and legacy handoffs compute an effective expiry on read.
- [x] Make accept and decline reject expired handoffs with stable `HANDOFF_EXPIRED`.

## 2. Pending Surface Decay

- [x] Hide expired handoffs from `attention_inbox`.
- [x] Hide expired handoffs from storage-backed pending handoff counts.
- [x] Preserve old handoff observations for audit.

## 3. Tests And Docs

- [x] Add tests for live pending handoffs before expiry.
- [x] Add tests for expired handoffs hidden from pending surfaces.
- [x] Add tests for accepted/declined handoffs no longer appearing pending.
- [x] Add tests for expired accept/decline returning `HANDOFF_EXPIRED`.
- [x] Update MCP/docs descriptions for handoff TTL behavior.

## 4. Completion

- [x] Run focused tests.
- [x] Run OpenSpec validation.
- [ ] Commit, push, PR, merge.
- [ ] Record final `MERGED` evidence and sandbox cleanup.
