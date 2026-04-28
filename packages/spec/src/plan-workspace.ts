import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const PLAN_WORKSPACE_DIR = 'openspec/plans';

export const PLAN_WORKSPACE_ROLES = [
  'planner',
  'architect',
  'critic',
  'executor',
  'writer',
  'verifier',
] as const;

export type PlanWorkspaceRole = (typeof PLAN_WORKSPACE_ROLES)[number];
export type PlanTaskStatus = 'available' | 'claimed' | 'completed' | 'blocked';
export type PlanCapabilityHint = 'ui_work' | 'api_work' | 'test_work' | 'infra_work' | 'doc_work';

export interface PlanWorkspaceTaskInput {
  title: string;
  description: string;
  file_scope: string[];
  depends_on?: number[] | undefined;
  spec_row_id?: string | null | undefined;
  capability_hint?: PlanCapabilityHint | null | undefined;
  status?: PlanTaskStatus | undefined;
  claimed_by_session_id?: string | null | undefined;
  claimed_by_agent?: string | null | undefined;
  completed_summary?: string | null | undefined;
}

export interface PlanWorkspaceTask extends PlanWorkspaceTaskInput {
  subtask_index: number;
  depends_on: number[];
  spec_row_id: string | null;
  capability_hint: PlanCapabilityHint | null;
  status: PlanTaskStatus;
  claimed_by_session_id: string | null;
  claimed_by_agent: string | null;
  completed_summary: string | null;
}

export interface PlanWorkspaceManifest {
  schema_version: 1;
  plan_slug: string;
  title: string;
  problem: string;
  acceptance_criteria: string[];
  roles: PlanWorkspaceRole[];
  tasks: PlanWorkspaceTask[];
  published: {
    spec_task_id: number | null;
    spec_change_path: string | null;
    auto_archive: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface CreatePlanWorkspaceInput {
  repoRoot: string;
  slug: string;
  title: string;
  problem?: string | undefined;
  acceptanceCriteria?: string[] | undefined;
  tasks?: PlanWorkspaceTaskInput[] | undefined;
  roles?: PlanWorkspaceRole[] | undefined;
  force?: boolean | undefined;
  published?:
    | {
        spec_task_id?: number | null | undefined;
        spec_change_path?: string | null | undefined;
        auto_archive?: boolean | undefined;
      }
    | undefined;
}

export interface PlanWorkspaceSummary {
  dir: string;
  manifest: PlanWorkspaceManifest;
}

export function planWorkspacePath(repoRoot: string, slug: string): string {
  assertPlanSlug(slug);
  return join(repoRoot, PLAN_WORKSPACE_DIR, slug);
}

export function createPlanWorkspace(input: CreatePlanWorkspaceInput): PlanWorkspaceSummary {
  assertPlanSlug(input.slug);
  const dir = planWorkspacePath(input.repoRoot, input.slug);
  const manifestPath = join(dir, 'plan.json');
  if (existsSync(manifestPath) && !input.force) {
    throw new Error(`plan workspace already exists at ${dir}; pass --force to overwrite`);
  }

  const now = new Date().toISOString();
  const roles = input.roles?.length ? input.roles : [...PLAN_WORKSPACE_ROLES];
  const manifest: PlanWorkspaceManifest = {
    schema_version: 1,
    plan_slug: input.slug,
    title: input.title,
    problem: input.problem ?? 'TBD',
    acceptance_criteria: input.acceptanceCriteria?.length ? input.acceptanceCriteria : ['TBD'],
    roles,
    tasks: normalizeTasks(input.tasks ?? []),
    published: {
      spec_task_id: input.published?.spec_task_id ?? null,
      spec_change_path: input.published?.spec_change_path ?? null,
      auto_archive: input.published?.auto_archive ?? false,
    },
    created_at: now,
    updated_at: now,
  };

  mkdirSync(dir, { recursive: true });
  writeManifest(dir, manifest);
  writeFileSync(join(dir, 'plan.md'), renderPlanMarkdown(manifest), 'utf8');
  writeFileSync(join(dir, 'tasks.md'), renderTasksMarkdown(manifest), 'utf8');
  writeFileSync(join(dir, 'checkpoints.md'), renderCheckpointsMarkdown(manifest), 'utf8');
  for (const role of roles) {
    writeFileSync(join(dir, `${role}.md`), renderRoleMarkdown(manifest, role), 'utf8');
  }

  return { dir, manifest };
}

export function readPlanWorkspace(repoRoot: string, slug: string): PlanWorkspaceSummary {
  const dir = planWorkspacePath(repoRoot, slug);
  const manifest = JSON.parse(
    readFileSync(join(dir, 'plan.json'), 'utf8'),
  ) as PlanWorkspaceManifest;
  return { dir, manifest };
}

export function listPlanWorkspaces(repoRoot: string): PlanWorkspaceSummary[] {
  const root = join(repoRoot, PLAN_WORKSPACE_DIR);
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((slug) => existsSync(join(root, slug, 'plan.json')))
    .sort()
    .map((slug) => readPlanWorkspace(repoRoot, slug));
}

export function syncPlanWorkspaceTasks(args: {
  repoRoot: string;
  slug: string;
  tasks: PlanWorkspaceTaskInput[];
}): PlanWorkspaceSummary | null {
  const dir = planWorkspacePath(args.repoRoot, args.slug);
  const manifestPath = join(dir, 'plan.json');
  if (!existsSync(manifestPath)) return null;

  const manifest = readPlanWorkspace(args.repoRoot, args.slug).manifest;
  const previousByIndex = new Map(manifest.tasks.map((task) => [task.subtask_index, task]));
  const mergedTasks = args.tasks.map((task, index) => ({
    ...task,
    completed_summary:
      task.completed_summary ?? previousByIndex.get(index)?.completed_summary ?? null,
  }));
  const updated: PlanWorkspaceManifest = {
    ...manifest,
    tasks: normalizeTasks(mergedTasks),
    updated_at: new Date().toISOString(),
  };
  writeManifest(dir, updated);
  writeFileSync(join(dir, 'tasks.md'), renderTasksMarkdown(updated), 'utf8');
  writeFileSync(join(dir, 'checkpoints.md'), renderCheckpointsMarkdown(updated), 'utf8');
  return { dir, manifest: updated };
}

export function planTaskCounts(tasks: PlanWorkspaceTask[]): Record<PlanTaskStatus, number> {
  return tasks.reduce<Record<PlanTaskStatus, number>>(
    (acc, task) => {
      acc[task.status]++;
      return acc;
    },
    { available: 0, claimed: 0, completed: 0, blocked: 0 },
  );
}

function normalizeTasks(tasks: PlanWorkspaceTaskInput[]): PlanWorkspaceTask[] {
  return tasks.map((task, index) => ({
    subtask_index: index,
    title: task.title,
    description: task.description,
    file_scope: task.file_scope,
    depends_on: task.depends_on ?? [],
    spec_row_id: task.spec_row_id ?? null,
    capability_hint: task.capability_hint ?? null,
    status: task.status ?? 'available',
    claimed_by_session_id: task.claimed_by_session_id ?? null,
    claimed_by_agent: task.claimed_by_agent ?? null,
    completed_summary: task.completed_summary ?? null,
  }));
}

function writeManifest(dir: string, manifest: PlanWorkspaceManifest): void {
  writeFileSync(join(dir, 'plan.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function renderPlanMarkdown(manifest: PlanWorkspaceManifest): string {
  const criteria = manifest.acceptance_criteria.map((item) => `- ${item}`).join('\n');
  const roles = manifest.roles.map((role) => `- [${role}](./${role}.md)`).join('\n');
  return `# ${manifest.title}

Plan slug: \`${manifest.plan_slug}\`

## Problem

${manifest.problem}

## Acceptance Criteria

${criteria}

## Roles

${roles}

## Operator Flow

1. Refine this workspace until scope, risks, and tasks are explicit.
2. Publish the plan with \`colony plan publish ${manifest.plan_slug}\` or the \`task_plan_publish\` MCP tool.
3. Claim subtasks through Colony plan tools before editing files.
4. Close only when all subtasks are complete and \`checkpoints.md\` records final evidence.
`;
}

function renderTasksMarkdown(manifest: PlanWorkspaceManifest): string {
  const rows = manifest.tasks.map((task) =>
    [
      String(task.subtask_index),
      task.status,
      escapeCell(task.title),
      task.file_scope.map((file) => `\`${file}\``).join('<br>') || '-',
      task.depends_on.length ? task.depends_on.join(', ') : '-',
      task.capability_hint ?? '-',
      task.spec_row_id ?? '-',
      task.claimed_by_agent ?? '-',
    ].join('|'),
  );
  return `# Tasks

| # | Status | Title | Files | Depends on | Capability | Spec row | Owner |
| - | - | - | - | - | - | - | - |
${rows.length ? rows.join('\n') : '| - | available | TBD | - | - | - | - | - |'}
`;
}

function renderCheckpointsMarkdown(manifest: PlanWorkspaceManifest): string {
  const counts = planTaskCounts(manifest.tasks);
  const items = manifest.tasks.map((task) => {
    const mark = task.status === 'completed' ? 'x' : ' ';
    const owner = task.claimed_by_agent ? ` (${task.claimed_by_agent})` : '';
    const summary = task.completed_summary ? ` - ${task.completed_summary}` : '';
    return `- [${mark}] sub-${task.subtask_index} ${task.title} [${task.status}]${owner}${summary}`;
  });
  return `# Checkpoints

## Rollup

- available: ${counts.available}
- claimed: ${counts.claimed}
- completed: ${counts.completed}
- blocked: ${counts.blocked}

## Subtasks

${items.length ? items.join('\n') : '- [ ] Add subtasks before publishing.'}

## Completion Gate

- [ ] All subtasks complete.
- [ ] Spec change archived or explicitly marked not applicable.
- [ ] Verification evidence recorded.
`;
}

function renderRoleMarkdown(manifest: PlanWorkspaceManifest, role: PlanWorkspaceRole): string {
  return `# ${capitalize(role)}

Plan: \`${manifest.plan_slug}\`

## Responsibility

${roleResponsibility(role)}

## Checkpoints

- [ ] Read \`plan.md\`, \`tasks.md\`, and \`checkpoints.md\`.
- [ ] Record decisions or blockers in the plan workspace before handoff.
- [ ] Keep task-thread status aligned with local files.
`;
}

function roleResponsibility(role: PlanWorkspaceRole): string {
  switch (role) {
    case 'planner':
      return 'Clarify scope, sequencing, dependencies, and acceptance criteria.';
    case 'architect':
      return 'Check boundaries, data flow, interfaces, and rollback shape.';
    case 'critic':
      return 'Challenge weak assumptions, hidden risks, and missing tests.';
    case 'executor':
      return 'Implement claimed subtasks inside declared file scope.';
    case 'writer':
      return 'Keep docs, operator notes, and final handoff language accurate.';
    case 'verifier':
      return 'Prove completion with focused tests and explicit evidence.';
  }
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function assertPlanSlug(slug: string): void {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`invalid plan slug '${slug}'; use kebab-case`);
  }
}
