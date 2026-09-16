# skill-clash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `skill-clash` v0.1.0 to npm — a CLI that finds Claude Code skills whose descriptions fight over the same prompts.

**Architecture:** A pipeline of pure modules (`discover → parse → triggers → overlap | match → deep → report`), each in its own file with one exported responsibility, wired together by `pipeline.ts` and exposed by a thin `commander` CLI in `cli.ts`. Scoring is heuristic (word-set overlap coefficients); `--deep` optionally shells out to the user's own `claude -p` for verdicts on ambiguous pairs.

**Tech Stack:** TypeScript (strict, ESM, NodeNext), Node ≥ 20, `commander`, `gray-matter`, `picocolors`; `tsup` (build), `vitest` (tests), `tsx` (dev runner).

Spec: `docs/superpowers/specs/2026-09-15-skill-clash-design.md`

## Global Constraints

- Node `>=20`; package `"type": "module"`; every relative import ends in `.js` (NodeNext resolution).
- Runtime dependencies are exactly `commander`, `gray-matter`, `picocolors`. Nothing else.
- Package name `skill-clash`, MIT license, bin `skill-clash` → `dist/cli.js`.
- Exit codes: `0` no clashes / nothing found, `1` clash-band pair exists (`--strict` adds ambiguous), `2` usage error or crash.
- Rule for everything that touches the filesystem or a child process: **never crash on someone else's files.** Errors become `Skipped` entries or warning lines.
- Default thresholds: `clash: 0.45`, `ambiguous: 0.15` (Task 11 may change these — change them in `src/types.ts` only).
- Score weights: `0.6` trigger overlap, `0.4` description-word overlap — defined once in `src/overlap.ts` as `WEIGHTS`.
- Terminal output is ASCII-only (`<->`, `(competes)`), no box-drawing or emoji, so it survives Windows consoles.
- README tagline (verbatim): *skill-doctor tells you what's unused. skill-clash tells you why.*
- Every commit message ends with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

```
skill-clash/
├── package.json                 npm manifest, scripts, bin
├── tsconfig.json                strict ESM TypeScript
├── tsup.config.ts               builds src/cli.ts → dist/cli.js
├── .gitignore
├── LICENSE                      MIT
├── README.md                    Task 12
├── src/
│   ├── types.ts                 shared types + DEFAULT_THRESHOLDS (no logic)
│   ├── triggers.ts              tokenize/stem/normalize + extractTriggers
│   ├── overlap.ts               overlapCoeff, scorePair, findClashes, WEIGHTS
│   ├── match.ts                 matchPrompt (--prompt mode)
│   ├── parse.ts                 parseSkill (SKILL.md → Skill | Skipped), labelSkills
│   ├── discover.ts              find SKILL.md files, searchRoots
│   ├── report.ts                terminal + JSON renderers, ScanReport/MatchReport types
│   ├── html.ts                  standalone HTML report renderer
│   ├── deep.ts                  buildPrompt, parseVerdicts, deepen, runClaudeCli
│   ├── pipeline.ts              run(opts, io) — orchestration, returns exit code
│   └── cli.ts                   commander flags → run(); process.exit
├── tests/
│   ├── helpers.ts               shared `set()` TriggerSet builder for tests
│   ├── triggers.test.ts
│   ├── overlap.test.ts
│   ├── match.test.ts
│   ├── parse.test.ts
│   ├── discover.test.ts
│   ├── report.test.ts
│   ├── html.test.ts
│   ├── pipeline.test.ts
│   ├── cli.test.ts
│   └── deep.test.ts
└── fixtures/
    ├── home/.claude/skills/<name>/SKILL.md          fake ~/.claude
    ├── home/.claude/plugins/marketplaces/demo/plugins/charts/skills/dataviz/SKILL.md
    └── project/.claude/skills/threejs-shaders/SKILL.md
```

All commands below run from the repo root `C:\Users\mck09\Desktop\skill-clash`.

---

### Task 1: Project scaffold and shared types

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsup.config.ts`, `.gitignore`, `LICENSE`, `src/types.ts`
- Test: `tests/types.test.ts`

**Interfaces:**
- Produces: every type in `src/types.ts` (below). All later tasks import from `./types.js`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "skill-clash",
  "version": "0.1.0",
  "description": "Find Claude Code skills that fight over the same prompts.",
  "type": "module",
  "bin": { "skill-clash": "dist/cli.js" },
  "files": ["dist", "README.md", "LICENSE"],
  "engines": { "node": ">=20" },
  "license": "MIT",
  "keywords": ["claude-code", "skills", "lint", "cli", "claude"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev": "tsx src/cli.ts",
    "prepublishOnly": "npm run typecheck && npm test && npm run build"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install commander gray-matter picocolors
```

```bash
npm install -D typescript tsup tsx vitest @types/node
```

Expected: `package.json` gains `dependencies` (3) and `devDependencies` (5); `package-lock.json` and `node_modules/` appear.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "tests", "tsup.config.ts"]
}
```

- [ ] **Step 4: Create `tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: false,
  minify: false,
});
```

- [ ] **Step 5: Create `.gitignore` and `LICENSE`**

`.gitignore`:
```
node_modules/
dist/
*.log
report.html
```

`LICENSE` (MIT, year 2026, copyright holder: the repo owner's name — ask if unsure; default to "skill-clash contributors"):
```
MIT License

Copyright (c) 2026 skill-clash contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 6: Write the failing test `tests/types.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_THRESHOLDS } from '../src/types.js';

describe('types', () => {
  it('ships sane default thresholds', () => {
    expect(DEFAULT_THRESHOLDS.ambiguous).toBeLessThan(DEFAULT_THRESHOLDS.clash);
    expect(DEFAULT_THRESHOLDS.clash).toBeLessThanOrEqual(1);
    expect(DEFAULT_THRESHOLDS.ambiguous).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

```bash
npx vitest run tests/types.test.ts
```
Expected: FAIL — `Cannot find module '../src/types.js'`.

- [ ] **Step 8: Create `src/types.ts`**

```ts
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
```

- [ ] **Step 9: Run tests and typecheck**

```bash
npx vitest run tests/types.test.ts
```
Expected: PASS (1 test).

```bash
npm run typecheck
```
Expected: no output, exit 0.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsup.config.ts .gitignore LICENSE src/types.ts tests/types.test.ts
git commit -m "chore: scaffold skill-clash project with shared types

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Trigger extraction (`triggers.ts`)

**Files:**
- Create: `src/triggers.ts`
- Test: `tests/triggers.test.ts`

**Interfaces:**
- Consumes: `Trigger`, `TriggerSet` from `./types.js`.
- Produces:
  - `stem(word: string): string`
  - `tokenize(text: string): Array<{ raw: string; norm: string }>`
  - `normalize(text: string): string[]` — `tokenize(text).map(t => t.norm)`
  - `verbObjects(text: string): string[]`
  - `extractTriggers(skill: string, description: string): TriggerSet`
  - `STOPWORDS: Set<string>`, `TASK_VERBS: Set<string>`

- [ ] **Step 1: Write the failing tests `tests/triggers.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { stem, normalize, extractTriggers, verbObjects } from '../src/triggers.js';

describe('stem', () => {
  it('maps inflections of one word to one key', () => {
    expect(stem('creating')).toBe('creat');
    expect(stem('create')).toBe('creat');
    expect(stem('created')).toBe('creat');
    expect(stem('practices')).toBe('practic');
    expect(stem('practice')).toBe('practic');
    expect(stem('designs')).toBe('design');
  });
  it('leaves short words and -ss words alone', () => {
    expect(stem('ui')).toBe('ui');
    expect(stem('css')).toBe('css');
    expect(stem('use')).toBe('use');
  });
});

describe('normalize', () => {
  it('lowercases, strips punctuation and stopwords, stems', () => {
    expect(normalize('Use when the user asks to "review my UI".')).toEqual(['review', 'ui']);
  });
  it('drops Claude-Code-generic words and content-free verbs', () => {
    expect(normalize('the code in your project files')).toEqual([]);
    expect(normalize('create a git commit')).toEqual(['git', 'commit']);
    expect(normalize('creating custom shaders')).toEqual(['custom', 'shader']);
  });
});

describe('verbObjects', () => {
  it('pairs task verbs with up to two following content words', () => {
    expect(verbObjects('Implement web accessibility best practices to create inclusive, accessible user interfaces.'))
      .toEqual(['implement web accessibility', 'create inclusive accessible']);
  });
  it('returns nothing when there is no task verb', () => {
    expect(verbObjects('Three.js shaders - GLSL, uniforms.')).toEqual([]);
  });
});

describe('extractTriggers', () => {
  it('takes quoted phrases as explicit triggers', () => {
    const t = extractTriggers('x', 'Use when asked to "review my UI", "check accessibility" or \'audit design\'.');
    expect(t.triggers.map((x) => x.text)).toEqual(['review my UI', 'check accessibility', 'audit design']);
    expect(t.triggers.every((x) => x.kind === 'explicit')).toBe(true);
    expect(t.triggerWords).toEqual(new Set(['review', 'ui', 'check', 'accessibility', 'audit', 'design']));
  });

  it('splits "use when" clauses on commas and "or"', () => {
    const t = extractTriggers('x', 'Use when the user wants to design, redesign, or otherwise improve a frontend interface. Not for backend.');
    expect(t.triggers.map((x) => x.norm)).toEqual(['design', 'redesign', 'improv frontend interfac']);
  });

  it('handles "Triggers on:" lists', () => {
    const t = extractTriggers('x', 'Triggers on: "chart", "graph", "plot".');
    expect(t.triggers.map((x) => x.norm)).toEqual(['chart', 'graph', 'plot']);
  });

  it('falls back to verb-object pairs only when nothing is explicit', () => {
    const t = extractTriggers('x', 'Implement web accessibility best practices to create inclusive, accessible user interfaces.');
    expect(t.triggers.map((x) => x.text)).toEqual(['implement web accessibility', 'create inclusive accessible']);
    expect(t.triggers.every((x) => x.kind === 'inferred')).toBe(true);
  });

  it('dedupes triggers by normalized form', () => {
    const t = extractTriggers('x', '"Review UI" and "review the UI"');
    expect(t.triggers).toHaveLength(1);
  });

  it('collects description words and remembers original spelling', () => {
    const t = extractTriggers('x', 'Animating practices');
    expect(t.words).toEqual(new Set(['animat', 'practic']));
    expect(t.wordText.get('practic')).toBe('practices');
    expect(t.skill).toBe('x');
  });

  it('yields no triggers for a description with no signal', () => {
    const t = extractTriggers('x', 'Three.js shaders - GLSL, uniforms.');
    expect(t.triggers).toEqual([]);
    expect(t.triggerWords.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/triggers.test.ts
```
Expected: FAIL — `Cannot find module '../src/triggers.js'`.

- [ ] **Step 3: Create `src/triggers.ts`**

```ts
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

const DOUBLE_QUOTED = /["\u201c\u201d`]([^"\u201c\u201d`\n]{2,80})["\u201c\u201d`]/g;
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
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/triggers.test.ts
```
Expected: PASS (all). If `improv frontend interfac` differs, check `stem` order: `-ing`/`-ed`/`-s` first, then a single trailing `-e`.

- [ ] **Step 5: Commit**

```bash
git add src/triggers.ts tests/triggers.test.ts
git commit -m "feat: extract explicit and inferred triggers from skill descriptions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Pair scoring (`overlap.ts`)

**Files:**
- Create: `src/overlap.ts`, `tests/helpers.ts`
- Test: `tests/overlap.test.ts`

**Interfaces:**
- Consumes: `TriggerSet`, `Clash`, `Band`, `Thresholds`, `DEFAULT_THRESHOLDS` from `./types.js`.
- Produces:
  - `WEIGHTS = { triggers: 0.6, words: 0.4 }`
  - `overlapCoeff(a: Set<string>, b: Set<string>): number`
  - `bandFor(score: number, th: Thresholds): Band`
  - `round3(n: number): number`
  - `evidenceFor(a: TriggerSet, b: TriggerSet, max?: number): string[]`
  - `scorePair(a: TriggerSet, b: TriggerSet, th?: Thresholds): Clash`
  - `findClashes(sets: TriggerSet[], th?: Thresholds): Clash[]` — sorted by score desc, `none` band dropped

- [ ] **Step 1: Create `tests/helpers.ts`**

```ts
import type { TriggerSet } from '../src/types.js';

/** Builds a TriggerSet directly so scoring tests do not depend on extractTriggers. */
export const set = (skill: string, triggers: string[], words: string[]): TriggerSet => ({
  skill,
  triggers: triggers.map((t) => ({ text: t, norm: t, kind: 'explicit' as const })),
  triggerWords: new Set(triggers.flatMap((t) => t.split(' '))),
  words: new Set(words),
  wordText: new Map(words.map((w) => [w, w])),
});
```

- [ ] **Step 2: Write the failing tests `tests/overlap.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { overlapCoeff, bandFor, scorePair, findClashes, evidenceFor } from '../src/overlap.js';
import { set } from './helpers.js';

describe('overlapCoeff', () => {
  it('is |A∩B| / min(|A|,|B|)', () => {
    expect(overlapCoeff(new Set(['a', 'b', 'c']), new Set(['b', 'c', 'd', 'e']))).toBeCloseTo(2 / 3);
  });
  it('is 0 when either set is empty', () => {
    expect(overlapCoeff(new Set(), new Set(['a']))).toBe(0);
    expect(overlapCoeff(new Set(['a']), new Set())).toBe(0);
  });
});

describe('bandFor', () => {
  const th = { clash: 0.5, ambiguous: 0.2 };
  it('buckets by thresholds, inclusive at the bottom', () => {
    expect(bandFor(0.5, th)).toBe('clash');
    expect(bandFor(0.49, th)).toBe('ambiguous');
    expect(bandFor(0.2, th)).toBe('ambiguous');
    expect(bandFor(0.19, th)).toBe('none');
  });
});

describe('scorePair', () => {
  const wdg = set('wdg', ['review ui', 'audit design'], ['review', 'ui', 'audit', 'design', 'web']);
  const mini = set('mini', ['review ui'], ['review', 'ui', 'css']);
  const git = set('git', ['commit change'], ['git', 'commit', 'change']);

  it('scores 0.6*triggerOverlap + 0.4*wordOverlap', () => {
    const c = scorePair(wdg, mini);
    // triggers: {review,ui,audit,design} ∩ {review,ui} = 2 / min(4,2) = 1
    // words:    {review,ui} shared = 2 / min(5,3) = 0.667
    expect(c.score).toBeCloseTo(0.6 * 1 + 0.4 * (2 / 3), 3);
    expect(c.band).toBe('clash');
    expect(c.a).toBe('wdg');
    expect(c.b).toBe('mini');
  });

  it('cites the triggers that share words as evidence', () => {
    expect(scorePair(wdg, mini).evidence).toEqual(['review ui']);
  });

  it('scores unrelated skills as none', () => {
    const c = scorePair(wdg, git);
    expect(c.score).toBe(0);
    expect(c.band).toBe('none');
  });

  it('respects custom thresholds', () => {
    expect(scorePair(wdg, mini, { clash: 0.95, ambiguous: 0.9 }).band).toBe('none');
  });
});

describe('evidenceFor', () => {
  it('falls back to shared description words in original spelling', () => {
    const a = set('a', [], ['practic', 'ui']);
    a.wordText.set('practic', 'practices');
    const b = set('b', [], ['practic', 'css']);
    expect(evidenceFor(a, b)).toEqual(['practices']);
  });
  it('caps trigger evidence at max', () => {
    const a = set('a', ['x one', 'x two', 'x three'], []);
    const b = set('b', ['x four'], []);
    expect(evidenceFor(a, b, 2)).toEqual(['x one', 'x two']);
  });
});

describe('findClashes', () => {
  it('returns non-none pairs sorted by score descending', () => {
    const a = set('a', ['review ui'], ['review', 'ui']);
    const b = set('b', ['review ui'], ['review', 'ui']);
    const c = set('c', ['review layout'], ['review', 'layout', 'grid', 'spacing']);
    const d = set('d', ['commit'], ['git', 'commit']);
    const out = findClashes([d, c, b, a]);
    // (b,a) scores 1.0; (c,a) and (c,b) tie at 0.5 and sort by a then b.
    expect(out.map((x) => [x.a, x.b])).toEqual([
      ['b', 'a'],
      ['c', 'a'],
      ['c', 'b'],
    ]);
    expect(out[0].score).toBeGreaterThan(out[1].score);
    expect(out.every((x) => x.band !== 'none')).toBe(true);
  });
  it('is empty for a single skill', () => {
    expect(findClashes([set('a', ['x'], ['x'])])).toEqual([]);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

```bash
npx vitest run tests/overlap.test.ts
```
Expected: FAIL — `Cannot find module '../src/overlap.js'`.

- [ ] **Step 4: Create `src/overlap.ts`**

```ts
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
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/overlap.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/overlap.ts tests/helpers.ts tests/overlap.test.ts
git commit -m "feat: score skill pairs by trigger and description word overlap

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Prompt matching (`match.ts`)

**Files:**
- Create: `src/match.ts`
- Test: `tests/match.test.ts`

**Interfaces:**
- Consumes: `normalize` from `./triggers.js`; `WEIGHTS`, `round3` from `./overlap.js`; `MatchResult`, `TriggerSet` from `./types.js`.
- Produces: `matchPrompt(prompt: string, sets: TriggerSet[], top?: number): MatchResult[]`

- [ ] **Step 1: Write the failing tests `tests/match.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { matchPrompt } from '../src/match.js';
import { set } from './helpers.js';

describe('matchPrompt', () => {
  const wdg = set('wdg', ['review ui', 'check accessibility'], ['review', 'ui', 'check', 'accessibility']);
  const imp = set('imp', ['design', 'audit'], ['design', 'audit', 'ui', 'review', 'layout']);
  const git = set('git', ['commit change'], ['git', 'commit', 'change']);

  it('ranks skills whose triggers appear in the prompt first', () => {
    const r = matchPrompt('review my UI', [git, imp, wdg]);
    expect(r.map((x) => x.skill)).toEqual(['wdg', 'imp']);
    // wdg: 1 hit -> min(1, 1/2)=0.5*0.6 = 0.3 ; words {review,ui} both present -> 1*0.4 = 0.4
    expect(r[0].score).toBeCloseTo(0.7, 3);
    expect(r[0].matched).toEqual(['review ui']);
    // imp: no trigger hit, both words present -> 0.4
    expect(r[1].score).toBeCloseTo(0.4, 3);
    expect(r[1].matched).toEqual(['review', 'ui']);
  });

  it('drops skills that score zero', () => {
    expect(matchPrompt('review my UI', [git])).toEqual([]);
  });

  it('marks results within 0.1 of the top as competing only when there are at least two', () => {
    const a = set('a', ['review ui'], ['review', 'ui']);
    const b = set('b', ['review ui'], ['review', 'ui', 'extra']);
    const r = matchPrompt('review my ui', [a, b]);
    expect(r.map((x) => x.competes)).toEqual([true, true]);
    expect(matchPrompt('review my ui', [a]).map((x) => x.competes)).toEqual([false]);
  });

  it('caps results at top', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => set(n, ['review ui'], ['review', 'ui']));
    expect(matchPrompt('review ui', many, 5)).toHaveLength(5);
  });

  it('returns nothing for an empty or stopword-only prompt', () => {
    expect(matchPrompt('', [wdg])).toEqual([]);
    expect(matchPrompt('the and or', [wdg])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/match.test.ts
```
Expected: FAIL — `Cannot find module '../src/match.js'`.

- [ ] **Step 3: Create `src/match.ts`**

```ts
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
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/match.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/match.ts tests/match.test.ts
git commit -m "feat: rank skills competing for a given prompt

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: SKILL.md parsing (`parse.ts`)

**Files:**
- Create: `src/parse.ts`
- Test: `tests/parse.test.ts`

**Interfaces:**
- Consumes: `Skill`, `Skipped`, `Source` from `./types.js`; `gray-matter`.
- Produces:
  - `type ParseResult = { ok: true; skill: Skill } | { ok: false; skipped: Skipped }`
  - `parseSkill(path: string, source: Source): ParseResult`
  - `labelSkills(skills: Skill[]): Map<Skill, string>` — display label; `name (source)` when the name is shared

- [ ] **Step 1: Write the failing tests `tests/parse.test.ts`**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { parseSkill, labelSkills } from '../src/parse.js';
import type { Skill } from '../src/types.js';

let dir: string;
const file = (name: string, content: string): string => {
  const p = join(dir, name, 'SKILL.md');
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return p;
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'skill-clash-'));
});

describe('parseSkill', () => {
  it('reads name and description from frontmatter', () => {
    const p = file('good', '---\nname: foo\ndescription: Does foo things.\n---\n# Foo\n');
    const r = parseSkill(p, 'user');
    expect(r).toEqual({ ok: true, skill: { name: 'foo', description: 'Does foo things.', path: p, source: 'user' } });
  });

  it('falls back to the directory name when name is missing', () => {
    const p = file('dirname-fallback', '---\ndescription: Hi.\n---\n');
    const r = parseSkill(p, 'project');
    expect(r.ok && r.skill.name).toBe('dirname-fallback');
  });

  it('skips a file without frontmatter', () => {
    const p = file('nofm', '# Just markdown\n');
    expect(parseSkill(p, 'user')).toEqual({ ok: false, skipped: { path: p, reason: 'no description in frontmatter' } });
  });

  it('skips invalid YAML with a reason', () => {
    const p = file('badyaml', '---\ndescription: [unclosed\n---\n');
    const r = parseSkill(p, 'user');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.skipped.reason).toMatch(/^invalid frontmatter/);
  });

  it('tolerates a BOM and CRLF line endings', () => {
    const p = file('bom', '\ufeff---\r\nname: bom\r\ndescription: Has BOM.\r\n---\r\nbody\r\n');
    const r = parseSkill(p, 'user');
    expect(r.ok && r.skill.description).toBe('Has BOM.');
  });

  it('skips an unreadable path', () => {
    const p = join(dir, 'missing', 'SKILL.md');
    const r = parseSkill(p, 'user');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.skipped.reason).toMatch(/^unreadable/);
  });
});

describe('labelSkills', () => {
  const mk = (name: string, source: Skill['source']): Skill => ({ name, description: '', path: name, source });
  it('uses the bare name when unique and name (source) when shared', () => {
    const a = mk('review', 'user');
    const b = mk('review', 'plugin:x');
    const c = mk('commit', 'user');
    const labels = labelSkills([a, b, c]);
    expect(labels.get(a)).toBe('review (user)');
    expect(labels.get(b)).toBe('review (plugin:x)');
    expect(labels.get(c)).toBe('commit');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/parse.test.ts
```
Expected: FAIL — `Cannot find module '../src/parse.js'`.

- [ ] **Step 3: Create `src/parse.ts`**

```ts
import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import matter from 'gray-matter';
import type { Skill, Skipped, Source } from './types.js';

export type ParseResult = { ok: true; skill: Skill } | { ok: false; skipped: Skipped };

const skip = (path: string, reason: string): ParseResult => ({ ok: false, skipped: { path, reason } });

/** Never throws: anything unusable becomes a Skipped entry. */
export function parseSkill(path: string, source: Source): ParseResult {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    return skip(path, `unreadable: ${(e as Error).message}`);
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  raw = raw.replace(/\r\n/g, '\n');

  let data: Record<string, unknown>;
  try {
    data = matter(raw).data as Record<string, unknown>;
  } catch (e) {
    return skip(path, `invalid frontmatter: ${(e as Error).message.split('\n')[0]}`);
  }

  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (!description) return skip(path, 'no description in frontmatter');
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : basename(dirname(path));
  return { ok: true, skill: { name, description, path, source } };
}

/** Display labels; disambiguates shared names with their source. */
export function labelSkills(skills: Skill[]): Map<Skill, string> {
  const counts = new Map<string, number>();
  for (const s of skills) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
  return new Map(skills.map((s) => [s, (counts.get(s.name) ?? 0) > 1 ? `${s.name} (${s.source})` : s.name]));
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/parse.test.ts
```
Expected: PASS. If the "no frontmatter" test fails because gray-matter returns a non-empty `data`, it does not — `matter('# Just markdown')` yields `data: {}`.

- [ ] **Step 5: Commit**

```bash
git add src/parse.ts tests/parse.test.ts
git commit -m "feat: parse SKILL.md frontmatter into Skill or Skipped

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Discovery and fixtures (`discover.ts`)

**Files:**
- Create: `src/discover.ts`
- Create: fixture files listed in Step 1
- Test: `tests/discover.test.ts`

**Interfaces:**
- Consumes: `Source` from `./types.js`.
- Produces:
  - `interface Discovered { path: string; source: Source }`
  - `interface DiscoverOptions { home?: string; cwd?: string; plugins?: boolean }`
  - `searchRoots(opts?: DiscoverOptions): string[]` — the directories that were (or would be) searched
  - `discover(opts?: DiscoverOptions): Discovered[]`

- [ ] **Step 1: Create the fixture tree**

Create each file with exactly this content (frontmatter + one body line).

`fixtures/home/.claude/skills/impeccable/SKILL.md`:
```markdown
---
name: impeccable
description: Use when the user wants to design, redesign, shape, critique, audit, polish, clarify, distill, harden, optimize, adapt, animate, colorize, extract, or otherwise improve a frontend interface. Covers websites, landing pages, dashboards, product UI, app shells, components, forms, settings, onboarding, and empty states. Handles UX review, visual hierarchy, information architecture, cognitive load, accessibility, performance, responsive behavior, theming, anti-patterns, typography, fonts, spacing, layout, alignment, color, motion, micro-interactions, UX copy, error states, edge cases, i18n, and reusable design systems or tokens. Also use for bland designs that need to become bolder or more delightful, loud designs that should become quieter, live browser iteration on UI elements, or ambitious visual effects that should feel technically extraordinary. Not for backend-only or non-UI tasks.
---
Fixture copy of a real skill description.
```

`fixtures/home/.claude/skills/web-design-guidelines/SKILL.md`:
```markdown
---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
---
Fixture copy of a real skill description.
```

`fixtures/home/.claude/skills/accessibility-a11y/SKILL.md`:
```markdown
---
name: accessibility-a11y
description: Implement web accessibility (a11y) best practices following WCAG guidelines to create inclusive, accessible user interfaces.
---
Fixture copy of a real skill description.
```

`fixtures/home/.claude/skills/git-commit/SKILL.md`:
```markdown
---
name: git-commit
description: Execute git commit with conventional commit message analysis, intelligent staging, and message generation. Use when user asks to commit changes, create a git commit, or mentions "/commit". Supports auto-detecting type and scope from changes and generating conventional commit messages from the diff.
---
Fixture copy of a real skill description.
```

`fixtures/home/.claude/skills/no-description/SKILL.md`:
```markdown
---
name: no-description
---
This skill has no description and must be reported as skipped.
```

`fixtures/home/.claude/skills/not-a-skill/README.md`:
```markdown
Directory without SKILL.md; must be ignored.
```

`fixtures/home/.claude/plugins/marketplaces/demo/plugins/charts/skills/dataviz/SKILL.md`:
```markdown
---
name: dataviz
description: Use when the user asks to "make a chart", "plot data", or "build a dashboard".
---
Fixture plugin skill.
```

`fixtures/project/.claude/skills/threejs-shaders/SKILL.md`:
```markdown
---
name: threejs-shaders
description: Three.js shaders - GLSL, ShaderMaterial, uniforms, custom effects. Use when creating custom visual effects, modifying vertices, writing fragment shaders, or extending built-in materials.
---
Fixture copy of a real skill description.
```

- [ ] **Step 2: Write the failing tests `tests/discover.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { discover, searchRoots } from '../src/discover.js';

const home = resolve('fixtures/home');
const cwd = resolve('fixtures/project');
const norm = (p: string) => p.replace(/\\/g, '/');

describe('discover', () => {
  it('finds user, project and plugin skills with sources', () => {
    const found = discover({ home, cwd }).map((d) => ({ ...d, path: norm(d.path) }));
    expect(found).toEqual([
      { path: `${norm(home)}/.claude/skills/accessibility-a11y/SKILL.md`, source: 'user' },
      { path: `${norm(home)}/.claude/skills/git-commit/SKILL.md`, source: 'user' },
      { path: `${norm(home)}/.claude/skills/impeccable/SKILL.md`, source: 'user' },
      { path: `${norm(home)}/.claude/skills/no-description/SKILL.md`, source: 'user' },
      { path: `${norm(home)}/.claude/skills/web-design-guidelines/SKILL.md`, source: 'user' },
      { path: `${norm(cwd)}/.claude/skills/threejs-shaders/SKILL.md`, source: 'project' },
      { path: `${norm(home)}/.claude/plugins/marketplaces/demo/plugins/charts/skills/dataviz/SKILL.md`, source: 'plugin:charts' },
    ]);
  });

  it('skips plugins when plugins is false', () => {
    expect(discover({ home, cwd, plugins: false }).some((d) => d.source.startsWith('plugin:'))).toBe(false);
  });

  it('returns nothing for a missing home and cwd', () => {
    expect(discover({ home: resolve('fixtures/nope'), cwd: resolve('fixtures/nope') })).toEqual([]);
  });

  it('reports the roots it searches', () => {
    expect(searchRoots({ home, cwd }).map(norm)).toEqual([
      `${norm(home)}/.claude/skills`,
      `${norm(cwd)}/.claude/skills`,
      `${norm(home)}/.claude/plugins`,
    ]);
    expect(searchRoots({ home, cwd, plugins: false })).toHaveLength(2);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

```bash
npx vitest run tests/discover.test.ts
```
Expected: FAIL — `Cannot find module '../src/discover.js'`.

- [ ] **Step 4: Create `src/discover.ts`**

```ts
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { Source } from './types.js';

export interface Discovered {
  path: string;
  source: Source;
}

export interface DiscoverOptions {
  home?: string;
  cwd?: string;
  /** Default true. */
  plugins?: boolean;
}

export function searchRoots(opts: DiscoverOptions = {}): string[] {
  const home = opts.home ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const roots = [join(home, '.claude', 'skills'), join(cwd, '.claude', 'skills')];
  if (opts.plugins !== false) roots.push(join(home, '.claude', 'plugins'));
  return roots;
}

export function discover(opts: DiscoverOptions = {}): Discovered[] {
  const [userRoot, projectRoot, pluginRoot] = searchRoots(opts);
  const out: Discovered[] = [];
  for (const p of skillFiles(userRoot)) out.push({ path: p, source: 'user' });
  for (const p of skillFiles(projectRoot)) out.push({ path: p, source: 'project' });
  if (pluginRoot) out.push(...pluginSkills(pluginRoot));
  return out;
}

/** `<dir>/<name>/SKILL.md` for every subdirectory that has one. */
function skillFiles(dir: string): string[] {
  return subdirs(dir)
    .map((d) => join(dir, d, 'SKILL.md'))
    .filter(isFile);
}

/**
 * Walks the plugins tree. Any `<plugin>/skills/<name>/SKILL.md` is tagged plugin:<plugin>.
 * Real layout: plugins/marketplaces/<market>/(plugins|external_plugins)/<plugin>/skills/<name>/SKILL.md
 */
function pluginSkills(root: string, maxDepth = 8): Discovered[] {
  const out: Discovered[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    for (const sub of subdirs(dir)) {
      if (sub === 'node_modules' || sub.startsWith('.')) continue;
      const full = join(dir, sub);
      if (sub === 'skills') {
        const plugin = basename(dir);
        for (const f of skillFiles(full)) out.push({ path: f, source: `plugin:${plugin}` });
      } else {
        walk(full, depth + 1);
      }
    }
  };
  walk(root, 0);
  return out;
}

function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run tests/discover.test.ts
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/discover.ts tests/discover.test.ts fixtures
git commit -m "feat: discover SKILL.md files in user, project and plugin roots

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Terminal and JSON reports (`report.ts`)

**Files:**
- Create: `src/report.ts`
- Test: `tests/report.test.ts`

**Interfaces:**
- Consumes: `Clash`, `MatchResult`, `Skipped` from `./types.js`; `picocolors`.
- Produces:
  - `interface ScanReport { scanned: number; clashes: Clash[]; skipped: Skipped[]; untriggered: string[]; warnings: string[] }`
  - `interface MatchReport { prompt: string; scanned: number; results: MatchResult[]; skipped: Skipped[]; warnings: string[] }`
  - `renderScan(r: ScanReport): string`
  - `renderMatch(r: MatchReport): string`
  - `renderJson(r: ScanReport | MatchReport): string` — `{ version: 1, ...r }` pretty-printed

- [ ] **Step 1: Write the failing tests `tests/report.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { renderScan, renderMatch, renderJson, type ScanReport, type MatchReport } from '../src/report.js';

const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

const scan: ScanReport = {
  scanned: 4,
  clashes: [
    { a: 'impeccable', b: 'web-design-guidelines', score: 0.61, band: 'clash', evidence: ['audit design', 'review my UI'] },
    { a: 'a11y', b: 'web-design-guidelines', score: 0.28, band: 'ambiguous', evidence: ['accessibility'], verdict: 'distinct', reason: 'one implements, one reviews' },
  ],
  skipped: [{ path: 'C:/x/SKILL.md', reason: 'no description in frontmatter' }],
  untriggered: ['threejs-shaders'],
  warnings: ['--deep: batch 1 failed (boom)'],
};

describe('renderScan', () => {
  const out = strip(renderScan(scan));
  it('summarises counts', () => {
    expect(out).toContain('4 skills scanned');
    expect(out).toContain('1 clash,');
    expect(out).toContain('1 ambiguous');
  });
  it('lists pairs with band, score, evidence and verdict', () => {
    expect(out).toContain('CLASH  0.61  impeccable <-> web-design-guidelines');
    expect(out).toContain('"audit design" . "review my UI"');
    expect(out).toContain('AMBIG  0.28  a11y <-> web-design-guidelines');
    expect(out).toContain('deep: distinct - one implements, one reviews');
  });
  it('lists untriggered, skipped and warnings', () => {
    expect(out).toContain('No detectable triggers (1): threejs-shaders');
    expect(out).toContain('Skipped (1):');
    expect(out).toContain('C:/x/SKILL.md - no description in frontmatter');
    expect(out).toContain('warning: --deep: batch 1 failed (boom)');
  });
  it('says so when nothing overlaps', () => {
    expect(strip(renderScan({ ...scan, clashes: [] }))).toContain('No overlapping skills found.');
  });
  it('is ASCII only', () => {
    expect(/[^\x00-\x7f]/.test(out)).toBe(false);
  });
});

describe('renderMatch', () => {
  const match: MatchReport = {
    prompt: 'review my UI',
    scanned: 4,
    results: [
      { skill: 'web-design-guidelines', score: 0.7, matched: ['review my UI'], competes: true },
      { skill: 'impeccable', score: 0.65, matched: ['review', 'UI'], competes: true },
    ],
    skipped: [],
    warnings: [],
  };
  const out = strip(renderMatch(match));
  it('shows the prompt and a ranked list', () => {
    expect(out).toContain('prompt: "review my UI"');
    expect(out).toContain('1. 0.70  web-design-guidelines (competes)');
    expect(out).toContain('2. 0.65  impeccable (competes)');
    expect(out).toContain('"review my UI"');
  });
  it('says so when nothing matches', () => {
    expect(strip(renderMatch({ ...match, results: [] }))).toContain('No skill claims this prompt.');
  });
});

describe('renderJson', () => {
  it('round-trips with a version field', () => {
    const parsed = JSON.parse(renderJson(scan));
    expect(parsed.version).toBe(1);
    expect(parsed.clashes).toHaveLength(2);
    expect(parsed.untriggered).toEqual(['threejs-shaders']);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/report.test.ts
```
Expected: FAIL — `Cannot find module '../src/report.js'`.

- [ ] **Step 3: Create `src/report.ts`**

```ts
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
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/report.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/report.ts tests/report.test.ts
git commit -m "feat: render scan and match reports for terminal and JSON

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: HTML report (`html.ts`)

**Files:**
- Create: `src/html.ts`
- Test: `tests/html.test.ts`

**Interfaces:**
- Consumes: `ScanReport` from `./report.js`; `Clash` from `./types.js`.
- Produces: `renderHtml(r: ScanReport): string` — a complete standalone HTML document.

- [ ] **Step 1: Write the failing tests `tests/html.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { renderHtml } from '../src/html.js';
import type { ScanReport } from '../src/report.js';

const scan: ScanReport = {
  scanned: 3,
  clashes: [
    { a: 'impeccable', b: 'web-design-guidelines', score: 0.61, band: 'clash', evidence: ['audit design'] },
    { a: 'a11y', b: 'web-design-guidelines', score: 0.28, band: 'ambiguous', evidence: ['<b>accessibility</b>'], verdict: 'distinct', reason: 'r' },
  ],
  skipped: [{ path: 'x', reason: 'no description in frontmatter' }],
  untriggered: [],
  warnings: [],
};

describe('renderHtml', () => {
  const html = renderHtml(scan);
  it('is a standalone document', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<script src|<link /);
  });
  it('has a matrix over every skill involved in a pair', () => {
    expect(html).toContain('<table');
    expect(html).toContain('1. a11y');
    expect(html).toContain('2. impeccable');
    expect(html).toContain('3. web-design-guidelines');
    expect(html).toContain('class="clash"');
    expect(html).toContain('class="ambiguous"');
  });
  it('lists pairs with evidence and verdicts', () => {
    expect(html).toContain('<code>audit design</code>');
    expect(html).toContain('deep: distinct');
  });
  it('escapes HTML in evidence', () => {
    expect(html).toContain('&lt;b&gt;accessibility&lt;/b&gt;');
    expect(html).not.toContain('<b>accessibility</b>');
  });
  it('handles an empty report', () => {
    expect(renderHtml({ ...scan, clashes: [] })).toContain('No overlapping skills found.');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/html.test.ts
```
Expected: FAIL — `Cannot find module '../src/html.js'`.

- [ ] **Step 3: Create `src/html.ts`**

```ts
import type { ScanReport } from './report.js';
import type { Clash } from './types.js';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const CSS = `
:root{color-scheme:light dark;--bg:#fff;--fg:#1a1a1a;--muted:#6b7280;--line:#e5e7eb;--clash:#fecaca;--clash-fg:#991b1b;--amb:#fde68a;--amb-fg:#92400e;--ok:#bbf7d0}
@media(prefers-color-scheme:dark){:root{--bg:#111318;--fg:#e5e7eb;--muted:#9ca3af;--line:#2a2f3a;--clash:#7f1d1d;--clash-fg:#fecaca;--amb:#78350f;--amb-fg:#fde68a;--ok:#14532d}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;max-width:1100px;margin-inline:auto}
h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);margin:0 0 24px}
.wrap{overflow-x:auto}table{border-collapse:collapse;font-size:13px}th,td{border:1px solid var(--line);padding:4px 8px;text-align:center;min-width:34px}
th{text-align:left;white-space:nowrap}thead th{text-align:center}td.self{background:var(--line)}
td.clash{background:var(--clash);color:var(--clash-fg);font-weight:600}td.ambiguous{background:var(--amb);color:var(--amb-fg)}
ul{list-style:none;padding:0}li{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin:8px 0}
.badge{font-size:11px;font-weight:700;letter-spacing:.04em;padding:2px 6px;border-radius:4px;margin-right:6px}
li.clash .badge{background:var(--clash);color:var(--clash-fg)}li.ambiguous .badge{background:var(--amb);color:var(--amb-fg)}
.score{color:var(--muted);margin-left:6px}.ev{margin-top:6px}code{background:var(--line);padding:1px 5px;border-radius:4px;font-size:12px}
.deep{margin-top:4px;font-size:13px}.deep.clash{color:var(--clash-fg)}.deep.distinct{color:#166534}
.empty{background:var(--ok);padding:12px;border-radius:8px}.muted{color:var(--muted);font-size:13px}
`;

export function renderHtml(r: ScanReport): string {
  const names = [...new Set(r.clashes.flatMap((c) => [c.a, c.b]))].sort((x, y) => x.localeCompare(y));
  const idx = new Map(names.map((n, i) => [n, i + 1]));
  const cells = new Map<string, Clash>();
  for (const c of r.clashes) {
    cells.set(`${c.a}|${c.b}`, c);
    cells.set(`${c.b}|${c.a}`, c);
  }
  const nClash = r.clashes.filter((c) => c.band === 'clash').length;

  const matrix =
    names.length === 0
      ? '<p class="empty">No overlapping skills found.</p>'
      : `<div class="wrap"><table>
<thead><tr><th></th>${names.map((n) => `<th title="${esc(n)}">${idx.get(n)}</th>`).join('')}</tr></thead>
<tbody>
${names
  .map(
    (a) =>
      `<tr><th>${idx.get(a)}. ${esc(a)}</th>${names
        .map((b) => {
          if (a === b) return '<td class="self"></td>';
          const c = cells.get(`${a}|${b}`);
          return c ? `<td class="${c.band}" title="${esc(c.evidence.join(' | '))}">${c.score.toFixed(2)}</td>` : '<td></td>';
        })
        .join('')}</tr>`,
  )
  .join('\n')}
</tbody></table></div>`;

  const list = r.clashes
    .map(
      (c) =>
        `<li class="${c.band}"><span class="badge">${c.band === 'clash' ? 'CLASH' : 'AMBIGUOUS'}</span><b>${esc(c.a)}</b> &harr; <b>${esc(c.b)}</b><span class="score">${c.score.toFixed(2)}</span>` +
        (c.evidence.length ? `<div class="ev">${c.evidence.map((e) => `<code>${esc(e)}</code>`).join(' ')}</div>` : '') +
        (c.verdict ? `<div class="deep ${c.verdict}">deep: ${c.verdict}${c.reason ? ` &mdash; ${esc(c.reason)}` : ''}</div>` : '') +
        '</li>',
    )
    .join('\n');

  const skipped = r.skipped.length
    ? `<p class="muted">Skipped ${r.skipped.length}: ${r.skipped.map((s) => `${esc(s.path)} (${esc(s.reason)})`).join('; ')}</p>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>skill-clash report</title><style>${CSS}</style></head>
<body>
<h1>skill-clash</h1>
<p class="sub">${r.scanned} skills scanned &middot; ${nClash} clash${nClash === 1 ? '' : 'es'} &middot; ${r.clashes.length - nClash} ambiguous</p>
${matrix}
<ul>
${list}
</ul>
${skipped}
</body></html>
`;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/html.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/html.ts tests/html.test.ts
git commit -m "feat: render standalone HTML collision report

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Pipeline and CLI (`pipeline.ts`, `cli.ts`)

**Files:**
- Create: `src/pipeline.ts`, `src/cli.ts`
- Test: `tests/pipeline.test.ts`, `tests/cli.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–8.
- Produces:
  - `interface RunOptions { home?: string; cwd?: string; plugins?: boolean; prompt?: string; deep?: boolean; json?: boolean; html?: string; strict?: boolean; thresholds?: Thresholds; runClaude?: RunClaude }`
  - `interface RunIO { out(line: string): void; err(line: string): void; writeFile(path: string, content: string): void }`
  - `run(opts: RunOptions, io: RunIO): Promise<number>` — returns the exit code
  - `loadSkills(opts: RunOptions): { skills: Skill[]; skipped: Skipped[] }`

`--deep` is wired here but `deep.ts` is written in Task 10. To keep this task green on its own, this task creates a **stub** `src/deep.ts` that Task 10 replaces:

- [ ] **Step 1: Create the stub `src/deep.ts`**

```ts
import type { Clash, Skill } from './types.js';

export type RunClaude = (prompt: string) => Promise<string>;

/** Stub — replaced in Task 10. */
export async function deepen(
  clashes: Clash[],
  _skills: Map<string, Skill>,
  _run: RunClaude,
  _warn: (msg: string) => void,
): Promise<Clash[]> {
  return clashes;
}

/** Stub — replaced in Task 10. */
export const runClaudeCli: RunClaude = async () => {
  throw new Error('not implemented');
};
```

- [ ] **Step 2: Write the failing tests `tests/pipeline.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { run, loadSkills, type RunIO } from '../src/pipeline.js';

const home = resolve('fixtures/home');
const cwd = resolve('fixtures/project');
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

function io() {
  const out: string[] = [];
  const err: string[] = [];
  const files = new Map<string, string>();
  const rio: RunIO = {
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    writeFile: (p, c) => files.set(p, c),
  };
  return { rio, out, err, files, text: () => strip(out.join('\n')) };
}

describe('loadSkills', () => {
  it('parses every discovered skill and collects skipped ones', () => {
    const { skills, skipped } = loadSkills({ home, cwd });
    expect(skills.map((s) => s.name).sort()).toEqual([
      'accessibility-a11y', 'dataviz', 'git-commit', 'impeccable', 'threejs-shaders', 'web-design-guidelines',
    ]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toBe('no description in frontmatter');
  });
});

describe('run (scan)', () => {
  it('exits 1 and lists the UI clash when thresholds are low', async () => {
    const t = io();
    const code = await run({ home, cwd, thresholds: { clash: 0.2, ambiguous: 0.1 } }, t.rio);
    expect(code).toBe(1);
    expect(t.text()).toMatch(/(CLASH|AMBIG) .*(impeccable <-> web-design-guidelines|web-design-guidelines <-> impeccable)/);
    expect(t.text()).toContain('Skipped (1):');
  });

  it('exits 0 when nothing reaches the clash band', async () => {
    const t = io();
    const code = await run({ home, cwd, thresholds: { clash: 0.99, ambiguous: 0.98 } }, t.rio);
    expect(code).toBe(0);
    expect(t.text()).toContain('No overlapping skills found.');
  });

  it('--strict fails on ambiguous pairs', async () => {
    const t = io();
    const code = await run({ home, cwd, strict: true, thresholds: { clash: 0.99, ambiguous: 0.1 } }, t.rio);
    expect(code).toBe(1);
  });

  it('never pairs a skill with itself and never reports git-commit vs threejs-shaders', async () => {
    const t = io();
    await run({ home, cwd, json: true, thresholds: { clash: 0.2, ambiguous: 0.05 } }, t.rio);
    const parsed = JSON.parse(t.out.join('\n'));
    for (const c of parsed.clashes) {
      expect(c.a).not.toBe(c.b);
      expect([c.a, c.b].sort()).not.toEqual(['git-commit', 'threejs-shaders']);
    }
  });

  it('--json prints only JSON and --html writes a file', async () => {
    const t = io();
    await run({ home, cwd, json: true, html: 'out.html' }, t.rio);
    expect(() => JSON.parse(t.out.join('\n'))).not.toThrow();
    expect(t.files.get('out.html')).toContain('<!doctype html>');
    expect(t.err.join('\n')).toContain('HTML report written to out.html');
  });

  it('reports the search roots when nothing is found', async () => {
    const t = io();
    const code = await run({ home: resolve('fixtures/nope'), cwd: resolve('fixtures/nope') }, t.rio);
    expect(code).toBe(0);
    expect(t.text()).toMatch(/^no skills found in: /);
  });
});

describe('run (--prompt)', () => {
  it('ranks web-design-guidelines and impeccable in the top 3 for "review my UI"', async () => {
    const t = io();
    const code = await run({ home, cwd, prompt: 'review my UI', json: true }, t.rio);
    expect(code).toBe(0);
    const parsed = JSON.parse(t.out.join('\n'));
    const top3 = parsed.results.slice(0, 3).map((r: { skill: string }) => r.skill);
    expect(top3).toContain('web-design-guidelines');
    expect(top3).toContain('impeccable');
  });

  it('renders a ranked list in terminal mode', async () => {
    const t = io();
    await run({ home, cwd, prompt: 'review my UI' }, t.rio);
    expect(t.text()).toContain('prompt: "review my UI"');
    expect(t.text()).toMatch(/1\. \d\.\d\d  /);
  });
});
```

- [ ] **Step 3: Write the failing tests `tests/cli.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const home = resolve('fixtures/home');
const cwd = resolve('fixtures/project');

function cli(...args: string[]) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe('cli', () => {
  it('--help exits 0', () => {
    const r = cli('--help');
    expect(r.code).toBe(0);
    expect(r.out).toContain('--prompt');
    expect(r.out).toContain('--deep');
  });

  it('--version exits 0', () => {
    expect(cli('--version').code).toBe(0);
  });

  it('unknown option exits 2', () => {
    expect(cli('--bogus').code).toBe(2);
  });

  it('empty --prompt exits 2', () => {
    const r = cli('--prompt', '');
    expect(r.code).toBe(2);
    expect(r.err).toContain('--prompt must not be empty');
  });

  it('ambiguous >= clash exits 2', () => {
    const r = cli('--home', home, '--cwd', cwd, '--clash', '0.4', '--ambiguous', '0.5');
    expect(r.code).toBe(2);
    expect(r.err).toContain('--ambiguous must be lower than --clash');
  });

  it('threshold outside 0..1 exits 2', () => {
    expect(cli('--clash', '7').code).toBe(2);
  });

  it('scans fixtures and exits 1 with low thresholds', () => {
    const r = cli('--home', home, '--cwd', cwd, '--clash', '0.2', '--ambiguous', '0.1');
    expect(r.code).toBe(1);
    expect(r.out).toContain('skills scanned');
  });

  it('--json is parseable', () => {
    const r = cli('--home', home, '--cwd', cwd, '--json');
    expect(() => JSON.parse(r.out)).not.toThrow();
  });
});
```

- [ ] **Step 4: Run to verify they fail**

```bash
npx vitest run tests/pipeline.test.ts tests/cli.test.ts
```
Expected: FAIL — `Cannot find module '../src/pipeline.js'` and CLI spawn failures.

- [ ] **Step 5: Create `src/pipeline.ts`**

```ts
import { discover, searchRoots } from './discover.js';
import { parseSkill, labelSkills } from './parse.js';
import { extractTriggers } from './triggers.js';
import { findClashes } from './overlap.js';
import { matchPrompt } from './match.js';
import { deepen, runClaudeCli, type RunClaude } from './deep.js';
import { renderScan, renderMatch, renderJson, type ScanReport, type MatchReport } from './report.js';
import { renderHtml } from './html.js';
import { DEFAULT_THRESHOLDS, type Skill, type Skipped, type Thresholds, type TriggerSet } from './types.js';

export interface RunOptions {
  home?: string;
  cwd?: string;
  plugins?: boolean;
  prompt?: string;
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
```

- [ ] **Step 6: Create `src/cli.ts`**

```ts
#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Command, CommanderError, InvalidArgumentError } from 'commander';
import { run } from './pipeline.js';
import { DEFAULT_THRESHOLDS } from './types.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const unit = (v: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new InvalidArgumentError('must be a number between 0 and 1');
  return n;
};

const program = new Command()
  .name('skill-clash')
  .description('Find Claude Code skills that fight over the same prompts.')
  .version(version)
  .option('-p, --prompt <text>', 'show which skills compete for this prompt')
  .option('--deep', 'ask your local claude to judge ambiguous pairs', false)
  .option('--json', 'machine-readable output', false)
  .option('--html <file>', 'also write a standalone HTML report')
  .option('--strict', 'exit 1 on ambiguous pairs too', false)
  .option('--clash <n>', `clash threshold (default ${DEFAULT_THRESHOLDS.clash})`, unit)
  .option('--ambiguous <n>', `ambiguous threshold (default ${DEFAULT_THRESHOLDS.ambiguous})`, unit)
  .option('--no-plugins', 'skip skills shipped by plugins')
  .option('--home <dir>', 'home directory to scan (default: your user profile)')
  .option('--cwd <dir>', 'project directory to scan (default: current directory)')
  .option('--verbose', 'print stack traces on unexpected errors', false)
  .exitOverride();

interface Opts {
  prompt?: string;
  deep: boolean;
  json: boolean;
  html?: string;
  strict: boolean;
  clash?: number;
  ambiguous?: number;
  plugins: boolean;
  home?: string;
  cwd?: string;
  verbose: boolean;
}

async function main(): Promise<number> {
  let opts: Opts;
  try {
    program.parse(process.argv);
    opts = program.opts<Opts>();
  } catch (e) {
    const code = (e as CommanderError).code;
    return code === 'commander.helpDisplayed' || code === 'commander.version' ? 0 : 2;
  }

  if (opts.prompt !== undefined && opts.prompt.trim() === '') {
    process.stderr.write('error: --prompt must not be empty\n');
    return 2;
  }
  const thresholds = {
    clash: opts.clash ?? DEFAULT_THRESHOLDS.clash,
    ambiguous: opts.ambiguous ?? DEFAULT_THRESHOLDS.ambiguous,
  };
  if (thresholds.ambiguous >= thresholds.clash) {
    process.stderr.write('error: --ambiguous must be lower than --clash\n');
    return 2;
  }

  try {
    return await run(
      {
        home: opts.home,
        cwd: opts.cwd,
        plugins: opts.plugins,
        prompt: opts.prompt,
        deep: opts.deep,
        json: opts.json,
        html: opts.html,
        strict: opts.strict,
        thresholds,
      },
      {
        out: (l) => process.stdout.write(l + '\n'),
        err: (l) => process.stderr.write(l + '\n'),
        writeFile: (p, c) => writeFileSync(p, c),
      },
    );
  } catch (e) {
    const err = e as Error;
    process.stderr.write(`error: ${err.message}\n`);
    process.stderr.write(opts.verbose ? `${err.stack ?? ''}\n` : 'rerun with --verbose for details\n');
    return 2;
  }
}

main().then((code) => process.exit(code));
```

- [ ] **Step 7: Run all tests and typecheck**

```bash
npx vitest run
```
Expected: PASS across all files. If `tests/cli.test.ts` fails with "Cannot find package 'tsx'", confirm `tsx` is in `devDependencies` (Task 1 Step 2) and the Node version is ≥ 20.6 (`node --version`).

```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 8: Smoke-test against the real machine**

```bash
npm run dev -- --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);console.log(r.scanned,'skills',r.clashes.length,'pairs',r.skipped.length,'skipped')})"
```
Expected: a line like `72 skills 9 pairs 0 skipped` — numbers will vary; the point is it runs to completion on real data with no crash.

- [ ] **Step 9: Commit**

```bash
git add src/pipeline.ts src/cli.ts src/deep.ts tests/pipeline.test.ts tests/cli.test.ts
git commit -m "feat: wire pipeline and commander CLI with exit codes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Deep verdicts via `claude -p` (`deep.ts`)

**Files:**
- Modify: `src/deep.ts` (replace the Task 9 stub entirely)
- Test: `tests/deep.test.ts`; add one case to `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: `Clash`, `Skill` from `./types.js`.
- Produces:
  - `type RunClaude = (prompt: string) => Promise<string>` (unchanged)
  - `interface Verdict { pair: string; verdict: 'clash' | 'distinct'; reason: string }`
  - `BATCH_SIZE = 20`
  - `pairKey(c: Clash): string` — `` `${c.a} <> ${c.b}` ``
  - `buildPrompt(clashes: Clash[], byLabel: Map<string, Skill>): string`
  - `parseVerdicts(raw: string): Verdict[]` — throws on garbage
  - `deepen(clashes, byLabel, run, warn): Promise<Clash[]>` (same signature as the stub)
  - `runClaudeCli: RunClaude` — spawns `claude -p --output-format json`, prompt on stdin, 60 s timeout

- [ ] **Step 1: Write the failing tests `tests/deep.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { buildPrompt, parseVerdicts, deepen, pairKey, BATCH_SIZE } from '../src/deep.js';
import type { Clash, Skill } from '../src/types.js';

const skill = (name: string, description: string): Skill => ({ name, description, path: name, source: 'user' });
const byLabel = new Map<string, Skill>([
  ['a', skill('a', 'Reviews UI.')],
  ['b', skill('b', 'Audits design.')],
  ['c', skill('c', 'Commits code.')],
]);
const clash = (a: string, b: string, band: Clash['band']): Clash => ({ a, b, score: 0.3, band, evidence: [] });

describe('buildPrompt', () => {
  it('includes pair keys, names and descriptions and asks for a JSON array', () => {
    const p = buildPrompt([clash('a', 'b', 'ambiguous')], byLabel);
    expect(p).toContain('"pair":"a <> b"');
    expect(p).toContain('Reviews UI.');
    expect(p).toContain('Audits design.');
    expect(p).toMatch(/JSON array/);
  });
});

describe('parseVerdicts', () => {
  it('reads a bare JSON array', () => {
    expect(parseVerdicts('[{"pair":"a <> b","verdict":"clash","reason":"same job"}]')).toEqual([
      { pair: 'a <> b', verdict: 'clash', reason: 'same job' },
    ]);
  });
  it('unwraps the claude -p json envelope', () => {
    const env = JSON.stringify({ type: 'result', result: 'Sure:\n```json\n[{"pair":"a <> b","verdict":"distinct"}]\n```' });
    expect(parseVerdicts(env)).toEqual([{ pair: 'a <> b', verdict: 'distinct', reason: '' }]);
  });
  it('drops malformed entries', () => {
    expect(parseVerdicts('[{"pair":"x","verdict":"maybe"},{"verdict":"clash"},{"pair":"a <> b","verdict":"clash"}]')).toEqual([
      { pair: 'a <> b', verdict: 'clash', reason: '' },
    ]);
  });
  it('throws when there is no array', () => {
    expect(() => parseVerdicts('I cannot help with that.')).toThrow(/no JSON array/);
  });
});

describe('deepen', () => {
  it('sends only ambiguous pairs and merges verdicts back', async () => {
    const run = vi.fn(async () => '[{"pair":"a <> b","verdict":"clash","reason":"same job"}]');
    const warn = vi.fn();
    const out = await deepen([clash('a', 'b', 'ambiguous'), clash('a', 'c', 'clash')], byLabel, run, warn);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).not.toContain('Commits code.');
    expect(out[0]).toMatchObject({ verdict: 'clash', reason: 'same job', band: 'ambiguous' });
    expect(out[1].verdict).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips the call when nothing is ambiguous', async () => {
    const run = vi.fn(async () => '[]');
    await deepen([clash('a', 'c', 'clash')], byLabel, run, vi.fn());
    expect(run).not.toHaveBeenCalled();
  });

  it('batches at BATCH_SIZE', async () => {
    const many = Array.from({ length: BATCH_SIZE + 5 }, (_, i) => clash(`s${i}`, `t${i}`, 'ambiguous'));
    const run = vi.fn(async () => '[]');
    await deepen(many, byLabel, run, vi.fn());
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('warns and keeps heuristic bands when claude fails', async () => {
    const run = vi.fn(async () => {
      throw new Error('could not run claude: ENOENT');
    });
    const warn = vi.fn();
    const out = await deepen([clash('a', 'b', 'ambiguous')], byLabel, run, warn);
    expect(out[0].verdict).toBeUndefined();
    expect(out[0].band).toBe('ambiguous');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not run claude'));
  });

  it('pairKey is stable', () => {
    expect(pairKey(clash('a', 'b', 'clash'))).toBe('a <> b');
  });
});
```

Append to `tests/pipeline.test.ts`:

```ts
describe('run (--deep)', () => {
  it('passes verdicts through to the report and never changes the exit code on failure', async () => {
    const t = io();
    const runClaude = async () => '[]';
    const code = await run({ home, cwd, deep: true, runClaude, thresholds: { clash: 0.99, ambiguous: 0.1 } }, t.rio);
    expect(code).toBe(0);
    const t2 = io();
    const broken = async () => {
      throw new Error('boom');
    };
    const code2 = await run({ home, cwd, deep: true, runClaude: broken, thresholds: { clash: 0.99, ambiguous: 0.1 } }, t2.rio);
    expect(code2).toBe(0);
    expect(t2.text()).toContain('warning: --deep');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/deep.test.ts tests/pipeline.test.ts
```
Expected: FAIL — `buildPrompt` etc. are not exported by the stub; the pipeline `--deep` warning case fails.

- [ ] **Step 3: Replace `src/deep.ts`**

```ts
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
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```
Expected: PASS.

- [ ] **Step 5: Manual smoke test of the real `claude` path**

```bash
npm run dev -- --deep --ambiguous 0.1 --clash 0.9
```
Expected: the report shows `deep: clash` / `deep: distinct` lines under AMBIG pairs, no `warning: --deep` line. Takes 10–40 s. If it prints a warning, run with `--verbose` and read the message; the usual cause is `claude` not on PATH or a nested-session guard — this is a soft-fail by design, not a blocker for the commit.

Then confirm the soft-fail path from a shell where `claude` is absent:

```bash
PATH=/nonexistent node --import tsx src/cli.ts --deep --home fixtures/home --cwd fixtures/project --ambiguous 0.1 --clash 0.9
```
Expected: normal report plus one `warning: --deep: batch 1 failed (...)` line; exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/deep.ts tests/deep.test.ts tests/pipeline.test.ts
git commit -m "feat: --deep asks the local claude CLI to judge ambiguous pairs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Calibrate thresholds against the real skill set

The defaults (`0.45` / `0.15`) are estimates. This task checks them against the author's ~70 real skills and adjusts **only** `DEFAULT_THRESHOLDS` in `src/types.ts` and, if that is not enough, `WEIGHTS` in `src/overlap.ts`.

**Files:**
- Modify: `src/types.ts` (thresholds) — possibly `src/overlap.ts` (weights)
- Modify: `tests/pipeline.test.ts` (one new test pins the outcome)

- [ ] **Step 1: Dump real scores**

```bash
npm run dev -- --json --ambiguous 0.01 --clash 0.99 > calib.json
```

```bash
node -e "const r=require('./calib.json');for(const c of r.clashes.slice(0,40))console.log(c.score.toFixed(2),c.a,'<->',c.b,'|',c.evidence.slice(0,3).join(' . '))"
```
Expected: a ranked list of ~40 real pairs with scores. Read it.

- [ ] **Step 2: Judge the list against these acceptance rules**

1. `impeccable <-> web-design-guidelines` must be `ambiguous` or `clash` at the defaults.
2. `web-design-guidelines <-> accessibility-a11y` must be at least `ambiguous`.
3. `git-commit <-> threejs-shaders` (and any equally unrelated pair you spot) must be `none`.
4. At the defaults, the `clash` band should contain no pair you would call obviously unrelated. If it does, raise `clash`.
5. At the defaults, the total number of reported pairs (clash + ambiguous) should be small enough to read in one screen — roughly ≤ 25 for ~70 skills. If it is far larger, raise `ambiguous`.

Pick the smallest change to `DEFAULT_THRESHOLDS` that satisfies 1–5. Change `WEIGHTS` only if no threshold pair can satisfy both rule 1 and rule 4.

- [ ] **Step 3: Pin the outcome with a fixture-level test**

Append to `tests/pipeline.test.ts` (uses the defaults, no threshold override):

```ts
describe('default thresholds (calibrated in plan Task 11)', () => {
  it('flag the UI pairs and stay silent on unrelated ones', async () => {
    const t = io();
    await run({ home, cwd, json: true }, t.rio);
    const parsed = JSON.parse(t.out.join('\n'));
    const key = (c: { a: string; b: string }) => [c.a, c.b].sort().join('|');
    const keys = parsed.clashes.map(key);
    expect(keys).toContain('impeccable|web-design-guidelines');
    expect(keys).toContain('accessibility-a11y|web-design-guidelines');
    expect(keys).not.toContain('git-commit|threejs-shaders');
  });
});
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```
Expected: PASS. If the new test fails, the thresholds chosen in Step 2 do not hold on the fixture subset — revisit Step 2; do not weaken the test.

- [ ] **Step 5: Verify the definition of done items 1–3**

```bash
npm run dev
```
Expected: the terminal report lists `impeccable <-> web-design-guidelines` with evidence that includes at least one of `audit`, `design`, `review`.

```bash
npm run dev -- --prompt "review my UI"
```
Expected: `web-design-guidelines` and `impeccable` both in the top 3.

```bash
npm run dev -- --html report.html
```
Open `report.html` in a browser. Expected: a colored matrix plus the pair list. It should look like something you would screenshot for a README.

- [ ] **Step 6: Commit**

```bash
rm calib.json
git add src/types.ts src/overlap.ts tests/pipeline.test.ts
git commit -m "feat: calibrate default thresholds against a real skill set

Chosen: clash=<value> ambiguous=<value>. <one line on why>

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
(Replace `<value>` and the reason line with what Step 2 decided.)

---

### Task 12: README, build, publish

**Files:**
- Create: `README.md`
- Verify: `dist/cli.js` builds and runs

- [ ] **Step 1: Build and run the built binary**

```bash
npm run build
```
Expected: `dist/cli.js` created; the file starts with `#!/usr/bin/env node`.

```bash
node dist/cli.js --version
```
Expected: `0.1.0`.

```bash
node dist/cli.js --html report.html
```
Expected: the same report as `npm run dev`, exit code 0 or 1 depending on your skills.

- [ ] **Step 2: Take the README screenshot**

Open `report.html` in a browser, screenshot the matrix, save as `docs/report.png`. (It is committed to the repo; `files` in `package.json` keeps it out of the npm tarball.)

- [ ] **Step 3: Write `README.md`**

````markdown
# skill-clash

> skill-doctor tells you what's unused. skill-clash tells you why.

Claude Code routes a prompt to a skill by reading each skill's `description`.
When two descriptions claim the same triggers, you cannot predict which one
runs. `skill-clash` reads every skill you have installed and tells you which
pairs fight over the same prompts — and on which words.

![collision matrix](docs/report.png)

## Usage

```bash
npx skill-clash
```

```
skill-clash - 71 skills scanned, 3 clashes, 9 ambiguous

CLASH  0.58  impeccable <-> web-design-guidelines
             "audit design" . "review my UI" . "review UX"
AMBIG  0.27  accessibility-a11y <-> web-design-guidelines
             "check accessibility" . "implement web accessibility"
```

Which skills would compete for a specific prompt:

```bash
npx skill-clash --prompt "review my UI"
```

Let your own Claude judge the ambiguous pairs (uses your `claude` CLI, a few
hundred tokens per pair, nothing else is sent):

```bash
npx skill-clash --deep
```

Shareable report:

```bash
npx skill-clash --html report.html
```

## Flags

| Flag | Effect |
|---|---|
| `-p, --prompt <text>` | Rank skills competing for this prompt |
| `--deep` | Ask `claude -p` for a verdict on ambiguous pairs |
| `--json` | Machine-readable output |
| `--html <file>` | Also write a standalone HTML report |
| `--strict` | Exit 1 on ambiguous pairs too |
| `--clash <n>`, `--ambiguous <n>` | Band thresholds (0–1) |
| `--no-plugins` | Skip skills shipped by plugins |
| `--home <dir>`, `--cwd <dir>` | Scan somewhere else |

Exit codes: `0` clean, `1` at least one clash (CI gate), `2` usage error.

## What it scans

- `~/.claude/skills/*/SKILL.md`
- `./.claude/skills/*/SKILL.md`
- `~/.claude/plugins/**/<plugin>/skills/*/SKILL.md`

Only the `description` frontmatter field is analysed — that is all Claude
Code sees when it picks a skill.

## How scoring works

Explicit triggers (quoted phrases, "use when …" clauses) are extracted from
each description. Two skills are compared by the overlap of their trigger
words (60 %) and of their whole description vocabulary (40 %), using the
overlap coefficient so a short skill subsumed by a long one still scores
high. Scores ≥ 0.45 are a clash, ≥ 0.15 ambiguous. No model, no network,
no cost — unless you pass `--deep`.

## Not what this does

- Lint frontmatter or structure → use [claudelint](https://claudelint.com/)
- Show token cost or usage → use `/skill-doctor` in Claude Code
- Rewrite your skills — it only tells you where they collide

## License

MIT
````

Update the numbers in the sample output block to what `npx skill-clash` actually printed on your machine in Task 11 Step 5, and the thresholds sentence to the calibrated values.

- [ ] **Step 4: Dry-run the publish**

```bash
npm publish --dry-run
```
Expected: tarball listing shows `dist/cli.js`, `README.md`, `LICENSE`, `package.json` and nothing from `fixtures/`, `tests/`, `docs/`. Size well under 100 kB.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/report.png
git commit -m "docs: add README with usage, flags and scoring notes

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Publish (user action)**

Publishing needs the user's npm account. Hand this back to the user with:

```bash
npm login
```

```bash
npm publish
```

Expected after publish: `npx skill-clash@0.1.0 --version` prints `0.1.0` from a directory outside the repo.

- [ ] **Step 7: Tag**

```bash
git tag v0.1.0
```

Done. v1 definition of done (spec §7) is met when Task 11 Step 5 and Task 12 Step 6 both pass.
