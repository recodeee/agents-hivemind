import type { FileHeatRow, Storage, TaskRow } from '@colony/storage';
import { formatAgo } from '../format.js';
import { html, raw } from '../html.js';

export function renderFileHeatMap(
  storage: Storage,
  tasks: TaskRow[],
  fileHeatHalfLifeMinutes: number,
): string {
  const taskIds = tasks.map((task) => task.id);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const heat = storage.fileHeat({
    task_ids: taskIds,
    now: Date.now(),
    half_life_minutes: fileHeatHalfLifeMinutes,
    limit: 24,
  });
  if (heat.length === 0) {
    return html`
      <div class="card">
        <h2>File activity heat-map</h2>
        <p class="meta">No hot files across active tasks.</p>
      </div>`;
  }

  return html`
    <div class="card">
      <h2>File activity heat-map</h2>
      <div class="heat-map">
        ${heat.map((row) => renderFileHeatTile(taskById.get(row.task_id), row))}
      </div>
    </div>`;
}

function renderFileHeatTile(task: TaskRow | undefined, file: FileHeatRow): string {
  const branch = task?.branch ?? `task #${file.task_id}`;
  const title = `${file.file_path} · heat ${file.heat.toFixed(3)} · ${branch} · ${formatAgo(
    file.last_activity_ts,
  )}`;
  return html`
    <div class="claim-tile" title="${title}" style="${raw(fileHeatStyle(file.heat))}">
      <code>${file.file_path}</code>
      <div class="meta">heat ${file.heat.toFixed(3)} · ${file.event_count} event(s)</div>
      <div class="meta">${branch} · ${formatAgo(file.last_activity_ts)}</div>
    </div>`;
}

function fileHeatStyle(heat: number): string {
  const ratio = Math.max(0, Math.min(1, heat));
  const hue = Math.round(35 + ratio * 110);
  const light = Math.round(16 + ratio * 5);
  const borderLight = Math.round(33 + ratio * 14);
  return `background: hsl(${hue} 42% ${light}%); border-color: hsl(${hue} 58% ${borderLight}%);`;
}
