export type PlanValidationErrorCode =
  | 'PLAN_INVALID_WAVE_DEPENDENCY'
  | 'PLAN_WAVE_SCOPE_OVERLAP'
  | 'PLAN_FINALIZER_NOT_LAST';

export interface OrderedPlanSubtaskInput {
  title: string;
  file_scope: string[];
  depends_on?: number[] | undefined;
  capability_hint?: string | null | undefined;
}

export interface PlanValidationErrorDetail {
  code: PlanValidationErrorCode;
  message: string;
  subtask_index?: number | undefined;
  dependency_index?: number | undefined;
  wave?: number | undefined;
  shared?: string[] | undefined;
  related_subtask_indices?: number[] | undefined;
}

export function validateOrderedPlan(
  subtasks: OrderedPlanSubtaskInput[],
): PlanValidationErrorDetail[] {
  const dependencyErrors = validateDependencies(subtasks);
  if (dependencyErrors.length > 0) return dependencyErrors;

  const waves = computeWaves(subtasks);
  return [...validateWaveScopeOverlaps(subtasks, waves), ...validateFinalizers(subtasks, waves)];
}

export function hasDependencyPath(
  subtasks: OrderedPlanSubtaskInput[],
  from: number,
  to: number,
): boolean {
  const visited = new Set<number>();
  const stack = [from];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (cur === undefined || visited.has(cur)) continue;
    visited.add(cur);
    const deps = subtasks[cur]?.depends_on ?? [];
    if (deps.includes(to)) return true;
    stack.push(...deps.filter((dep) => dep >= 0 && dep < subtasks.length));
  }
  return false;
}

function validateDependencies(subtasks: OrderedPlanSubtaskInput[]): PlanValidationErrorDetail[] {
  const errors: PlanValidationErrorDetail[] = [];

  for (let i = 0; i < subtasks.length; i++) {
    for (const dep of subtasks[i]?.depends_on ?? []) {
      if (dep < 0 || dep >= subtasks.length) {
        errors.push({
          code: 'PLAN_INVALID_WAVE_DEPENDENCY',
          message: `sub-task ${i} depends on ${dep}; dependency index is outside the plan`,
          subtask_index: i,
          dependency_index: dep,
        });
      } else if (dep >= i) {
        errors.push({
          code: 'PLAN_INVALID_WAVE_DEPENDENCY',
          message: `sub-task ${i} depends on ${dep}; dependencies must point to earlier indices`,
          subtask_index: i,
          dependency_index: dep,
        });
      }
    }
  }

  const cycle = findDependencyCycle(subtasks);
  if (cycle.length > 0) {
    errors.push({
      code: 'PLAN_INVALID_WAVE_DEPENDENCY',
      message: `dependency cycle detected: ${cycle.join(' -> ')}`,
      related_subtask_indices: cycle,
    });
  }

  return errors;
}

function findDependencyCycle(subtasks: OrderedPlanSubtaskInput[]): number[] {
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const stack: number[] = [];

  function visit(index: number): number[] {
    if (visiting.has(index)) {
      const start = stack.indexOf(index);
      return [...stack.slice(start), index];
    }
    if (visited.has(index)) return [];

    visiting.add(index);
    stack.push(index);
    for (const dep of subtasks[index]?.depends_on ?? []) {
      if (dep < 0 || dep >= subtasks.length) continue;
      const cycle = visit(dep);
      if (cycle.length > 0) return cycle;
    }
    stack.pop();
    visiting.delete(index);
    visited.add(index);
    return [];
  }

  for (let i = 0; i < subtasks.length; i++) {
    const cycle = visit(i);
    if (cycle.length > 0) return cycle;
  }
  return [];
}

function computeWaves(subtasks: OrderedPlanSubtaskInput[]): number[] {
  const memo = new Map<number, number>();

  function waveFor(index: number): number {
    const cached = memo.get(index);
    if (cached !== undefined) return cached;
    const deps = subtasks[index]?.depends_on ?? [];
    const wave = deps.length === 0 ? 0 : Math.max(...deps.map((dep) => waveFor(dep) + 1));
    memo.set(index, wave);
    return wave;
  }

  return subtasks.map((_, index) => waveFor(index));
}

function validateWaveScopeOverlaps(
  subtasks: OrderedPlanSubtaskInput[],
  waves: number[],
): PlanValidationErrorDetail[] {
  const errors: PlanValidationErrorDetail[] = [];
  for (let i = 0; i < subtasks.length; i++) {
    for (let j = i + 1; j < subtasks.length; j++) {
      if (waves[i] !== waves[j]) continue;
      const shared = intersect(subtasks[i]?.file_scope ?? [], subtasks[j]?.file_scope ?? []);
      if (shared.length === 0) continue;
      errors.push({
        code: 'PLAN_WAVE_SCOPE_OVERLAP',
        message: `sub-tasks ${i} and ${j} are both in wave ${waves[i]} and share files [${shared.join(', ')}]`,
        wave: waves[i],
        shared,
        related_subtask_indices: [i, j],
      });
    }
  }
  return errors;
}

function validateFinalizers(
  subtasks: OrderedPlanSubtaskInput[],
  waves: number[],
): PlanValidationErrorDetail[] {
  const errors: PlanValidationErrorDetail[] = [];
  const finalizerIndices = subtasks
    .map((subtask, index) => (isFinalizerSubtask(subtask) ? index : -1))
    .filter((index) => index >= 0);
  if (finalizerIndices.length === 0) return errors;

  const nonFinalizerIndices = subtasks
    .map((subtask, index) => (isFinalizerSubtask(subtask) ? -1 : index))
    .filter((index) => index >= 0);
  const lastNonFinalizerWave = Math.max(
    -1,
    ...nonFinalizerIndices.map((index) => waves[index] ?? 0),
  );

  for (const finalizerIndex of finalizerIndices) {
    const finalizerWave = waves[finalizerIndex] ?? 0;
    const laterWork = nonFinalizerIndices.filter((index) => (waves[index] ?? 0) >= finalizerWave);
    if (laterWork.length > 0) {
      errors.push({
        code: 'PLAN_FINALIZER_NOT_LAST',
        message: `finalizer sub-task ${finalizerIndex} is in wave ${finalizerWave}; finalizers must run after non-finalizer sub-tasks [${laterWork.join(', ')}]`,
        subtask_index: finalizerIndex,
        wave: finalizerWave,
        related_subtask_indices: laterWork,
      });
      continue;
    }

    if (finalizerWave <= lastNonFinalizerWave) {
      errors.push({
        code: 'PLAN_FINALIZER_NOT_LAST',
        message: `finalizer sub-task ${finalizerIndex} is in wave ${finalizerWave}; finalizers must be in the last wave`,
        subtask_index: finalizerIndex,
        wave: finalizerWave,
      });
      continue;
    }

    const missing = nonFinalizerIndices.filter(
      (index) => index < finalizerIndex && !hasDependencyPath(subtasks, finalizerIndex, index),
    );
    if (missing.length > 0) {
      errors.push({
        code: 'PLAN_FINALIZER_NOT_LAST',
        message: `finalizer sub-task ${finalizerIndex} must depend on every earlier non-finalizer sub-task; missing [${missing.join(', ')}]`,
        subtask_index: finalizerIndex,
        wave: finalizerWave,
        related_subtask_indices: missing,
      });
    }
  }

  return errors;
}

function isFinalizerSubtask(subtask: OrderedPlanSubtaskInput): boolean {
  const title = subtask.title.toLowerCase();
  if (/\b(final|finalize|finalizer|verify|verification|qa|release)\b/.test(title)) return true;
  if (
    (subtask.capability_hint ?? '') === 'test_work' &&
    /\b(test|tests|verify|verification|qa)\b/.test(title)
  ) {
    return true;
  }
  if (
    (subtask.capability_hint ?? '') === 'doc_work' &&
    /\b(update|final|release)\b.*\b(doc|docs|documentation|readme|notes)\b/.test(title)
  ) {
    return true;
  }
  return false;
}

function intersect(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return [...new Set(left.filter((value) => rightSet.has(value)))];
}
