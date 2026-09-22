#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Command, CommanderError, InvalidArgumentError } from 'commander';
import { run } from './pipeline.js';
import { DEFAULT_THRESHOLDS } from './types.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const unit = (v: string): number => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1) throw new InvalidArgumentError('must be a number between 0 and 1');
  return n;
};

const program = new Command()
  .name('skill-clash')
  .description('Find Claude Code skills that fight over the same prompts.')
  .version(version)
  .option('-p, --prompt <text>', 'show which skills compete for this prompt')
  .option('--deep', 'ask your local claude to judge ambiguous pairs', false)
  .option('--json', 'machine-readable output', false)
  .option('--html <file>', 'also write a standalone HTML report')
  .option('--strict', 'exit 1 on ambiguous pairs too', false)
  .option('--clash <n>', `clash threshold (default ${DEFAULT_THRESHOLDS.clash})`, unit)
  .option('--ambiguous <n>', `ambiguous threshold (default ${DEFAULT_THRESHOLDS.ambiguous})`, unit)
  .option('--no-plugins', 'skip skills shipped by plugins')
  .option('--home <dir>', 'home directory to scan (default: your user profile)')
  .option('--cwd <dir>', 'project directory to scan (default: current directory)')
  .option('--verbose', 'print stack traces on unexpected errors', false)
  .exitOverride();

interface Opts {
  prompt?: string;
  deep: boolean;
  json: boolean;
  html?: string;
  strict: boolean;
  clash?: number;
  ambiguous?: number;
  plugins: boolean;
  home?: string;
  cwd?: string;
  verbose: boolean;
}

async function main(): Promise<number> {
  let opts: Opts;
  try {
    program.parse(process.argv);
    opts = program.opts<Opts>();
  } catch (e) {
    // Help and version are successful exits; everything else is a usage error.
    const code = (e as CommanderError).code ?? '';
    return code.startsWith('commander.help') || code === 'commander.version' ? 0 : 2;
  }

  if (opts.prompt !== undefined && opts.prompt.trim() === '') {
    process.stderr.write('error: --prompt must not be empty\n');
    return 2;
  }
  const thresholds = {
    clash: opts.clash ?? DEFAULT_THRESHOLDS.clash,
    ambiguous: opts.ambiguous ?? DEFAULT_THRESHOLDS.ambiguous,
  };
  if (thresholds.ambiguous >= thresholds.clash) {
    process.stderr.write('error: --ambiguous must be lower than --clash\n');
    return 2;
  }

  try {
    return await run(
      {
        home: opts.home,
        cwd: opts.cwd,
        plugins: opts.plugins,
        prompt: opts.prompt,
        deep: opts.deep,
        json: opts.json,
        html: opts.html,
        strict: opts.strict,
        thresholds,
      },
      {
        out: (l) => process.stdout.write(l + '\n'),
        err: (l) => process.stderr.write(l + '\n'),
        writeFile: (p, c) => writeFileSync(p, c),
      },
    );
  } catch (e) {
    const err = e as Error;
    process.stderr.write(`error: ${err.message}\n`);
    process.stderr.write(opts.verbose ? `${err.stack ?? ''}\n` : 'rerun with --verbose for details\n');
    return 2;
  }
}

main().then((code) => process.exit(code));
