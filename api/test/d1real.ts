import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = fileURLToPath(new URL('../migrations/', import.meta.url));

/**
 * The same migrations on workerd's own D1 engine (Miniflare) instead of node:sqlite. Opt-in:
 * `REAL_D1=1 npx vitest run`. One proxy per test worker; each harness() resets the database by
 * dropping every table and re-running the migrations, so tests stay isolated.
 */
let proxy: Promise<{ env: { DB: D1Database }; dispose: () => Promise<void> }> | undefined;

async function db(): Promise<D1Database> {
  const { getPlatformProxy } = await import('wrangler');
  proxy ??= getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: join(tmpdir(), `gymentra-d1-${randomUUID()}`) } }) as never;
  return (await proxy).env.DB;
}

/** D1 runs one statement per prepare(); split a migration file on statement boundaries. */
function statements(sql: string): string[] {
  const parts = sql.replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
  // A trigger body contains `;` before its closing END: glue the pieces back together.
  const out: string[] = [];
  let buf = '';
  for (const p of parts) {
    buf = buf ? `${buf};\n${p}` : p;
    if (/^CREATE\s+TRIGGER/i.test(buf) && !/\bEND$/i.test(buf)) continue;
    out.push(buf);
    buf = '';
  }
  return out;
}

/**
 * Plain-object facade over the real binding: the binding's methods live on a prototype, so test code that
 * wraps the DB with `{ ...db, batch }` (race injection) would silently lose them. Own properties survive spreading.
 */
function facade(d: D1Database): D1Database {
  const wrapStmt = (st: D1PreparedStatement): any => ({
    __st: st,
    bind: (...a: unknown[]) => wrapStmt(st.bind(...a)),
    first: (...a: unknown[]) => (st.first as any)(...a),
    all: () => st.all(),
    run: () => st.run(),
    raw: (...a: unknown[]) => (st.raw as any)(...a),
  });
  const raw = (x: any) => x.__st ?? x;
  return {
    prepare: (q: string) => wrapStmt(d.prepare(q)),
    batch: (l: any[]) => d.batch(l.map(raw)),
    exec: (q: string) => d.exec(q),
  } as unknown as D1Database;
}

export async function makeRealDb(): Promise<D1Database> {
  const d = await db();
  const { results } = await d.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`).all<{ name: string }>();
  if (results.length) {
    // Schema stays; only rows go. D1 always enforces foreign keys, so deferral inside one transaction
    // makes the order irrelevant.
    await d.batch([d.prepare('PRAGMA defer_foreign_keys = ON'), ...results.map((r) => d.prepare(`DELETE FROM "${r.name}"`))]);
    return facade(d);
  }
  for (const f of readdirSync(MIGRATIONS).sort()) {
    for (const s of statements(readFileSync(MIGRATIONS + f, 'utf8'))) await d.prepare(s).run();
  }
  return facade(d);
}
