# Tasks

- [x] Emit `LIVE_FILE_CONTENTION` for live file contention conflicts.
- [x] Add default `protected_files` config list for storage/schema/health/hook cores.
- [x] Emit `PROTECTED_FILE_CONTENTION` for protected file contention across live sessions.
- [x] Block non-integrator protected-file edits in `block-on-conflict`.
- [x] Block runtime bridge output only for `block-on-conflict` plus strong live contention.
- [x] Keep weak and expired claims advisory/non-blocking.
- [x] Add tests for warn, block-on-conflict, audit-only, weak, expired, and protected contention behavior.
- [x] Run targeted tests, typecheck, and OpenSpec validation.
- [ ] Finish PR, merge, and sandbox cleanup; record PR URL and `MERGED` evidence.
