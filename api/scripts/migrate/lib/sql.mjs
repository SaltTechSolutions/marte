// SQL rendering helpers. The output is parameter-free SQL that `wrangler d1 execute --file`
// accepts, so every value is rendered as a literal with strict quoting.

/** Render one scalar as an SQL literal. Objects are rejected: JSON columns must be stringified first. */
export function sqlValue(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`cannot render non-finite number ${v}`);
    return String(v);
  }
  if (typeof v === 'string') {
    // SQLite cannot hold NUL inside a literal sent as SQL text.
    if (v.includes('\u0000')) throw new Error('string contains NUL; sanitise before rendering');
    return `'${v.replaceAll("'", "''")}'`;
  }
  throw new Error(`cannot render ${typeof v} as an SQL literal`);
}

export function insertStatement(table, row) {
  const cols = Object.keys(row);
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => sqlValue(row[c])).join(', ')});`;
}

/** JSON with recursively sorted object keys: the same document always renders to the same text. */
export function stableStringify(v) {
  return JSON.stringify(sortKeys(v));
}
function sortKeys(v) {
  if (Array.isArray(v)) return v.map((x) => (x === undefined ? null : sortKeys(x)));
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

/** Quote for a POSIX shell (used only to PRINT commands; nothing here ever runs a shell). */
export function shellQuote(s) {
  return `'${s.replaceAll("'", `'\\''`)}'`;
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
