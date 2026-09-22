import type { Clash, Skill } from './types.js';

export type RunClaude = (prompt: string) => Promise<string>;

/** Stub — replaced in Task 10. */
export async function deepen(
  clashes: Clash[],
  _skills: Map<string, Skill>,
  _run: RunClaude,
  _warn: (msg: string) => void,
): Promise<Clash[]> {
  return clashes;
}

/** Stub — replaced in Task 10. */
export const runClaudeCli: RunClaude = async () => {
  throw new Error('not implemented');
};
