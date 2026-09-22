import type { TriggerSet } from '../src/types.js';

/** Builds a TriggerSet directly so scoring tests do not depend on extractTriggers. */
export const set = (skill: string, triggers: string[], words: string[]): TriggerSet => ({
  skill,
  triggers: triggers.map((t) => ({ text: t, norm: t, kind: 'explicit' as const })),
  triggerWords: new Set(triggers.flatMap((t) => t.split(' '))),
  words: new Set(words),
  wordText: new Map(words.map((w) => [w, w])),
});
