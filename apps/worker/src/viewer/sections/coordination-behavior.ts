import type { DiscrepancyReport, MemoryStore } from '@colony/core';
import { html, raw } from '../html.js';

const COORDINATION_BEHAVIOR_WINDOW_MS = 24 * 60 * 60_000;
type ClaimCoverageSnapshot = ReturnType<MemoryStore['storage']['claimCoverageSnapshot']>;

export type BuildDiscrepancyReport = (
  store: MemoryStore,
  options: { since: number },
) => DiscrepancyReport;

const COORDINATION_BEHAVIOR_ROWS = [
  {
    key: 'edits_without_claims',
    aliases: ['editsWithoutClaims', 'edits-without-claims'],
    label: 'Edits without claims',
  },
  {
    key: 'sessions_without_handoff',
    aliases: [
      'sessions_ended_without_handoff',
      'sessionsWithoutHandoff',
      'sessions_without_handoffs',
      'sessions-without-handoff',
    ],
    label: 'Sessions w/o handoff',
  },
  {
    key: 'blockers_without_messages',
    aliases: ['blockersWithoutMessages', 'blockers_without_message', 'blockers-without-messages'],
    label: 'Blockers without messages',
  },
  {
    key: 'proposals_abandoned',
    aliases: [
      'proposals_without_reinforcement',
      'proposalsAbandoned',
      'abandoned_proposals',
      'proposals-abandoned',
    ],
    label: 'Proposals abandoned',
  },
];

interface CoordinationBehaviorReport {
  insufficient_data_reason?: string | null;
  discrepancies?: unknown;
  metrics?: unknown;
  rows?: unknown;
  [key: string]: unknown;
}

interface CoordinationBehaviorMetric {
  key?: string;
  label?: string;
  rate?: number;
  ratio?: number;
  numerator?: number;
  denominator?: number;
  count?: number;
  total?: number;
  value?: number;
}

export function renderCoordinationBehavior(
  store: MemoryStore,
  reportBuilder: BuildDiscrepancyReport,
): string {
  const report = reportBuilder(store, {
    since: Date.now() - COORDINATION_BEHAVIOR_WINDOW_MS,
  });
  const bashEvents = store.storage.claimCoverageSnapshot(
    Date.now() - COORDINATION_BEHAVIOR_WINDOW_MS,
  );
  if (report.insufficient_data_reason) {
    return html`
      <div class="card">
        <p class="meta"><strong>Coordination behavior (last 24h)</strong>: No coordination behavior report: ${report.insufficient_data_reason}.</p>
      </div>`;
  }

  return html`
    <div class="card">
      <h2>Coordination behavior <span class="meta">(last 24h)</span></h2>
      <div class="coordination-behavior">
        ${raw(
          COORDINATION_BEHAVIOR_ROWS.map((row) =>
            renderCoordinationBehaviorRow(
              row.label,
              readMetric(report as unknown as CoordinationBehaviorReport, row.key, row.aliases),
            ),
          )
            .concat(renderBashCoordinationEventsRow(bashEvents))
            .join(''),
        )}
      </div>
    </div>`;
}

function renderBashCoordinationEventsRow(snapshot: ClaimCoverageSnapshot): string {
  const rate = snapshot.bash_git_file_op_count > 0 ? 100 : 0;
  return html`
    <div class="coordination-row" data-rate-level="green">
      <div>Bash coordination events</div>
      <div class="coordination-bar" style="--rate: ${rate}%;" aria-label="Bash coordination events ${snapshot.bash_git_file_op_count}"></div>
      <div class="meta">${snapshot.bash_git_file_op_count} (${snapshot.bash_git_op_count} git-op + ${snapshot.bash_file_op_count} file-op)</div>
    </div>`;
}

function renderCoordinationBehaviorRow(label: string, metric: CoordinationBehaviorMetric): string {
  const numerator = readMetricNumber(metric, ['numerator', 'count', 'value']);
  const denominator = readMetricNumber(metric, ['denominator', 'total']);
  const rate = normalizeRate(metric, numerator, denominator);
  const displayDenominator = denominator > 0 ? denominator : inferDenominator(numerator, rate);
  const pct = Math.round(rate * 100);
  const level = rateLevel(rate);
  return html`
    <div class="coordination-row" data-rate-level="${level}">
      <div>${label}</div>
      <div class="coordination-bar" style="--rate: ${pct}%;" aria-label="${label} ${pct}%"></div>
      <div class="meta">${pct}% (${numerator} of ${displayDenominator})</div>
    </div>`;
}

function readMetric(
  report: CoordinationBehaviorReport,
  key: string,
  aliases: string[],
): CoordinationBehaviorMetric {
  const keys = [key, ...aliases];
  for (const source of [report.discrepancies, report.metrics, report.rows]) {
    const found = readMetricFromSource(source, keys);
    if (found) return found;
  }
  const direct = readMetricFromSource(report, keys);
  return direct ?? {};
}

function readMetricFromSource(
  source: unknown,
  keys: string[],
): CoordinationBehaviorMetric | undefined {
  if (!source || typeof source !== 'object') return undefined;
  if (Array.isArray(source)) {
    const row = source.find((item) => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Record<string, unknown>;
      return keys.some((key) => value.key === key || value.id === key || value.name === key);
    });
    return row && typeof row === 'object' ? (row as CoordinationBehaviorMetric) : undefined;
  }
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value && typeof value === 'object') return value as CoordinationBehaviorMetric;
  }
  return undefined;
}

function readMetricNumber(metric: CoordinationBehaviorMetric, names: string[]): number {
  for (const name of names) {
    const value = metric[name as keyof CoordinationBehaviorMetric];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeRate(
  metric: CoordinationBehaviorMetric,
  numerator: number,
  denominator: number,
): number {
  const explicit = metric.rate ?? metric.ratio;
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return clampRate(explicit);
  if (denominator <= 0) return 0;
  return clampRate(numerator / denominator);
}

function clampRate(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function inferDenominator(numerator: number, rate: number): number {
  if (rate <= 0) return 0;
  return Math.round(numerator / rate);
}

function rateLevel(rate: number): 'red' | 'yellow' | 'green' {
  if (rate > 0.5) return 'red';
  if (rate >= 0.2) return 'yellow';
  return 'green';
}
