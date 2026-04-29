import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MCP_TOOL_CALL_END_MARKER = '"mcp_tool_call_end"';
const FUNCTION_CALL_MARKER = '"function_call"';
const EXEC_COMMAND_END_MARKER = '"exec_command_end"';
const ONE_DAY_MS = 86_400_000;
const CODEX_WRITE_TOOL_NAMES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);

/**
 * Synthetic tool-call row sourced from a Codex CLI rollout. Mirrors the shape
 * of `@colony/storage`'s `ToolCallRow` so health metrics can merge both
 * sources without branching, but uses an `id` of `0` because rollout events
 * are not addressable inside the colony observations table.
 */
export interface CodexMcpToolCall {
  id: 0;
  session_id: string;
  tool: string;
  ts: number;
}

export interface CodexEditToolCall {
  id: 0;
  session_id: string;
  tool: string;
  ts: number;
}

export interface CodexRolloutOptions {
  /** Override the directory layout root. Defaults to `~/.codex/sessions`. */
  root?: string | undefined;
  /** Upper bound on rollout timestamps, ms epoch. Defaults to `Date.now()`. */
  now?: number | undefined;
}

/**
 * Resolve the Codex sessions root the same way the recodee backend does:
 * the `CODEX_CLI_SESSIONS_ROOT` env override, falling back to
 * `~/.codex/sessions`. Exported so callers and tests can point at a fixture.
 */
export function codexSessionsRoot(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.CODEX_CLI_SESSIONS_ROOT;
  if (typeof override === 'string' && override.trim().length > 0) {
    return path.resolve(expandHome(override.trim()));
  }
  return path.join(os.homedir(), '.codex', 'sessions');
}

/**
 * Read every `mcp_tool_call_end` event Codex emitted into rollout JSONL
 * files between `sinceMs` and `now`. The dashboard backend at
 * `app/modules/cavemem_hivemind/service.py::_count_codex_mcp_tool_calls`
 * is the reference implementation — keep this aligned: the day directory
 * walk, the marker pre-filter, the timestamp gate, and the
 * `mcp__<server>__<tool>` shape are all behaviour-load-bearing.
 */
export function readCodexMcpToolCallsSince(
  sinceMs: number,
  options: CodexRolloutOptions = {},
): CodexMcpToolCall[] {
  const now = options.now ?? Date.now();
  const root = options.root ?? codexSessionsRoot();
  if (!isDirectory(root)) return [];

  const calls: CodexMcpToolCall[] = [];
  for (const file of iterRolloutFiles(root, sinceMs, now)) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    // Skip files whose last write predates the window — saves the cost of
    // opening + scanning rollouts that can't possibly contribute events.
    if (stat.mtimeMs < sinceMs) continue;

    const sessionId = sessionIdFromRolloutPath(file);
    let raw: string;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split('\n')) {
      if (!line.includes(MCP_TOOL_CALL_END_MARKER)) continue;
      const parsed = parseRolloutLine(line, { sinceMs, nowMs: now });
      if (parsed === null) continue;
      calls.push({ id: 0, session_id: sessionId, tool: parsed.tool, ts: parsed.ts });
    }
  }
  return calls;
}

/**
 * Read write-family Codex rollout tool calls separately from Colony's
 * PostToolUse observations. These events prove Codex was editing, but they are
 * not claim-before-edit eligible unless Codex hooks or a rollout bridge are
 * installed, so health reports them as a source breakdown instead of folding
 * them into the claim-before-edit denominator.
 */
export function readCodexEditToolCallsSince(
  sinceMs: number,
  options: CodexRolloutOptions = {},
): CodexEditToolCall[] {
  const now = options.now ?? Date.now();
  const root = options.root ?? codexSessionsRoot();
  if (!isDirectory(root)) return [];

  const calls: CodexEditToolCall[] = [];
  for (const file of iterRolloutFiles(root, sinceMs, now)) {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(file);
    } catch {
      continue;
    }
    if (stat.mtimeMs < sinceMs) continue;

    const sessionId = sessionIdFromRolloutPath(file);
    let raw: string;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split('\n')) {
      if (!line.includes(FUNCTION_CALL_MARKER) && !line.includes(EXEC_COMMAND_END_MARKER)) {
        continue;
      }
      const parsed = parseEditRolloutLine(line, { sinceMs, nowMs: now });
      if (parsed === null) continue;
      calls.push({ id: 0, session_id: sessionId, tool: parsed.tool, ts: parsed.ts });
    }
  }
  return calls;
}

function expandHome(value: string): string {
  if (value === '~' || value.startsWith(`~${path.sep}`) || value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(1));
  }
  return value;
}

function isDirectory(candidate: string): boolean {
  try {
    return fs.statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function* iterRolloutFiles(root: string, sinceMs: number, nowMs: number): Iterable<string> {
  // Walk one UTC day at a time. The recodee backend uses calendar-day
  // boundaries because Codex names directories by the local UTC date the
  // session started; reusing the same arithmetic keeps both sources in sync.
  const startUtc = startOfUtcDay(sinceMs);
  const endUtc = startOfUtcDay(nowMs);
  for (let cursor = startUtc; cursor <= endUtc; cursor += ONE_DAY_MS) {
    const date = new Date(cursor);
    const yyyy = String(date.getUTCFullYear()).padStart(4, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const dayDir = path.join(root, yyyy, mm, dd);
    if (!isDirectory(dayDir)) continue;
    let entries: string[];
    try {
      entries = fs.readdirSync(dayDir);
    } catch {
      continue;
    }
    for (const name of entries.sort()) {
      if (name.startsWith('rollout-') && name.endsWith('.jsonl')) {
        yield path.join(dayDir, name);
      }
    }
  }
}

function startOfUtcDay(ms: number): number {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function sessionIdFromRolloutPath(filePath: string): string {
  const base = path.basename(filePath, '.jsonl');
  // Filename shape: `rollout-2026-04-28T13-41-07-019dd3e4-94bd-7f30-9f24-391e66eef84f`.
  // The last five hyphen-separated chunks are the UUID; lifting just the
  // UUID keeps Codex sessions distinct from colony's session IDs while
  // staying short enough to render in `colony health` output.
  const parts = base.split('-');
  if (parts.length >= 5) {
    return `codex:${parts.slice(-5).join('-')}`;
  }
  return `codex:${base}`;
}

function parseRolloutLine(
  line: string,
  bounds: { sinceMs: number; nowMs: number },
): { tool: string; ts: number } | null {
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(event)) return null;
  const payload = event.payload;
  if (!isRecord(payload) || payload.type !== 'mcp_tool_call_end') return null;
  const ts = parseRolloutTimestamp(event.timestamp);
  if (ts === null || ts <= bounds.sinceMs || ts > bounds.nowMs) return null;
  const invocation = payload.invocation;
  if (!isRecord(invocation)) return null;
  const server = typeof invocation.server === 'string' ? invocation.server.trim() : '';
  const tool = typeof invocation.tool === 'string' ? invocation.tool.trim() : '';
  if (!server || !tool) return null;
  return { tool: `mcp__${server}__${tool}`, ts };
}

function parseEditRolloutLine(
  line: string,
  bounds: { sinceMs: number; nowMs: number },
): { tool: string; ts: number } | null {
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(event)) return null;
  const ts = parseRolloutTimestamp(event.timestamp);
  if (ts === null || ts <= bounds.sinceMs || ts > bounds.nowMs) return null;
  const payload = event.payload;
  if (!isRecord(payload)) return null;

  if (payload.type === 'function_call') {
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (CODEX_WRITE_TOOL_NAMES.has(name)) return { tool: name, ts };
    if (name === 'apply_patch') return { tool: 'apply_patch', ts };
    return null;
  }

  if (payload.type === 'exec_command_end' && parsedCommandWrites(payload.parsed_cmd)) {
    return { tool: 'Bash', ts };
  }

  return null;
}

function parsedCommandWrites(parsedCmd: unknown): boolean {
  if (!Array.isArray(parsedCmd)) return false;
  return parsedCmd.some((entry) => {
    if (!isRecord(entry)) return false;
    const type = typeof entry.type === 'string' ? entry.type : '';
    return type === 'write' || type === 'edit' || type === 'patch';
  });
}

function parseRolloutTimestamp(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
