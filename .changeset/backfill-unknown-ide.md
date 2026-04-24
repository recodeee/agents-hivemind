---
"@colony/storage": patch
"@colony/cli": patch
---

Add a `colony backfill ide` command that heals session rows whose stored `ide` is `'unknown'` by re-running the shared `inferIdeFromSessionId` helper against the row's session id. This is intended as a one-shot clean-up for databases populated before the hook-side inference learned to handle hyphen-delimited (`codex-...`) and Guardex-branch (`agent/<name>/...`) session ids. The underlying `Storage.backfillUnknownIde(mapper)` is idempotent, returns `{ scanned, updated }`, and skips any row the mapper cannot classify so it never invents an owner.
