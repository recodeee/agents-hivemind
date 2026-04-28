import type { Storage, TaskClaimRow, TaskRow } from '@colony/storage';
import { formatAgo } from '../format.js';
import { html, raw } from '../html.js';

const RECENT_CLAIM_WINDOW_MS = 60 * 60_000;

export function renderRecentClaimsHeatMap(storage: Storage, tasks: TaskRow[]): string {
  const since = Date.now() - RECENT_CLAIM_WINDOW_MS;
  const claims = tasks.flatMap((task) =>
    storage.recentClaims(task.id, since, 100).map((claim) => ({ task, claim })),
  );
  if (claims.length === 0) {
    return html`
      <div class="card">
        <h2>Recent claims heat-map</h2>
        <p class="meta">No recent claims across active tasks.</p>
      </div>`;
  }

  return html`
    <div class="card">
      <h2>Recent claims heat-map</h2>
      <div class="heat-map">
        ${claims.map(({ task, claim }) => renderClaimTile(task, claim))}
      </div>
    </div>`;
}

function renderClaimTile(task: TaskRow, claim: TaskClaimRow): string {
  const title = `${claim.file_path} · held by ${claim.session_id} · ${task.branch} · ${formatAgo(
    claim.claimed_at,
  )}`;
  return html`
    <div class="claim-tile" title="${title}" style="${raw(claimHeatStyle(claim.claimed_at))}">
      <code>${claim.file_path}</code>
      <div class="meta">${claim.session_id}</div>
      <div class="meta">${task.branch} · ${formatAgo(claim.claimed_at)}</div>
    </div>`;
}

function claimHeatStyle(ts: number): string {
  const ratio = Math.max(0, Math.min(1, (Date.now() - ts) / RECENT_CLAIM_WINDOW_MS));
  const hue = Math.round(145 - ratio * 110);
  const light = Math.round(21 - ratio * 5);
  const borderLight = Math.round(47 - ratio * 14);
  return `background: hsl(${hue} 42% ${light}%); border-color: hsl(${hue} 58% ${borderLight}%);`;
}
