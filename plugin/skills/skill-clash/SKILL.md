---
name: skill-clash
description: Find Claude Code skills whose descriptions compete for the same prompts. Use when the user asks which of their skills overlap, conflict, clash, collide, are duplicated, or why the wrong skill keeps triggering. Also use when they ask which skill would handle a given prompt, or want to audit or clean up their installed skills.
---

# skill-clash

Claude Code picks a skill by reading each skill's `description`. When two
descriptions claim the same triggers, which one runs is unpredictable. This
skill runs the `skill-clash` CLI to find those pairs and show the evidence.

## Running it

The CLI ships on npm and needs no install step — `npx` fetches it on first use.
Run it with Bash and show the user the output.

**Which skills collide:**

```bash
npx -y skill-clash
```

**Which skills compete for one specific prompt:**

```bash
npx -y skill-clash --prompt "review my UI"
```

**Why two particular skills overlap** (both file paths, both descriptions, the
shared trigger words, and what distinguishes each side):

```bash
npx -y skill-clash --explain <skill-a> <skill-b>
```

**A shareable HTML report** with a collision matrix:

```bash
npx -y skill-clash --html skill-clash-report.html
```

## Exit codes

`0` clean, `1` at least one clash was found, `2` usage error. **Exit 1 is the
normal, expected result on a real machine** — it exists so the command can gate
CI. Do not report it as a failure; read the output and summarise the findings.

## Reading the output

- `CLASH` (score ≥ 0.45) — the descriptions overlap heavily.
- `AMBIG` (≥ 0.35) — worth a look, more likely to be a false positive.
- The quoted strings under each pair are the actual shared trigger phrases.
  Quote them when explaining a clash; they are the evidence.

Scoring is heuristic and has no model behind it, so false positives happen:
two skills describing the same *domain* in the same words can score high while
doing unrelated jobs. When a pair looks arguable, use `--explain` to show the
detail, or offer `--deep`, which asks the user's own `claude` CLI to judge the
ambiguous pairs (a few hundred tokens per pair — mention the cost before
running it, and never run it unasked).

A clash is **not** automatically a defect. Plenty of overlapping pairs are ones
the user wants to keep — a planning skill and a testing skill that both say
"before implementing a feature" genuinely overlap and are both still correct.

## Never delete anything

This skill reports; the user decides. Do not remove, rename, edit or disable a
skill because `skill-clash` flagged it. If the user asks you to act on a
finding, show them the paths from `--explain` and confirm the specific change
before touching any file.

Watch for one common case: the same skill installed twice, once under
`~/.claude/skills` and once via a plugin. It scores near 1.00. Removing one is
usually right, but check which copy is newer and whether either is a symlink
before recommending which to drop.
