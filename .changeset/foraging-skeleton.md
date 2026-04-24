---
"@colony/foraging": minor
---

Introduce `@colony/foraging` package skeleton. Ships pure-fs primitives
for foraging — scanning `<repo_root>/examples/<name>/` food sources,
classifying each by manifest kind (`npm` / `pypi` / `cargo` / `go` /
`unknown`), computing a change-signal `content_hash` over manifest +
file tree, and best-effort redaction of common cloud-service secrets
before anything hits storage.

No storage writes, no MCP wiring, no hooks yet — those arrive in the
follow-up PR. This layer stands alone so it can be unit-tested without
dragging `MemoryStore` into the test fixture.

Public API: `scanExamplesFs`, `extract`, `readCapped`, `redact`, plus
the `FoodSource` / `ForagedPattern` / `IntegrationPlan` / `ScanLimits`
types and `DEFAULT_SCAN_LIMITS` constants.
