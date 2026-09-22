import type { ScanReport } from './report.js';
import type { Clash } from './types.js';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--muted:#6b7280;--line:#e5e7eb;--clash:#fecaca;--clash-fg:#991b1b;--amb:#fde68a;--amb-fg:#92400e;--ok:#bbf7d0}
@media(prefers-color-scheme:dark){:root{--bg:#111318;--fg:#e5e7eb;--muted:#9ca3af;--line:#2a2f3a;--clash:#7f1d1d;--clash-fg:#fecaca;--amb:#78350f;--amb-fg:#fde68a;--ok:#14532d}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:1100px;margin-inline:auto}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 24px}
.wrap{overflow-x:auto}table{border-collapse:collapse;font-size:13px}th,td{border:1px solid var(--line);padding:4px 8px;text-align:center;min-width:34px}
th{text-align:left;white-space:nowrap}thead th{text-align:center}td.self{background:var(--line)}
td.clash{background:var(--clash);color:var(--clash-fg);font-weight:600}td.ambiguous{background:var(--amb);color:var(--amb-fg)}
ul{list-style:none;padding:0}li{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:8px 0}
.badge{font-size:11px;font-weight:700;letter-spacing:.04em;padding:2px 6px;border-radius:4px;margin-right:6px}
li.clash .badge{background:var(--clash);color:var(--clash-fg)}li.ambiguous .badge{background:var(--amb);color:var(--amb-fg)}
.score{color:var(--muted);margin-left:6px}.ev{margin-top:6px}code{background:var(--line);padding:1px 5px;border-radius:4px;font-size:12px}
.deep{margin-top:4px;font-size:13px}.deep.clash{color:var(--clash-fg)}.deep.distinct{color:#166534}
.empty{background:var(--ok);padding:12px;border-radius:8px}.muted{color:var(--muted);font-size:13px}
`;

/** Says so when --limit hid pairs, so a shared report is not read as complete. */
function truncNote(r: ScanReport): string {
  const total = r.totalClashes ?? r.clashes.length;
  return total > r.clashes.length ? ` &middot; showing top ${r.clashes.length} of ${total}` : '';
}

export function renderHtml(r: ScanReport): string {
  const names = [...new Set(r.clashes.flatMap((c) => [c.a, c.b]))].sort((x, y) => x.localeCompare(y));
  const idx = new Map(names.map((n, i) => [n, i + 1]));
  const cells = new Map<string, Clash>();
  for (const c of r.clashes) {
    cells.set(`${c.a}|${c.b}`, c);
    cells.set(`${c.b}|${c.a}`, c);
  }
  const nClash = r.clashes.filter((c) => c.band === 'clash').length;

  const matrix =
    names.length === 0
      ? '<p class="empty">No overlapping skills found.</p>'
      : `<div class="wrap"><table>
<thead><tr><th></th>${names.map((n) => `<th title="${esc(n)}">${idx.get(n)}</th>`).join('')}</tr></thead>
<tbody>
${names
  .map(
    (a) =>
      `<tr><th>${idx.get(a)}. ${esc(a)}</th>${names
        .map((b) => {
          if (a === b) return '<td class="self"></td>';
          const c = cells.get(`${a}|${b}`);
          return c ? `<td class="${c.band}" title="${esc(c.evidence.join(' | '))}">${c.score.toFixed(2)}</td>` : '<td></td>';
        })
        .join('')}</tr>`,
  )
  .join('\n')}
</tbody></table></div>`;

  const list = r.clashes
    .map(
      (c) =>
        `<li class="${c.band}"><span class="badge">${c.band === 'clash' ? 'CLASH' : 'AMBIGUOUS'}</span><b>${esc(c.a)}</b> &harr; <b>${esc(c.b)}</b><span class="score">${c.score.toFixed(2)}</span>` +
        (c.evidence.length ? `<div class="ev">${c.evidence.map((e) => `<code>${esc(e)}</code>`).join(' ')}</div>` : '') +
        (c.verdict ? `<div class="deep ${c.verdict}">deep: ${c.verdict}${c.reason ? ` &mdash; ${esc(c.reason)}` : ''}</div>` : '') +
        '</li>',
    )
    .join('\n');

  const skipped = r.skipped.length
    ? `<p class="muted">Skipped ${r.skipped.length}: ${r.skipped.map((s) => `${esc(s.path)} (${esc(s.reason)})`).join('; ')}</p>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>skill-clash report</title><style>${CSS}</style></head>
<body>
<h1>skill-clash</h1>
<p class="sub">${r.scanned} skills scanned &middot; ${nClash} clash${nClash === 1 ? '' : 'es'} &middot; ${r.clashes.length - nClash} ambiguous${truncNote(r)}</p>
${matrix}
<ul>
${list}
</ul>
${skipped}
</body></html>
`;
}
