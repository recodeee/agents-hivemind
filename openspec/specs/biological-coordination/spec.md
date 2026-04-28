# Biological Coordination Specification

## Purpose

Colony coordinates agents like an ant colony, not like a central scheduler. Work
is discovered through local traces, reinforced by repeated signal, weakened by
time, and claimed by agents that decide they are a good fit.

## Model Map

| Colony term | Biological model | Practical meaning |
| --- | --- | --- |
| Agent session | Ant | One local actor with limited context. |
| Repository | Nest | Shared work area and durable memory boundary. |
| Decaying priority signal | Pheromone | Time-sensitive strength used for ranking or warnings. |
| Task post, observation, file claim | Stigmergic mark | Local mark another agent can read later. |
| Useful example, bug fix, or improvement | Food source | Candidate value worth bringing back to the nest. |
| Agent discovering candidate work | Forager | Session that proposes or records possible future work. |
| Reinforce, handoff, message | Recruitment | Signal that invites another agent to inspect or join work. |
| TTL, decay, sweep | Evaporation | Automatic weakening or removal of stale signal. |
| Agent profile plus ready-work ranking | Response threshold | Fit score that lets agents pull work when signal crosses their threshold. |
| Queen | Plan publisher | Publishes structure; never commands workers. |
| Blocking message or attention inbox item | Alarm pheromone | Urgent signal that interrupts normal local pull. |
| Failed approach or do-not-touch warning | Negative pheromone | Compact avoidance signal for paths agents should not repeat blindly. |
| Rescue, sweep, archive | Trail pruning | Cleanup of stale, stranded, or completed trails. |

## Requirements

### Requirement: Coordination Is Local And Stigmergic

Colony SHALL coordinate through durable local marks, not through a commander that
knows every worker state.

#### Scenario: agent leaves a coordination mark

- **WHEN** an agent posts a task note, creates an observation, claims a file, or
  publishes a plan subtask
- **THEN** the mark is persisted on the repository's Colony substrate
- **AND** later agents can discover it through compact tools before fetching
  full bodies

#### Scenario: local marks stay advisory

- **WHEN** a file claim, observation, or task post suggests nearby work is active
- **THEN** Colony warns and ranks using that signal
- **AND** the signal does not become a hidden global lock unless a specific tool
  contract says so

### Requirement: Signals Decay Unless Intentionally Durable

Colony SHALL make coordination signals expire, decay, or fall below a noise
floor unless they are intentionally durable records.

#### Scenario: short-lived signal ages out

- **WHEN** a pheromone, handoff, wake, proposal reinforcement, message, or claim
  is older than its TTL, half-life, or sweep window
- **THEN** Colony reduces its routing impact or hides it from live coordination
- **AND** stale live state cannot dominate fresh work selection

#### Scenario: durable record is explicit

- **WHEN** a decision must survive decay
- **THEN** it is recorded as a document, spec, archive, completed task, or
  explicit decision observation
- **AND** it is not kept alive by repeatedly treating stale runtime state as
  current truth

### Requirement: Agents Pull Work By Response Threshold

Colony SHALL expose ready work for agents to pull, ranked by fit and current
local context.

#### Scenario: agent asks for ready work

- **WHEN** an agent calls `task_ready_for_agent`
- **THEN** Colony ranks unblocked work using plan availability, capability
  hints, agent profile, live claim conflicts, and recent release density
- **AND** the agent chooses and claims the work through normal task-plan tools

#### Scenario: response threshold is not assignment

- **WHEN** ready-work ranking names the best fit
- **THEN** the result is a pull signal, not a command
- **AND** any eligible agent can still inspect, claim, decline, reinforce, or
  hand off based on current context

### Requirement: Recruitment Uses Existing Coordination Primitives

Colony SHALL recruit agents through reinforcement, handoff, message, and wake
signals instead of out-of-band scheduler commands.

#### Scenario: forager finds food source

- **WHEN** an agent finds a useful example, bug fix, or improvement candidate
- **THEN** it records the candidate as a proposal, example, task post, or
  observation
- **AND** other agents can reinforce it explicitly, rediscover it, or create
  adjacent reinforcement through related edits

#### Scenario: agent needs another agent

- **WHEN** work should move to another session
- **THEN** the sender uses a handoff, message, wake, or relay with an explicit
  summary, next step, blocker, and file scope
- **AND** broadcast recruitment is ranked by response threshold rather than
  enforced as an exact assignment

### Requirement: Alarm Signals Interrupt Normal Pull

Colony SHALL surface blocking coordination signals as attention items before
ordinary ready-work selection.

#### Scenario: blocker is raised

- **WHEN** a message has `urgency: 'blocking'`, a handoff is pending, a wake is
  pending, or a lane is stalled
- **THEN** `attention_inbox` or equivalent startup context surfaces it as an
  alarm signal
- **AND** agents resolve, accept, decline, or relay the alarm before treating
  lower-priority ready work as the next action

### Requirement: Negative Signals Warn Without Freezing Work

Colony SHALL let agents record explicit avoidance signals for failed paths,
blocked approaches, reverted solutions, flaky routes, and do-not-touch warnings.

#### Scenario: agent records a failed path

- **WHEN** an agent posts `failed_approach`, `blocked_path`,
  `conflict_warning`, or `reverted_solution` on a task thread
- **THEN** Colony persists it as a searchable observation
- **AND** `search`, `hivemind_context`, and `task_ready_for_agent` can surface a
  compact warning before another agent implements nearby work

#### Scenario: warning stays advisory

- **WHEN** a negative signal matches ready work
- **THEN** Colony shows the warning without lowering the task's fit score
- **AND** ordinary failed experiments are not promoted to avoidance signals
  unless an agent records explicit do-not-repeat evidence

### Requirement: Queen Publishes Structure Only

Queen SHALL publish bounded task structure into Colony; it SHALL NOT command,
launch, or supervise agents.

#### Scenario: queen publishes a plan

- **WHEN** Queen receives a concrete goal with subtasks, file scopes,
  capability hints, and dependencies
- **THEN** it publishes claimable `task_plan` structure
- **AND** agents discover and claim sub-tasks through `task_ready_for_agent` and
  `task_plan_claim_subtask`

#### Scenario: queen observes stale plan state

- **WHEN** Queen sweep finds stalled, unclaimed, or archive-ready work
- **THEN** it emits attention items or optional messages
- **AND** it does not become a shell monitor, runtime supervisor, or worker
  launcher

### Requirement: Trail Pruning Removes Stale Coordination

Colony SHALL prune trails through rescue, sweep, archive, and completion
mechanisms so old state does not masquerade as current work.

#### Scenario: session is stranded

- **WHEN** a live session has stale activity and held claims past the rescue
  threshold
- **THEN** rescue emits a relay or attention item with inherited claims and a
  suggested next action
- **AND** another agent can pull or decline the rescued work through normal
  coordination tools

#### Scenario: plan is complete or stale

- **WHEN** all plan subtasks are complete, or a claimed/unclaimed subtask is
  stale past sweep thresholds
- **THEN** sweep or archive surfaces the next cleanup action
- **AND** completed or abandoned trails stop competing with fresh ready work

## Anti-Rules

- Queen MUST NOT launch agents.
- Queen MUST NOT assign exact agents as commands.
- Queen MUST NOT monitor every shell as a scheduler.
- Queen MUST NOT replace `task_ready_for_agent`, handoffs, messages, rescue, or
  archive with a parallel command channel.
- Signals MUST decay, expire, sweep, or fall below a noise floor unless they are
  intentionally durable records.
- A stale claim, handoff, wake, message, proposal, or pheromone MUST NOT be
  treated as current truth without fresh evidence.
- Durable records MUST be explicit: docs, specs, decisions, archives, completed
  tasks, or committed history.
