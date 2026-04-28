import { describe, expect, it } from 'vitest';
import { validateOrderedPlan } from '../src/plan-validation.js';

function subtask(
  title: string,
  fileScope: string[],
  dependsOn: number[] = [],
  capabilityHint?: string,
) {
  return {
    title,
    file_scope: fileScope,
    depends_on: dependsOn,
    ...(capabilityHint !== undefined ? { capability_hint: capabilityHint } : {}),
  };
}

describe('validateOrderedPlan', () => {
  it('rejects dependency cycles and forward edges', () => {
    const errors = validateOrderedPlan([subtask('A', ['a.ts'], [1]), subtask('B', ['b.ts'], [0])]);

    expect(errors.map((error) => error.code)).toContain('PLAN_INVALID_WAVE_DEPENDENCY');
    expect(errors[0]?.message).toContain('earlier indices');
  });

  it('rejects overlapping file scopes inside one wave', () => {
    const errors = validateOrderedPlan([subtask('A', ['shared.ts']), subtask('B', ['shared.ts'])]);

    expect(errors).toMatchObject([
      {
        code: 'PLAN_WAVE_SCOPE_OVERLAP',
        wave: 0,
        shared: ['shared.ts'],
        related_subtask_indices: [0, 1],
      },
    ]);
  });

  it('rejects finalizers that can start before earlier work finishes', () => {
    const errors = validateOrderedPlan([
      subtask('Build API', ['api.ts']),
      subtask('Build UI', ['ui.ts']),
      subtask('Verify release', ['api.test.ts'], [0], 'test_work'),
    ]);

    expect(errors).toMatchObject([
      {
        code: 'PLAN_FINALIZER_NOT_LAST',
        subtask_index: 2,
        related_subtask_indices: [1],
      },
    ]);
  });

  it('accepts ordered waves with a final verification task last', () => {
    const errors = validateOrderedPlan([
      subtask('Prepare storage', ['storage.ts']),
      subtask('Build API', ['api.ts'], [0]),
      subtask('Build UI', ['ui.ts'], [0]),
      subtask('Verify release', ['api.test.ts'], [1, 2], 'test_work'),
    ]);

    expect(errors).toEqual([]);
  });
});
