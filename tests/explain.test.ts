import { describe, it, expect } from 'vitest';
import { resolveSkill, explainPair } from '../src/explain.js';
import { extractTriggers } from '../src/triggers.js';
import type { Skill, TriggerSet } from '../src/types.js';

const mk = (name: string, description: string): Skill => ({
  name,
  description,
  path: `C:/skills/${name}/SKILL.md`,
  source: 'user',
});

const wdg = mk(
  'web-design-guidelines',
  'Review UI code for compliance. Use when asked to "review my UI", "check accessibility", or "audit design".',
);
const imp = mk('impeccable', 'Use when the user wants to design, audit, or polish a frontend interface.');
const git = mk('git-commit', 'Use when the user asks to commit changes.');

const skills = [wdg, imp, git];
const byLabel = new Map(skills.map((s) => [s.name, s]));
const setByLabel = new Map<string, TriggerSet>(skills.map((s) => [s.name, extractTriggers(s.name, s.description)]));
const labels = [...byLabel.keys()];

describe('resolveSkill', () => {
  it('matches an exact name', () => {
    expect(resolveSkill('impeccable', labels)).toEqual(['impeccable']);
  });
  it('is case insensitive', () => {
    expect(resolveSkill('IMPECCABLE', labels)).toEqual(['impeccable']);
  });
  it('matches a substring', () => {
    expect(resolveSkill('design-guide', labels)).toEqual(['web-design-guidelines']);
  });
  it('returns every candidate when a substring is ambiguous', () => {
    expect(resolveSkill('i', labels).length).toBeGreaterThan(1);
  });
  it('prefers an exact match over substrings', () => {
    expect(resolveSkill('git-commit', [...labels, 'git-commit-extra'])).toEqual(['git-commit']);
  });
  it('returns nothing when there is no match', () => {
    expect(resolveSkill('nonexistent', labels)).toEqual([]);
  });
});

describe('explainPair', () => {
  const e = explainPair('web-design-guidelines', 'impeccable', byLabel, setByLabel);

  it('carries both file paths and full descriptions', () => {
    expect(e.a.path).toBe('C:/skills/web-design-guidelines/SKILL.md');
    expect(e.b.path).toBe('C:/skills/impeccable/SKILL.md');
    expect(e.a.description).toContain('Review UI code');
    expect(e.b.description).toContain('frontend interface');
  });

  it('reports the score and band from the same scorer as a normal scan', () => {
    expect(e.score).toBeGreaterThan(0);
    expect(['clash', 'ambiguous', 'none']).toContain(e.band);
  });

  it('lists the shared trigger words that cause the overlap', () => {
    expect(e.sharedTriggerWords).toContain('audit');
    expect(e.sharedTriggerWords).toContain('design');
  });

  it('shows which triggers on each side contain a shared word', () => {
    expect(e.a.sharedTriggers.join(' ')).toMatch(/audit design/i);
    expect(e.b.sharedTriggers.join(' ')).toMatch(/audit|design/i);
  });

  it('shows the trigger words unique to each side', () => {
    expect(e.a.distinctWords).toContain('accessibility');
    expect(e.b.distinctWords).toContain('polish');
    expect(e.a.distinctWords).not.toContain('design');
  });

  it('works for a pair with no overlap at all', () => {
    const none = explainPair('impeccable', 'git-commit', byLabel, setByLabel);
    expect(none.sharedTriggerWords).toEqual([]);
    expect(none.band).toBe('none');
    expect(none.a.sharedTriggers).toEqual([]);
  });

  it('respects custom thresholds', () => {
    const strictly = explainPair('web-design-guidelines', 'impeccable', byLabel, setByLabel, {
      clash: 0.01,
      ambiguous: 0.005,
    });
    expect(strictly.band).toBe('clash');
  });
});
