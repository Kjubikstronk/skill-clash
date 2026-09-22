import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import matter from 'gray-matter';
import type { Skill, Skipped, Source } from './types.js';

export type ParseResult = { ok: true; skill: Skill } | { ok: false; skipped: Skipped };

const skip = (path: string, reason: string): ParseResult => ({ ok: false, skipped: { path, reason } });

/** Never throws: anything unusable becomes a Skipped entry. */
export function parseSkill(path: string, source: Source): ParseResult {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (e) {
    return skip(path, `unreadable: ${(e as Error).message}`);
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  raw = raw.replace(/\r\n/g, '\n');

  let data: Record<string, unknown>;
  try {
    data = matter(raw).data as Record<string, unknown>;
  } catch (e) {
    return skip(path, `invalid frontmatter: ${(e as Error).message.split('\n')[0]}`);
  }

  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (!description) return skip(path, 'no description in frontmatter');
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : basename(dirname(path));
  return { ok: true, skill: { name, description, path, source } };
}

/**
 * Display labels, guaranteed unique — they key the maps that `--explain` and
 * `--deep` look skills up in, so a collision would silently drop a skill.
 * A shared name is qualified with its source; if that still collides (two
 * skills of the same name from the same source), a counter is appended.
 */
export function labelSkills(skills: Skill[]): Map<Skill, string> {
  const nameCounts = new Map<string, number>();
  for (const s of skills) nameCounts.set(s.name, (nameCounts.get(s.name) ?? 0) + 1);

  const used = new Set<string>();
  const out = new Map<Skill, string>();
  for (const s of skills) {
    const base = (nameCounts.get(s.name) ?? 0) > 1 ? `${s.name} (${s.source})` : s.name;
    let label = base;
    for (let n = 2; used.has(label); n++) label = `${base} #${n}`;
    used.add(label);
    out.set(s, label);
  }
  return out;
}
