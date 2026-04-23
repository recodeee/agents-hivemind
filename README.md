# agents-hivemind

Multi-agent memory and runtime awareness for local coding agents.

This repo is the `agents-hivemind` monorepo. It combines:

- local persistent memory for agent sessions
- compressed storage and progressive retrieval over MCP
- a compact `hivemind` runtime snapshot tool for active agent lanes
- a local viewer and worker for browsing and embedding backfill

Important current-state note: the published CLI and package names are still `cavemem`, so the commands below use `cavemem` even though this repository is branded as `agents-hivemind`.

## What It Does

`agents-hivemind` is built for agent-heavy local workflows where you need both memory and live coordination context.

- Hooks capture session events from supported IDE/CLI integrations.
- Prose is compressed before storage while code, paths, URLs, and technical tokens stay intact.
- Observations are written to local SQLite with FTS-backed search.
- MCP tools expose progressive retrieval: compact hits first, full bodies only when needed.
- The `hivemind` MCP tool reads `.omx` runtime state so agents can see who owns which branch, worktree, and task.
- A local worker serves a read-only browser viewer and optional embedding backfill.

## Current Surface

### CLI

The current CLI entrypoint is `cavemem` and registers these command groups:

- `install`
- `uninstall`
- `status`
- `config`
- `doctor`
- `start`, `stop`, `restart`, `viewer`
- `worker`
- `mcp`
- `search`
- `compress`
- `export`
- `hook`
- `reindex`

### MCP

The MCP server currently exposes:

- `hivemind`
- `search`
- `timeline`
- `get_observations`
- `list_sessions`

Recommended usage pattern:

1. Call `hivemind` when you need live ownership and task state from `.omx`.
2. Call `search` or `list_sessions` plus `timeline` to narrow the memory slice.
3. Call `get_observations` only for the specific IDs you actually need.

## Repo Layout

```text
apps/
  cli/          User-facing CLI entrypoint
  mcp-server/   MCP stdio server, including the hivemind tool
  worker/       Local HTTP viewer and embedding/backfill worker

packages/
  compress/     Deterministic prose compression and expansion
  config/       Settings schema and loader
  core/         MemoryStore orchestration
  embedding/    Local/Ollama/OpenAI embedding providers
  hooks/        IDE hook handlers
  installers/   IDE integration installers
  storage/      SQLite + FTS persistence layer

docs/
  architecture.md
  compression.md
  development.md
  mcp.md
```

## Architecture

```text
IDE hooks -> CLI hook runner -> MemoryStore
                               |- compression
                               |- SQLite / FTS / embeddings

MCP client -> apps/mcp-server -> MemoryStore
Browser    -> apps/worker     -> MemoryStore
```

Write path:

1. Hook fires from an IDE or CLI integration.
2. CLI routes the event into the hook runner.
3. Private blocks are redacted.
4. Prose is compressed.
5. Observation lands in SQLite and search indexes.
6. Embeddings are computed out of band when enabled.

Read path:

- Agents use MCP for compact-first retrieval.
- Humans use the local viewer on `127.0.0.1`.
- Multi-agent runtime state comes from `.omx/state/active-sessions/*.json` and worktree `AGENT.lock` telemetry when available.

## Quick Start

Prereqs:

- Node `>= 20`
- pnpm `>= 9`

Install dependencies and build:

```bash
pnpm install
pnpm build
```

Link the CLI globally for local use:

```bash
cd apps/cli
pnpm link --global
cavemem --help
```

Basic local flow:

```bash
cavemem install
cavemem status
cavemem mcp
cavemem viewer
```

Run against a scratch data dir:

```bash
export CAVEMEM_HOME=$PWD/.cavemem-dev
pnpm dev
```

## Hivemind Runtime Snapshot

The `hivemind` MCP tool is the repo's Hivemind-specific surface.

It summarizes active agent sessions without fetching memory bodies, including:

- repo root
- branch
- task name and latest task preview
- agent and CLI name
- activity state
- worktree path
- pid / pid liveness
- task mode and routing metadata

It reads runtime state from:

- `.omx/state/active-sessions/*.json`
- `.omx/agent-worktrees/*/AGENT.lock`
- `.omc/agent-worktrees/*/AGENT.lock`

This is meant to answer "who is doing what right now?" before a model starts pulling historical memory.

## Development

Core gates:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

All four should pass before merge.

Add a changeset when needed:

```bash
pnpm changeset
```

## Related Docs

- [Architecture](docs/architecture.md)
- [MCP tools](docs/mcp.md)
- [Development](docs/development.md)
- [Compression](docs/compression.md)
