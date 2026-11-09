import { describe, expect, it } from 'vitest';
import { formatStamp, preview } from './format';

describe('formatStamp', () => {
  it('renders day, month and time', () => {
    expect(formatStamp('2026-03-05T14:07:00.000Z')).toMatch(/^0[56]\.03 \d{2}:\d{2}$/);
  });

  it('passes an unparseable value through instead of showing Invalid Date', () => {
    expect(formatStamp('wczoraj')).toBe('wczoraj');
  });
});

describe('preview', () => {
  it('takes the first non-empty line', () => {
    expect(preview('\n\n  drugi wiersz\nnastępny')).toBe('drugi wiersz');
  });

  it('marks an empty body', () => {
    expect(preview('   \n \n')).toBe('pusto');
  });

  it('truncates long lines to the requested width including the ellipsis', () => {
    const result = preview('a'.repeat(200), 20);
    expect(result).toHaveLength(20);
    expect(result.endsWith('…')).toBe(true);
  });
});
