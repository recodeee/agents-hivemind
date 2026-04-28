## ADDED Requirements

### Requirement: Working-State Guidance Uses task_note_working First

Agent-facing guidance SHALL route current working-state saves through
`task_note_working` before OMX notepad writes or generic `task_post` notes.

#### Scenario: Agent saves current working state

- **WHEN** an agent records branch, task, blocker, next, and evidence progress
- **THEN** the documented first write path is `task_note_working`
- **AND** the full content remains in Colony when an active task resolves
- **AND** `.omx/notepad.md` receives no full proof body

#### Scenario: Transition pointer is needed

- **WHEN** `bridge.writeOmxNotepadPointer=true` or explicit
  `allow_omx_notepad_fallback=true` fallback is used
- **THEN** the documented OMX notepad record contains only `branch`, `task`,
  `blocker`, `next`, `evidence`, and `colony_observation_id`
- **AND** OMX remains a fallback or pointer surface, not the primary store
