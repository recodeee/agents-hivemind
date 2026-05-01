import { resolve } from 'node:path';
import { loadSettings } from '@colony/config';
import { inferIdeFromSessionId } from '@colony/core';
import type { Command } from 'commander';
import kleur from 'kleur';
import {
  type ReadyForAgentResult,
  buildReadyForAgent,
} from '../../../mcp-server/src/tools/ready-queue.js';
import { withStore } from '../util/store.js';

type ReadyItem = ReadyForAgentResult['ready'][number];
type QuotaReadyItem = Extract<ReadyItem, { kind: 'quota_relay_ready' }>;
type PlanReadyItem = Exclude<ReadyItem, QuotaReadyItem>;

interface TaskReadyOptions {
  session?: string;
  agent?: string;
  repoRoot?: string;
  limit?: string;
  json?: boolean;
}

function sessionFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return (
    env.CODEX_SESSION_ID?.trim() ||
    env.CLAUDECODE_SESSION_ID?.trim() ||
    env.CLAUDE_SESSION_ID?.trim() ||
    undefined
  );
}

function agentFromSession(sessionId: string): string | undefined {
  const ide = inferIdeFromSessionId(sessionId);
  if (ide === 'claude-code') return 'claude';
  return ide;
}

export function registerTaskCommand(program: Command): void {
  const group = program.command('task').description('Task scheduling helpers');

  group
    .command('ready')
    .description('Pick claimable work through task_ready_for_agent')
    .option(
      '--session <id>',
      'your session_id (defaults to CODEX_SESSION_ID/CLAUDECODE_SESSION_ID)',
    )
    .option('--agent <name>', 'your agent name (e.g. claude, codex)')
    .option('--repo-root <path>', 'repo root (defaults to process.cwd())')
    .option('--limit <n>', 'max ready items to show', '5')
    .option('--json', 'emit the task_ready_for_agent payload as JSON')
    .action(async (opts: TaskReadyOptions) => {
      const session = opts.session?.trim() || sessionFromEnv();
      if (!session) {
        process.stderr.write(
          `${kleur.red('missing session')} - pass --session or set CODEX_SESSION_ID/CLAUDECODE_SESSION_ID\n`,
        );
        process.exitCode = 1;
        return;
      }
      const agent = opts.agent?.trim() || agentFromSession(session);
      if (!agent) {
        process.stderr.write(
          `${kleur.red('missing agent')} - pass --agent or use a session id prefixed with codex@/claude@\n`,
        );
        process.exitCode = 1;
        return;
      }

      const limit = parsePositiveInt(opts.limit, '--limit');
      const repoRoot = resolve(opts.repoRoot ?? process.cwd());
      const settings = loadSettings();
      await withStore(settings, async (store) => {
        const result = await buildReadyForAgent(store, {
          session_id: session,
          agent,
          repo_root: repoRoot,
          limit,
        });
        process.stdout.write(
          `${opts.json === true ? JSON.stringify(result, null, 2) : formatTaskReadyOutput(result)}\n`,
        );
      });
    });
}

export function formatTaskReadyOutput(result: ReadyForAgentResult): string {
  const lines = [
    kleur.bold('colony task ready'),
    `next: ${result.next_action}`,
    `ready: ${result.ready.length}/${result.total_available}`,
  ];

  if (result.codex_mcp_call) lines.push(`claim: ${result.codex_mcp_call}`);
  if (result.empty_state) {
    lines.push(`empty: ${result.empty_state}`);
    lines.push('proposal: task_propose -> task_reinforce -> queen_plan_goal/task_plan_publish');
  }

  for (const [index, item] of result.ready.entries()) {
    lines.push('');
    const extra = item as { priority?: number; codex_mcp_call?: string };
    if (isQuotaReady(item)) {
      lines.push(
        kleur.bold(
          `${index + 1}. quota relay task ${item.task_id} priority=${extra.priority ?? index + 1}`,
        ),
      );
      lines.push(`  branch: ${item.branch}`);
      lines.push(`  reason: ${item.next_action_reason}`);
      lines.push(`  next_tool: ${item.next_tool}`);
      lines.push(`  files: ${item.files.length > 0 ? item.files.join(', ') : '-'}`);
      lines.push(
        `  claim: ${extra.codex_mcp_call ?? result.codex_mcp_call ?? 'task_claim_quota_accept(...)'}`,
      );
      continue;
    }

    const planItem = item as PlanReadyItem;
    lines.push(
      kleur.bold(
        `${index + 1}. ${planItem.plan_slug}/sub-${planItem.subtask_index} priority=${extra.priority ?? index + 1}`,
      ),
    );
    lines.push(`  title: ${planItem.title}`);
    lines.push(`  reason: ${planItem.reason}`);
    lines.push(`  fit: ${planItem.fit_score.toFixed(2)}`);
    lines.push(`  next_tool: ${planItem.next_tool ?? 'task_plan_complete_subtask'}`);
    lines.push(`  files: ${planItem.file_scope.length > 0 ? planItem.file_scope.join(', ') : '-'}`);
    lines.push(
      `  claim: ${extra.codex_mcp_call ?? result.codex_mcp_call ?? 'task_plan_claim_subtask(...)'}`,
    );
  }

  return lines.join('\n');
}

function isQuotaReady(item: ReadyItem): item is QuotaReadyItem {
  return 'kind' in item && item.kind === 'quota_relay_ready';
}

function parsePositiveInt(value: string | undefined, label: string): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${label} must be a positive integer`);
  return parsed;
}
