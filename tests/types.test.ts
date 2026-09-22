import { describe, it, expect } from 'vitest';
import { DEFAULT_THRESHOLDS } from '../src/types.js';

describe('types', () => {
  it('ships sane default thresholds', () => {
    expect(DEFAULT_THRESHOLDS.ambiguous).toBeLessThan(DEFAULT_THRESHOLDS.clash);
    expect(DEFAULT_THRESHOLDS.clash).toBeLessThanOrEqual(1);
    expect(DEFAULT_THRESHOLDS.ambiguous).toBeGreaterThan(0);
  });
});
