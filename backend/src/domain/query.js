/**
 * Query helpers shared by every list endpoint.
 *
 * Both the keyword filter and the ORDER BY are built from fixed fragments, never
 * from user input: only the *values* are bound as parameters, so no string of
 * unknown origin ever reaches the SQL text.
 */

/** Maps the API `sort` values to a fixed ORDER BY. Unknown values cannot reach here (zod). */
const ORDER_BY = {
  updated_desc: 'updated_at DESC, id DESC',
  updated_asc: 'updated_at ASC, id ASC',
  created_desc: 'created_at DESC, id DESC',
  created_asc: 'created_at ASC, id ASC',
  title_asc: 'title COLLATE NOCASE ASC, id ASC',
  title_desc: 'title COLLATE NOCASE DESC, id ASC',
};

/** Stickies have no title column, so title sorts fall back to the update stamp. */
const ORDER_BY_BODY = {
  ...ORDER_BY,
  title_asc: 'updated_at DESC, id DESC',
  title_desc: 'updated_at DESC, id ASC',
};

/**
 * @param {string} sort
 * @param {{titleColumn?: string}} [options] - pass titleColumn: 'body' for tables without titles
 * @returns {string} SQL fragment safe to interpolate
 */
export function orderBySql(sort, { titleColumn = 'title' } = {}) {
  const table = titleColumn === 'body' ? ORDER_BY_BODY : ORDER_BY;
  return table[sort] ?? ORDER_BY.updated_desc;
}

/**
 * Build a case-insensitive "all keywords present" filter over the given columns.
 *
 * `%` and `_` are escaped so a search for `100%` matches itself instead of
 * turning into a wildcard match-everything query.
 *
 * @param {string|undefined} query - raw search string, may be empty
 * @param {string[]} columns - columns to search, e.g. ['title', 'body']
 * @returns {{clause: string, params: Record<string, string>}} empty clause when no keywords
 */
export function keywordFilter(query, columns) {
  const keywords = String(query ?? '')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (keywords.length === 0) return { clause: '', params: {} };

  const conditions = [];
  const params = {};

  keywords.forEach((keyword, index) => {
    const escaped = keyword.replace(/[\\%_]/g, (char) => `\\${char}`);
    const named = `kw${index}`;
    conditions.push(
      `(${columns
        .map((column) => `lower(${column}) LIKE @${named} ESCAPE '\\'`)
        .join(' OR ')})`,
    );
    params[named] = `%${escaped.toLowerCase()}%`;
  });

  return { clause: conditions.join(' AND '), params };
}
