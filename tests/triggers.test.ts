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
