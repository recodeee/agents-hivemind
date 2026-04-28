import { formatAgoLong, shortSessionId, truncateText } from '../format.js';
import { html, raw } from '../html.js';

export interface StrandedSessionSummary {
  session_id: string;
  agent_name: string;
  branch: string;
  repo_root: string;
  last_activity_ts: number;
  held_claims: Array<{ file_path: string }>;
  last_tool_error: string | null;
}

export function renderStrandedSessions(sessions: StrandedSessionSummary[]): string {
  if (sessions.length === 0) return '';
  const cards = sessions.map((session) => {
    const visibleClaims = session.held_claims.slice(0, 3);
    const hiddenClaimCount = Math.max(0, session.held_claims.length - visibleClaims.length);
    const claimRows =
      visibleClaims.length > 0
        ? html`<ul class="path-list">${raw(
            visibleClaims.map((claim) => html`<li><code>${claim.file_path}</code></li>`).join(''),
          )}</ul>`
        : '<p class="meta">No held claims reported.</p>';
    const morePill =
      hiddenClaimCount > 0 ? html`<span class="badge">+${hiddenClaimCount} more</span>` : '';
    const rescuePath = `/api/colony/stranded/${encodeURIComponent(session.session_id)}/rescue`;
    return html`
      <div class="card stranded-card" data-stranded="true" data-session-id="${session.session_id}">
        <div class="stranded-head">
          <div>
            <strong title="${session.session_id}">${shortSessionId(session.session_id)}</strong>
            <span class="meta"> · ${session.agent_name}</span>
          </div>
          <span class="stranded-pill">stranded · rescue available</span>
        </div>
        <div class="meta">${session.branch} · ${session.repo_root}</div>
        <div class="meta">Last activity ${formatAgoLong(session.last_activity_ts)} · ${session.held_claims.length} held claims ${raw(morePill)}</div>
        ${raw(claimRows)}
        <code class="stranded-error">${truncateText(session.last_tool_error ?? 'No tool error recorded.', 80)}</code>
        <div class="stranded-actions">
          <form method="post" action="${rescuePath}" data-action="rescue-stranded" data-session-id="${session.session_id}">
            <button type="submit">rescue this</button>
          </form>
          <a href="/sessions/${encodeURIComponent(session.session_id)}">view timeline</a>
        </div>
      </div>`;
  });
  return html`
    <section class="stranded-section" aria-label="Stranded sessions">
      <h2 class="stranded-title">Stranded sessions</h2>
      ${raw(cards.join(''))}
    </section>
    <script>
${raw(strandedRescueScript())}
    </script>`;
}

function strandedRescueScript(): string {
  return `
(() => {
  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.action !== 'rescue-stranded') return;
    event.preventDefault();
    const button = form.querySelector('button');
    if (button) button.disabled = true;
    try {
      await fetch(form.action, { method: 'POST', headers: { accept: 'application/json' } });
    } finally {
      if (button) button.disabled = false;
    }
  });
})();
`;
}
