import type { TaskRow } from '@colony/storage';
import { esc, html, raw } from '../html.js';

export function renderAttentionSidebar(tasks: TaskRow[]): string {
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
