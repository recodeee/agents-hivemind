import type { MemoryStore } from '@colony/core';
import { formatAgo } from '../format.js';
import { html, raw } from '../html.js';

const RECENT_EDIT_WINDOW_MS = 5 * 60_000;
const CLAIM_COVERAGE_WINDOW_MS = 60 * 60_000;

export function renderDiagnostic(store: MemoryStore): string {
  const storage = store.storage;
  const unclaimed = storage.recentEditsWithoutClaims(Date.now() - RECENT_EDIT_WINDOW_MS);
  const coverage = storage.claimCoverageSnapshot(Date.now() - CLAIM_COVERAGE_WINDOW_MS);
  const integrationWarning =
    coverage.auto_claim_count < coverage.edit_write_count
      ? html`<p class="diagnostic-warning">hook integration may be broken</p>`
      : '';
  const rows =
    unclaimed.length > 0
      ? html`<ul class="path-list">${unclaimed.slice(0, 10).map((edit) => {
          const task = edit.task_id === null ? 'no task' : `task #${edit.task_id}`;
          return html`<li><code>${edit.file_path}</code><span class="meta">${edit.session_id} · ${task} · ${formatAgo(edit.ts)}</span></li>`;
        })}</ul>`
      : '<p class="meta">No unclaimed write-tool edits in the last 5 minutes.</p>';

  return html`
    <div class="card">
      <h2>Diagnostic</h2>
      <p><span class="count">${unclaimed.length}</span><span class="meta">edits without proactive claims (last 5m)</span></p>
      <div class="diagnostic-stats">
        ${raw(renderDiagnosticStat('Edit/Write count', coverage.edit_write_count))}
        ${raw(renderDiagnosticStat('Auto-claim count', coverage.auto_claim_count))}
        ${raw(renderDiagnosticStat('Explicit claim count', coverage.explicit_claim_count))}
        ${raw(renderDiagnosticStat('Claim-conflict count', coverage.claim_conflict_count))}
      </div>
      <p class="meta">Auto-claim coverage <strong>${coverage.auto_claim_count} / ${coverage.edit_write_count}</strong> (last 1h)</p>
      ${raw(integrationWarning)}
      ${raw(rows)}
    </div>`;
}

function renderDiagnosticStat(label: string, value: number): string {
  return html`<div class="diagnostic-stat"><strong>${value}</strong><span class="meta">${label}</span></div>`;
}

export function renderToolUsageHistogram(): string {
  return html`
    <div class="card">
      <h2>Tool usage histogram</h2>
      ${raw('<!-- Deferred: tool_usage_counters storage migration is not present yet. -->')}
      <p class="meta">Waiting for tool_usage_counters storage migration.</p>
    </div>`;
}
