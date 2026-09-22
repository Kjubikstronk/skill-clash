import { describe, it, expect } from 'vitest';
import { renderHtml } from '../src/html.js';
import type { ScanReport } from '../src/report.js';

const scan: ScanReport = {
  scanned: 3,
  clashes: [
    { a: 'impeccable', b: 'web-design-guidelines', score: 0.61, band: 'clash', evidence: ['audit design'] },
    { a: 'a11y', b: 'web-design-guidelines', score: 0.28, band: 'ambiguous', evidence: ['<b>accessibility</b>'], verdict: 'distinct', reason: 'r' },
  ],
  skipped: [{ path: 'x', reason: 'no description in frontmatter' }],
  untriggered: [],
  warnings: [],
};

describe('renderHtml', () => {
  const html = renderHtml(scan);
  it('is a standalone document', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<script src|<link /);
  });
  it('has a matrix over every skill involved in a pair', () => {
    expect(html).toContain('<table');
    expect(html).toContain('1. a11y');
    expect(html).toContain('2. impeccable');
    expect(html).toContain('3. web-design-guidelines');
    expect(html).toContain('class="clash"');
    expect(html).toContain('class="ambiguous"');
  });
  it('lists pairs with evidence and verdicts', () => {
    expect(html).toContain('<code>audit design</code>');
    expect(html).toContain('deep: distinct');
  });
  it('escapes HTML in evidence', () => {
    expect(html).toContain('&lt;b&gt;accessibility&lt;/b&gt;');
    expect(html).not.toContain('<b>accessibility</b>');
  });
  it('handles an empty report', () => {
    expect(renderHtml({ ...scan, clashes: [] })).toContain('No overlapping skills found.');
  });
});
