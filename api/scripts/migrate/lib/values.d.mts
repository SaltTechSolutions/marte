export const MANAGED_ID: RegExp;
export function internalUserId(uid: string): string;
export function toMs(v: unknown): number | null;
export function deepConvert(v: unknown, onTag?: (tag: string) => void): unknown;
