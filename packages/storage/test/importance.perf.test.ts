import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Storage } from '../src/index.js';

/**
 * ICM slice 3 — perf smoke. Inserts 50k observations across mixed importance
 * tiers, runs 100 random `searchFts` calls, and asserts mean latency stays
 * under the AGENTS.md 50ms p95 budget. Skip via `COLONY_SKIP_PERF=1` (CI
 * machines with cold disks can spike past the threshold; the unit suite
 * already covers correctness).
 */
const skip = process.env.COLONY_SKIP_PERF === '1';

const queries = [
  'session',
  'task',
  'observation',
  'memory',
  'storage',
  'colony',
  'agent',
  'compress',
  'search',
  'decay',
];

let dir: string;
let storage: Storage;

beforeAll(() => {
  if (skip) return;
  dir = mkdtempSync(join(tmpdir(), 'colony-importance-perf-'));
  storage = new Storage(join(dir, 'perf.db'));
  storage.createSession({
    id: 'P',
    ide: 'claude-code',
    cwd: '/tmp',
    started_at: Date.now(),
    metadata: null,
  });
  const N = 50_000;
  const tiers = ['critical', 'high', 'medium', 'low'] as const;
  for (let i = 0; i < N; i++) {
    const tier = tiers[i % tiers.length];
    if (!tier) continue;
    storage.insertObservation({
      session_id: 'P',
      kind: 'note',
      content: `${queries[i % queries.length]} sample observation #${i} colony memory storage agent`,
      compressed: false,
      intensity: null,
      importance: tier,
    });
  }
}, 120_000);

afterAll(() => {
  if (skip) return;
  try {
    storage.close();
  } catch {
    /* ignore */
  }
  rmSync(dir, { recursive: true, force: true });
});

describe.skipIf(skip)('importance perf smoke', () => {
  it('mean searchFts latency stays under the 50ms budget at 50k rows', () => {
    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const q = queries[i % queries.length];
      if (!q) continue;
      const t0 = process.hrtime.bigint();
      storage.searchFts(q, 10);
      const t1 = process.hrtime.bigint();
      samples.push(Number(t1 - t0) / 1_000_000);
    }
    samples.sort((a, b) => a - b);
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const sample = samples[Math.floor(samples.length * 0.95)] ?? 0;
    const p95 = sample;
    // Surface the numbers so test output doubles as the perf receipt.
    process.stderr.write(
      `[importance-perf] n=${samples.length} mean=${mean.toFixed(2)}ms p95=${p95.toFixed(2)}ms\n`,
    );
    expect(mean).toBeLessThan(50);
    expect(p95).toBeLessThan(50);
  });
});
