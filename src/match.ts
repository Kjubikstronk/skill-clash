import { normalize } from './triggers.js';
import { WEIGHTS, round3 } from './overlap.js';
import type { MatchResult, TriggerSet } from './types.js';

const COMPETE_MARGIN = 0.1;

/** Scores a free-text prompt against every skill. See spec §3 "Match". */
export function matchPrompt(prompt: string, sets: TriggerSet[], top = 5): MatchResult[] {
  const tokens = normalize(prompt);
  if (tokens.length === 0) return [];
  const padded = ` ${tokens.join(' ')} `;
  const promptWords = new Set(tokens);

  const results: MatchResult[] = [];
  for (const s of sets) {
    const hits = s.triggers.filter((t) => padded.includes(` ${t.norm} `));
    const exact = Math.min(1, hits.length / 2);
    const sharedWords = [...promptWords].filter((w) => s.words.has(w));
    const words = sharedWords.length / promptWords.size;
    const score = round3(WEIGHTS.triggers * exact + WEIGHTS.words * words);
    if (score === 0) continue;
    const matched = hits.length ? hits.map((t) => t.text) : sharedWords.map((w) => s.wordText.get(w) ?? w);
    results.push({ skill: s.skill, score, matched, competes: false });
  }

  results.sort((x, y) => y.score - x.score || x.skill.localeCompare(y.skill));
  const ranked = results.slice(0, top);
  const best = ranked[0]?.score ?? 0;
  const contenders = ranked.filter((r) => best - r.score <= COMPETE_MARGIN);
  if (contenders.length >= 2) for (const r of contenders) r.competes = true;
  return ranked;
}
