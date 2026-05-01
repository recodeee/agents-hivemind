import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defaultSettings } from '@colony/config';
import { MemoryStore, TaskThread } from '@colony/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildClaimDriftPayload, registerClaimsCommand } from '../src/commands/claims.js';

let dir: string;
let repoRoot: string;
let store: MemoryStore;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'colony-claims-drift-'));
  repoRoot = path.join(dir, 'repo');
  mkdirSync(repoRoot, { recursive: true });
  git(['init', '--initial-branch=main']);
  git(['config', 'user.email', 'agent@example.com']);
  git(['config', 'user.name', 'Agent']);
  writeRepoFile('src/claimed.ts', 'export const claimed = 1;\n');
  writeRepoFile('src/unclaimed.ts', 'export const unclaimed = 1;\n');
  writeRepoFile('src/staged.ts', 'export const staged = 1;\n');
  git(['add', '.']);
  git(['commit', '-m', 'initial']);

  store = new MemoryStore({
    dbPath: path.join(dir, 'data.db'),
    settings: { ...defaultSettings, dataDir: dir },
  });
  store.startSession({ id: 'session-a', ide: 'codex', cwd: repoRoot });
  store.startSession({ id: 'session-b', ide: 'codex', cwd: repoRoot });
});

afterEach(() => {
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('claim drift detector', () => {
  it('registers the claims drift command surface', () => {
    const program = new FakeCommand('colony');
    registerClaimsCommand(program as never);

    const claims = program.commands.find((command) => command.name() === 'claims');
    expect(claims?.commands.map((command) => command.name())).toContain('drift');
    const drift = claims?.commands.find((command) => command.name() === 'drift');
    expect(drift?.options.find((option) => option.long === '--repo-root')).toBeDefined();
    expect(drift?.options.find((option) => option.long === '--branch')).toBeDefined();
    expect(drift?.options.find((option) => option.long === '--session-id')).toBeDefined();
    expect(drift?.options.find((option) => option.long === '--task-id')).toBeDefined();
    expect(drift?.options.find((option) => option.long === '--fail-on-drift')).toBeDefined();
  });

  it('treats a touched claimed file as covered', () => {
    const thread = openTask();
    thread.claimFile({ session_id: 'session-a', file_path: 'src/claimed.ts' });
    writeRepoFile('src/claimed.ts', 'export const claimed = 2;\n');

    const payload = drift(thread.task_id);

    expect(payload.touched_files).toEqual(['src/claimed.ts']);
    expect(payload.claimed_files).toEqual(['src/claimed.ts']);
    expect(payload.unclaimed_touched_files).toEqual([]);
    expect(payload.claimed_but_untouched_files).toEqual([]);
    expect(payload.task_claim_file_calls).toEqual([]);
  });

  it('reports an unstaged touched file with no claim', () => {
    const thread = openTask();
    writeRepoFile('src/unclaimed.ts', 'export const unclaimed = 2;\n');

    const payload = drift(thread.task_id);

    expect(payload.git.unstaged_files).toEqual(['src/unclaimed.ts']);
    expect(payload.unclaimed_touched_files).toEqual(['src/unclaimed.ts']);
    expect(payload.task_claim_file_calls).toEqual([
      `mcp__colony__task_claim_file({ task_id: ${thread.task_id}, session_id: "session-a", file_path: "src/unclaimed.ts", note: "claim drift repair" })`,
    ]);
  });

  it('reports a staged touched file with no claim', () => {
    const thread = openTask();
    writeRepoFile('src/staged.ts', 'export const staged = 2;\n');
    git(['add', 'src/staged.ts']);

    const payload = drift(thread.task_id);

    expect(payload.git.staged_files).toEqual(['src/staged.ts']);
    expect(payload.unclaimed_touched_files).toEqual(['src/staged.ts']);
  });

  it('reports an untracked touched file with no claim', () => {
    const thread = openTask();
    writeRepoFile('src/new-file.ts', 'export const fresh = 1;\n');

    const payload = drift(thread.task_id);

    expect(payload.git.untracked_files).toEqual(['src/new-file.ts']);
    expect(payload.unclaimed_touched_files).toEqual(['src/new-file.ts']);
  });

  it('ignores generated touched files when configured', () => {
    const thread = openTask();
    writeRepoFile('generated/out.ts', 'export const generated = 1;\n');

    const payload = drift(thread.task_id, { ignore_patterns: ['generated/**'] });

    expect(payload.ignored_files).toEqual(['generated/out.ts']);
    expect(payload.touched_files).toEqual([]);
    expect(payload.unclaimed_touched_files).toEqual([]);
  });

  it('flags another session claim as a conflict instead of claim coverage', () => {
    const thread = openTask();
    thread.claimFile({ session_id: 'session-b', file_path: 'src/claimed.ts' });
    writeRepoFile('src/claimed.ts', 'export const claimed = 3;\n');

    const payload = drift(thread.task_id);

    expect(payload.unclaimed_touched_files).toEqual([]);
    expect(payload.conflicts).toMatchObject([
      {
        file_path: 'src/claimed.ts',
        reason: 'claimed_by_other_session',
        claims: [{ session_id: 'session-b', file_path: 'src/claimed.ts' }],
      },
    ]);
  });
});

function openTask(): TaskThread {
  const thread = TaskThread.open(store, {
    repo_root: repoRoot,
    branch: 'main',
    title: 'Claim drift test',
    session_id: 'session-a',
  });
  thread.join('session-a', 'codex');
  thread.join('session-b', 'codex');
  return thread;
}

function drift(
  taskId: number,
  options: { ignore_patterns?: string[] } = {},
): ReturnType<typeof buildClaimDriftPayload> {
  return buildClaimDriftPayload(store.storage, {
    repo_root: repoRoot,
    branch: 'main',
    session_id: 'session-a',
    task_id: taskId,
    now: 1_800_000_000_000,
    ...(options.ignore_patterns !== undefined ? { ignore_patterns: options.ignore_patterns } : {}),
  });
}

function writeRepoFile(relativePath: string, content: string): void {
  const target = path.join(repoRoot, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
}

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

class FakeCommand {
  readonly commands: FakeCommand[] = [];
  readonly options: Array<{ long: string }> = [];

  constructor(private readonly commandName: string) {}

  command(spec: string): FakeCommand {
    const child = new FakeCommand(spec.split(/\s+/)[0] ?? spec);
    this.commands.push(child);
    return child;
  }

  description(): this {
    return this;
  }

  option(flags: string): this {
    const long = flags.split(/[,\s]+/).find((part) => part.startsWith('--'));
    if (long) this.options.push({ long });
    return this;
  }

  action(): this {
    return this;
  }

  name(): string {
    return this.commandName;
  }
}
