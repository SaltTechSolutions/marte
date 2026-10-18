// Per-run context and the document Reader used by the table specs.
import { deepConvert, internalUserId, k, MANAGED_ID, toMs } from './values.mjs';
import { stableStringify } from './sql.mjs';

export class Ctx {
  constructor(data, opts, schema) {
    this.data = data;                 // {collection: doc[]}
    this.opts = opts;
    this.schema = schema;
    this.rows = {};                   // table -> row[]
    this.kept = {};                   // table -> Map<key, row>
    this.uidToInternal = new Map();   // raw uid -> internal id
    this.internalToUid = new Map();
    this.docMap = {};                 // table -> {oldId: newId}
    this.excludedUsers = new Set();   // referenced-only uids that Auth says no longer exist
    this.report = {
      units: {
        timestamps: 'unix milliseconds (INTEGER)',
        money: `Firestore numbers copied x${opts.moneyScale}. The app stores and formats whole-lira values (it prints "₺" + n); ` +
          `the D1 header comment says "integer kurus". With moneyScale 1 nothing is converted, so D1 holds whole lira. ` +
          `Re-run with --money-scale 100 to store kurus. The owner must decide before the API stops treating amounts as lira.`,
      },
      source: { collections: {} }, emitted: {}, dropped: {}, unmapped: {}, skipped: [], skippedCounts: {},
      orphans: [], invalid: [], conflicts: [], warnings: [], warningCounts: {}, orphanCounts: {}, invalidCounts: {},
      counters: { tenants: [], gymPackages: [] }, schemaNotes: [], unknownCollections: [],
    };
  }

  docsOf(name) {
    const list = [...(this.data[name] ?? [])].sort((a, b) => (a.__id < b.__id ? -1 : a.__id > b.__id ? 1 : 0));
    this.report.source.collections[name] = list.length;
    return list;
  }

  warn(code, table, id, detail) {
    this.report.warnings.push({ code, table, id, detail });
    this.report.warningCounts[code] = (this.report.warningCounts[code] ?? 0) + 1;
  }
  orphan(table, id, reason, ref) {
    this.report.orphans.push({ table, id, reason, ...(ref ? { ref } : {}) });
    this.report.orphanCounts[table] = (this.report.orphanCounts[table] ?? 0) + 1;
  }
  invalid(table, id, reason) {
    this.report.invalid.push({ table, id, reason });
    this.report.invalidCounts[table] = (this.report.invalidCounts[table] ?? 0) + 1;
  }
  skip(table, id, reason) {
    this.report.skippedCounts[`${table}: ${reason}`] = (this.report.skippedCounts[`${table}: ${reason}`] ?? 0) + 1;
    if (this.report.skipped.length < 200) this.report.skipped.push({ table, id, reason });
  }
  drop(table, field, n = 1) {
    const key = `${table}.${field}`;
    this.report.dropped[key] = (this.report.dropped[key] ?? 0) + n;
  }

  /** Raw provider uid -> internal id; refuses to continue on a hash collision. */
  uidId(raw) {
    let id = this.uidToInternal.get(raw);
    if (id) return id;
    id = internalUserId(raw);
    const prior = this.internalToUid.get(id);
    if (prior && prior !== raw) throw new Error(`internal id collision: ${prior} and ${raw} both map to ${id}`);
    this.uidToInternal.set(raw, id);
    this.internalToUid.set(id, raw);
    return id;
  }

  has(table, ...keys) { return !!this.kept[table]?.has(k(...keys)); }
  get(table, ...keys) { return this.kept[table]?.get(k(...keys)); }
}

const FIELD_META = (key) => key.startsWith('__');

/** Reads one source document, collecting problems instead of throwing, so a bad doc is reported, not fatal. */
export class Reader {
  constructor(ctx, table, doc) {
    this.ctx = ctx; this.table = table; this.doc = doc; this.id = doc.__id;
    this.problems = []; this.orphans = []; this.seen = new Set(); this.skipReason = null;
  }
  bad(reason) { if (!this.problems.includes(reason)) this.problems.push(reason); }
  warn(code, detail) { this.ctx.warn(code, this.table, this.id, detail); }
  raw(f) { this.seen.add(f); return this.doc[f]; }
  has(f) { const v = this.doc[f]; return v !== undefined && v !== null && v !== ''; }

  str(f, { req = false, upper = false, trim = true } = {}) {
    let v = this.raw(f);
    if (v === undefined || v === null || v === '') { if (req) this.bad(`missing ${f}`); return null; }
    if (typeof v === 'number' && Number.isFinite(v)) { this.warn('coerced-to-string', `${f}=${v}`); v = String(v); }
    if (typeof v !== 'string') { this.bad(`${f} is not a string`); return null; }
    if (v.includes('\u0000')) { this.warn('nul-stripped', f); v = v.replaceAll('\u0000', ''); }
    if (trim) v = v.trim();
    if (!v) { if (req) this.bad(`blank ${f}`); return null; }
    return upper ? v.toUpperCase() : v;
  }
  /** Text kept byte-for-byte (notes, addresses): no trimming. */
  text(f, { req = false } = {}) {
    const v = this.raw(f);
    if (typeof v !== 'string' || v === '') { if (req) this.bad(`missing ${f}`); return null; }
    return v.replaceAll('\u0000', '');
  }
  int(f, { req = false, min = -Infinity, max = Infinity, def = null } = {}) {
    const v = this.raw(f);
    if (v === undefined || v === null) { if (req) this.bad(`missing ${f}`); return def; }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) { this.bad(`${f}=${JSON.stringify(v)} is not an integer in range`); return def; }
    return v;
  }
  /** Money: Firestore number x moneyScale, must land on an integer. */
  money(f, { req = false } = {}) {
    const v = this.raw(f);
    if (v === undefined || v === null) { if (req) this.bad(`missing ${f}`); return null; }
    if (typeof v !== 'number' || !Number.isFinite(v)) { this.bad(`${f}=${JSON.stringify(v)} is not a number`); return null; }
    const scaled = v * this.ctx.opts.moneyScale;
    const rounded = Math.round(scaled);
    if (Math.abs(scaled - rounded) > 1e-6) { this.bad(`${f}=${v} is not an integer after x${this.ctx.opts.moneyScale}`); return null; }
    return rounded;
  }
  ts(f, { req = false, fallback = undefined } = {}) {
    const ms = toMs(this.raw(f));
    if (ms === null) {
      if (!req) return null;
      if (fallback !== undefined) { this.warn('timestamp-defaulted', `${f} -> ${fallback}`); return fallback; }
      this.bad(`missing ${f}`); return null;
    }
    if (Number.isNaN(ms)) { this.bad(`unusable timestamp in ${f}`); return null; }
    if (!Number.isInteger(ms)) { this.warn('timestamp-fractional', `${f}=${ms} floored`); return Math.floor(ms); }
    return ms;
  }
  bool(f) { const v = this.raw(f); return v === true; }
  enumStr(f, allowed, { req = false, def = null } = {}) {
    const v = this.str(f, { req });
    if (v === null) return def;
    if (!allowed.includes(v)) { this.bad(`${f}="${v}" is not one of ${allowed.join('/')}`); return def; }
    return v;
  }
  strArr(f) {
    const v = this.raw(f);
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) { this.bad(`${f} is not an array`); return []; }
    return v.filter((x) => typeof x === 'string' && x);
  }
  /** Raw provider uid in a field -> internal id (null when absent). */
  uid(f, { req = false } = {}) {
    const v = this.str(f, { req, trim: true });
    return v === null ? null : this.ctx.uidId(v);
  }
  /** Value to JSON text (sorted keys), timestamps converted. */
  json(f, def) {
    const v = this.raw(f);
    return stableStringify(v === undefined || v === null ? def : this.convert(v));
  }
  convert(v) {
    try { return deepConvert(v, (tag) => this.warn('unsupported-export-tag', tag)); }
    catch (e) { if (!this.problems.some((p) => p.startsWith('unusable timestamp'))) this.bad(e.message); return null; }
  }
  /**
   * The free-form JSON column: every field that is not otherwise consumed, minus `omit`.
   * `uid` lists top-level fields holding provider uids, `uidKeyed` fields that are maps keyed by uid,
   * `money` dotted paths holding amounts.
   */
  blob({ omit = [], drop = [], uid = [], uidKeyed = [], money = [], defaults = {} } = {}) {
    const out = {};
    for (const key of omit) this.seen.add(key);   // handled by a column or another table
    for (const key of drop) { this.seen.add(key); omit = [...omit, key]; if (this.doc[key] !== undefined) this.ctx.drop(this.table, key); }   // deliberately not carried
    for (const [key, val] of Object.entries(this.doc)) {
      if (FIELD_META(key) || omit.includes(key) || val === undefined) continue;
      this.seen.add(key);
      out[key] = this.convert(val);
    }
    for (const [key, val] of Object.entries(defaults)) if (out[key] === undefined || out[key] === null) out[key] = val;
    for (const f of uid) if (typeof out[f] === 'string' && out[f]) out[f] = this.ctx.uidId(out[f]);
    for (const f of uidKeyed) {
      if (out[f] && typeof out[f] === 'object') {
        out[f] = Object.fromEntries(Object.entries(out[f]).map(([u, x]) => [this.ctx.uidId(u), x]));
      }
    }
    for (const path of money) this.scaleAt(out, path.split('.'));
    return stableStringify(out);
  }
  scaleAt(obj, path) {
    const [head, ...rest] = path;
    if (!obj || typeof obj !== 'object' || !(head in obj)) return;
    if (rest.length) return this.scaleAt(obj[head], rest);
    const v = obj[head];
    if (typeof v !== 'number') return;
    const scaled = v * this.ctx.opts.moneyScale;
    if (Math.abs(scaled - Math.round(scaled)) > 1e-6) { this.bad(`${path.join('.')}=${v} is not an integer after x${this.ctx.opts.moneyScale}`); return; }
    obj[head] = Math.round(scaled);
  }

  /** Tenant id; documents without one are reported by the caller via `legacy`. */
  tenantId({ legacySharedCollection = false } = {}) {
    const v = this.str('tenantId');
    if (v) return v;
    if (legacySharedCollection) this.skipReason = 'no tenantId (legacy marte06 document in a shared collection)';
    else this.bad('missing tenantId');
    return null;
  }

  /** Required reference to an already-built row; a miss makes this document an orphan. */
  need(table, label, ...keys) {
    if (keys.some((x) => x === null || x === undefined)) return false;
    if (this.ctx.has(table, ...keys)) return true;
    this.orphans.push(`${label}: no ${table} row for ${keys.join(' / ')}`);
    return false;
  }

  /**
   * Close the document. Returns true when it may be emitted; otherwise the reason is already recorded.
   * `dropped` are denormalised copies deliberately not carried over; any other unseen field is "unmapped".
   */
  finish(dropped = []) {
    for (const f of dropped) if (this.doc[f] !== undefined) this.ctx.drop(this.table, f);
    for (const f of Object.keys(this.doc)) {
      if (FIELD_META(f) || this.seen.has(f) || dropped.includes(f)) continue;
      this.ctx.report.unmapped[`${this.table}.${f}`] = (this.ctx.report.unmapped[`${this.table}.${f}`] ?? 0) + 1;
    }
    if (this.skipReason) { this.ctx.skip(this.table, this.id, this.skipReason); return false; }
    if (this.problems.length) { this.ctx.invalid(this.table, this.id, this.problems.join('; ')); return false; }
    if (this.orphans.length) { this.ctx.orphan(this.table, this.id, this.orphans.join('; ')); return false; }
    return true;
  }
}

export { MANAGED_ID };
