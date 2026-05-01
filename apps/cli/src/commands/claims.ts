import { execFileSync as nodeExecFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path, { dirname, resolve } from 'node:path';
import { loadSettingsForCwd } from '@colony/config';
import {
  type Storage,
  type TaskClaimRow,
  type TaskRow,
  normalizeRepoFilePath,
} from '@colony/storage';
import type { Command } from 'commander';
import kleur from 'kleur';
import { withStorage } from '../util/store.js';

type ExecFileSync = (
  file: string,
  args: string[],
  options: {
    cwd?: string;
    encoding: 'utf8';
    stdio: ['ignore', 'pipe', 'ignore'];
    timeout?: number;
    maxBuffer?: number;
  },
) => string | Buffer;

export interface ClaimDriftTouchedSources {
  unstaged: boolean;
  staged: boolean;
  untracked: boolean;
  telemetry: boolean;
}

export interface ClaimDriftConflictClaim {
  task_id: number;
  task_title: string;
  branch: string;
  session_id: string;
  state: string;
  file_path: string;
}

export interface ClaimDriftConflict {
  file_path: string;
  reason: 'claimed_by_other_session' | 'multiple_claim_owners';
  claims: ClaimDriftConflictClaim[];
}

export interface ClaimDriftPayload {
  generated_at: string;
  repo_root: string;
  worktree_path: string;
  branch: string;
  task_id: number | null;
  session_id: string | null;
  selected_task_ids: number[];
  touched_files: string[];
  touched_file_sources: Record<string, ClaimDriftTouchedSources>;
  claimed_files: string[];
  unclaimed_touched_files: string[];
  claimed_but_untouched_files: string[];
  conflicts: ClaimDriftConflict[];
  task_claim_file_calls: string[];
  ignored_files: string[];
  git: {
    unstaged_files: string[];
    staged_files: string[];
    untracked_files: string[];
  };
}

interface BuildClaimDriftOptions {
  repo_root: string;
  branch?: string;
  session_id?: string;
  task_id?: number;
  now?: number;
  ignore_patterns?: string[];
  recent_edit_files?: string[];
  execFileSync?: ExecFileSync;
}

interface TaskClaimWithTask extends TaskClaimRow {
  task: TaskRow;
  normalized_file_path: string;
}

interface DriftGitFiles {
  worktree_path: string;
  branch: string;
  unstaged_files: string[];
  staged_files: string[];
  untracked_files: string[];
}

interface ClaimsDriftOpts {
  repoRoot?: string;
  branch?: string;
  sessionId?: string;
  taskId?: string;
  ignore?: string[];
  json?: boolean;
  failOnDrift?: boolean;
}

export function registerClaimsCommand(program: Command): void {
  const group = program.command('claims').description('Inspect Colony file claim coverage');

  group
    .command('drift')
    .description('Compare current git-touched files with Colony file claims')
    .option('--repo-root <path>', 'repo root to inspect (defaults to process.cwd())')
    .option('--branch <name>', 'branch to match Colony task claims (defaults to current branch)')
    .option('--session-id <id>', 'session whose claims should cover touched files')
    .option('--task-id <id>', 'specific Colony task id to compare against')
    .option('--ignore <glob>', 'ignore generated/pseudo paths; repeatable', collectOption, [])
    .option('--json', 'emit structured JSON')
    .option('--fail-on-drift', 'exit non-zero when unclaimed files or conflicts are found')
    .action(async (opts: ClaimsDriftOpts) => {
      const repoRoot = resolve(opts.repoRoot ?? process.cwd());
      const settings = loadSettingsForCwd(repoRoot);
      const taskId = parseOptionalPositiveInt(opts.taskId, '--task-id');
      const ignorePatterns = [...settings.privacy.excludePatterns, ...(opts.ignore ?? [])];

      await withStorage(
        settings,
        (storage) => {
          const payload = buildClaimDriftPayload(storage, {
            repo_root: repoRoot,
            ...(opts.branch !== undefined ? { branch: opts.branch } : {}),
            ...(opts.sessionId !== undefined ? { session_id: opts.sessionId } : {}),
            ...(taskId !== undefined ? { task_id: taskId } : {}),
            ignore_patterns: ignorePatterns,
          });
          process.stdout.write(
            `${opts.json === true ? JSON.stringify(payload, null, 2) : formatClaimDriftOutput(payload)}\n`,
          );
          if (
            opts.failOnDrift === true &&
            (payload.unclaimed_touched_files.length > 0 || payload.conflicts.length > 0)
          ) {
            process.exitCode = 1;
          }
        },
        { readonly: true },
      );
    });
}

export function buildClaimDriftPayload(
  storage: Pick<Storage, 'getTask' | 'listTasks' | 'listClaims'>,
  options: BuildClaimDriftOptions,
): ClaimDriftPayload {
  const execFileSync = options.execFileSync ?? nodeExecFileSync;
  const repoRoot = resolve(options.repo_root);
  const gitFiles = readDriftGitFiles(repoRoot, {
    ...(options.branch !== undefined ? { branch: options.branch } : {}),
    execFileSync,
  });
  const aliases = repoRootAliases(repoRoot, gitFiles.worktree_path, execFileSync);
  const tasks = selectClaimTasks(storage, {
    repo_root_aliases: aliases,
    branch: gitFiles.branch,
    ...(options.task_id !== undefined ? { task_id: options.task_id } : {}),
  });
  const ignorePatterns = options.ignore_patterns ?? [];
  const gitTouched = buildTouchedMap(gitFiles, repoRoot, ignorePatterns);
  const telemetryFiles = normalizeFiles(
    options.recent_edit_files ?? [],
    repoRoot,
    gitFiles.worktree_path,
  );
  for (const filePath of telemetryFiles) {
    if (isIgnored(filePath, ignorePatterns)) {
      gitTouched.ignored_files.add(filePath);
      continue;
    }
    const sources = gitTouched.touched_file_sources.get(filePath) ?? emptyTouchedSources();
    sources.telemetry = true;
    gitTouched.touched_file_sources.set(filePath, sources);
  }

  const scopeClaims = collectActiveClaims(tasks, storage, repoRoot, gitFiles.worktree_path);
  const coveredClaims =
    options.session_id !== undefined
      ? scopeClaims.filter((claim) => claim.session_id === options.session_id)
      : scopeClaims;
  const touchedFiles = sortPaths([...gitTouched.touched_file_sources.keys()]);
  const coveredClaimedFiles = sortPaths(
    unique(coveredClaims.map((claim) => claim.normalized_file_path)),
  );
  const scopeClaimsByFile = groupClaimsByFile(scopeClaims);
  const coveredFileSet = new Set(coveredClaimedFiles);
  const touchedFileSet = new Set(touchedFiles);
  const conflicts = claimConflicts(touchedFiles, scopeClaimsByFile, options.session_id);
  const conflictFileSet = new Set(conflicts.map((conflict) => conflict.file_path));
  const unclaimedTouchedFiles = touchedFiles.filter(
    (filePath) =>
      !coveredFileSet.has(filePath) &&
      !scopeClaimsByFile.has(filePath) &&
      !conflictFileSet.has(filePath),
  );
  const claimTaskId = options.task_id ?? (tasks.length === 1 ? tasks[0]?.id : undefined);

  return {
    generated_at: new Date(options.now ?? Date.now()).toISOString(),
    repo_root: repoRoot,
    worktree_path: gitFiles.worktree_path,
    branch: gitFiles.branch,
    task_id: claimTaskId ?? null,
    session_id: options.session_id ?? null,
    selected_task_ids: tasks.map((task) => task.id).sort((a, b) => a - b),
    touched_files: touchedFiles,
    touched_file_sources: Object.fromEntries(
      [...gitTouched.touched_file_sources.entries()].sort(([a], [b]) => a.localeCompare(b)),
    ),
    claimed_files: coveredClaimedFiles,
    unclaimed_touched_files: unclaimedTouchedFiles,
    claimed_but_untouched_files: coveredClaimedFiles.filter(
      (filePath) => !touchedFileSet.has(filePath),
    ),
    conflicts,
    task_claim_file_calls: unclaimedTouchedFiles.map((filePath) =>
      taskClaimFileCall({
        task_id: claimTaskId,
        session_id: options.session_id,
        file_path: filePath,
      }),
    ),
    ignored_files: sortPaths([...gitTouched.ignored_files]),
    git: {
      unstaged_files: gitFiles.unstaged_files,
      staged_files: gitFiles.staged_files,
      untracked_files: gitFiles.untracked_files,
    },
  };
}

export function formatClaimDriftOutput(payload: ClaimDriftPayload): string {
  const lines = [
    kleur.bold('colony claims drift'),
    `  repo: ${payload.repo_root}`,
    `  worktree: ${payload.worktree_path}`,
    `  branch: ${payload.branch}`,
    `  task: ${payload.task_id === null ? 'unknown' : `#${payload.task_id}`}`,
    `  session: ${payload.session_id ?? 'not provided'}`,
    `  touched_files: ${payload.touched_files.length}`,
    `  claimed_files: ${payload.claimed_files.length}`,
    `  unclaimed_touched_files: ${payload.unclaimed_touched_files.length}`,
    `  claimed_but_untouched_files: ${payload.claimed_but_untouched_files.length}`,
    `  conflicts: ${payload.conflicts.length}`,
  ];

  renderList(lines, 'Touched files', payload.touched_files);
  renderList(lines, 'Claimed files', payload.claimed_files);
  renderList(lines, 'Unclaimed touched files', payload.unclaimed_touched_files);
  renderList(lines, 'Claimed but untouched files', payload.claimed_but_untouched_files);
  renderConflicts(lines, payload.conflicts);
  renderList(lines, 'Exact task_claim_file calls', payload.task_claim_file_calls);
  renderList(lines, 'Ignored files', payload.ignored_files);

  if (payload.unclaimed_touched_files.length === 0 && payload.conflicts.length === 0) {
    lines.push(kleur.green('  result: no claim drift blocking commit/finish'));
  } else {
    lines.push(kleur.yellow('  result: claim drift found before commit/finish'));
  }

  return lines.join('\n');
}

function readDriftGitFiles(
  repoRoot: string,
  options: { branch?: string; execFileSync: ExecFileSync },
): DriftGitFiles {
  const branch = options.branch ?? readCurrentBranch(repoRoot, options.execFileSync);
  const worktreePath = resolveWorktreePath(repoRoot, branch, options.execFileSync);
  return {
    worktree_path: worktreePath,
    branch,
    unstaged_files: readGitPathList(
      worktreePath,
      ['diff', '--name-only', '-z'],
      options.execFileSync,
    ),
    staged_files: readGitPathList(
      worktreePath,
      ['diff', '--cached', '--name-only', '-z'],
      options.execFileSync,
    ),
    untracked_files: readGitPathList(
      worktreePath,
      ['ls-files', '--others', '--exclude-standard', '-z'],
      options.execFileSync,
    ),
  };
}

function readGitPathList(
  worktreePath: string,
  args: string[],
  execFileSync: ExecFileSync,
): string[] {
  try {
    const output = String(
      execFileSync('git', ['-C', worktreePath, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5_000,
        maxBuffer: 5 * 1024 * 1024,
      }),
    );
    return sortPaths(unique(output.split('\0').filter((filePath) => filePath.trim().length > 0)));
  } catch {
    return [];
  }
}

function readCurrentBranch(repoRoot: string, execFileSync: ExecFileSync): string {
  try {
    const branch = String(
      execFileSync('git', ['-C', repoRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2_000,
      }),
    ).trim();
    return branch.length > 0 ? branch : 'HEAD';
  } catch {
    return 'HEAD';
  }
}

function resolveWorktreePath(repoRoot: string, branch: string, execFileSync: ExecFileSync): string {
  const currentRoot = readGitTopLevel(repoRoot, execFileSync);
  if (readCurrentBranch(currentRoot, execFileSync) === branch) return currentRoot;
  for (const entry of readWorktreeEntries(repoRoot, execFileSync)) {
    if (entry.branch === branch) return entry.worktree;
  }
  return currentRoot;
}

function readGitTopLevel(repoRoot: string, execFileSync: ExecFileSync): string {
  try {
    const topLevel = String(
      execFileSync('git', ['-C', repoRoot, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2_000,
      }),
    ).trim();
    return topLevel.length > 0 ? resolve(topLevel) : repoRoot;
  } catch {
    return repoRoot;
  }
}

function readWorktreeEntries(
  repoRoot: string,
  execFileSync: ExecFileSync,
): Array<{ worktree: string; branch: string }> {
  try {
    const output = String(
      execFileSync('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2_000,
      }),
    );
    const entries: Array<{ worktree: string; branch: string }> = [];
    let worktree: string | null = null;
    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        worktree = resolve(line.slice('worktree '.length).trim());
      } else if (line.startsWith('branch ') && worktree !== null) {
        entries.push({
          worktree,
          branch: line
            .slice('branch '.length)
            .trim()
            .replace(/^refs\/heads\//, ''),
        });
      } else if (line.trim() === '') {
        worktree = null;
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function repoRootAliases(
  repoRoot: string,
  worktreePath: string,
  execFileSync: ExecFileSync,
): Set<string> {
  const aliases = new Set<string>();
  for (const candidate of [repoRoot, worktreePath, readGitTopLevel(repoRoot, execFileSync)]) {
    aliases.add(resolve(candidate));
    try {
      aliases.add(realpathSync.native(candidate));
    } catch {
      // Keep literal path when the alias cannot be resolved.
    }
  }
  const commonRoot = commonGitRepoRoot(worktreePath, execFileSync);
  if (commonRoot) aliases.add(commonRoot);
  return aliases;
}

function commonGitRepoRoot(worktreePath: string, execFileSync: ExecFileSync): string | null {
  try {
    const raw = String(
      execFileSync('git', ['-C', worktreePath, 'rev-parse', '--git-common-dir'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2_000,
      }),
    ).trim();
    if (!raw) return null;
    const gitDir = path.isAbsolute(raw) ? raw : resolve(worktreePath, raw);
    const normalized = resolve(gitDir);
    return path.basename(normalized) === '.git' ? dirname(normalized) : null;
  } catch {
    return null;
  }
}

function selectClaimTasks(
  storage: Pick<Storage, 'getTask' | 'listTasks'>,
  options: { repo_root_aliases: Set<string>; branch: string; task_id?: number },
): TaskRow[] {
  if (options.task_id !== undefined) {
    const task = storage.getTask(options.task_id);
    return task ? [task] : [];
  }
  return storage
    .listTasks(5000)
    .filter((task) => options.repo_root_aliases.has(resolve(task.repo_root)))
    .filter((task) => task.branch === options.branch);
}

function collectActiveClaims(
  tasks: TaskRow[],
  storage: Pick<Storage, 'listClaims'>,
  repoRoot: string,
  worktreePath: string,
): TaskClaimWithTask[] {
  const claims: TaskClaimWithTask[] = [];
  for (const task of tasks) {
    for (const claim of storage.listClaims(task.id)) {
      if (claim.state !== 'active') continue;
      const normalized = normalizeRepoFilePath({
        repo_root: task.repo_root || repoRoot,
        cwd: worktreePath,
        file_path: claim.file_path,
      });
      if (normalized === null) continue;
      claims.push({ ...claim, task, normalized_file_path: normalized });
    }
  }
  return claims;
}

function buildTouchedMap(
  gitFiles: DriftGitFiles,
  repoRoot: string,
  ignorePatterns: string[],
): {
  touched_file_sources: Map<string, ClaimDriftTouchedSources>;
  ignored_files: Set<string>;
} {
  const touchedFileSources = new Map<string, ClaimDriftTouchedSources>();
  const ignoredFiles = new Set<string>();
  addGitFiles(touchedFileSources, ignoredFiles, gitFiles.unstaged_files, {
    source: 'unstaged',
    repoRoot,
    worktreePath: gitFiles.worktree_path,
    ignorePatterns,
  });
  addGitFiles(touchedFileSources, ignoredFiles, gitFiles.staged_files, {
    source: 'staged',
    repoRoot,
    worktreePath: gitFiles.worktree_path,
    ignorePatterns,
  });
  addGitFiles(touchedFileSources, ignoredFiles, gitFiles.untracked_files, {
    source: 'untracked',
    repoRoot,
    worktreePath: gitFiles.worktree_path,
    ignorePatterns,
  });
  return { touched_file_sources: touchedFileSources, ignored_files: ignoredFiles };
}

function addGitFiles(
  touchedFileSources: Map<string, ClaimDriftTouchedSources>,
  ignoredFiles: Set<string>,
  files: string[],
  options: {
    source: 'unstaged' | 'staged' | 'untracked';
    repoRoot: string;
    worktreePath: string;
    ignorePatterns: string[];
  },
): void {
  for (const filePath of normalizeFiles(files, options.repoRoot, options.worktreePath)) {
    if (isIgnored(filePath, options.ignorePatterns)) {
      ignoredFiles.add(filePath);
      continue;
    }
    const sources = touchedFileSources.get(filePath) ?? emptyTouchedSources();
    sources[options.source] = true;
    touchedFileSources.set(filePath, sources);
  }
}

function normalizeFiles(files: string[], repoRoot: string, worktreePath: string): string[] {
  return sortPaths(
    unique(
      files
        .map((filePath) =>
          normalizeRepoFilePath({
            repo_root: repoRoot,
            cwd: worktreePath,
            file_path: filePath,
          }),
        )
        .filter((filePath): filePath is string => filePath !== null),
    ),
  );
}

function emptyTouchedSources(): ClaimDriftTouchedSources {
  return { unstaged: false, staged: false, untracked: false, telemetry: false };
}

function groupClaimsByFile(claims: TaskClaimWithTask[]): Map<string, TaskClaimWithTask[]> {
  const byFile = new Map<string, TaskClaimWithTask[]>();
  for (const claim of claims) {
    const bucket = byFile.get(claim.normalized_file_path) ?? [];
    bucket.push(claim);
    byFile.set(claim.normalized_file_path, bucket);
  }
  return byFile;
}

function claimConflicts(
  touchedFiles: string[],
  claimsByFile: Map<string, TaskClaimWithTask[]>,
  sessionId: string | undefined,
): ClaimDriftConflict[] {
  const conflicts: ClaimDriftConflict[] = [];
  for (const filePath of touchedFiles) {
    const claims = claimsByFile.get(filePath) ?? [];
    const otherClaims =
      sessionId === undefined ? claims : claims.filter((claim) => claim.session_id !== sessionId);
    const uniqueOwners = new Set(claims.map((claim) => claim.session_id));
    const isConflict = sessionId !== undefined ? otherClaims.length > 0 : uniqueOwners.size > 1;
    if (!isConflict) continue;
    conflicts.push({
      file_path: filePath,
      reason: sessionId !== undefined ? 'claimed_by_other_session' : 'multiple_claim_owners',
      claims: claims.map((claim) => ({
        task_id: claim.task_id,
        task_title: claim.task.title,
        branch: claim.task.branch,
        session_id: claim.session_id,
        state: claim.state,
        file_path: claim.normalized_file_path,
      })),
    });
  }
  return conflicts.sort((a, b) => a.file_path.localeCompare(b.file_path));
}

function taskClaimFileCall(input: {
  task_id: number | undefined;
  session_id: string | undefined;
  file_path: string;
}): string {
  const taskId = input.task_id ?? '<task_id>';
  const sessionId = input.session_id ?? '<session_id>';
  const sessionLiteral =
    input.session_id === undefined ? `"${sessionId}"` : JSON.stringify(sessionId);
  return `mcp__colony__task_claim_file({ task_id: ${taskId}, session_id: ${sessionLiteral}, file_path: ${JSON.stringify(
    input.file_path,
  )}, note: "claim drift repair" })`;
}

function renderList(lines: string[], title: string, values: string[]): void {
  if (values.length === 0) return;
  lines.push('', kleur.bold(title));
  for (const value of values) lines.push(`  - ${value}`);
}

function renderConflicts(lines: string[], conflicts: ClaimDriftConflict[]): void {
  if (conflicts.length === 0) return;
  lines.push('', kleur.bold('Conflicts'));
  for (const conflict of conflicts) {
    lines.push(`  - ${conflict.file_path}: ${conflict.reason}`);
    for (const claim of conflict.claims) {
      lines.push(`    task #${claim.task_id} ${claim.branch} held by ${claim.session_id}`);
    }
  }
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseOptionalPositiveInt(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function isIgnored(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globMatch(filePath, pattern));
}

function globMatch(filePath: string, pattern: string): boolean {
  const normalizedPattern = pattern.trim().replaceAll(path.sep, '/');
  if (!normalizedPattern) return false;
  if (!hasGlob(normalizedPattern)) {
    return filePath === normalizedPattern || filePath.startsWith(`${normalizedPattern}/`);
  }
  const regex = new RegExp(`^${globToRegex(normalizedPattern)}$`);
  return regex.test(filePath);
}

function globToRegex(pattern: string): string {
  let result = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === undefined) continue;
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        result += '.*';
        index += 1;
      } else {
        result += '[^/]*';
      }
    } else if (char === '?') {
      result += '[^/]';
    } else {
      result += escapeRegex(char);
    }
  }
  return result;
}

function hasGlob(pattern: string): boolean {
  return pattern.includes('*') || pattern.includes('?');
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function sortPaths(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}
