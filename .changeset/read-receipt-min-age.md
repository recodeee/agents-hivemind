---
"@colony/core": patch
---

Suppress fresh read receipts in `attention_inbox` until they ripen.

`buildAttentionInbox` now filters out `message_read` siblings that are
younger than `read_receipt_min_age_ms` (default 5 minutes). The receipt
exists in storage immediately, but the inbox only surfaces it once
"the recipient had time to respond and didn't" is honest signal —
otherwise the sender's preface gets a "follow up?" hint every turn the
recipient is still typing.

The min-age window is configurable per call so tests and hot-debug
sessions can pass `read_receipt_min_age_ms: 0` to opt out.
