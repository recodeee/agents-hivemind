---
"@colony/core": patch
---

Extend `inferIdeFromSessionId` so session ids that mirror the Guardex branch name (`agent/<name>/<task-slug>`, e.g. `agent/codex/make-openspec-lighter-with-colony-spec-m-2026-04-24-21-32`) resolve to the correct IDE. Previously the leading segment was the literal `agent`, so those rows were classified as `unknown` and the viewer showed no owner.
