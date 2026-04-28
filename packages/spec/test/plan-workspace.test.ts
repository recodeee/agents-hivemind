import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createPlanWorkspace,
  listPlanWorkspaces,
  planWorkspacePath,
  readPlanWorkspace,
  syncPlanWorkspaceTasks,
} from '../src/plan-workspace.js';

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'colony-plan-workspace-'));
});

afterEach(() => {
  rmSync(repoRoot, { recursive: true, force: true });
});

describe('plan workspace', () => {
  it('creates an OpenSpec-like local plan folder with role and checkpoint files', () => {
    const result = createPlanWorkspace({
      repoRoot,
      slug: 'add-widget-page',
      title: 'Add widget page',
      problem: 'Users need a widget entry point.',
      acceptanceCriteria: ['Widget page renders'],
      tasks: [
        {
          title: 'Build widget API',
          description: 'Return widget rows.',
          file_scope: ['apps/api/src/widgets.ts'],
          capability_hint: 'api_work',
        },
        {
          title: 'Build widget UI',
          description: 'Render widget rows.',
          file_scope: ['apps/frontend/src/widgets.tsx'],
          depends_on: [0],
          capability_hint: 'ui_work',
        },
      ],
    });

    expect(result.dir).toBe(planWorkspacePath(repoRoot, 'add-widget-page'));
    expect(existsSync(join(result.dir, 'plan.md'))).toBe(true);
    expect(existsSync(join(result.dir, 'tasks.md'))).toBe(true);
    expect(existsSync(join(result.dir, 'checkpoints.md'))).toBe(true);
    expect(existsSync(join(result.dir, 'planner.md'))).toBe(true);
    expect(existsSync(join(result.dir, 'verifier.md'))).toBe(true);
    expect(readFileSync(join(result.dir, 'tasks.md'), 'utf8')).toContain('Build widget API');
  });

  it('lists and reads machine manifests without parsing markdown tables', () => {
    createPlanWorkspace({
      repoRoot,
      slug: 'first-plan',
      title: 'First plan',
      tasks: [],
    });
    createPlanWorkspace({
      repoRoot,
      slug: 'second-plan',
      title: 'Second plan',
      tasks: [],
    });

    expect(listPlanWorkspaces(repoRoot).map((p) => p.manifest.plan_slug)).toEqual([
      'first-plan',
      'second-plan',
    ]);
    expect(readPlanWorkspace(repoRoot, 'first-plan').manifest.title).toBe('First plan');
  });

  it('syncs task status into manifest, tasks, and checkpoints files', () => {
    const workspace = createPlanWorkspace({
      repoRoot,
      slug: 'sync-plan',
      title: 'Sync plan',
      tasks: [
        {
          title: 'Build API',
          description: 'Done later.',
          file_scope: ['apps/api.ts'],
        },
      ],
    });

    syncPlanWorkspaceTasks({
      repoRoot,
      slug: 'sync-plan',
      tasks: [
        {
          title: 'Build API',
          description: 'Done later.',
          file_scope: ['apps/api.ts'],
          status: 'completed',
          claimed_by_agent: 'codex',
          completed_summary: 'API shipped.',
        },
      ],
    });

    const manifest = readPlanWorkspace(repoRoot, 'sync-plan').manifest;
    expect(manifest.tasks[0]?.status).toBe('completed');
    expect(readFileSync(join(workspace.dir, 'checkpoints.md'), 'utf8')).toContain(
      '- [x] sub-0 Build API [completed] (codex) - API shipped.',
    );
  });
});
