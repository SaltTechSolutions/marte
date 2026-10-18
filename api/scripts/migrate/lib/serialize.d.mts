export const EXPORT_COLLECTIONS: string[];
export const EPHEMERAL_ROOTS: string[];
export const LEGACY_ROOTS: string[];
export function serializeValue(v: unknown): unknown;
export function serializeDoc(snap: { id: string; ref: { path: string }; data(): unknown }, extra?: Record<string, unknown>): string;
