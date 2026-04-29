import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  codexSessionsRoot,
  readCodexEditToolCallsSince,
  readCodexMcpToolCallsSince,
} from '../../src/lib/codex-rollouts.js';

let tmpRoot: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-rollouts-'));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('readCodexMcpToolCallsSince', () => {
  it('returns empty when the sessions root is missing', () => {
    const calls = readCodexMcpToolCallsSince(0, {
      root: path.join(tmpRoot, 'does-not-exist'),
      now: Date.UTC(2026, 3, 28, 12, 0, 0),
    });
    expect(calls).toEqual([]);
  });

  it('extracts mcp__server__tool rows from rollout files inside the window', () => {
    const sinceMs = Date.UTC(2026, 3, 28, 0, 0, 0);
    const nowMs = Date.UTC(2026, 3, 28, 23, 59, 0);
    const dir = path.join(tmpRoot, '2026', '04', '28');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      'rollout-2026-04-28T13-41-07-019dd3e4-94bd-7f30-9f24-391e66eef84f.jsonl',
    );
    fs.writeFileSync(
      file,
      [
        rolloutLine('2026-04-28T11:41:37.698Z', 'colony', 'list_sessions'),
        rolloutLine('2026-04-28T11:41:40.101Z', 'colony', 'hivemind_context'),
        rolloutLine('2026-04-28T11:41:55.000Z', 'colony', 'hivemind_context'),
        rolloutLine('2026-04-28T11:41:55.500Z', 'omx_state', 'state_get_status'),
      ].join('\n'),
    );

    const calls = readCodexMcpToolCallsSince(sinceMs, { root: tmpRoot, now: nowMs });

    expect(calls.map((row) => row.tool).sort()).toEqual([
      'mcp__colony__hivemind_context',
      'mcp__colony__hivemind_context',
      'mcp__colony__list_sessions',
      'mcp__omx_state__state_get_status',
    ]);
    expect(new Set(calls.map((row) => row.session_id))).toEqual(
      new Set(['codex:019dd3e4-94bd-7f30-9f24-391e66eef84f']),
    );
    expect(calls.every((row) => row.id === 0)).toBe(true);
    expect(calls.every((row) => row.ts >= sinceMs && row.ts <= nowMs)).toBe(true);
  });

  it('drops events outside the window and tolerates malformed lines', () => {
    const sinceMs = Date.UTC(2026, 3, 28, 0, 0, 0);
    const nowMs = Date.UTC(2026, 3, 28, 23, 59, 0);
    const dir = path.join(tmpRoot, '2026', '04', '28');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      'rollout-2026-04-28T01-00-00-019dd000-aaaa-bbbb-cccc-dddddddddddd.jsonl',
    );
    fs.writeFileSync(
      file,
      [
        '{"this":"is not a rollout event"}',
        'this line is not even json',
        rolloutLine('2026-04-27T23:59:59.000Z', 'colony', 'too_old'),
        rolloutLine('2026-04-29T00:00:01.000Z', 'colony', 'too_new'),
        rolloutLine('2026-04-28T12:00:00.000Z', 'colony', 'in_window'),
      ].join('\n'),
    );

    const calls = readCodexMcpToolCallsSince(sinceMs, { root: tmpRoot, now: nowMs });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.tool).toBe('mcp__colony__in_window');
  });

  it('ignores rollout files whose mtime predates the window even if they exist on disk', () => {
    const sinceMs = Date.UTC(2026, 3, 28, 0, 0, 0);
    const nowMs = Date.UTC(2026, 3, 28, 23, 59, 0);
    const dir = path.join(tmpRoot, '2026', '04', '28');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      'rollout-2026-04-28T01-00-00-019dd111-eeee-ffff-aaaa-bbbbbbbbbbbb.jsonl',
    );
    fs.writeFileSync(file, rolloutLine('2026-04-28T12:00:00.000Z', 'colony', 'fresh'));
    const ancient = Date.UTC(2026, 3, 27, 0, 0, 0) / 1000;
    fs.utimesSync(file, ancient, ancient);

    const calls = readCodexMcpToolCallsSince(sinceMs, { root: tmpRoot, now: nowMs });

    expect(calls).toEqual([]);
  });

  it('walks every UTC day touched by the window', () => {
    const sinceMs = Date.UTC(2026, 3, 27, 12, 0, 0);
    const nowMs = Date.UTC(2026, 3, 28, 12, 0, 0);

    for (const [yyyy, mm, dd, hh] of [
      ['2026', '04', '27', '13'],
      ['2026', '04', '28', '11'],
    ] as const) {
      const dir = path.join(tmpRoot, yyyy, mm, dd);
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(
        dir,
        `rollout-${yyyy}-${mm}-${dd}T${hh}-00-00-019dd${dd}-aaaa-bbbb-cccc-dddddddddddd.jsonl`,
      );
      fs.writeFileSync(
        filePath,
        rolloutLine(`${yyyy}-${mm}-${dd}T${hh}:00:30.000Z`, 'colony', `day_${dd}`),
      );
    }

    const calls = readCodexMcpToolCallsSince(sinceMs, { root: tmpRoot, now: nowMs });

    expect(calls.map((row) => row.tool).sort()).toEqual([
      'mcp__colony__day_27',
      'mcp__colony__day_28',
    ]);
  });
});

describe('readCodexEditToolCallsSince', () => {
  it('extracts write-family function calls without counting read-only shell commands', () => {
    const sinceMs = Date.UTC(2026, 3, 28, 0, 0, 0);
    const nowMs = Date.UTC(2026, 3, 28, 23, 59, 0);
    const dir = path.join(tmpRoot, '2026', '04', '28');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(
      dir,
      'rollout-2026-04-28T13-41-07-019dd3e4-94bd-7f30-9f24-391e66eef84f.jsonl',
    );
    fs.writeFileSync(
      file,
      [
        functionCallLine('2026-04-28T11:41:37.000Z', 'Read'),
        functionCallLine('2026-04-28T11:41:38.000Z', 'Edit'),
        functionCallLine('2026-04-28T11:41:39.000Z', 'Write'),
        functionCallLine('2026-04-28T11:41:40.000Z', 'apply_patch'),
        execCommandEndLine('2026-04-28T11:41:41.000Z', 'read'),
        execCommandEndLine('2026-04-28T11:41:42.000Z', 'write'),
      ].join('\n'),
    );

    const calls = readCodexEditToolCallsSince(sinceMs, { root: tmpRoot, now: nowMs });

    expect(calls.map((row) => row.tool)).toEqual(['Edit', 'Write', 'apply_patch', 'Bash']);
    expect(new Set(calls.map((row) => row.session_id))).toEqual(
      new Set(['codex:019dd3e4-94bd-7f30-9f24-391e66eef84f']),
    );
  });
});

describe('codexSessionsRoot', () => {
  it('honours the CODEX_CLI_SESSIONS_ROOT override', () => {
    expect(codexSessionsRoot({ CODEX_CLI_SESSIONS_ROOT: '/tmp/codex-sessions' })).toBe(
      path.resolve('/tmp/codex-sessions'),
    );
  });

  it('falls back to ~/.codex/sessions when the env var is empty', () => {
    expect(codexSessionsRoot({ CODEX_CLI_SESSIONS_ROOT: '' })).toBe(
      path.join(os.homedir(), '.codex', 'sessions'),
    );
  });
});

function rolloutLine(timestamp: string, server: string, tool: string): string {
  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'mcp_tool_call_end',
      call_id: `call_${tool}`,
      invocation: { server, tool, arguments: {} },
    },
  });
}

function functionCallLine(timestamp: string, name: string): string {
  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'function_call',
      name,
      arguments: '{}',
      call_id: `call_${name}`,
    },
  });
}

function execCommandEndLine(timestamp: string, parsedType: string): string {
  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'exec_command_end',
      call_id: `call_${parsedType}`,
      parsed_cmd: [{ type: parsedType, cmd: parsedType === 'write' ? 'printf x > a.txt' : 'pwd' }],
    },
  });
}
