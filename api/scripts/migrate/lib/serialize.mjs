// Firestore value -> JSON-safe value for the JSONL export. Duck-typed on purpose: this module has no
// dependency on firebase-admin, so it can be unit-tested and the exporter can load the SDK lazily.

/** Top-level collections the migration reads (the 28 GymEntra collections minus the ones that do not exist at root). */
export const EXPORT_COLLECTIONS = [
  'tenants', 'tenant_memberships', 'user_settings', 'member_notes', 'member_admin_notes', 'member_addresses',
  'classes', 'class_cancellation_refunds', 'checkins', 'programs', 'program_templates', 'workout_logs', 'measurements',
  'payments', 'gym_packages', 'promotions', 'member_packages', 'member_credits', 'package_change_requests',
  'pt_sessions', 'trainer_availability', 'calendar_shares', 'push_tokens', 'announcements', 'renewal_requests', 'exercise_reports',
  // exported only so the transformer can COUNT and drop them (server-maintained mirrors):
  'member_entitlements', 'trainer_busy_slots',
];

/** Throttle documents of the password-reset flow: ephemeral, deliberately not exported. */
export const EPHEMERAL_ROOTS = ['password_reset_throttle', 'password_reset_ip'];

/** Collections of the legacy marte06 web app in the same project; only noted, never exported. */
export const LEGACY_ROOTS = ['members', 'assigned_packages', 'lessons', 'packages', 'settings', 'branches'];

const isTimestamp = (v) => typeof v.toMillis === 'function' && ('seconds' in v || '_seconds' in v);
const isGeoPoint = (v) => typeof v.latitude === 'number' && typeof v.longitude === 'number' && Object.keys(v).length <= 4 && v.constructor?.name === 'GeoPoint';
const isDocRef = (v) => typeof v.path === 'string' && v.firestore !== undefined;

export function serializeValue(v) {
  if (v === null || v === undefined) return null;
  const t = typeof v;
  if (t === 'string' || t === 'boolean') return v;
  if (t === 'number') return Number.isFinite(v) ? v : { __num: String(v) };
  if (t === 'bigint') return { __num: v.toString() };
  if (v instanceof Date) return { __ts: v.getTime() };
  if (Array.isArray(v)) return v.map(serializeValue);
  if (v instanceof Uint8Array) return { __bytes: Buffer.from(v).toString('base64') };
  if (t === 'object') {
    if (isTimestamp(v)) return { __ts: v.toMillis() };
    if (isDocRef(v)) return { __ref: v.path };
    if (isGeoPoint(v)) return { __geo: [v.latitude, v.longitude] };
    const out = {};
    for (const [key, val] of Object.entries(v)) if (val !== undefined) out[key] = serializeValue(val);
    return out;
  }
  return { __unsupported: t };
}

/** One JSONL line for a document snapshot-like {id, ref:{path}, data()}. */
export function serializeDoc(snap, extra = {}) {
  return JSON.stringify({ __id: snap.id, __path: snap.ref.path, ...extra, ...serializeValue(snap.data()) });
}
