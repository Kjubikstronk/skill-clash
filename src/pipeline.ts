import { discover, searchRoots } from './discover.js';
import { parseSkill, labelSkills } from './parse.js';
import { extractTriggers } from './triggers.js';
import { findClashes } from './overlap.js';
import { matchPrompt } from './match.js';
import { explainPair, resolveSkill } from './explain.js';
import { deepen, runClaudeCli, type RunClaude } from './deep.js';
import { renderScan, renderMatch, renderJson, renderExplain, type ScanReport, type MatchReport } from './report.js';
import { renderHtml } from './html.js';
import { DEFAULT_THRESHOLDS, type Skill, type Skipped, type Thresholds, type TriggerSet } from './types.js';

export interface RunOptions {
  home?: string;
  cwd?: string;
  plugins?: boolean;
  prompt?: string;
  /** Two skill names to compare in detail. */
  explain?: string[];
  deep?: boolean;
  json?: boolean;
  html?: string;
  strict?: boolean;
  thresholds?: Thresholds;
  /** Injected in tests; defaults to spawning `claude -p`. */
  runClaude?: RunClaude;
}

export interface RunIO {
  out(line: string): void;
  err(line: string): void;
  writeFile(path: string, content: string): void;
}

export function loadSkills(opts: RunOptions): { skills: Skill[]; skipped: Skipped[] } {
  const skills: Skill[] = [];
  const skipped: Skipped[] = [];
  for (const d of discover({ home: opts.home, cwd: opts.cwd, plugins: opts.plugins })) {
    const r = parseSkill(d.path, d.source);
    if (r.ok) skills.push(r.skill);
    else skipped.push(r.skipped);
  }
  return { skills, skipped };
}

/** Runs the whole pipeline and returns the process exit code. */
export async function run(opts: RunOptions, io: RunIO): Promise<number> {
  const th = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const { skills, skipped } = loadSkills(opts);
  if (skills.length === 0 && skipped.length === 0) {
    io.out(`no skills found in: ${searchRoots({ home: opts.home, cwd: opts.cwd, plugins: opts.plugins }).join(', ')}`);
    return 0;
  }

  const labels = labelSkills(skills);
  const byLabel = new Map(skills.map((s) => [labels.get(s) as string, s]));
  const sets: TriggerSet[] = skills.map((s) => extractTriggers(labels.get(s) as string, s.description));
  const warnings: string[] = [];

  if (opts.explain) {
    const allLabels = [...byLabel.keys()];
    const picked: string[] = [];
    for (const q of opts.explain) {
      const hits = resolveSkill(q, allLabels);
      if (hits.length === 0) {
        io.err(`error: no skill matches "${q}"`);
        return 2;
      }
      if (hits.length > 1) {
        io.err(`error: "${q}" matches ${hits.length} skills: ${hits.join(', ')}`);
        return 2;
      }
      picked.push(hits[0]);
    }
    if (picked[0] === picked[1]) {
      io.err(`error: both names resolve to the same skill (${picked[0]})`);
      return 2;
    }
    const explanation = explainPair(picked[0], picked[1], byLabel, new Map(sets.map((s) => [s.skill, s])), th);
    io.out(opts.json ? JSON.stringify({ version: 1, ...explanation }, null, 2) : renderExplain(explanation));
    return 0;
  }

  if (opts.prompt !== undefined) {
    const report: MatchReport = { prompt: opts.prompt, scanned: skills.length, results: matchPrompt(opts.prompt, sets), skipped, warnings };
    io.out(opts.json ? renderJson(report) : renderMatch(report));
    return 0;
  }

  let clashes = findClashes(sets, th);
  if (opts.deep) clashes = await deepen(clashes, byLabel, opts.runClaude ?? runClaudeCli, (w) => warnings.push(w));

  const report: ScanReport = {
    scanned: skills.length,
    clashes,
    skipped,
    untriggered: sets.filter((s) => s.triggers.length === 0).map((s) => s.skill),
    warnings,
  };
  if (opts.html) {
    io.writeFile(opts.html, renderHtml(report));
    io.err(`HTML report written to ${opts.html}`);
  }
  io.out(opts.json ? renderJson(report) : renderScan(report));

  const failing = clashes.some((c) => c.band === 'clash' || (opts.strict === true && c.band === 'ambiguous'));
  return failing ? 1 : 0;
}
