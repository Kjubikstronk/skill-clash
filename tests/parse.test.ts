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
    const p = file('bom', '﻿---\r\nname: bom\r\ndescription: Has BOM.\r\n---\r\nbody\r\n');
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

describe('labelSkills uniqueness', () => {
  const mk2 = (name: string, source: Skill['source'], path: string): Skill => ({ name, description: '', path, source });
  it('appends a counter when name and source both collide', () => {
    const a = mk2('huge', 'user', 'a');
    const b = mk2('huge', 'user', 'b');
    const labels = labelSkills([a, b]);
    expect(labels.get(a)).toBe('huge (user)');
    expect(labels.get(b)).toBe('huge (user) #2');
    expect(new Set([...labels.values()]).size).toBe(2);
  });
});
