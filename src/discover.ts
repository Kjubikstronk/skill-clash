import { readdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import type { Source } from './types.js';

export interface Discovered {
  path: string;
  source: Source;
}

export interface DiscoverOptions {
  home?: string;
  cwd?: string;
  /** Default true. */
  plugins?: boolean;
}

export function searchRoots(opts: DiscoverOptions = {}): string[] {
  const home = opts.home ?? homedir();
  const cwd = opts.cwd ?? process.cwd();
  const roots = [join(home, '.claude', 'skills'), join(cwd, '.claude', 'skills')];
  if (opts.plugins !== false) roots.push(join(home, '.claude', 'plugins'));
  return roots;
}

export function discover(opts: DiscoverOptions = {}): Discovered[] {
  const [userRoot, projectRoot, pluginRoot] = searchRoots(opts);
  const found: Discovered[] = [];
  for (const p of skillFiles(userRoot)) found.push({ path: p, source: 'user' });
  for (const p of skillFiles(projectRoot)) found.push({ path: p, source: 'project' });
  if (pluginRoot) found.push(...pluginSkills(pluginRoot));

  // One file must yield one skill. Run from your home directory and
  // ~/.claude/skills IS ./.claude/skills, so without this every skill is
  // discovered twice and then reported as clashing with itself at 1.00.
  // Symlinks are resolved too, so two links to one target collapse as well.
  // First win: user beats project beats plugin, matching the push order.
  const seen = new Set<string>();
  const out: Discovered[] = [];
  for (const d of found) {
    // Case-fold only where the filesystem does. On Linux, `Foo/SKILL.md` and
    // `foo/SKILL.md` are two different skills and must not collapse into one.
    const real = realOrSelf(d.path);
    const key = process.platform === 'win32' || process.platform === 'darwin' ? real.toLowerCase() : real;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

function realOrSelf(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/** `<dir>/<name>/SKILL.md` for every subdirectory that has one. */
function skillFiles(dir: string): string[] {
  return subdirs(dir)
    .map((d) => join(dir, d, 'SKILL.md'))
    .filter(isFile);
}

/**
 * Walks the plugins tree. Any `<plugin>/skills/<name>/SKILL.md` is tagged plugin:<plugin>.
 * Real layout: plugins/marketplaces/<market>/(plugins|external_plugins)/<plugin>/skills/<name>/SKILL.md
 */
function pluginSkills(root: string, maxDepth = 8): Discovered[] {
  const out: Discovered[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth) return;
    for (const sub of subdirs(dir)) {
      if (sub === 'node_modules' || sub.startsWith('.')) continue;
      const full = join(dir, sub);
      if (sub === 'skills') {
        const plugin = basename(dir);
        for (const f of skillFiles(full)) out.push({ path: f, source: `plugin:${plugin}` });
      } else {
        walk(full, depth + 1);
      }
    }
  };
  walk(root, 0);
  return out;
}

/**
 * Subdirectory names, following symlinks.
 * `Dirent.isDirectory()` uses lstat semantics and is false for a symlinked
 * directory, so a symlinked skill would be invisible. Plugin managers and
 * dotfile setups commonly symlink skills in (on Windows, as junctions), so
 * each non-directory entry is stat'd to see what it really points at.
 */
function subdirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() || (e.isSymbolicLink() && isDir(join(dir, e.name))))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
