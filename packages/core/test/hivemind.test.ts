import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readHivemind } from '../src/hivemind.js';

let dir = '';

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

describe('readHivemind', () => {
  it('keeps cli unknown when no active-session identity signal is concrete', () => {
    dir = mkdtempSync(join(tmpdir(), 'colony-hivemind-'));
    const repoRoot = join(dir, 'repo');
    const activeSessionDir = join(repoRoot, '.omx', 'state', 'active-sessions');
    const now = new Date().toISOString();
    mkdirSync(activeSessionDir, { recursive: true });
    writeFileSync(
      join(activeSessionDir, 'mcp-123.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          repoRoot,
          branch: 'main',
          taskName: 'MCP tool heartbeat',
          agentName: 'unknown',
          cliName: 'unknown',
          sessionKey: 'mcp-123',
          worktreePath: repoRoot,
          startedAt: now,
          lastHeartbeatAt: now,
          state: 'working',
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const snapshot = readHivemind({ repoRoot, now: Date.parse(now), includeStale: true });

    expect(snapshot.sessions[0]).toMatchObject({
      branch: 'main',
      agent: 'agent',
      cli: 'unknown',
    });
  });

  it('derives codex owner when active-session telemetry says unknown', () => {
    dir = mkdtempSync(join(tmpdir(), 'colony-hivemind-'));
    const repoRoot = join(dir, 'repo');
    const worktreePath = join(repoRoot, '.omx', 'agent-worktrees', 'agent__codex__owner-task');
    const activeSessionDir = join(repoRoot, '.omx', 'state', 'active-sessions');
    const now = new Date().toISOString();
    mkdirSync(activeSessionDir, { recursive: true });
    mkdirSync(worktreePath, { recursive: true });
    writeFileSync(
      join(activeSessionDir, 'agent__codex__owner-task.json'),
      `${JSON.stringify(
        {
          schemaVersion: 1,
          repoRoot,
          branch: 'agent/codex/owner-task',
          taskName: 'Fix owner label',
          latestTaskPreview: 'Render Codex instead of unknown',
          agentName: 'unknown',
          cliName: 'unknown',
          sessionKey: 'agent/codex/owner-task',
          worktreePath,
          pid: process.pid,
          startedAt: now,
          lastHeartbeatAt: now,
          state: 'working',
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const snapshot = readHivemind({ repoRoot, now: Date.parse(now) });

    expect(snapshot.sessions[0]).toMatchObject({
      branch: 'agent/codex/owner-task',
      agent: 'codex',
      cli: 'codex',
    });
  });

  it('keeps explicit repoRoot local instead of merging env repo roots', () => {
    dir = mkdtempSync(join(tmpdir(), 'colony-hivemind-'));
    const repoRoot = join(dir, 'repo-local');
    const envRepoRoot = join(dir, 'repo-env');
    const now = new Date().toISOString();
    writeActiveSession(repoRoot, {
      branch: 'agent/codex/local-task',
      fileName: 'local.json',
      taskName: 'Local task',
    });
    writeActiveSession(envRepoRoot, {
      branch: 'agent/codex/env-task',
      fileName: 'env.json',
      taskName: 'Env task',
    });

    const previous = process.env.COLONY_HIVEMIND_REPO_ROOTS;
    process.env.COLONY_HIVEMIND_REPO_ROOTS = envRepoRoot;
    try {
      const snapshot = readHivemind({ repoRoot, now: Date.parse(now) });

      expect(snapshot.repo_roots).toEqual([repoRoot]);
      expect(snapshot.session_count).toBe(1);
      expect(snapshot.sessions[0]?.branch).toBe('agent/codex/local-task');
    } finally {
      if (previous === undefined) delete process.env.COLONY_HIVEMIND_REPO_ROOTS;
      else process.env.COLONY_HIVEMIND_REPO_ROOTS = previous;
    }
  });

  it('surfaces bare managed worktrees as stranded lanes', () => {
    dir = mkdtempSync(join(tmpdir(), 'colony-hivemind-'));
    const repoRoot = join(dir, 'repo');
    const worktreePath = join(
      repoRoot,
      '.omx',
      'agent-worktrees',
      'recodee__codex__create-public-terms-page-2026-04-27-12-13',
    );
    mkdirSync(join(worktreePath, '.git'), { recursive: true });
    writeFileSync(
      join(worktreePath, '.git', 'HEAD'),
      'ref: refs/heads/agent/codex/create-public-terms-page-2026-04-27-12-13\n',
      'utf8',
    );

    const snapshot = readHivemind({
      repoRoot,
      now: Date.parse('2026-04-27T12:30:00.000Z'),
    });

    expect(snapshot.session_count).toBe(1);
    expect(snapshot.counts.stalled).toBe(1);
    expect(snapshot.sessions[0]).toMatchObject({
      branch: 'agent/codex/create-public-terms-page-2026-04-27-12-13',
      task: 'Stranded lane: create-public-terms-page-2026-04-27-12-13',
      task_name: 'create-public-terms-page-2026-04-27-12-13',
      agent: 'codex',
      cli: 'codex',
      source: 'managed-worktree',
      activity: 'stalled',
      routing_reason: 'stranded managed worktree',
    });
    expect(snapshot.sessions[0]?.activity_summary).toContain('Stranded managed worktree');
  });
});

function writeActiveSession(
  repoRoot: string,
  options: { branch: string; fileName: string; taskName: string },
): void {
  const activeSessionDir = join(repoRoot, '.omx', 'state', 'active-sessions');
  const worktreePath = join(repoRoot, '.omx', 'agent-worktrees', options.fileName);
  const now = new Date().toISOString();
  mkdirSync(activeSessionDir, { recursive: true });
  mkdirSync(worktreePath, { recursive: true });
  writeFileSync(
    join(activeSessionDir, options.fileName),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        repoRoot,
        branch: options.branch,
        taskName: options.taskName,
        agentName: 'codex',
        cliName: 'codex',
        worktreePath,
        startedAt: now,
        lastHeartbeatAt: now,
        state: 'working',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}
