import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/memory-store.js';
import type { SimilarTask } from '../src/similarity-search.js';
import { buildSuggestionPayload } from '../src/suggestion-payload.js';

let dir: string;
let store: MemoryStore;

function seed(...ids: string[]): void {
  for (const id of ids) {
    store.startSession({ id, ide: 'claude-code', cwd: '/r' });
  }
}

function createTask(branch: string, repo_root = '/r'): number {
  const row = store.storage.findOrCreateTask({
    title: branch,
    repo_root,
    branch,
    created_by: 'claude',
  });
  return row.id;
}

function fillCorpusWithBackground(count: number): void {
  // Add disposable tasks so the corpus passes the MIN_CORPUS_SIZE gate.
  // Their content is irrelevant to the tests below; they exist solely
  // so honesty-gate logic doesn't short-circuit the suggestion path.
  for (let i = 0; i < count; i++) createTask(`background/${i}`);
}

function addClaim(p: { task_id: number; file_path: string; ts: number }): void {
  store.storage.insertObservation({
    session_id: 'claude',
    kind: 'claim',
    content: `claim ${p.file_path}`,
    compressed: false,
    intensity: null,
    task_id: p.task_id,
    ts: p.ts,
    metadata: { file_path: p.file_path },
  });
}

function addObservation(p: {
  task_id: number;
  kind: string;
  content?: string;
  ts: number;
  metadata?: Record<string, unknown>;
}): void {
  store.storage.insertObservation({
    session_id: 'claude',
    kind: p.kind,
    content: p.content ?? p.kind,
    compressed: false,
    intensity: null,
    task_id: p.task_id,
    ts: p.ts,
    ...(p.metadata ? { metadata: p.metadata } : {}),
  });
}

function similar(task_id: number, branch: string, opts: Partial<SimilarTask> = {}): SimilarTask {
  return {
    task_id,
    branch,
    repo_root: '/r',
    similarity: opts.similarity ?? 0.8,
    status: opts.status ?? 'in-progress',
    observation_count: opts.observation_count ?? 5,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'colony-suggestion-payload-'));
  store = new MemoryStore({ dbPath: join(dir, 'data.db'), settings: defaultSettings });
  seed('claude');
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('buildSuggestionPayload — honesty gates', () => {
  it('sets insufficient_data_reason when corpus is below MIN_CORPUS_SIZE', () => {
    // 5 tasks total — well below the 10-task floor.
    const ids = Array.from({ length: 5 }, (_, i) => createTask(`only-${i}`));
    const similar_tasks = ids.map((id, i) => similar(id, `only-${i}`));

    const payload = buildSuggestionPayload(store, similar_tasks);
    expect(payload.insufficient_data_reason).not.toBeNull();
    expect(payload.insufficient_data_reason).toMatch(/colony has only/);
    expect(payload.first_files_likely_claimed).toEqual([]);
    expect(payload.patterns_to_watch).toEqual([]);
    expect(payload.resolution_hints).toBeNull();
  });

  it('sets insufficient_data_reason when fewer than 3 similar tasks above floor', () => {
    fillCorpusWithBackground(20);
    // Only 2 similar — below MIN_SIMILAR_TASKS_FOR_SUGGESTION (3).
    const a = createTask('similar-a');
    const b = createTask('similar-b');
    const payload = buildSuggestionPayload(store, [
      similar(a, 'similar-a'),
      similar(b, 'similar-b'),
    ]);
    expect(payload.insufficient_data_reason).toMatch(/2 similar task/);
    expect(payload.first_files_likely_claimed).toEqual([]);
  });
});

describe('buildSuggestionPayload — first_files_likely_claimed', () => {
  it('ranks files by appearance count across similar tasks with Wilson dampening', () => {
    fillCorpusWithBackground(20);

    // Three similar tasks. File X appears in all three; file Y in two; Z in one.
    const t1 = createTask('similar-1');
    const t2 = createTask('similar-2');
    const t3 = createTask('similar-3');

    addClaim({ task_id: t1, file_path: 'src/X.ts', ts: 1000 });
    addClaim({ task_id: t1, file_path: 'src/Y.ts', ts: 2000 });

    addClaim({ task_id: t2, file_path: 'src/X.ts', ts: 1000 });
    addClaim({ task_id: t2, file_path: 'src/Y.ts', ts: 2000 });

    addClaim({ task_id: t3, file_path: 'src/X.ts', ts: 1000 });
    addClaim({ task_id: t3, file_path: 'src/Z.ts', ts: 2000 });

    const payload = buildSuggestionPayload(store, [
      similar(t1, 'similar-1'),
      similar(t2, 'similar-2'),
      similar(t3, 'similar-3'),
    ]);
    expect(payload.insufficient_data_reason).toBeNull();

    const ranking = payload.first_files_likely_claimed;
    expect(ranking[0]?.file_path).toBe('src/X.ts');
    expect(ranking[0]?.appears_in_count).toBe(3);
    // Wilson lower-bound dampens the 3/3 confidence below 1.0 — the
    // load-bearing property is that small-sample 100% never reads as
    // "fully confident".
    expect(ranking[0]?.confidence).toBeLessThan(1);
    expect(ranking[0]?.confidence).toBeGreaterThan(0);

    // src/Y.ts (2 of 3) should rank above src/Z.ts (1 of 3).
    const yIdx = ranking.findIndex((r) => r.file_path === 'src/Y.ts');
    const zIdx = ranking.findIndex((r) => r.file_path === 'src/Z.ts');
    expect(yIdx).toBeGreaterThanOrEqual(0);
    expect(zIdx).toBeGreaterThanOrEqual(0);
    expect(yIdx).toBeLessThan(zIdx);
    // Y in 2/3 has higher confidence than Z in 1/3.
    expect(ranking[yIdx]?.confidence).toBeGreaterThan(ranking[zIdx]?.confidence ?? 0);
  });

  it('only counts the first N (default 3) unique files per task', () => {
    fillCorpusWithBackground(20);
    const t1 = createTask('many-claims-1');
    const t2 = createTask('many-claims-2');
    const t3 = createTask('many-claims-3');

    // Each task claims 5 files; only the first 3 should count.
    for (const t of [t1, t2, t3]) {
      for (let i = 0; i < 5; i++) {
        addClaim({ task_id: t, file_path: `src/file-${i}.ts`, ts: 1000 + i });
      }
    }

    const payload = buildSuggestionPayload(store, [
      similar(t1, 'many-claims-1'),
      similar(t2, 'many-claims-2'),
      similar(t3, 'many-claims-3'),
    ]);
    // file-3 and file-4 should not be ranked — only the first 3
    // unique claims per task count.
    const paths = payload.first_files_likely_claimed.map((r) => r.file_path);
    expect(paths).toContain('src/file-0.ts');
    expect(paths).toContain('src/file-1.ts');
    expect(paths).toContain('src/file-2.ts');
    expect(paths).not.toContain('src/file-3.ts');
    expect(paths).not.toContain('src/file-4.ts');
  });
});

describe('buildSuggestionPayload — patterns_to_watch', () => {
  it('surfaces handoff-expired, handoff-cancelled, and plan-archive-blocked patterns with the right kind', () => {
    fillCorpusWithBackground(20);
    const t1 = createTask('expired/task');
    const t2 = createTask('cancelled/task');
    const t3 = createTask('blocked/task');

    addObservation({
      task_id: t1,
      kind: 'handoff',
      content: 'handoff to codex; expired after 90m',
      ts: 1000,
      metadata: { status: 'expired' },
    });
    addObservation({
      task_id: t2,
      kind: 'handoff',
      content: 'handoff to claude; user cancelled',
      ts: 1000,
      metadata: { status: 'cancelled' },
    });
    addObservation({
      task_id: t3,
      kind: 'plan-archive-blocked',
      content: 'plan A ready to archive but 2 conflicts block the merge',
      ts: 1000,
    });

    const payload = buildSuggestionPayload(store, [
      similar(t1, 'expired/task'),
      similar(t2, 'cancelled/task'),
      similar(t3, 'blocked/task'),
    ]);

    const kinds = payload.patterns_to_watch.map((p) => p.kind).sort();
    expect(kinds).toEqual(['cancelled-handoff', 'expired-handoff', 'plan-archive-blocked']);
  });

  it('caps patterns_to_watch at the configured limit', () => {
    fillCorpusWithBackground(20);
    const tasks = Array.from({ length: 10 }, (_, i) => createTask(`many-blocked-${i}`));
    for (const t of tasks) {
      addObservation({
        task_id: t,
        kind: 'plan-archive-blocked',
        content: `blocked ${t}`,
        ts: 1000,
      });
    }
    const payload = buildSuggestionPayload(
      store,
      tasks.map((t, i) => similar(t, `many-blocked-${i}`)),
      { max_patterns: 3 },
    );
    expect(payload.patterns_to_watch).toHaveLength(3);
  });
});

describe('buildSuggestionPayload — resolution_hints', () => {
  it('returns null when fewer than 2 completed similar tasks', () => {
    fillCorpusWithBackground(20);
    const t1 = createTask('completed-1');
    const t2 = createTask('in-progress-1');
    const t3 = createTask('in-progress-2');
    addObservation({ task_id: t1, kind: 'plan-archived', ts: 1000 });

    const payload = buildSuggestionPayload(store, [
      similar(t1, 'completed-1', { status: 'completed' }),
      similar(t2, 'in-progress-1', { status: 'in-progress' }),
      similar(t3, 'in-progress-2', { status: 'in-progress' }),
    ]);
    expect(payload.resolution_hints).toBeNull();
  });

  it('computes medians from completed similar tasks (>=2)', () => {
    fillCorpusWithBackground(20);

    // Two completed tasks with measurable elapsed/handoff/subtask shapes.
    const t1 = createTask('completed-1');
    const t2 = createTask('completed-2');
    const t3 = createTask('similar-3'); // padding to satisfy MIN_SIMILAR_TASKS_FOR_SUGGESTION

    // Task t1: 30 minutes elapsed, 1 accepted handoff, 2 sub-tasks.
    const t1Start = 1000;
    const t1End = t1Start + 30 * 60_000;
    addObservation({ task_id: t1, kind: 'note', ts: t1Start });
    addObservation({
      task_id: t1,
      kind: 'handoff',
      ts: t1End - 1000,
      metadata: { status: 'accepted' },
    });
    addObservation({ task_id: t1, kind: 'plan-subtask', ts: t1Start + 1 });
    addObservation({ task_id: t1, kind: 'plan-subtask', ts: t1Start + 2 });
    addObservation({ task_id: t1, kind: 'plan-archived', ts: t1End });

    // Task t2: 60 minutes elapsed, 3 accepted handoffs, 4 sub-tasks.
    const t2Start = 5000;
    const t2End = t2Start + 60 * 60_000;
    addObservation({ task_id: t2, kind: 'note', ts: t2Start });
    for (let i = 0; i < 3; i++) {
      addObservation({
        task_id: t2,
        kind: 'handoff',
        ts: t2End - (i + 1) * 1000,
        metadata: { status: 'accepted' },
      });
    }
    for (let i = 0; i < 4; i++) {
      addObservation({ task_id: t2, kind: 'plan-subtask', ts: t2Start + i });
    }
    addObservation({ task_id: t2, kind: 'plan-archived', ts: t2End });

    const payload = buildSuggestionPayload(store, [
      similar(t1, 'completed-1', { status: 'completed' }),
      similar(t2, 'completed-2', { status: 'completed' }),
      similar(t3, 'similar-3', { status: 'in-progress' }),
    ]);

    const hints = payload.resolution_hints;
    expect(hints).not.toBeNull();
    if (!hints) return;
    expect(hints.completed_sample_size).toBe(2);
    // Median of (30, 60) = 45 minutes.
    expect(hints.median_elapsed_minutes).toBeCloseTo(45, 0);
    // Median of (1, 3) = 2.
    expect(hints.median_handoff_count).toBe(2);
    // Median of (2, 4) = 3.
    expect(hints.median_subtask_count).toBe(3);
  });

  it('keeps median_subtask_count null when no completed similar task used a plan', () => {
    fillCorpusWithBackground(20);
    const t1 = createTask('completed-1');
    const t2 = createTask('completed-2');
    const t3 = createTask('similar-3');
    addObservation({ task_id: t1, kind: 'note', ts: 1000 });
    addObservation({ task_id: t1, kind: 'plan-archived', ts: 2000 });
    addObservation({ task_id: t2, kind: 'note', ts: 3000 });
    addObservation({ task_id: t2, kind: 'plan-archived', ts: 4000 });

    const payload = buildSuggestionPayload(store, [
      similar(t1, 'completed-1', { status: 'completed' }),
      similar(t2, 'completed-2', { status: 'completed' }),
      similar(t3, 'similar-3', { status: 'in-progress' }),
    ]);
    expect(payload.resolution_hints?.median_subtask_count).toBeNull();
  });
});
