---
"@imdeadpool/colony-cli": patch
---

Add `colony health --merge-repo-store` so claim-before-edit metrics include the per-repo `<repo_root>/.omx/colony-home/data.db` that codex hooks write to when `COLONY_HOME` redirects them off the global database. Also stop classifying the lifecycle bridge as "unavailable" when PreToolUse signals are present — those signals are direct evidence the hook is firing, regardless of whether the OMX runtime summary stream is connected.
