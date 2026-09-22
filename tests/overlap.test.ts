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
