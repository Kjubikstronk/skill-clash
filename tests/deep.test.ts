import { describe, it, expect, vi } from 'vitest';
import { buildPrompt, parseVerdicts, deepen, pairKey, BATCH_SIZE } from '../src/deep.js';
import type { Clash, Skill } from '../src/types.js';

const skill = (name: string, description: string): Skill => ({ name, description, path: name, source: 'user' });
const byLabel = new Map<string, Skill>([
  ['a', skill('a', 'Reviews UI.')],
  ['b', skill('b', 'Audits design.')],
  ['c', skill('c', 'Commits code.')],
]);
const clash = (a: string, b: string, band: Clash['band']): Clash => ({ a, b, score: 0.3, band, evidence: [] });

describe('buildPrompt', () => {
  it('includes pair keys, names and descriptions and asks for a JSON array', () => {
    const p = buildPrompt([clash('a', 'b', 'ambiguous')], byLabel);
    expect(p).toContain('"pair":"a <> b"');
    expect(p).toContain('Reviews UI.');
    expect(p).toContain('Audits design.');
    expect(p).toMatch(/JSON array/);
  });
});

describe('parseVerdicts', () => {
  it('reads a bare JSON array', () => {
    expect(parseVerdicts('[{"pair":"a <> b","verdict":"clash","reason":"same job"}]')).toEqual([
      { pair: 'a <> b', verdict: 'clash', reason: 'same job' },
    ]);
  });
  it('unwraps the claude -p json envelope', () => {
    const env = JSON.stringify({ type: 'result', result: 'Sure:\n```json\n[{"pair":"a <> b","verdict":"distinct"}]\n```' });
    expect(parseVerdicts(env)).toEqual([{ pair: 'a <> b', verdict: 'distinct', reason: '' }]);
  });
  it('drops malformed entries', () => {
    expect(parseVerdicts('[{"pair":"x","verdict":"maybe"},{"verdict":"clash"},{"pair":"a <> b","verdict":"clash"}]')).toEqual([
      { pair: 'a <> b', verdict: 'clash', reason: '' },
    ]);
  });
  it('throws when there is no array', () => {
    expect(() => parseVerdicts('I cannot help with that.')).toThrow(/no JSON array/);
  });
});

describe('deepen', () => {
  it('sends only ambiguous pairs and merges verdicts back', async () => {
    // Parameter is declared so `run.mock.calls[0][0]` is typed; the mock ignores it.
    const run = vi.fn(async (_prompt: string) => '[{"pair":"a <> b","verdict":"clash","reason":"same job"}]');
    const warn = vi.fn();
    const out = await deepen([clash('a', 'b', 'ambiguous'), clash('a', 'c', 'clash')], byLabel, run, warn);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).not.toContain('Commits code.');
    expect(out[0]).toMatchObject({ verdict: 'clash', reason: 'same job', band: 'ambiguous' });
    expect(out[1].verdict).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
  });

  it('skips the call when nothing is ambiguous', async () => {
    const run = vi.fn(async () => '[]');
    await deepen([clash('a', 'c', 'clash')], byLabel, run, vi.fn());
    expect(run).not.toHaveBeenCalled();
  });

  it('batches at BATCH_SIZE', async () => {
    const many = Array.from({ length: BATCH_SIZE + 5 }, (_, i) => clash(`s${i}`, `t${i}`, 'ambiguous'));
    const run = vi.fn(async () => '[]');
    await deepen(many, byLabel, run, vi.fn());
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('warns and keeps heuristic bands when claude fails', async () => {
    const run = vi.fn(async () => {
      throw new Error('could not run claude: ENOENT');
    });
    const warn = vi.fn();
    const out = await deepen([clash('a', 'b', 'ambiguous')], byLabel, run, warn);
    expect(out[0].verdict).toBeUndefined();
    expect(out[0].band).toBe('ambiguous');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not run claude'));
  });

  it('pairKey is stable', () => {
    expect(pairKey(clash('a', 'b', 'clash'))).toBe('a <> b');
  });
});
