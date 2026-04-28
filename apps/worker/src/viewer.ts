import { type HivemindSession, type HivemindSnapshot, inferIdeFromSessionId } from '@colony/core';
import type { SessionRow, Storage, TaskClaimRow, TaskRow } from '@colony/storage';

const RECENT_EDIT_WINDOW_MS = 5 * 60_000;
const RECENT_CLAIM_WINDOW_MS = 60 * 60_000;

const style = `
  body { font: 14px/1.5 -apple-system, system-ui, sans-serif; margin: 0; background: #0b0d10; color: #e6e6e6; }
  header { padding: 16px 24px; border-bottom: 1px solid #222; }
  main { padding: 24px; max-width: 1100px; margin: 0 auto; }
  a { color: #7aa2ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .card { background: #13161b; border: 1px solid #222; border-radius: 8px; padding: 12px 16px; margin-bottom: 10px; }
  .grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin-bottom: 18px; }
  .stat { background: #151a22; border: 1px solid #263041; border-radius: 10px; padding: 12px 14px; }
  .stat strong { display: block; font-size: 22px; color: #f2f5f8; }
  .lane { border-left: 3px solid #50658a; }
  .lane[data-attention="true"] { border-left-color: #e7b85b; }
  .badge { display: inline-block; margin-left: 6px; padding: 1px 7px; border-radius: 999px; background: #263041; color: #c9d4e5; font-size: 11px; }
  .badge[data-attention="true"] { background: #3b2d17; color: #ffd88a; }
  .meta { color: #8a94a3; font-size: 12px; }
  pre { white-space: pre-wrap; word-break: break-word; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  h2 { margin: 0 0 12px; font-size: 16px; color: #cfd5de; }
  code { background: #1d2129; padding: 1px 4px; border-radius: 3px; }
  .owner { display: inline-block; margin-right: 6px; padding: 1px 7px; border-radius: 999px; background: #1c2433; color: #cdd6e4; font-size: 11px; font-weight: 500; }
  .owner[data-owner="codex"] { background: #1a2a1f; color: #8bd5a6; }
  .owner[data-owner="claude-code"] { background: #2a2238; color: #c8b1ff; }
  .owner[data-owner="unknown"] { background: #2a1f1f; color: #e48a8a; }
  .owner[data-derived="true"] { font-style: italic; opacity: 0.85; }
  .viewer-grid { display: grid; gap: 12px; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); align-items: start; margin-bottom: 18px; }
  .viewer-main { display: grid; gap: 10px; }
  .attention { position: sticky; top: 12px; }
  .count { font-size: 28px; line-height: 1; color: #f2f5f8; margin-right: 8px; }
  .path-list { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
  .path-list li { display: grid; gap: 2px; }
  .heat-map { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
  .claim-tile { min-height: 58px; border: 1px solid #31405a; border-radius: 6px; padding: 8px; overflow: hidden; }
  .claim-tile code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; background: transparent; padding: 0; }
  .attention-item { border-top: 1px solid #222; padding-top: 8px; margin-top: 8px; }
  .attention-item:first-child { border-top: 0; padding-top: 0; margin-top: 0; }
  @media (max-width: 860px) { .viewer-grid { grid-template-columns: 1fr; } .attention { position: static; } }
`;

interface SafeHtml {
  readonly __html: string;
}

function raw(value: string): SafeHtml {
  return { __html: value };
}

function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) {
    out += renderHtmlValue(values[i]);
    out += strings[i + 1] ?? '';
  }
  return out;
}

function renderHtmlValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(renderHtmlValue).join('');
  if (value && typeof value === 'object' && '__html' in value) {
    return String((value as SafeHtml).__html);
  }
  return esc(String(value ?? ''));
}

function layout(title: string, body: string): string {
  return html`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${raw(style)}</style></head><body><header><h1>agents-hivemind</h1><div class="meta">local memory + runtime viewer</div></header><main>${raw(body)}</main></body></html>`;
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

/**
 * Backfill display-only owner when the stored ide is 'unknown' — legacy rows
 * from before MemoryStore.ensureSession learned to infer. Mark the result
 * `derived` so the viewer renders it italic + with a `?` suffix instead of
 * claiming the store actually knows the owner.
 */
function resolveOwner(storedIde: string, sessionId: string): { ide: string; derived: boolean } {
  if (storedIde && storedIde !== 'unknown') return { ide: storedIde, derived: false };
  const inferred = inferIdeFromSessionId(sessionId);
  if (inferred) return { ide: inferred, derived: true };
  return { ide: 'unknown', derived: false };
}

function ownerChip(ide: string, derived: boolean): string {
  const label = derived ? `${ide}?` : ide;
  return html`<span class="owner" data-owner="${ide}" data-derived="${String(derived)}">${label}</span>`;
}

export function renderIndex(
  sessions: SessionRow[],
  snapshot: HivemindSnapshot | undefined,
  storage: Storage,
): string {
  const dashboard = snapshot ? renderHivemindDashboard(snapshot) : '';
  const colonyState = renderColonyState(storage);
  if (sessions.length === 0) {
    return layout(
      'agents-hivemind',
      html`${raw(dashboard)}${raw(colonyState)}<p>No memory sessions yet.</p>`,
    );
  }
  const ownerCounts = new Map<string, number>();
  const items = sessions
    .map((s) => {
      const owner = resolveOwner(s.ide, s.id);
      ownerCounts.set(owner.ide, (ownerCounts.get(owner.ide) ?? 0) + 1);
      const cwdHtml = s.cwd ? html` · ${s.cwd}` : '';
      return html`
      <div class="card">
        <div>${raw(ownerChip(owner.ide, owner.derived))}<a href="/sessions/${s.id}"><strong>${s.id}</strong></a></div>
        <div class="meta">${new Date(s.started_at).toISOString()}${raw(cwdHtml)}</div>
      </div>`;
    })
    .join('');
  const summary = [...ownerCounts.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([ide, n]) => html`<span class="owner" data-owner="${ide}">${ide} · ${n}</span>`)
    .join(' ');
  return layout(
    'agents-hivemind · sessions',
    html`${raw(dashboard)}${raw(colonyState)}<h2>Recent memory sessions</h2><p class="meta">${raw(summary)}</p>${raw(items)}`,
  );
}

function renderColonyState(storage: Storage): string {
  const tasks = storage.listTasks(200).filter((task) => task.status === 'open');
  return html`
    <section>
      <h2>Canonical colony state</h2>
      <div class="viewer-grid">
        <div class="viewer-main">
          ${raw(renderDiagnostic(storage))}
          ${raw(renderRecentClaimsHeatMap(storage, tasks))}
          ${raw(renderToolUsageHistogram())}
        </div>
        ${raw(renderAttentionSidebar(tasks))}
      </div>
    </section>`;
}

function renderDiagnostic(storage: Storage): string {
  const unclaimed = storage.recentEditsWithoutClaims(Date.now() - RECENT_EDIT_WINDOW_MS);
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
      ${raw(rows)}
    </div>`;
}

function renderRecentClaimsHeatMap(storage: Storage, tasks: TaskRow[]): string {
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

function renderAttentionSidebar(tasks: TaskRow[]): string {
  const taskIds = tasks.map((task) => task.id);
  const taskIdJson = JSON.stringify(taskIds);
  const empty = tasks.length === 0 ? 'No active tasks.' : 'Loading attention items...';
  return html`
    <aside class="card attention" id="attention-sidebar" data-task-ids="${raw(esc(taskIdJson))}">
      <h2>Pending handoffs / wakes / broadcasts</h2>
      <div id="attention-items" class="meta">${empty}</div>
    </aside>
    <script>
${raw(attentionRefreshScript(taskIdJson))}
    </script>`;
}

function renderToolUsageHistogram(): string {
  return html`
    <div class="card">
      <h2>Tool usage histogram</h2>
      ${raw('<!-- Deferred: tool_usage_counters storage migration is not present yet. -->')}
      <p class="meta">Waiting for tool_usage_counters storage migration.</p>
    </div>`;
}

export function renderSession(
  session: SessionRow,
  observations: Array<{ id: number; kind: string; ts: number; content: string }>,
): string {
  const rows = observations
    .map(
      (o) => html`
      <div class="card">
        <div class="meta">#${o.id} · ${o.kind} · ${new Date(o.ts).toISOString()}</div>
        <pre>${o.content}</pre>
      </div>`,
    )
    .join('');
  const owner = resolveOwner(session.ide, session.id);
  return layout(
    `agents-hivemind · ${session.id}`,
    html`<h2>${raw(ownerChip(owner.ide, owner.derived))}${session.id}</h2><p><a href="/">&larr; all sessions</a></p>${raw(rows)}`,
  );
}

function renderHivemindDashboard(snapshot: HivemindSnapshot): string {
  const needsAttention = snapshot.sessions.filter((session) => laneNeedsAttention(session));
  const lanes = snapshot.sessions.length
    ? snapshot.sessions.map(renderLane).join('')
    : '<p class="meta">No active Hivemind lanes found for configured repo roots.</p>';

  return html`
    <section>
      <h2>Hivemind runtime</h2>
      <div class="grid">
        <div class="stat"><strong>${snapshot.session_count}</strong><span class="meta">live lanes</span></div>
        <div class="stat"><strong>${snapshot.counts.working}</strong><span class="meta">working</span></div>
        <div class="stat"><strong>${snapshot.counts.stalled + snapshot.counts.dead + snapshot.counts.unknown}</strong><span class="meta">attention</span></div>
        <div class="stat"><strong>${snapshot.repo_roots.length}</strong><span class="meta">repo roots</span></div>
      </div>
      ${
        needsAttention.length > 0
          ? raw(
              html`<p><span class="badge" data-attention="true">${needsAttention.length} lane needs attention</span></p>`,
            )
          : raw('<p><span class="badge">runtime clean</span></p>')
      }
      ${raw(lanes)}
    </section>`;
}

function renderLane(session: HivemindSession): string {
  const attention = laneNeedsAttention(session);
  const lockSummary =
    session.locked_file_count > 0
      ? html`<div class="meta">GX locks ${session.locked_file_count}: ${session.locked_file_preview.join(', ')}</div>`
      : '';
  const ownerIde = laneOwnerIde(session);
  const ownerDerived = ownerIde !== session.agent && ownerIde !== session.cli;
  return html`
    <div class="card lane" data-attention="${String(attention)}">
      <div>${raw(ownerChip(ownerIde, ownerDerived))}<strong>${session.task || session.task_name || session.branch}</strong>
        <span class="badge" data-attention="${String(attention)}">${session.activity}</span></div>
      <div class="meta">${session.agent}/${session.cli} · ${session.branch} · ${session.source}</div>
      <div class="meta">${session.activity_summary} Updated ${session.updated_at || 'unknown'}.</div>
      ${raw(lockSummary)}
      <div class="meta">${session.worktree_path}</div>
    </div>`;
}

/**
 * Pick the owner label for a lane card. Prefers concrete signals (agent
 * name parsed from the `agent/<name>/...` branch, cli identifier) before
 * falling back to a prefix inference on the session id. Keeps codex- vs
 * claude-driven lanes visually distinguishable even when the hivemind
 * telemetry only knew the generic `'agent'` fallback.
 */
function laneOwnerIde(session: HivemindSession): string {
  if (session.agent && session.agent !== 'agent') return session.agent;
  if (session.cli && session.cli !== 'unknown') return session.cli;
  const inferred = inferIdeFromSessionId(session.session_key);
  return inferred ?? session.agent ?? 'unknown';
}

function laneNeedsAttention(session: HivemindSession): boolean {
  return ['dead', 'stalled', 'unknown'].includes(session.activity);
}

function formatAgo(ts: number): string {
  const ms = Math.max(0, Date.now() - ts);
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

function claimHeatStyle(ts: number): string {
  const ratio = Math.max(0, Math.min(1, (Date.now() - ts) / RECENT_CLAIM_WINDOW_MS));
  const hue = Math.round(145 - ratio * 110);
  const light = Math.round(21 - ratio * 5);
  const borderLight = Math.round(47 - ratio * 14);
  return `background: hsl(${hue} 42% ${light}%); border-color: hsl(${hue} 58% ${borderLight}%);`;
}

function attentionRefreshScript(taskIdJson: string): string {
  return `
(() => {
  const ids = ${taskIdJson};
  const root = document.getElementById('attention-items');
  if (!root || !Array.isArray(ids) || ids.length === 0) return;
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const item = (label, taskId, text, meta) =>
    '<div class="attention-item"><strong>' + esc(label) + '</strong> <span class="meta">task #' +
    esc(taskId) + '</span><div>' + esc(text) + '</div><div class="meta">' + esc(meta) + '</div></div>';
  async function refreshAttention() {
    const groups = await Promise.all(ids.map(async (id) => {
      const res = await fetch('/api/colony/tasks/' + encodeURIComponent(id) + '/attention');
      return { id, body: await res.json() };
    }));
    const rows = [];
    for (const group of groups) {
      for (const handoff of group.body.pending_handoffs ?? []) {
        rows.push(item('handoff', group.id, handoff.summary, (handoff.from_agent ?? '?') + ' -> ' + (handoff.to_agent ?? '?')));
      }
      for (const wake of group.body.pending_wakes ?? []) {
        rows.push(item('wake', group.id, wake.reason, 'to ' + (wake.to_agent ?? '?')));
      }
      for (const broadcast of group.body.pending_broadcasts ?? []) {
        rows.push(item('broadcast', group.id, broadcast.preview, broadcast.from_agent ?? '?'));
      }
    }
    root.className = rows.length === 0 ? 'meta' : '';
    root.innerHTML = rows.length === 0 ? 'No pending attention items.' : rows.join('');
  }
  refreshAttention().catch(() => { root.textContent = 'Attention feed unavailable.'; });
  setInterval(() => refreshAttention().catch(() => {}), 3000);
})();
`;
}
