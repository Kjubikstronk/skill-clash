import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
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

  // Regression: Dirent.isDirectory() is false for a symlinked directory, so
  // symlinked skills (common with plugin managers and dotfiles) were invisible.
  it('follows symlinked skill directories', () => {
    const root = mkdtempSync(join(tmpdir(), 'skill-clash-link-'));
    const skills = join(root, '.claude', 'skills');
    const real = join(skills, 'real-skill');
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, 'SKILL.md'), '---\nname: real-skill\ndescription: Real.\n---\n');

    const target = join(root, 'elsewhere', 'linked-skill');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'SKILL.md'), '---\nname: linked-skill\ndescription: Linked.\n---\n');
    // 'junction' works without elevation on Windows and is ignored elsewhere.
    symlinkSync(target, join(skills, 'linked-skill'), 'junction');

    const names = discover({ home: root, cwd: resolve('fixtures/nope'), plugins: false }).map((d) =>
      norm(d.path).split('/').at(-2),
    );
    expect(names.sort()).toEqual(['linked-skill', 'real-skill']);
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
