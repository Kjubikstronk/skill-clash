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
