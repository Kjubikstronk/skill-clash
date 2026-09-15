# skill-clash — Design Spec

**Date:** 2026-09-15
**Status:** Approved for planning

## 1. What it is

`skill-clash` is a TypeScript CLI on npm. `npx skill-clash` answers one question:
**which of my Claude Code skills collide, and on what prompts?**

Claude Code routes prompts to skills by reading each skill's `description`.
When two descriptions claim the same triggers, the user cannot predict which
skill runs. `/skill-doctor` reports what each skill costs and how often it is
used; nothing reports *why* a skill keeps losing to another. That is the gap.

### Commands

| Invocation | Result |
|---|---|
| `skill-clash` | Scan all visible skills, print ranked collision pairs with evidence. |
| `skill-clash --prompt "review my UI"` | Show which skills would compete for that input, ranked, with matched triggers. |
| `skill-clash --deep` | Send ambiguous pairs to `claude -p` (the user's own Claude Code) for a verdict and a one-line reason. |

### Output formats

- Terminal table (default), colored.
- `--json` — machine-readable, for CI.
- `--html <file>` — standalone HTML report with a collision matrix.

### Exit codes

- `0` — no clashes (or nothing found)
- `1` — at least one `clash`-band pair (`--strict` also counts `ambiguous`)
- `2` — usage error or unexpected failure

### Not in scope (v1)

- Lint rules of any kind (frontmatter validity, dead references, body size — `claudelint` covers this)
- Token-cost auditing (`/skill-doctor`, `claude-context-lint`)
- Auto-fixing or rewriting skills
- CLAUDE.md, memory, hooks, MCP config
- Config file (`.skillclashrc`) — thresholds are CLI flags only
- Embedding models

## 2. Architecture

```
discover → parse → extractTriggers → overlap ──→ (deep) → report
                                   └→ match(prompt) ┘
```

Each module is a pure function over the previous module's output, in its own
file, independently testable.

| Module | Does | Depends on |
|---|---|---|
| `discover` | Finds `SKILL.md` under `~/.claude/skills/*`, `./.claude/skills/*`, `~/.claude/plugins/**`. Tags each path with `source`: `user`, `project`, or `plugin:<name>`. | fs |
| `parse` | `SKILL.md` → `Skill { name, description, path, source }`. Frontmatter via `gray-matter`. Never throws; unparseable or missing description → `Skipped { path, reason }`. | discover |
| `triggers` | `description` → `TriggerSet`. See §3. | parse |
| `overlap` | All pairs of `TriggerSet` → `Clash[]`. See §3. | triggers |
| `match` | `--prompt` mode. Treats the prompt as a one-off `TriggerSet`, scores it against every skill with the same formula as `overlap`, returns `MatchResult[]`. | triggers, overlap |
| `deep` | Batches `ambiguous` clashes, runs `claude -p --output-format json`, merges verdicts back. Soft-fails. See §3. | overlap |
| `report` | `Clash[]` / `MatchResult[]` + `Skipped[]` → terminal / JSON / HTML. Pure rendering; knows nothing about scoring. | — |
| `cli` | `commander` entry point. Wires the pipeline, maps flags, sets exit code. | all |

### Types (`types.ts`)

```ts
type Source = 'user' | 'project' | `plugin:${string}`;

interface Skill   { name: string; description: string; path: string; source: Source }
interface Skipped { path: string; reason: string }

interface Trigger { text: string; norm: string; strength: 'strong' | 'weak' }
interface TriggerSet { skill: string; triggers: Trigger[]; bigrams: Set<string> }

type Band = 'clash' | 'ambiguous' | 'none';

interface Clash {
  a: string; b: string;
  score: number;                       // 0..1
  band: Band;
  evidence: string[];                  // original text of shared triggers
  verdict?: 'clash' | 'distinct';      // from --deep
  reason?: string;                     // from --deep
}

interface MatchResult { skill: string; score: number; matched: string[]; competes: boolean }
```

## 3. Scoring

### Trigger extraction (from `description` only — the body is irrelevant to routing)

1. **Quoted phrases** — anything inside `"…"` or `'…'` → `strong`, kept verbatim.
2. **Clause triggers** — text following `use when`, `use for`, `triggers on`,
   `when the user (asks|says|wants|mentions)`, up to end of sentence; split on
   `,` and ` or ` → `strong`.
3. **Verb–object pairs** — remaining sentences → `(verb, noun-phrase)` bigrams
   where verb is in a fixed list of roughly 30 common task verbs exported from
   `triggers.ts` (review, audit, check, create, build, fix, generate, animate,
   design, refactor, debug, test, write, convert, and similar) → `weak`.
4. **Normalization** — lowercase, light stemming (`-ing`, `-s`, `-ed`), drop
   stopwords. `text` keeps the original for evidence; `norm` is the compare key.
5. `bigrams` — word 2-grams of the whole normalized description.

### Clash score for pair (A, B)

```
exact = |strongA ∩ strongB| / min(|strongA|, |strongB|)   (0 if either set empty)
jacc  = |bigramsA ∩ bigramsB| / |bigramsA ∪ bigramsB|
score = 0.7 * exact + 0.3 * jacc
```

Bands (defaults, overridable via `--clash <n>` and `--ambiguous <n>`):

- `score ≥ 0.45` → `clash`
- `0.20 ≤ score < 0.45` → `ambiguous`
- otherwise → `none` (dropped from output)

`evidence` = original text of every shared strong trigger, plus up to 3 shared
bigrams if there are no shared strong triggers.

### Match (`--prompt`)

A bare prompt has no quoted phrases or "use when" clauses, so the pair formula
would give `exact = 0` for every skill. Match mode therefore scores differently:

```
hits  = number of the skill's strong triggers whose `norm` occurs in the
        normalized prompt (substring match)
exact = hits / |strong|                                    (0 if no strong triggers)
jacc  = jaccard(bigrams(prompt), bigrams(skill description))
score = 0.7 * exact + 0.3 * jacc
```

`matched` = original text of the hit triggers. Return the top 5 by score.
Any result within 0.10 of the top score gets `competes: true` and a warning
marker in the report.

### Deep (`--deep`)

- Input: all `ambiguous` clashes. Batches of ≤ 20 pairs per call.
- Prompt body: compact JSON `[{ pair: "a↔b", a: {name, description}, b: {name, description} }]`
  plus the instruction to return `[{ pair, verdict: "clash"|"distinct", reason }]`.
  ~150 tokens per pair; a 20-pair batch is roughly 3–4k in, ~500 out.
- Execution: `claude -p <prompt> --output-format json` via `child_process`,
  behind a `runClaude(prompt: string): Promise<string>` interface.
- Merge: verdict and reason attached to the matching `Clash`. Band is **not**
  changed by the verdict; the report shows both.

## 4. Error handling

Rule: **never crash on someone else's files.**

| Situation | Behaviour |
|---|---|
| `~/.claude` or project `.claude` missing / unreadable | Empty scan for that source. If all sources empty: "no skills found in: …", exit 0. |
| `SKILL.md` unparseable, no frontmatter, no description | `Skipped { path, reason }`, listed at bottom of report. Never affects exit code. |
| Description yields zero strong triggers | Skill included; `exact` is always 0 for it, so only bigram overlap can score. Flagged "no detectable triggers" in the report. |
| Two skills share a `name` | Both kept; displayed as `name (source)`. |
| `--deep`: `claude` not on PATH, non-zero exit, timeout (60 s), unparseable JSON | One warning line; report continues with heuristic bands only. Exit code unaffected. |
| `--prompt ""` or invalid threshold flags | Usage error, exit 2. |
| Unexpected exception | One-line error, hint to rerun with `--verbose` (prints stack), exit 2. |

## 5. Testing

- **Unit (vitest)** — `triggers` and `overlap` are pure; table-driven tests
  using real descriptions copied from public skills. Canonical clash fixture:
  three UI-review skills (`impeccable`, `web-design-guidelines`,
  `accessibility-a11y`) whose descriptions all claim "review UI"-style prompts.
  Also: a pair that must score `none` (e.g. `git-commit` vs `threejs-shaders`).
- **Parse** — `fixtures/skills/` with good, bad (no frontmatter, no description,
  invalid YAML), and weird (BOM, CRLF, huge body) `SKILL.md` files.
- **Discover** — integration test against a temp directory mimicking the
  `~/.claude` layout, with `HOME` / `USERPROFILE` overridden.
- **Report** — snapshot tests for terminal, JSON and HTML renderers on a fixed
  `Clash[]` input.
- **Deep** — `runClaude` mocked; tests cover merge logic, batching at 20, and
  every soft-fail path. One manual smoke test against the real `claude` before
  each release.
- **CLI** — spawn the built binary against `fixtures/`, assert exit codes 0/1/2.

## 6. Project setup

- TypeScript, Node ≥ 20, ESM.
- Build: `tsup`. Test: `vitest`. CLI: `commander`. Frontmatter: `gray-matter`.
  Colors: `picocolors`. No other runtime dependencies.
- Layout:
  ```
  src/{cli,discover,parse,triggers,overlap,match,deep,report,types}.ts
  tests/
  fixtures/skills/
  docs/superpowers/specs/
  ```
- Package name `skill-clash` (verified free on npm 2026-09-15). MIT license.
- README leads with a screenshot of the HTML report and the line:
  *"skill-doctor tells you what's unused. skill-clash tells you why."*

## 7. Definition of done (v1)

1. `npx skill-clash` on the author's machine reports the UI-review clash with
   correct evidence.
2. `skill-clash --prompt "review my UI"` ranks those three skills at the top and
   marks them as competing.
3. `skill-clash --html report.html` produces a file worth screenshotting.
4. `--deep` works against a real `claude` install and degrades gracefully without one.
5. Tests green; published to npm.

## 8. Prior art (checked 2026-09-15)

- `claudelint` — 116 lint rules for the whole Claude Code config. No overlap detection. We do not compete with it.
- `himself65/skill-lint`, `claude-skills-linter` — structural validators.
- `claude-context-lint` — token-cost audit with a shallow duplicate check (Jaccard > 0.75 on whole-description word sets; catches near-copies only).
- `/skill-doctor` (built-in, ≥ v2.1.252) — per-skill context cost and usage frequency. No content analysis.
