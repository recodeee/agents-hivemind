import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, test } from 'vitest';
import { IMPORTANCE_BASE_WEIGHT, Storage } from '../src/index.js';
import type { Importance } from '../src/index.js';

let dir: string;
let storage: Storage;

function seed(id = 'A'): string {
  storage.createSession({
    id,
    ide: 'claude-code',
    cwd: '/tmp',
    started_at: Date.now(),
    metadata: null,
  });
  return id;
}

function insert(content: string, importance?: Importance): number {
  return storage.insertObservation({
    session_id: 'A',
    kind: 'note',
    content,
    compressed: false,
    intensity: null,
    ...(importance !== undefined ? { importance } : {}),
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'colony-importance-'));
  storage = new Storage(join(dir, 'test.db'));
  seed();
});

afterEach(() => {
  storage.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('observation importance + temporal decay', () => {
  it('defaults importance to "medium" and seeds weight to baseWeight(medium)', () => {
    const id = insert('default');
    const row = storage.getObservation(id);
    expect(row).toBeDefined();
    expect(row?.importance).toBe('medium');
    expect(row?.access_count).toBe(0);
    expect(row?.last_accessed_at).toBeNull();
    expect(row?.weight).toBeCloseTo(IMPORTANCE_BASE_WEIGHT.medium, 6);
  });

  for (const tier of ['critical', 'high', 'medium', 'low'] as const) {
    test(`tier "${tier}" seeds weight = ${IMPORTANCE_BASE_WEIGHT[tier]}`, () => {
      const id = insert(`tier-${tier}`, tier);
      const row = storage.getObservation(id);
      expect(row?.importance).toBe(tier);
      expect(row?.weight).toBeCloseTo(IMPORTANCE_BASE_WEIGHT[tier], 6);
    });
  }

  it('recordAccess decays medium rows per baseWeight / (1 + access_count * 0.1)', () => {
    const id = insert('m', 'medium');
    // 5 sequential accesses → access_count = 5, weight = 1 / (1 + 5*0.1) = 1/1.5
    for (let i = 0; i < 5; i++) storage.recordAccess([id]);
    const row = storage.getObservation(id);
    expect(row?.access_count).toBe(5);
    expect(row?.weight).toBeCloseTo(IMPORTANCE_BASE_WEIGHT.medium / (1 + 5 * 0.1), 6);
    expect(row?.last_accessed_at).not.toBeNull();
  });

  it('recordAccess decays low rows from baseWeight=0.5', () => {
    const id = insert('l', 'low');
    for (let i = 0; i < 10; i++) storage.recordAccess([id]);
    const row = storage.getObservation(id);
    expect(row?.access_count).toBe(10);
    expect(row?.weight).toBeCloseTo(IMPORTANCE_BASE_WEIGHT.low / (1 + 10 * 0.1), 6);
  });

  it('critical never decays — weight stays at baseWeight after many accesses', () => {
    const id = insert('c', 'critical');
    for (let i = 0; i < 50; i++) storage.recordAccess([id]);
    const row = storage.getObservation(id);
    expect(row?.access_count).toBe(50);
    expect(row?.weight).toBeCloseTo(IMPORTANCE_BASE_WEIGHT.critical, 6);
  });

  it('high never decays — weight stays at baseWeight after many accesses', () => {
    const id = insert('h', 'high');
    for (let i = 0; i < 50; i++) storage.recordAccess([id]);
    const row = storage.getObservation(id);
    expect(row?.access_count).toBe(50);
    expect(row?.weight).toBeCloseTo(IMPORTANCE_BASE_WEIGHT.high, 6);
  });

  it('recordAccess batches multiple ids in one transaction', () => {
    const a = insert('a', 'medium');
    const b = insert('b', 'medium');
    storage.recordAccess([a, b]);
    expect(storage.getObservation(a)?.access_count).toBe(1);
    expect(storage.getObservation(b)?.access_count).toBe(1);
    const expected = IMPORTANCE_BASE_WEIGHT.medium / (1 + 1 * 0.1);
    expect(storage.getObservation(a)?.weight).toBeCloseTo(expected, 6);
    expect(storage.getObservation(b)?.weight).toBeCloseTo(expected, 6);
  });

  it('pruneLowDecay deletes only medium/low rows below minWeight', () => {
    const m = insert('m-keep', 'medium');
    const l = insert('l-prune', 'low');
    const h = insert('h-keep', 'high');
    const c = insert('c-keep', 'critical');

    // Drive `m` and `l` deep into decay. baseWeight/(1 + n*0.1) < 0.05 needs
    //   medium: 1 / (1 + n*0.1) < 0.05 → n > 190
    //   low:    0.5 / (1 + n*0.1) < 0.05 → n > 90
    for (let i = 0; i < 200; i++) storage.recordAccess([m, l]);

    const deleted = storage.pruneLowDecay({ minWeight: 0.05 });
    expect(deleted).toBe(2);
    expect(storage.getObservation(m)).toBeUndefined();
    expect(storage.getObservation(l)).toBeUndefined();
    // high + critical untouched even with the same heavy access pattern
    expect(storage.getObservation(h)).toBeDefined();
    expect(storage.getObservation(c)).toBeDefined();
  });

  it('pruneLowDecay never deletes critical/high even when weight is manually low', () => {
    // Simulate an out-of-band weight drift on critical/high; the
    // `importance IN (medium, low)` filter must still protect them.
    const c = insert('c', 'critical');
    const h = insert('h', 'high');
    storage['db' as never];
    // Direct write to confirm the filter is on importance, not weight.
    // Using better-sqlite3 handle via the prepared API path is overkill;
    // pruneLowDecay should refuse on importance alone. Instead just call
    // prune with a very high min and ensure critical/high survive.
    const deleted = storage.pruneLowDecay({ minWeight: 999 });
    expect(deleted).toBe(0);
    expect(storage.getObservation(c)).toBeDefined();
    expect(storage.getObservation(h)).toBeDefined();
  });

  it('countLowDecayCandidates matches pruneLowDecay for the same threshold', () => {
    const m = insert('m1', 'medium');
    const l = insert('l1', 'low');
    insert('m-keep', 'medium');
    for (let i = 0; i < 200; i++) storage.recordAccess([m, l]);
    const count = storage.countLowDecayCandidates(0.05);
    expect(count).toBe(2);
    const deleted = storage.pruneLowDecay({ minWeight: 0.05 });
    expect(deleted).toBe(count);
  });

  it('repeatedly fetching a medium observation accumulates access_count', () => {
    // Mirrors what MemoryStore.scheduleAccess does once flushed: each batch
    // counts as one access.
    const id = insert('repeat', 'medium');
    storage.recordAccess([id]);
    storage.recordAccess([id]);
    storage.recordAccess([id]);
    const row = storage.getObservation(id);
    expect(row?.access_count).toBe(3);
    expect(row?.weight).toBeCloseTo(IMPORTANCE_BASE_WEIGHT.medium / (1 + 3 * 0.1), 6);
  });
});
