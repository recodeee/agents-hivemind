import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { MemoryStore } from '../src/memory-store.js';
import { strandHistory } from '../src/strand-patterns.js';

let dir: string;
let store: MemoryStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'colony-strand-patterns-'));
  store = new MemoryStore({ dbPath: join(dir, 'data.db'), settings: defaultSettings });
  store.startSession({ id: 'seed', ide: 'test', cwd: '/repo' });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

it('returns no stranding history when similar tasks have no rescue relay', () => {
  const task = seedTask('clean-task');
  store.storage.insertObservation({
    session_id: 'seed',
    kind: 'note',
    content: 'ordinary progress',
    compressed: false,
    intensity: null,
    task_id: task.id,
    ts: task.created_at + 60_000,
  });

  expect(strandHistory(store, [task.id])).toEqual([]);
});

it('extracts rescue-relay stranding history with reason, outcome, and elapsed minutes', () => {
  const task = seedTask('stranded-task');
  store.storage.insertObservation({
    session_id: 'seed',
    kind: 'rescue-relay',
    content: 'task stranded on quota',
    compressed: false,
    intensity: null,
    task_id: task.id,
    ts: task.created_at + 120 * 60_000,
    metadata: {
      rescue_reason: 'quota',
      rescue_outcome: 'accepted',
    },
  });

  expect(strandHistory(store, [task.id])).toEqual([
    {
      task_id: task.id,
      stranded_at: task.created_at + 120 * 60_000,
      rescue_reason: 'quota',
      rescue_outcome: 'accepted',
      duration_to_strand_minutes: 120,
    },
  ]);
});

it('defaults missing rescue metadata without dropping the stranding event', () => {
  const task = seedTask('metadata-light-task');
  store.storage.insertObservation({
    session_id: 'seed',
    kind: 'rescue-relay',
    content: 'task stranded',
    compressed: false,
    intensity: null,
    task_id: task.id,
    ts: task.created_at + 30 * 60_000,
  });

  expect(strandHistory(store, [task.id])[0]).toMatchObject({
    rescue_reason: 'unspecified',
    rescue_outcome: 'pending',
    duration_to_strand_minutes: 30,
  });
});

function seedTask(branch: string): { id: number; created_at: number } {
  const task = store.storage.findOrCreateTask({
    title: branch,
    repo_root: '/repo',
    branch,
    created_by: 'seed',
  });
  return { id: task.id, created_at: task.created_at };
}
