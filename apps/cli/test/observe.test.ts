import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { MemoryStore } from '@colony/core';
import kleur from 'kleur';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderFrame } from '../src/commands/observe.js';

let dir: string;
let store: MemoryStore;

const FROZEN_NOW = new Date('2026-04-28T03:00:00.000Z');

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'colony-observe-test-'));
  store = new MemoryStore({ dbPath: join(dir, 'data.db'), settings: defaultSettings });
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
  kleur.enabled = false;
});

afterEach(() => {
  vi.useRealTimers();
  kleur.enabled = true;
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('observe.renderFrame', () => {
  it('does not print the unclaimed-edits diagnostic line', () => {
    store.startSession({ id: 'codex1234-session', ide: 'codex', cwd: '/repo' });
    store.storage.insertObservation({
      session_id: 'codex1234-session',
      kind: 'tool_use',
      content: 'Edit input=src/orphan.ts output=ok',
      compressed: false,
      intensity: null,
      ts: FROZEN_NOW.getTime(),
      metadata: { tool: 'Edit', file_path: 'src/orphan.ts' },
      task_id: null,
      reply_to: null,
    });
    const frame = renderFrame(store.storage);
    expect(frame).not.toContain('edits without proactive claims');
    expect(frame).toContain('tool_use');
  });

  it('renders recent observations across sessions as tail lines', () => {
    store.startSession({ id: 'codex1234-session', ide: 'codex', cwd: '/repo' });
    store.startSession({ id: 'claude99-session', ide: 'claude-code', cwd: '/repo' });
    store.storage.insertObservation({
      session_id: 'codex1234-session',
      kind: 'note',
      content: 'codex made the worker viewer canonical',
      compressed: false,
      intensity: null,
      ts: FROZEN_NOW.getTime() + 1000,
      task_id: null,
      reply_to: null,
    });
    store.storage.insertObservation({
      session_id: 'claude99-session',
      kind: 'handoff',
      content: 'claude left a follow-up handoff',
      compressed: false,
      intensity: null,
      ts: FROZEN_NOW.getTime() + 2000,
      task_id: null,
      reply_to: null,
    });

    const lines = renderFrame(store.storage).split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^03:00:02\s+claude99\s+handoff\s+claude left a follow-up handoff$/);
    expect(lines[1]).toMatch(
      /^03:00:01\s+codex123\s+note\s+codex made the worker viewer canonical$/,
    );
  });
});
