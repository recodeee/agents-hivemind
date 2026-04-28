import { TaskThread, listPlans } from '@colony/core';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolContext } from './context.js';

const SUBTASK_BRANCH_RE = /^spec\/([a-z0-9-]+)\/sub-(\d+)$/;

export function register(server: McpServer, ctx: ToolContext): void {
  const { store } = ctx;

  // Task-thread tools. Agents already know their session_id from SessionStart;
  // it's passed explicitly on every call so this server stays session-agnostic
  // and can serve multiple agents without ambient state.

  server.tool(
    'task_list',
    'Browse task threads; use task_ready_for_agent when choosing work to claim. Lists shared coordination lanes by repo_root, branch, participants, status, and recent activity.',
    { limit: z.number().int().positive().max(200).optional() },
    async ({ limit }) => {
      const tasks = store.storage.listTasks(limit ?? 50);
      return { content: [{ type: 'text', text: JSON.stringify(tasks) }] };
    },
  );

  server.tool(
    'task_timeline',
    'See recent task-thread activity and coordination history. Returns compact observation IDs, kinds, authors, timestamps, and reply links for follow-up reads.',
    {
      task_id: z.number().int().positive(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ task_id, limit }) => {
      const rows = store.storage.taskTimeline(task_id, limit ?? 50);
      const planMetadata = compactPlanTimelineMetadata(store, task_id);
      const compact = rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        session_id: r.session_id,
        ts: r.ts,
        reply_to: r.reply_to,
        ...(planMetadata ?? {}),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(compact) }] };
    },
  );

  server.tool(
    'task_updates_since',
    "Check unread task updates since a timestamp. Excludes this session's own posts and returns other-agent changes, kinds, timestamps, and compact IDs.",
    {
      task_id: z.number().int().positive(),
      session_id: z.string().min(1),
      since_ts: z.number().int().nonnegative(),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ task_id, session_id, since_ts, limit }) => {
      const rows = store.storage
        .taskObservationsSince(task_id, since_ts, limit ?? 50)
        .filter((o) => o.session_id !== session_id);
      const compact = rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        session_id: r.session_id,
        ts: r.ts,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(compact) }] };
    },
  );

  server.tool(
    'task_post',
    [
      'Write a working note or save current state on a task thread.',
      'Use for questions, answers, decisions, blockers, and general notes; negative warnings use failed_approach, blocked_path, conflict_warning, or reverted_solution.',
    ].join(' '),
    {
      task_id: z.number().int().positive(),
      session_id: z.string().min(1),
      kind: z.enum([
        'question',
        'answer',
        'decision',
        'blocker',
        'note',
        'failed_approach',
        'blocked_path',
        'conflict_warning',
        'reverted_solution',
      ]),
      content: z.string().min(1),
      reply_to: z.number().int().positive().optional(),
    },
    async ({ task_id, session_id, kind, content, reply_to }) => {
      const thread = new TaskThread(store, task_id);
      const id = thread.post({
        session_id,
        kind,
        content,
        ...(reply_to !== undefined ? { reply_to } : {}),
      });
      return { content: [{ type: 'text', text: JSON.stringify({ id }) }] };
    },
  );

  server.tool(
    'task_note_working',
    'Save current working state to the active Colony task. Resolves the task from session_id plus optional repo_root/branch, posts kind=note, and returns compact candidates instead of guessing when ambiguous.',
    {
      session_id: z.string().min(1),
      content: z.string().min(1),
      repo_root: z.string().min(1).optional(),
      branch: z.string().min(1).optional(),
      candidate_limit: z.number().int().positive().max(50).optional(),
    },
    async ({ session_id, content, repo_root, branch, candidate_limit }) => {
      const candidates = activeTaskCandidates(store, {
        session_id,
        ...(repo_root !== undefined ? { repo_root } : {}),
        ...(branch !== undefined ? { branch } : {}),
      });
      const visibleCandidates = candidates.slice(0, candidate_limit ?? 10);

      if (candidates.length !== 1) {
        const code = candidates.length === 0 ? 'ACTIVE_TASK_NOT_FOUND' : 'AMBIGUOUS_ACTIVE_TASK';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                code,
                error:
                  candidates.length === 0
                    ? 'no active Colony task matched session/repo/branch'
                    : 'multiple active Colony tasks matched session/repo/branch',
                candidates: visibleCandidates,
              }),
            },
          ],
          isError: true,
        };
      }

      const candidate = candidates[0];
      if (!candidate) throw new Error('working note task resolution lost its only candidate');
      const thread = new TaskThread(store, candidate.task_id);
      const observation_id = thread.post({
        session_id,
        kind: 'note',
        content,
        metadata: {
          working_note: true,
          resolved_by: 'task_note_working',
          ...(repo_root !== undefined ? { requested_repo_root: repo_root } : {}),
          ...(branch !== undefined ? { requested_branch: branch } : {}),
        },
      });
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              observation_id,
              id: observation_id,
              task_id: candidate.task_id,
            }),
          },
        ],
      };
    },
  );

  server.tool(
    'task_claim_file',
    'Claim a file before editing so other agents see ownership and overlap warnings. Use before editing to avoid conflict and make file ownership visible; claims are soft coordination and never block writes.',
    {
      task_id: z.number().int().positive(),
      session_id: z.string().min(1),
      file_path: z.string().min(1),
      note: z.string().optional(),
    },
    async ({ task_id, session_id, file_path, note }) => {
      const thread = new TaskThread(store, task_id);
      const id = thread.claimFile({
        session_id,
        file_path,
        ...(note !== undefined ? { note } : {}),
      });
      return { content: [{ type: 'text', text: JSON.stringify({ observation_id: id }) }] };
    },
  );

  // --- task links ---
  // Cross-task edges. Linking two tasks lets each side see the other's
  // timeline + decisions in their own preface, without copy-paste. The
  // storage layer stores one row per unordered pair; the MCP surface is
  // symmetric so callers don't need to think about ordering.

  server.tool(
    'task_link',
    "Link related tasks so each thread sees the other's decisions. Bidirectional, idempotent edges carry cross-task context, notes, and coordination metadata.",
    {
      task_id: z.number().int().positive(),
      other_task_id: z.number().int().positive(),
      session_id: z.string().min(1),
      note: z.string().max(280).optional(),
    },
    async ({ task_id, other_task_id, session_id, note }) => {
      if (task_id === other_task_id) {
        return {
          content: [
            { type: 'text', text: JSON.stringify({ error: 'cannot link a task to itself' }) },
          ],
          isError: true,
        };
      }
      const thread = new TaskThread(store, task_id);
      const link = thread.link(other_task_id, session_id, note);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              low_id: link.low_id,
              high_id: link.high_id,
              created_at: link.created_at,
              created_by: link.created_by,
              note: link.note,
            }),
          },
        ],
      };
    },
  );

  server.tool(
    'task_unlink',
    'Unlink related tasks when cross-thread coordination is done. Drops bidirectional edge metadata and returns { removed: boolean } for cleanup state.',
    {
      task_id: z.number().int().positive(),
      other_task_id: z.number().int().positive(),
    },
    async ({ task_id, other_task_id }) => {
      const thread = new TaskThread(store, task_id);
      const removed = thread.unlink(other_task_id);
      return { content: [{ type: 'text', text: JSON.stringify({ removed }) }] };
    },
  );

  server.tool(
    'task_links',
    'List related tasks linked to this task thread. Returns each edge, other task side, notes, and link metadata for coordination context.',
    { task_id: z.number().int().positive() },
    async ({ task_id }) => {
      const thread = new TaskThread(store, task_id);
      const links = thread.linkedTasks();
      return { content: [{ type: 'text', text: JSON.stringify(links) }] };
    },
  );
}

interface ActiveTaskCandidate {
  task_id: number;
  title: string;
  repo_root: string;
  branch: string;
  status: string;
  updated_at: number;
  agent: string;
}

function activeTaskCandidates(
  store: ToolContext['store'],
  opts: { session_id: string; repo_root?: string; branch?: string },
): ActiveTaskCandidate[] {
  const candidates: ActiveTaskCandidate[] = [];
  for (const task of store.storage.listTasks(2000)) {
    if (opts.repo_root !== undefined && task.repo_root !== opts.repo_root) continue;
    if (opts.branch !== undefined && task.branch !== opts.branch) continue;
    const participant = store.storage
      .listParticipants(task.id)
      .find((row) => row.session_id === opts.session_id && row.left_at === null);
    if (!participant) continue;
    candidates.push({
      task_id: task.id,
      title: task.title,
      repo_root: task.repo_root,
      branch: task.branch,
      status: task.status,
      updated_at: task.updated_at,
      agent: participant.agent,
    });
  }
  return candidates.sort((a, b) => b.updated_at - a.updated_at);
}

function compactPlanTimelineMetadata(
  store: ToolContext['store'],
  task_id: number,
): {
  plan_slug: string;
  subtask_index: number;
  wave_index: number;
  wave_name: string;
  depends_on: number[];
  blocked_by: number[];
} | null {
  const task = store.storage.listTasks(2000).find((candidate) => candidate.id === task_id);
  const match = task?.branch.match(SUBTASK_BRANCH_RE);
  if (!task || !match) return null;

  const planSlug = match[1];
  const rawSubtaskIndex = match[2];
  if (!planSlug || rawSubtaskIndex === undefined) return null;

  const subtaskIndex = Number(rawSubtaskIndex);
  const plan = listPlans(store, { repo_root: task.repo_root, limit: 2000 }).find(
    (candidate) => candidate.plan_slug === planSlug,
  );
  const subtask = plan?.subtasks.find((candidate) => candidate.subtask_index === subtaskIndex);
  if (!subtask) return null;

  return {
    plan_slug: planSlug,
    subtask_index: subtask.subtask_index,
    wave_index: subtask.wave_index ?? 0,
    wave_name: subtask.wave_name ?? 'Wave 1',
    depends_on: subtask.depends_on,
    blocked_by: subtask.blocked_by ?? [],
  };
}
