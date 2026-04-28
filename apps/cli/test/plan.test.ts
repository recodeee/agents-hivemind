import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import kleur from 'kleur';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../src/index.js';

let repoRoot: string;
let output: string;

beforeEach(() => {
  kleur.enabled = false;
  repoRoot = mkdtempSync(join(tmpdir(), 'colony-cli-plan-'));
  output = '';
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    output += String(chunk);
    return true;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(repoRoot, { recursive: true, force: true });
  kleur.enabled = true;
});

describe('colony plan CLI', () => {
  it('creates a plan workspace from structured task JSON', async () => {
    const program = createProgram();
    await program.parseAsync(
      [
        'node',
        'test',
        'plan',
        'create',
        'add-widget-page',
        '--cwd',
        repoRoot,
        '--title',
        'Add widget page',
        '--problem',
        'Widgets have no entry point.',
        '--acceptance',
        'Widget page renders',
        '--task',
        JSON.stringify({
          title: 'Build widget API',
          description: 'Return rows.',
          file_scope: ['apps/api/src/widgets.ts'],
          capability_hint: 'api_work',
        }),
      ],
      { from: 'node' },
    );

    const planDir = join(repoRoot, 'openspec/plans/add-widget-page');
    expect(output).toContain(`plan add-widget-page created at ${planDir}`);
    expect(existsSync(join(planDir, 'plan.md'))).toBe(true);
    expect(readFileSync(join(planDir, 'tasks.md'), 'utf8')).toContain('Build widget API');
  });

  it('prints local plan status without reading task threads', async () => {
    const program = createProgram();
    await program.parseAsync(
      [
        'node',
        'test',
        'plan',
        'create',
        'status-plan',
        '--cwd',
        repoRoot,
        '--task',
        JSON.stringify({
          title: 'Build API',
          description: 'Return rows.',
          file_scope: ['apps/api.ts'],
        }),
      ],
      { from: 'node' },
    );
    output = '';

    await createProgram().parseAsync(
      ['node', 'test', 'plan', 'status', 'status-plan', '--cwd', repoRoot],
      { from: 'node' },
    );

    expect(output).toContain('status-plan');
    expect(output).toContain('tasks: 0 completed, 0 claimed, 1 available, 0 blocked');
  });
});
