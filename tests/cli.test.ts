import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const home = resolve('fixtures/home');
const cwd = resolve('fixtures/project');

function cli(...args: string[]) {
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'src/cli.ts', ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

describe('cli', () => {
  it('--help exits 0', () => {
    const r = cli('--help');
    expect(r.code).toBe(0);
    expect(r.out).toContain('--prompt');
    expect(r.out).toContain('--deep');
  });

  it('--version exits 0', () => {
    expect(cli('--version').code).toBe(0);
  });

  it('unknown option exits 2', () => {
    expect(cli('--bogus').code).toBe(2);
  });

  it('empty --prompt exits 2', () => {
    const r = cli('--prompt', '');
    expect(r.code).toBe(2);
    expect(r.err).toContain('--prompt must not be empty');
  });

  it('ambiguous >= clash exits 2', () => {
    const r = cli('--home', home, '--cwd', cwd, '--clash', '0.4', '--ambiguous', '0.5');
    expect(r.code).toBe(2);
    expect(r.err).toContain('--ambiguous must be lower than --clash');
  });

  it('threshold outside 0..1 exits 2', () => {
    expect(cli('--clash', '7').code).toBe(2);
  });

  it('scans fixtures and exits 1 with low thresholds', () => {
    const r = cli('--home', home, '--cwd', cwd, '--clash', '0.2', '--ambiguous', '0.1');
    expect(r.code).toBe(1);
    expect(r.out).toContain('skills scanned');
  });

  it('--json is parseable', () => {
    const r = cli('--home', home, '--cwd', cwd, '--json');
    expect(() => JSON.parse(r.out)).not.toThrow();
  });
});
