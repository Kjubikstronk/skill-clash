import pc from 'picocolors';
import type { Explanation } from './explain.js';
import type { Clash, MatchResult, Skipped } from './types.js';

export interface ScanReport {
  scanned: number;
  clashes: Clash[];
  skipped: Skipped[];
  untriggered: string[];
  warnings: string[];
}

export interface MatchReport {
  prompt: string;
  scanned: number;
  results: MatchResult[];
  skipped: Skipped[];
  warnings: string[];
}

const INDENT = '             ';
const quoteList = (items: string[]): string => items.map((e) => `"${e}"`).join(' . ');

export function renderScan(r: ScanReport): string {
  const nClash = r.clashes.filter((c) => c.band === 'clash').length;
  const nAmb = r.clashes.length - nClash;
  const lines: string[] = [
    `${pc.bold('skill-clash')} - ${r.scanned} skills scanned, ${pc.red(`${nClash} clash${nClash === 1 ? '' : 'es'}`)}, ${pc.yellow(`${nAmb} ambiguous`)}`,
    '',
  ];
  if (r.clashes.length === 0) lines.push(pc.green('No overlapping skills found.'));
  for (const c of r.clashes) {
    const tag = c.band === 'clash' ? pc.red('CLASH') : pc.yellow('AMBIG');
    lines.push(`${tag}  ${c.score.toFixed(2)}  ${pc.bold(c.a)} ${pc.dim('<->')} ${pc.bold(c.b)}`);
    if (c.evidence.length) lines.push(INDENT + pc.dim(quoteList(c.evidence)));
    if (c.verdict) {
      const v = c.verdict === 'clash' ? pc.red('deep: clash') : pc.green('deep: distinct');
      lines.push(INDENT + v + (c.reason ? pc.dim(` - ${c.reason}`) : ''));
    }
  }
  return [...lines, ...footer(r.skipped, r.warnings, r.untriggered)].join('\n');
}

export function renderMatch(r: MatchReport): string {
  const lines: string[] = [
    `${pc.bold('skill-clash')} - ${r.scanned} skills scanned, prompt: ${pc.cyan(JSON.stringify(r.prompt))}`,
    '',
  ];
  if (r.results.length === 0) lines.push(pc.green('No skill claims this prompt.'));
  r.results.forEach((m, i) => {
    const flag = m.competes ? pc.yellow(' (competes)') : '';
    lines.push(`${i + 1}. ${m.score.toFixed(2)}  ${pc.bold(m.skill)}${flag}`);
    if (m.matched.length) lines.push('      ' + pc.dim(quoteList(m.matched)));
  });
  return [...lines, ...footer(r.skipped, r.warnings, [])].join('\n');
}

export function renderJson(r: ScanReport | MatchReport): string {
  return JSON.stringify({ version: 1, ...r }, null, 2);
}

function footer(skipped: Skipped[], warnings: string[], untriggered: string[]): string[] {
  const lines: string[] = [];
  if (untriggered.length) lines.push('', pc.dim(`No detectable triggers (${untriggered.length}): ${untriggered.join(', ')}`));
  if (skipped.length) {
    lines.push('', pc.dim(`Skipped (${skipped.length}):`));
    for (const s of skipped) lines.push(pc.dim(`  ${s.path} - ${s.reason}`));
  }
  for (const w of warnings) lines.push('', pc.yellow(`warning: ${w}`));
  return lines;
}

/** `--explain a b`: everything needed to decide which of two skills to keep. */
export function renderExplain(e: Explanation): string {
  const band = e.band === 'clash' ? pc.red('CLASH') : e.band === 'ambiguous' ? pc.yellow('AMBIGUOUS') : pc.green('NO OVERLAP');
  const L: string[] = [
    `${pc.bold('skill-clash')} - ${pc.bold(e.a.label)} ${pc.dim('<->')} ${pc.bold(e.b.label)}  ${band} ${e.score.toFixed(2)}`,
    '',
  ];

  if (e.sharedTriggerWords.length) {
    L.push(pc.bold('Overlapping on:'), '  ' + e.sharedTriggerWords.map((w) => pc.yellow(w)).join(', '), '');
  } else {
    L.push(pc.green('These two share no trigger words.'), '');
  }

  for (const s of [e.a, e.b]) {
    L.push(`${pc.bold(s.label)} ${pc.dim(`(${s.source})`)}`);
    L.push(`  ${pc.dim(s.path)}`);
    L.push(`  ${wrap(s.description, 74, '  ')}`);
    if (s.sharedTriggers.length) L.push(`  ${pc.dim('claims:')} ${s.sharedTriggers.map((t) => pc.yellow(`"${t}"`)).join(' . ')}`);
    if (s.distinctWords.length) L.push(`  ${pc.dim('only it:')} ${pc.cyan(s.distinctWords.slice(0, 12).join(', '))}`);
    L.push('');
  }

  L.push(pc.dim('Nothing was changed. To drop one, remove its directory yourself.'));
  return L.join('\n');
}

function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if (line.length + w.length + 1 > width) {
      lines.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return lines.join('\n' + indent);
}
