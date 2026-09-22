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
