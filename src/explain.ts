import { scorePair } from './overlap.js';
import { DEFAULT_THRESHOLDS, type Band, type Skill, type Thresholds, type TriggerSet } from './types.js';

export interface ExplainSide {
  label: string;
  path: string;
  source: string;
  description: string;
  /** Every trigger this skill declares. */
  triggers: string[];
  /** The triggers that contain a word shared with the other skill. */
  sharedTriggers: string[];
  /** Trigger words this skill has and the other does not — what tells them apart. */
  distinctWords: string[];
}

export interface Explanation {
  a: ExplainSide;
  b: ExplainSide;
  score: number;
  band: Band;
  sharedTriggerWords: string[];
}

/**
 * Finds label(s) matching a user-typed name. An exact (case-insensitive) match
 * wins outright; otherwise every substring match is returned so the caller can
 * report the ambiguity rather than guessing.
 */
export function resolveSkill(query: string, labels: string[]): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const exact = labels.filter((l) => l.toLowerCase() === q);
  if (exact.length) return exact;
  return labels.filter((l) => l.toLowerCase().includes(q));
}

function side(skill: Skill, label: string, mine: TriggerSet, theirs: TriggerSet, shared: Set<string>): ExplainSide {
  return {
    label,
    path: skill.path,
    source: skill.source,
    description: skill.description,
    triggers: mine.triggers.map((t) => t.text),
    sharedTriggers: mine.triggers.filter((t) => t.norm.split(' ').some((w) => shared.has(w))).map((t) => t.text),
    distinctWords: [...mine.triggerWords]
      .filter((w) => !theirs.triggerWords.has(w))
      .map((w) => mine.wordText.get(w) ?? w),
  };
}

/** Everything needed to decide which of two overlapping skills to keep. */
export function explainPair(
  labelA: string,
  labelB: string,
  byLabel: Map<string, Skill>,
  setByLabel: Map<string, TriggerSet>,
  th: Thresholds = DEFAULT_THRESHOLDS,
): Explanation {
  const skillA = byLabel.get(labelA);
  const skillB = byLabel.get(labelB);
  const setA = setByLabel.get(labelA);
  const setB = setByLabel.get(labelB);
  if (!skillA || !skillB || !setA || !setB) throw new Error(`unknown skill: ${!skillA ? labelA : labelB}`);

  const clash = scorePair(setA, setB, th);
  const shared = new Set([...setA.triggerWords].filter((w) => setB.triggerWords.has(w)));

  return {
    a: side(skillA, labelA, setA, setB, shared),
    b: side(skillB, labelB, setB, setA, shared),
    score: clash.score,
    band: clash.band,
    sharedTriggerWords: [...shared].map((w) => setA.wordText.get(w) ?? w),
  };
}
