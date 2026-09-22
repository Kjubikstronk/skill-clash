import { DEFAULT_THRESHOLDS, type Band, type Clash, type Thresholds, type TriggerSet } from './types.js';

/** The only place score weights live. */
export const WEIGHTS = { triggers: 0.6, words: 0.4 } as const;

export const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** Overlap coefficient: |A∩B| / min(|A|,|B|). Unlike Jaccard, a small set fully contained in a big one scores 1. */
export function overlapCoeff(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / Math.min(a.size, b.size);
}

export function bandFor(score: number, th: Thresholds): Band {
  if (score >= th.clash) return 'clash';
  if (score >= th.ambiguous) return 'ambiguous';
  return 'none';
}

/** Original text of triggers (either side) containing a shared trigger word; else shared description words. */
export function evidenceFor(a: TriggerSet, b: TriggerSet, max = 6): string[] {
  const shared = new Set([...a.triggerWords].filter((w) => b.triggerWords.has(w)));
  const out: string[] = [];
  for (const t of [...a.triggers, ...b.triggers]) {
    if (out.length >= max) break;
    if (t.norm.split(' ').some((w) => shared.has(w)) && !out.includes(t.text)) out.push(t.text);
  }
  if (out.length === 0) {
    for (const w of a.words) {
      if (!b.words.has(w)) continue;
      out.push(a.wordText.get(w) ?? w);
      if (out.length >= 5) break;
    }
  }
  return out;
}

export function scorePair(a: TriggerSet, b: TriggerSet, th: Thresholds = DEFAULT_THRESHOLDS): Clash {
  const exact = overlapCoeff(a.triggerWords, b.triggerWords);
  const words = overlapCoeff(a.words, b.words);
  const score = round3(WEIGHTS.triggers * exact + WEIGHTS.words * words);
  return { a: a.skill, b: b.skill, score, band: bandFor(score, th), evidence: evidenceFor(a, b) };
}

export function findClashes(sets: TriggerSet[], th: Thresholds = DEFAULT_THRESHOLDS): Clash[] {
  const out: Clash[] = [];
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const c = scorePair(sets[i], sets[j], th);
      if (c.band !== 'none') out.push(c);
    }
  }
  return out.sort((x, y) => y.score - x.score || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}
