import { spawn } from 'node:child_process';
import type { Clash, Skill } from './types.js';

export type RunClaude = (prompt: string) => Promise<string>;

export interface Verdict {
  pair: string;
  verdict: 'clash' | 'distinct';
  reason: string;
}

export const BATCH_SIZE = 20;
const TIMEOUT_MS = 60_000;

export const pairKey = (c: Clash): string => `${c.a} <> ${c.b}`;

export function buildPrompt(clashes: Clash[], byLabel: Map<string, Skill>): string {
  const pairs = clashes.map((c) => ({
    pair: pairKey(c),
    a: { name: c.a, description: byLabel.get(c.a)?.description ?? '' },
    b: { name: c.b, description: byLabel.get(c.b)?.description ?? '' },
  }));
  return [
    'You are judging whether pairs of Claude Code skills would compete for the same user prompts.',
    'Two skills CLASH if a realistic user prompt could reasonably trigger either one.',
    'They are DISTINCT if their descriptions target clearly different requests.',
    'Reply with ONLY a JSON array, no prose, no code fences, one entry per pair, in this shape:',
    '[{"pair":"<pair>","verdict":"clash"|"distinct","reason":"<one short sentence>"}]',
    '',
    'Pairs:',
    JSON.stringify(pairs),
  ].join('\n');
}

/** Accepts a bare JSON array, or the `claude -p --output-format json` envelope, with or without code fences. */
export function parseVerdicts(raw: string): Verdict[] {
  let text = raw.trim();
  try {
    const env = JSON.parse(text) as unknown;
    if (env && typeof env === 'object' && !Array.isArray(env) && typeof (env as { result?: unknown }).result === 'string') {
      text = (env as { result: string }).result;
    }
  } catch {
    // not an envelope; fall through
  }
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('no JSON array in response');
  const arr = JSON.parse(text.slice(start, end + 1)) as unknown;
  if (!Array.isArray(arr)) throw new Error('response is not an array');
  const out: Verdict[] = [];
  for (const v of arr as Array<Record<string, unknown>>) {
    if (!v || typeof v.pair !== 'string') continue;
    if (v.verdict !== 'clash' && v.verdict !== 'distinct') continue;
    out.push({ pair: v.pair, verdict: v.verdict, reason: typeof v.reason === 'string' ? v.reason : '' });
  }
  return out;
}

/** Attaches verdicts to ambiguous clashes. Never throws; failures become warnings. Bands are left untouched. */
export async function deepen(
  clashes: Clash[],
  byLabel: Map<string, Skill>,
  run: RunClaude,
  warn: (msg: string) => void,
): Promise<Clash[]> {
  const targets = clashes.filter((c) => c.band === 'ambiguous');
  if (targets.length === 0) return clashes;

  const verdicts = new Map<string, Verdict>();
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    try {
      for (const v of parseVerdicts(await run(buildPrompt(batch, byLabel)))) verdicts.set(v.pair, v);
    } catch (e) {
      warn(`--deep: batch ${i / BATCH_SIZE + 1} failed (${(e as Error).message}); showing heuristic bands only for those pairs`);
    }
  }
  return clashes.map((c) => {
    const v = verdicts.get(pairKey(c));
    return v ? { ...c, verdict: v.verdict, reason: v.reason } : c;
  });
}

/** Spawns the user's own `claude` CLI. Prompt goes over stdin so no shell quoting is needed. */
export const runClaudeCli: RunClaude = (prompt) =>
  new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--output-format', 'json'], {
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`could not run claude: ${e.message}`));
    });
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (err += d.toString()));
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`claude exited ${code}: ${err.trim().slice(0, 200) || 'is claude on your PATH?'}`));
    });
    child.stdin.end(prompt);
  });
