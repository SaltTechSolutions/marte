import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));

/**
 * Minimal D1 stand-in over node:sqlite so route logic runs against the real
 * migrations without workerd. It does NOT reproduce D1 limits (batch size,
 * CPU, subrequests); those need a staging D1 before cutover.
 */
export function makeDb(): D1Database {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys = ON');
  for (const f of readdirSync(MIGRATIONS).sort()) sql.exec(readFileSync(MIGRATIONS + f, 'utf8'));

  const stmt = (query: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(query, a),
    first: async () => (sql.prepare(query).get(...(args as never[])) as never) ?? null,
    all: async () => ({ results: sql.prepare(query).all(...(args as never[])) as never[] }),
    run: async () => { const r = sql.prepare(query).run(...(args as never[])); return { success: true, meta: { changes: Number(r.changes) } }; },
    _run: () => sql.prepare(query).run(...(args as never[])),
  });
  return {
    prepare: (q: string) => stmt(q),
    batch: async (list: ReturnType<typeof stmt>[]) => {
      sql.exec('BEGIN');
      try {
        // Like D1: one result per statement, each with meta.changes.
        const out = list.map((s) => ({ success: true, results: [], meta: { changes: Number(s._run().changes) } }));
        sql.exec('COMMIT');
        return out;
      } catch (e) { sql.exec('ROLLBACK'); throw e; }
    },
    exec: async (q: string) => { sql.exec(q); return {}; },
  } as unknown as D1Database;
}
