import { describe, expect, it } from 'vitest';
import { keywordFilter, orderBySql } from '../src/domain/query.js';

describe('keywordFilter', () => {
  it('returns no clause for empty input', () => {
    expect(keywordFilter(undefined, ['title'])).toEqual({ clause: '', params: {} });
    expect(keywordFilter('   ', ['title'])).toEqual({ clause: '', params: {} });
  });

  it('requires every keyword to be present (AND) and lowercases the pattern', () => {
    const { clause, params } = keywordFilter('kot  pies', ['title', 'body']);
    expect(clause).toContain('AND');
    expect(clause.match(/LIKE/g)).toHaveLength(4);
    expect(params).toEqual({ kw0: '%kot%', kw1: '%pies%' });
  });

  it('escapes LIKE wildcards so a search for 100% matches itself', () => {
    const { params, clause } = keywordFilter('100% _x', ['body']);
    expect(params.kw0).toBe('%100\\%%');
    expect(params.kw1).toBe('%\\_x%');
    expect(clause).toContain(`ESCAPE '\\'`);
  });
});

describe('orderBySql', () => {
  it('maps each documented sort to a fixed ORDER BY', () => {
    expect(orderBySql('updated_desc')).toBe('updated_at DESC, id DESC');
    expect(orderBySql('created_asc')).toBe('created_at ASC, id ASC');
    expect(orderBySql('title_asc')).toContain('title COLLATE NOCASE ASC');
  });

  it('falls back to updated_desc for an unknown value', () => {
    expect(orderBySql('Robert); DROP TABLE notes;--')).toBe('updated_at DESC, id DESC');
  });

  it('substitutes title sorts for tables without a title column', () => {
    expect(orderBySql('title_asc', { titleColumn: 'body' })).toBe('updated_at DESC, id DESC');
  });
});
