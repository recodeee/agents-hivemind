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
  .diagnostic-stats { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); margin: 10px 0; }
  .diagnostic-stat { min-width: 0; border: 1px solid #263041; border-radius: 6px; padding: 8px; background: #151a22; }
  .diagnostic-stat strong { display: block; font-size: 20px; line-height: 1.1; color: #f2f5f8; }
  .diagnostic-warning { margin: 8px 0; padding: 7px 9px; border: 1px solid #6d2630; border-radius: 6px; background: #2a1117; color: #fecaca; }
  .coordination-behavior { display: grid; gap: 8px; }
  .coordination-row { display: grid; grid-template-columns: minmax(160px, 1fr) minmax(120px, 160px) minmax(92px, auto); gap: 10px; align-items: center; }
  .coordination-bar { position: relative; height: 10px; overflow: hidden; border-radius: 999px; background: #263041; }
  .coordination-bar::before { content: ""; display: block; width: var(--rate); height: 100%; background: var(--coord-color); }
  .coordination-row[data-rate-level="red"] { --coord-color: #ef4444; }
  .coordination-row[data-rate-level="yellow"] { --coord-color: #e7b85b; }
  .coordination-row[data-rate-level="green"] { --coord-color: #8bd5a6; }
  .attention-item { border-top: 1px solid #222; padding-top: 8px; margin-top: 8px; }
  .attention-item:first-child { border-top: 0; padding-top: 0; margin-top: 0; }
  .stranded-section { margin-bottom: 18px; }
  .stranded-title { color: #fecaca; }
  .stranded-card { border-left: 4px solid #ef4444; background: #1b1113; border-color: #452025; }
  .stranded-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
  .stranded-pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #5f1d25; color: #fecaca; font-size: 11px; font-weight: 600; }
  .stranded-error { display: block; margin-top: 8px; color: #ffd5d5; background: #250f12; border: 1px solid #5f1d25; padding: 6px 8px; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
  .stranded-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .stranded-actions button, .stranded-actions a { border: 1px solid #6d2630; border-radius: 6px; padding: 5px 9px; color: #f8fafc; background: #3f151b; font: inherit; cursor: pointer; }
  .stranded-actions a { display: inline-block; }
  .stranded-actions button:hover, .stranded-actions a:hover { background: #5f1d25; text-decoration: none; }
  .stranded-actions button:disabled { opacity: 0.65; cursor: wait; }
  @media (max-width: 860px) { .viewer-grid { grid-template-columns: 1fr; } .attention { position: static; } }
`;

interface SafeHtml {
  readonly __html: string;
}

export function raw(value: string): SafeHtml {
  return { __html: value };
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
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

export function layout(title: string, body: string): string {
  return html`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${raw(style)}</style></head><body><header><h1>agents-hivemind</h1><div class="meta">local memory + runtime viewer</div></header><main>${raw(body)}</main></body></html>`;
}

export function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}
