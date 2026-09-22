import pc from 'picocolors';
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
