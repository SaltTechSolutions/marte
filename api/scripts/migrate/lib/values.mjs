import { createHash } from 'node:crypto';

/** Managed (account-less) members carry a synthetic id that was never a provider uid. */
export const MANAGED_ID = /^mm[0-9a-f]{20}$/;

/**
 * Deterministic internal user id: 'u' + first 20 hex of sha256('firebase:' + uid).
 * Re-running the migration (or a final export after a rehearsal) yields the same ids.
 * Managed ids pass through unchanged: they are already internal.
 */
export function internalUserId(uid) {
  if (MANAGED_ID.test(uid)) return uid;
  return 'u' + createHash('sha256').update('firebase:' + uid).digest('hex').slice(0, 20);
}

/** Firestore Timestamp range: 0001-01-01 .. 9999-12-31 in ms. */
const TS_MIN = -62135596800000;
const TS_MAX = 253402300799999;

/**
 * Parse every timestamp shape an export may contain into integer ms.
 * Returns null when absent, NaN when present but unusable, otherwise a number (possibly fractional,
 * the caller decides what to do about that).
 */
export function toMs(v) {
  if (v === null || v === undefined) return null;
  let n;
  if (typeof v === 'object') {
    if ('__ts' in v) n = numLike(v.__ts);
    else if ('_seconds' in v || 'seconds' in v) {
      const s = numLike(v._seconds ?? v.seconds);
      const ns = numLike(v._nanoseconds ?? v.nanoseconds ?? 0);
      n = s * 1000 + ns / 1e6;
    } else return NaN;
  } else if (typeof v === 'number') n = v;
  else if (typeof v === 'string') n = /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : Date.parse(v);
  else return NaN;
  if (!Number.isFinite(n) || n < TS_MIN || n > TS_MAX) return NaN;
  return n;
}
function numLike(x) {
  if (typeof x === 'number') return x;
  if (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x))) return Number(x);
  return NaN;
}

/** Deep copy converting {__ts} to ms; unsupported export tags are kept as-is and reported via `onTag`. */
export function deepConvert(v, onTag = () => {}) {
  if (Array.isArray(v)) return v.map((x) => deepConvert(x, onTag));
  if (v && typeof v === 'object') {
    if ('__ts' in v) {
      const ms = toMs(v);
      if (Number.isNaN(ms)) throw new Error(`unusable timestamp ${JSON.stringify(v)}`);
      return Math.floor(ms);
    }
    for (const tag of ['__ref', '__geo', '__bytes', '__vector', '__num']) if (tag in v) onTag(tag);
    const out = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) out[k] = deepConvert(x, onTag);
    return out;
  }
  return v;
}

export const k = (...parts) => parts.join('\u0000');
