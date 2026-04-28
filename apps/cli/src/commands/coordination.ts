import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadSettings } from '@colony/config';
import { type CoordinationSweepResult, buildCoordinationSweep } from '@colony/core';
import type { Command } from 'commander';
import kleur from 'kleur';
import { withStore } from '../util/store.js';

interface SweepOpts {
  repoRoot?: string;
  dryRun?: boolean;
  json?: boolean;
}

export function registerCoordinationCommand(program: Command): void {
  const group = program
    .command('coordination')
    .description('Inspect biological coordination signals');

  group
    .command('sweep')
    .description('Report stale claims, expired messages, decayed proposals, and stale trails')
    .option('--repo-root <path>', 'repo root to scan (defaults to process.cwd())')
    .option('--dry-run', 'scan only; this is the default until cleanup has an explicit apply path')
    .option('--json', 'emit sweep result as JSON')
    .action(async (opts: SweepOpts) => {
      const repoRoot = resolve(opts.repoRoot ?? process.cwd());
      const repoRoots = repoRootAliases(repoRoot);
      const settings = loadSettings();
      await withStore(settings, (store) => {
        const result = buildCoordinationSweep(store, {
          repo_root: repoRoot,
          repo_roots: repoRoots,
        });
        if (opts.json) {
          process.stdout.write(`${JSON.stringify({ ...result, dry_run: true }, null, 2)}\n`);
          return;
        }
        process.stdout.write(`${renderCoordinationSweep(result)}\n`);
      });
    });
}

function repoRootAliases(repoRoot: string): string[] {
  const roots = new Set([repoRoot]);
  try {
    roots.add(realpathSync(repoRoot));
  } catch {
    // Non-existent --repo-root values are still passed through as literal filters.
  }
  const remoteSlug = gitOriginSlug(repoRoot);
  if (remoteSlug) roots.add(resolve(dirname(repoRoot), remoteSlug));
  return [...roots];
}

function gitOriginSlug(repoRoot: string): string | null {
  try {
    const remote = execFileSync('git', ['-C', repoRoot, 'config', '--get', 'remote.origin.url'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const name = remote
      .split(/[/:]/)
      .pop()
      ?.replace(/\.git$/, '')
      .trim();
    return name && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

function renderCoordinationSweep(result: CoordinationSweepResult): string {
  const total = staleSignalCount(result);
  const lines: string[] = [];
  if (total === 0) {
    lines.push(kleur.green('Coordination sweep: no stale biological signals'));
    lines.push(kleur.dim('read-only: no audit history deleted'));
  } else {
    lines.push(kleur.bold(`Coordination sweep: ${total} stale biological signal(s)`));
  }
  lines.push(`  repo: ${result.repo_root ?? 'all'}`);
  lines.push('  mode: dry-run, read-only');
  lines.push('  audit: observations retained; advisory claims only');
  lines.push(`  recommended action: ${result.recommended_action}`);
  lines.push(
    `  active claims: ${result.summary.active_claim_count}  stale claims: ${result.summary.stale_claim_count}  expired/weak claims: ${result.summary.expired_weak_claim_count}`,
  );
  lines.push(
    `  expired handoffs: ${result.summary.expired_handoff_count}  expired messages: ${result.summary.expired_message_count}`,
  );
  lines.push(
    `  decayed proposals: ${result.summary.decayed_proposal_count}  stale hot files: ${result.summary.stale_hot_file_count}  blocked downstream: ${result.summary.blocked_downstream_task_count}`,
  );

  renderSection(
    lines,
    'Active claims',
    result.active_claims,
    (claim) =>
      `task #${claim.task_id} ${claim.branch} ${claim.file_path} held by ${claim.session_id} for ${claim.age_minutes}m -> keep active`,
  );
  renderSection(
    lines,
    'Stale claims',
    result.stale_claims,
    (claim) =>
      `task #${claim.task_id} ${claim.branch} ${claim.file_path} held by ${claim.session_id} for ${claim.age_minutes}m, pheromone ${claim.current_strength} -> ${claim.cleanup_summary}`,
  );
  renderSection(
    lines,
    'Expired/weak claims',
    result.expired_weak_claims,
    (claim) =>
      `task #${claim.task_id} ${claim.branch} ${claim.file_path} held by ${claim.session_id} for ${claim.age_minutes}m (${claim.weak_reason ?? 'weak'}) -> ${claim.cleanup_summary}`,
  );
  renderSection(
    lines,
    'Top branches with stale claims',
    result.top_stale_branches,
    (branch) =>
      `${branch.branch} stale=${branch.stale_claim_count} expired/weak=${branch.expired_weak_claim_count} oldest=${branch.oldest_claim_age_minutes}m -> ${branch.suggested_cleanup_action}`,
  );
  renderSection(
    lines,
    'Expired handoffs',
    result.expired_handoffs,
    (handoff) =>
      `#${handoff.observation_id} ${handoff.from_agent}->${handoff.to_session_id ?? handoff.to_agent} expired ${handoff.expired_minutes}m ago -> send a fresh handoff if still needed`,
  );
  renderSection(
    lines,
    'Expired messages',
    result.expired_messages,
    (message) =>
      `#${message.observation_id} ${message.from_agent}->${message.to_session_id ?? message.to_agent} ${message.urgency} expired ${message.expired_minutes}m ago -> resend or ignore`,
  );
  renderSection(
    lines,
    'Decayed proposals',
    result.decayed_proposals,
    (proposal) =>
      `#${proposal.proposal_id} strength ${proposal.strength} < ${proposal.noise_floor} ${proposal.summary} -> reinforce or let fade`,
  );
  renderSection(
    lines,
    'Stale hot files',
    result.stale_hot_files,
    (file) =>
      `task #${file.task_id} ${file.file_path} current ${file.current_strength} from ${file.original_strength} -> ignore unless activity restarts`,
  );
  renderSection(
    lines,
    'Blocked downstream tasks',
    result.blocked_downstream_tasks,
    (task) =>
      `${task.plan_slug}/sub-${task.subtask_index} waits on ${task.blocked_by.map((b) => `sub-${b.subtask_index} [${b.status}]`).join(', ')} -> finish blocker or replan`,
  );

  return lines.join('\n');
}

function staleSignalCount(result: CoordinationSweepResult): number {
  return (
    result.summary.stale_claim_count +
    result.summary.expired_handoff_count +
    result.summary.expired_message_count +
    result.summary.decayed_proposal_count +
    result.summary.stale_hot_file_count +
    result.summary.blocked_downstream_task_count
  );
}

function renderSection<T>(
  lines: string[],
  title: string,
  items: T[],
  render: (item: T) => string,
): void {
  if (items.length === 0) return;
  lines.push('');
  lines.push(kleur.cyan(`${title}:`));
  for (const item of items.slice(0, 5)) {
    lines.push(`  ${render(item)}`);
  }
  if (items.length > 5) lines.push(`  ... ${items.length - 5} more; use --json for full detail`);
}
