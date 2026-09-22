import type { Trigger, TriggerSet } from './types.js';

/**
 * Words that carry no routing signal. Checked both before and after stemming,
 * so both raw and stemmed forms are listed where they differ.
 */
export const STOPWORDS = new Set<string>(
  (
    'a an the and or of to in on for with is are be it its this thi these thes those thos ' +
    'when whenever use user users ask asks say says want wants mention mentions need needs ' +
    'skill skills any all also like such as into from by at you your they their should can ' +
    'if not no do does doe etc e g i my me our we otherwise other than then so just via ' +
    'about how what which who while where will would could may might must always never against ' +
    // Claude-Code-generic nouns: in almost every description, no routing signal.
    'code file files project tool tools claude help work new existing ' +
    // Content-free verbs (listed pre- and post-stem): "create a commit" and "creating shaders" must not overlap on "create".
    'create creat creating created make mak add adding added update updat get build built generate generat ' +
    'implement run set turn find produce produc write writ written support include includ cover handle handl'
  ).split(' '),
);

/** Task verbs used for the inferred verb-object fallback. Compared by stem. */
export const TASK_VERBS = new Set<string>([
  'review', 'audit', 'check', 'create', 'build', 'fix', 'generate', 'animate', 'design',
  'refactor', 'debug', 'test', 'write', 'convert', 'improve', 'polish', 'optimize',
  'implement', 'add', 'remove', 'update', 'edit', 'read', 'extract', 'summarize',
  'translate', 'deploy', 'run', 'scan', 'validate', 'lint', 'format', 'render', 'schedule',
  'plan', 'explain', 'migrate', 'analyze', 'draft', 'turn', 'set', 'configure', 'install',
  'manage', 'track', 'produce', 'launch', 'find',
]);

const TASK_VERB_STEMS = new Set([...TASK_VERBS].map((v) => stem(v)));

/** Light suffix stripping so create/creating/created share one key. Not linguistically correct; consistent is enough. */
export function stem(word: string): string {
  let w = word;
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

export function tokenize(text: string): Array<{ raw: string; norm: string }> {
  const out: Array<{ raw: string; norm: string }> = [];
  for (const raw of text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    if (!raw || STOPWORDS.has(raw)) continue;
    const norm = stem(raw);
    if (norm.length > 1 && !STOPWORDS.has(norm)) out.push({ raw, norm });
  }
  return out;
}

export function normalize(text: string): string[] {
  return tokenize(text).map((t) => t.norm);
}

const DOUBLE_QUOTED = /["“”`]([^"“”`\n]{2,80})["“”`]/g;
const SINGLE_QUOTED = /(?:^|[\s(])'([^'\n]{2,80})'(?=[\s.,;:)!?]|$)/g;
const CLAUSE =
  /\b(?:use (?:this (?:skill )?)?(?:when|whenever|for)|triggers? on|when (?:the )?users? (?:asks?|says?|wants?|mentions?|needs?)(?: (?:to|for|about))?)\b:?\s*([^.;\n]+)/gi;

/** Verb + up to two following content words, e.g. "implement web accessibility". */
export function verbObjects(text: string): string[] {
  const raw = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < raw.length - 1; i++) {
    if (!TASK_VERB_STEMS.has(stem(raw[i]))) continue;
    const obj: string[] = [];
    for (let j = i + 1; j < raw.length && obj.length < 2; j++) {
      if (STOPWORDS.has(raw[j])) {
        if (obj.length) break;
        continue;
      }
      obj.push(raw[j]);
    }
    if (obj.length) out.push(`${raw[i]} ${obj.join(' ')}`);
  }
  return out;
}

export function extractTriggers(skill: string, description: string): TriggerSet {
  const triggers: Trigger[] = [];
  const seen = new Set<string>();
  const add = (text: string, kind: Trigger['kind']): void => {
    const norm = normalize(text).join(' ');
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    triggers.push({ text: text.trim().replace(/\s+/g, ' '), norm, kind });
  };

  for (const m of description.matchAll(DOUBLE_QUOTED)) add(m[1], 'explicit');
  for (const m of description.matchAll(SINGLE_QUOTED)) add(m[1], 'explicit');

  const unquoted = description.replace(DOUBLE_QUOTED, ' ').replace(SINGLE_QUOTED, ' ');
  for (const m of unquoted.matchAll(CLAUSE)) {
    for (const part of m[1].split(/,|\bor\b/)) add(part, 'explicit');
  }

  if (triggers.length === 0) {
    for (const pair of verbObjects(description)) add(pair, 'inferred');
  }

  const words = new Set<string>();
  const wordText = new Map<string, string>();
  for (const { raw, norm } of tokenize(description)) {
    words.add(norm);
    if (!wordText.has(norm)) wordText.set(norm, raw);
  }
  const triggerWords = new Set(triggers.flatMap((t) => t.norm.split(' ')));

  return { skill, triggers, triggerWords, words, wordText };
}
