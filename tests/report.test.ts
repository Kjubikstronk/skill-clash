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
