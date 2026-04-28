# Make task_note_working the working-state write path

## Problem

Colony already has `task_note_working`, but top-level agent guidance still
described `task_post` as the working-state path. That drift keeps agents using
generic thread notes or OMX notepad writes instead of the active-task shortcut.

## Scope

- Update AGENTS and MCP docs to say current working state starts with
  `task_note_working`.
- Document the optional `bridge.writeOmxNotepadPointer` pointer shape.
- Keep OMX notepad as fallback only when no active Colony task is available.
- Add contract coverage so the guidance does not regress.

## Non-Goals

- No generic Colony key-value notepad.
- No changes to the existing `task_note_working` handler owned by adjacent
  active lanes.
