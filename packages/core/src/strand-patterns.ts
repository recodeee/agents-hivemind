import type { MemoryStore } from './memory-store.js';

export type RescueOutcome = 'accepted' | 'expired' | 'pending';

export interface StrandingHistoryEvent {
  task_id: number;
  stranded_at: number;
  rescue_reason: string;
  rescue_outcome: RescueOutcome;
  duration_to_strand_minutes: number;
}

export function strandHistory(
  store: MemoryStore,
  similar_task_ids: number[],
): StrandingHistoryEvent[] {
  const events: StrandingHistoryEvent[] = [];
  const taskIds = [...new Set(similar_task_ids)];

  for (const taskId of taskIds) {
    const task = store.storage.getTask(taskId);
    if (!task) continue;

    for (const observation of store.storage.taskTimeline(taskId, 500)) {
      if (observation.kind !== 'rescue-relay') continue;
      const metadata = parseMetadata(observation.metadata);
      events.push({
        task_id: taskId,
        stranded_at: observation.ts,
        rescue_reason: readReason(metadata),
        rescue_outcome: readOutcome(metadata),
        duration_to_strand_minutes: Math.max(0, (observation.ts - task.created_at) / 60_000),
      });
    }
  }

  return events.sort((a, b) => b.stranded_at - a.stranded_at);
}

function readReason(metadata: Record<string, unknown>): string {
  for (const key of ['rescue_reason', 'reason', 'relay_reason']) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'unspecified';
}

function readOutcome(metadata: Record<string, unknown>): RescueOutcome {
  const status =
    typeof metadata.rescue_outcome === 'string'
      ? metadata.rescue_outcome
      : typeof metadata.status === 'string'
        ? metadata.status
        : null;
  if (status === 'accepted' || status === 'expired' || status === 'pending') return status;

  const expiresAt = metadata.expires_at;
  if (typeof expiresAt === 'number' && expiresAt <= Date.now()) return 'expired';
  return 'pending';
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
