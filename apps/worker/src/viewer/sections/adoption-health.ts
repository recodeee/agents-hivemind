import {
  type MemoryStore,
  ProposalSystem,
  currentSignalStrength,
  listPlans,
  signalMetadataFromProposal,
} from '@colony/core';
import type { ProposalRow, ReinforcementRow, TaskRow, ToolCallRow } from '@colony/storage';
import { html, raw } from '../html.js';

const ADOPTION_HEALTH_WINDOW_MS = 24 * 60 * 60_000;
const TARGET_TASK_MESSAGE_SHARE = 0.2;
const TARGET_READY_CLAIMED_SHARE = 0.3;

interface TaskPostMessagePayload {
  task_post_calls: number;
  task_message_calls: number;
  task_message_share: number | null;
}

interface ProposalHealthPayload {
  proposals_seen: number;
  pending: number;
  promoted: number;
  evaporated: number;
  pending_below_noise_floor: number;
  promotion_rate: number | null;
}

interface ReadyClaimPayload {
  plan_subtasks: number;
  ready_to_claim: number;
  claimed: number;
  ready_to_claim_per_claimed: number | null;
  claimed_share_of_actionable: number | null;
}

export interface ViewerAdoptionHealthPayload {
  task_post_vs_task_message: TaskPostMessagePayload;
  proposal_health: ProposalHealthPayload;
  ready_to_claim_vs_claimed: ReadyClaimPayload;
}

export function buildViewerAdoptionHealthPayload(
  store: MemoryStore,
  options: { since?: number; now?: number } = {},
): ViewerAdoptionHealthPayload {
  const now = options.now ?? Date.now();
  const since = options.since ?? now - ADOPTION_HEALTH_WINDOW_MS;
  const calls = store.storage.toolCallsSince(since);
  const tasks = store.storage.listTasks(2000);
  const taskPostCalls = countTool(calls, 'task_post');
  const taskMessageCalls = countTool(calls, 'task_message');

  return {
    task_post_vs_task_message: {
      task_post_calls: taskPostCalls,
      task_message_calls: taskMessageCalls,
      task_message_share: ratio(taskMessageCalls, taskPostCalls + taskMessageCalls),
    },
    proposal_health: proposalHealthPayload(store, tasks, { since, now }),
    ready_to_claim_vs_claimed: readyClaimPayload(store),
  };
}

export function renderAdoptionHealth(store: MemoryStore): string {
  const payload = buildViewerAdoptionHealthPayload(store);
  const message = messageHealth(payload.task_post_vs_task_message);
  const proposals = proposalHealth(payload.proposal_health);
  const ready = readyClaimHealth(payload.ready_to_claim_vs_claimed);

  return html`
    <div class="card adoption-health">
      <h2>Adoption health <span class="meta">(last 24h)</span></h2>
      <div class="adoption-grid">
        ${raw(
          [
            renderAdoptionTile({
              title: 'task_post vs task_message',
              badge: message.badge,
              status: message.status,
              value: `${payload.task_post_vs_task_message.task_message_calls} / ${
                payload.task_post_vs_task_message.task_post_calls
              }`,
              detail: `message share ${formatPercent(
                payload.task_post_vs_task_message.task_message_share,
              )}`,
              field: 'task_post_vs_task_message',
            }),
            renderAdoptionTile({
              title: 'Proposal health',
              badge: proposals.badge,
              status: proposals.status,
              value: `${payload.proposal_health.promoted} promoted`,
              detail: `${payload.proposal_health.pending} pending · ${payload.proposal_health.proposals_seen} seen`,
              field: 'proposal_health',
            }),
            renderAdoptionTile({
              title: 'Ready-to-claim vs claimed',
              badge: ready.badge,
              status: ready.status,
              value: `${payload.ready_to_claim_vs_claimed.ready_to_claim} ready`,
              detail: `${payload.ready_to_claim_vs_claimed.claimed} claimed · ${payload.ready_to_claim_vs_claimed.plan_subtasks} subtasks`,
              field: 'ready_to_claim_vs_claimed',
            }),
          ].join(''),
        )}
      </div>
    </div>`;
}

function renderAdoptionTile(input: {
  title: string;
  badge: string;
  status: 'good' | 'ok' | 'bad';
  value: string;
  detail: string;
  field: keyof ViewerAdoptionHealthPayload;
}): string {
  return html`
    <div class="adoption-tile" data-health="${input.status}" data-field="${input.field}">
      <div class="adoption-tile-head">
        <strong>${input.title}</strong>
        <span class="health-badge" data-health="${input.status}">${input.badge}</span>
      </div>
      <div class="adoption-value">${input.value}</div>
      <div class="meta">${input.detail}</div>
      <code>${input.field}</code>
    </div>`;
}

function messageHealth(payload: TaskPostMessagePayload): {
  status: 'good' | 'ok' | 'bad';
  badge: string;
} {
  if (payload.task_post_calls === 0 && payload.task_message_calls === 0) {
    return { status: 'ok', badge: 'no message data' };
  }
  if (
    payload.task_post_calls > 0 &&
    payload.task_message_share !== null &&
    payload.task_message_share < TARGET_TASK_MESSAGE_SHARE
  ) {
    return { status: 'bad', badge: 'directed messages low' };
  }
  return { status: 'good', badge: 'directed messages ok' };
}

function proposalHealth(payload: ProposalHealthPayload): {
  status: 'good' | 'ok' | 'bad';
  badge: string;
} {
  if (
    payload.proposals_seen === 0 ||
    (payload.pending > 0 && payload.promoted === 0 && payload.promotion_rate === 0)
  ) {
    return { status: 'bad', badge: 'proposal adoption low' };
  }
  if (payload.pending_below_noise_floor > 0) {
    return { status: 'ok', badge: 'proposal signals fading' };
  }
  return { status: 'good', badge: 'proposal adoption ok' };
}

function readyClaimHealth(payload: ReadyClaimPayload): {
  status: 'good' | 'ok' | 'bad';
  badge: string;
} {
  if (payload.ready_to_claim > 0 && payload.claimed === 0) {
    return { status: 'bad', badge: 'ready subtasks unclaimed' };
  }
  if (
    payload.claimed_share_of_actionable !== null &&
    payload.claimed_share_of_actionable < TARGET_READY_CLAIMED_SHARE
  ) {
    return { status: 'bad', badge: 'ready subtasks underclaimed' };
  }
  if (payload.plan_subtasks === 0) {
    return { status: 'ok', badge: 'no plan subtasks' };
  }
  return { status: 'good', badge: 'ready subtasks claimed' };
}

function proposalHealthPayload(
  store: MemoryStore,
  tasks: TaskRow[],
  options: { since: number; now: number },
): ProposalHealthPayload {
  const proposals = knownBranchProposals(store, tasks).filter(
    (proposal) =>
      proposal.status === 'pending' ||
      proposal.proposed_at > options.since ||
      (proposal.promoted_at !== null && proposal.promoted_at > options.since),
  );
  let pending = 0;
  let promoted = 0;
  let evaporated = 0;
  let pendingBelowNoiseFloor = 0;

  for (const proposal of proposals) {
    if (proposal.status === 'active') promoted++;
    if (proposal.status === 'evaporated') evaporated++;
    if (proposal.status !== 'pending') continue;
    pending++;
    const strength = currentProposalStrength(
      proposal,
      store.storage.listReinforcements(proposal.id),
      options.now,
    );
    if (strength < ProposalSystem.NOISE_FLOOR) pendingBelowNoiseFloor++;
  }

  return {
    proposals_seen: proposals.length,
    pending,
    promoted,
    evaporated,
    pending_below_noise_floor: pendingBelowNoiseFloor,
    promotion_rate: ratio(promoted, pending + promoted + evaporated),
  };
}

function knownBranchProposals(store: MemoryStore, tasks: TaskRow[]): ProposalRow[] {
  const pairs = new Map<string, { repo_root: string; branch: string }>();
  for (const task of tasks) {
    pairs.set(`${task.repo_root}\0${task.branch}`, {
      repo_root: task.repo_root,
      branch: task.branch,
    });
  }
  const proposals = new Map<number, ProposalRow>();
  for (const pair of pairs.values()) {
    for (const proposal of store.storage.listProposalsForBranch(pair.repo_root, pair.branch)) {
      proposals.set(proposal.id, proposal);
    }
  }
  return [...proposals.values()];
}

function currentProposalStrength(
  proposal: ProposalRow,
  reinforcements: ReinforcementRow[],
  now: number,
): number {
  const signal = signalMetadataFromProposal(proposal, {
    reinforcements,
    half_life_minutes: 60,
  });
  return currentSignalStrength(signal, now);
}

function readyClaimPayload(store: MemoryStore): ReadyClaimPayload {
  const plans = listPlans(store, { limit: 2000 });
  const subtasks = plans.flatMap((plan) => plan.subtasks);
  const readyToClaim = plans.reduce((sum, plan) => sum + plan.next_available.length, 0);
  const claimed = subtasks.filter((subtask) => subtask.status === 'claimed').length;
  return {
    plan_subtasks: subtasks.length,
    ready_to_claim: readyToClaim,
    claimed,
    ready_to_claim_per_claimed: ratio(readyToClaim, claimed),
    claimed_share_of_actionable: ratio(claimed, readyToClaim + claimed),
  };
}

function countTool(calls: ToolCallRow[], toolName: string): number {
  return calls.filter((call) => isColonyTool(call.tool, toolName)).length;
}

function isColonyTool(tool: string, toolName: string): boolean {
  return tool === toolName || tool === `colony.${toolName}` || tool === `mcp__colony__${toolName}`;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function formatPercent(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value * 100)}%`;
}
