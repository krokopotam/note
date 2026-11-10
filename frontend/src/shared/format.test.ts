import { describe, expect, it } from 'vitest';
import { formatCountdown, formatSize, formatStamp, preview } from './format';

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

describe('formatSize', () => {
  it('counts bytes in ones and bigger things in powers of 1024', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1023)).toBe('1023 B');
    expect(formatSize(2048)).toBe('2 kB');
    expect(formatSize(12_700)).toBe('12,4 kB');
    expect(formatSize(1024 ** 3)).toBe('1 GB');
  });

  it('refuses to invent a size for nonsense', () => {
    expect(formatSize(-1)).toBe('—');
    expect(formatSize(Number.NaN)).toBe('—');
  });
});

describe('formatCountdown', () => {
  it('reads like a clock, not like a number of seconds', () => {
    expect(formatCountdown(300_000)).toBe('5:00');
    expect(formatCountdown(9_000)).toBe('0:09');
    expect(formatCountdown(65_400)).toBe('1:06');
  });

  it('stops at zero instead of counting backwards', () => {
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(-5_000)).toBe('0:00');
    expect(formatCountdown(Number.NaN)).toBe('0:00');
  });
});
