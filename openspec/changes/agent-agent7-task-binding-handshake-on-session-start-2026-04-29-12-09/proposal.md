# Add Task Binding Handshake

## Problem

OMX emits runtime hooks and knows when sessions, prompts, and tools happen, but
Colony owns tasks, claims, ownership, health, handoffs, and ready work. Current
hook binding mostly happens implicitly through task prefaces, leaving OMX with
no compact task identity before the first edit and making pre-edit claim
diagnostics depend on late resolution.

## Scope

- Emit `session_start` lifecycle events from hook runtime with session, agent,
  cwd, repo, branch, and worktree identity.
- Emit one `task_bind` lifecycle event on the first prompt with only a safe,
  short prompt summary.
- Return a compact Colony binding response: bound task, ambiguous candidates,
  or no active task.
- Write only a short-lived OMX active-session cache with `task_id`,
  `expires_at`, and `binding_confidence`.
- Keep pre-tool-use canonical resolution in Colony and continue warning instead
  of blocking when binding is missing or ambiguous.

## Non-Goals

- No large prompt storage in OMX state.
- No new requirement that task binding must exist before edits run.
- No MCP dependency in hook safety.
