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
    const previewPath = `${rescuePath}/preview`;
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
          <form method="post" action="${rescuePath}" data-preview-action="${previewPath}" data-action="rescue-stranded" data-session-id="${session.session_id}">
            <button type="submit" data-role="preview-rescue">rescue this</button>
            <button type="button" data-role="confirm-rescue" hidden>apply rescue</button>
          </form>
          <a href="/sessions/${encodeURIComponent(session.session_id)}">view timeline</a>
        </div>
        <div class="rescue-preview" data-rescue-preview hidden aria-live="polite">
          <div class="meta" data-rescue-status>Preview not loaded.</div>
          <dl class="rescue-summary" data-rescue-summary></dl>
          <ul class="path-list rescue-claims" data-rescue-claims></ul>
          <code class="rescue-command" data-rescue-command></code>
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
  function query(root, selector) {
    return root ? root.querySelector(selector) : null;
  }

  function setText(root, selector, text) {
    const node = query(root, selector);
    if (node) node.textContent = text;
  }

  function setBusy(form, busy) {
    for (const button of form.querySelectorAll('button')) {
      button.disabled = busy;
    }
  }

  function setPanelState(card, state, message) {
    const panel = query(card, '[data-rescue-preview]');
    if (!panel) return null;
    panel.hidden = false;
    panel.dataset.state = state;
    card.dataset.rescueState = state;
    setText(panel, '[data-rescue-status]', message);
    return panel;
  }

  function setConfirmVisible(form, visible) {
    const button = query(form, '[data-role="confirm-rescue"]');
    if (button instanceof HTMLButtonElement) button.hidden = !visible;
  }

  function replaceDefinitionList(root, rows) {
    const list = query(root, '[data-rescue-summary]');
    if (!list) return;
    list.replaceChildren();
    for (const [label, value] of rows) {
      const term = document.createElement('dt');
      term.textContent = label;
      const detail = document.createElement('dd');
      detail.textContent = value;
      list.append(term, detail);
    }
  }

  function replaceClaimList(root, claims) {
    const list = query(root, '[data-rescue-claims]');
    if (!list) return;
    list.replaceChildren();
    if (claims.length === 0) {
      const item = document.createElement('li');
      item.className = 'meta';
      item.textContent = 'No claims to release.';
      list.append(item);
      return;
    }
    for (const claim of claims) {
      const item = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = 'release ' + claim;
      item.append(code);
      list.append(item);
    }
  }

  function renderRescueResponse(card, form, payload, state) {
    const panel = setPanelState(card, state, payload.message || 'Rescue state updated.');
    if (!panel) return;
    const first = Array.isArray(payload.rescued) ? payload.rescued[0] : null;
    const claims =
      first && Array.isArray(first.inherited_claims)
        ? first.inherited_claims
        : first && Array.isArray(first.held_claims)
          ? first.held_claims.map((claim) => claim.file_path).filter(Boolean)
          : [];
    replaceDefinitionList(panel, [
      ['task', first?.task_id ? String(first.task_id) : Array.isArray(first?.task_ids) ? first.task_ids.join(', ') : 'unknown'],
      ['audit', first?.audit_observation_id ? String(first.audit_observation_id) : 'pending'],
      ['claims', String(claims.length) + ' to release'],
      ['reason', first?.rescue_reason || first?.suggested_action || 'unknown'],
    ]);
    replaceClaimList(panel, claims);
    setText(panel, '[data-rescue-command]', payload.command || '');
    setConfirmVisible(form, Boolean(payload.ok) && state === 'preview');
    if (payload.ok && state === 'succeeded') {
      setText(card, '.stranded-pill', 'rescued');
      setConfirmVisible(form, false);
    }
  }

  async function fetchJson(url, init) {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => ({
      ok: false,
      message: 'Rescue request failed before JSON response.',
    }));
    if (!response.ok) payload.ok = false;
    return payload;
  }

  async function previewRescue(form) {
    const card = form.closest('.stranded-card');
    if (!card) return;
    setBusy(form, true);
    setPanelState(card, 'loading', 'Loading rescue preview...');
    try {
      const payload = await fetchJson(form.dataset.previewAction || form.action + '/preview', {
        headers: { accept: 'application/json' },
      });
      renderRescueResponse(card, form, payload, payload.ok ? 'preview' : 'failed');
    } catch (error) {
      setPanelState(card, 'failed', error instanceof Error ? error.message : String(error));
      setConfirmVisible(form, false);
    } finally {
      setBusy(form, false);
    }
  }

  async function applyRescue(form) {
    const card = form.closest('.stranded-card');
    if (!card) return;
    setBusy(form, true);
    setPanelState(card, 'loading', 'Applying rescue...');
    try {
      const payload = await fetchJson(form.action, {
        method: 'POST',
        headers: { accept: 'application/json' },
      });
      renderRescueResponse(card, form, payload, payload.ok ? 'succeeded' : 'failed');
    } catch (error) {
      setPanelState(card, 'failed', error instanceof Error ? error.message : String(error));
      setConfirmVisible(form, false);
    } finally {
      setBusy(form, false);
    }
  }

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.dataset.action !== 'rescue-stranded') return;
    event.preventDefault();
    await previewRescue(form);
  });

  document.addEventListener('click', async (event) => {
    const button = event.target;
    if (!(button instanceof HTMLButtonElement) || button.dataset.role !== 'confirm-rescue') return;
    const form = button.closest('form');
    if (form instanceof HTMLFormElement && form.dataset.action === 'rescue-stranded') {
      await applyRescue(form);
    }
  });
})();
`;
}
