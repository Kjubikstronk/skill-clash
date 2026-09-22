export type Source = 'user' | 'project' | `plugin:${string}`;

export interface Skill {
  name: string;
  description: string;
  path: string;
  source: Source;
}

export interface Skipped {
  path: string;
  reason: string;
}

export interface Trigger {
  /** Original text, for evidence. */
  text: string;
  /** Normalized compare key: stemmed content words joined by single spaces. */
  norm: string;
  /** explicit = quoted phrase or "use when" clause; inferred = verb-object fallback. */
  kind: 'explicit' | 'inferred';
}

export interface TriggerSet {
  skill: string;
  triggers: Trigger[];
  /** Union of words across all trigger norms. */
  triggerWords: Set<string>;
  /** All normalized words of the description. */
  words: Set<string>;
  /** Normalized word -> first original spelling seen. */
  wordText: Map<string, string>;
}

export type Band = 'clash' | 'ambiguous' | 'none';

export interface Clash {
  a: string;
  b: string;
  score: number;
  band: Band;
  evidence: string[];
  verdict?: 'clash' | 'distinct';
  reason?: string;
}

export interface MatchResult {
  skill: string;
  score: number;
  matched: string[];
  competes: boolean;
}

export interface Thresholds {
  clash: number;
  ambiguous: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = { clash: 0.45, ambiguous: 0.15 };
