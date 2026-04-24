import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultSettings } from '@colony/config';
import { MemoryStore } from '@colony/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildForagingPreface } from '../src/handlers/session-start.js';

let dir: string;
let store: MemoryStore;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'colony-forage-hook-'));
  store = new MemoryStore({ dbPath: join(dir, 'data.db'), settings: defaultSettings });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('buildForagingPreface', () => {
  it('returns an empty string when there are no indexed sources', () => {
    expect(buildForagingPreface(store, { cwd: '/some/repo' })).toBe('');
  });

  it('returns an empty string when cwd is absent', () => {
    store.storage.upsertExample({
      repo_root: '/some/repo',
      example_name: 'foo',
      content_hash: 'h',
      manifest_kind: 'npm',
      observation_count: 3,
    });
    expect(buildForagingPreface(store, {})).toBe('');
  });

  it('renders the indexed set with the examples_query hint', () => {
    for (const name of ['stripe-webhook', 'next-auth-demo', 'hono-rest']) {
      store.storage.upsertExample({
        repo_root: '/some/repo',
        example_name: name,
        content_hash: 'h',
        manifest_kind: 'npm',
        observation_count: 4,
      });
    }
    const preface = buildForagingPreface(store, { cwd: '/some/repo' });
    expect(preface).toMatch(/Examples indexed/);
    expect(preface).toContain('3 food sources');
    expect(preface).toContain('stripe-webhook');
    expect(preface).toContain('hono-rest');
    expect(preface).toMatch(/examples_query/);
  });

  it('truncates to the first 5 example names and shows an overflow count', () => {
    for (let i = 0; i < 9; i++) {
      store.storage.upsertExample({
        repo_root: '/some/repo',
        example_name: `ex-${String(i).padStart(2, '0')}`,
        content_hash: 'h',
        manifest_kind: 'npm',
        observation_count: 1,
      });
    }
    const preface = buildForagingPreface(store, { cwd: '/some/repo' });
    expect(preface).toContain('9 food sources');
    expect(preface).toContain('(+4 more)');
  });
});
