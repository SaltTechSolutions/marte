import { auth } from '@/services/firebase';

/**
 * Cloudflare API client. Authenticates every call with the Firebase ID token (Firebase Auth stays the
 * identity provider) and turns failures into the SAME error shape `data/errors.ts` already understands
 * for Cloud Functions: a `functions/<code>` code plus the server's Turkish `message`. Screens keep their
 * existing `reportError(e, toast, fallback)` handling unchanged.
 */
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, message: string, apiCode?: string, extra?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = codeFor(status);
    this.apiCode = apiCode;
    this.extra = extra;
  }
  /** The whole error body (e.g. `blocking`, `code` next to `error`), for logic that needs more than the message. */
  extra?: Record<string, unknown>;
  /** The machine-readable code the API sent (`error` field), for logic that branches on it. */
  apiCode?: string;
}

function codeFor(status: number): string {
  if (status === 400) return 'functions/invalid-argument';
  if (status === 401) return 'functions/unauthenticated';
  if (status === 403) return 'functions/permission-denied';
  if (status === 404) return 'functions/not-found';
  if (status === 409 || status === 412 || status === 429) return 'functions/failed-precondition';
  return 'functions/internal'; // untrusted on purpose: never shown to the user, reported to Sentry
}

type Fetcher = typeof fetch;
let fetcher: Fetcher = (...a) => fetch(...a);
let tokenProvider: () => Promise<string | null> = async () => (auth.currentUser ? auth.currentUser.getIdToken() : null);

/** Test seams. */
export const __setApiTransport = (f: Fetcher, t?: () => Promise<string | null>) => {
  fetcher = f;
  if (t) tokenProvider = t;
};

export async function apiFetch<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const token = await tokenProvider();
  if (!token) throw new ApiError(401, 'Oturum bulunamadı.');
  let res: Response;
  try {
    res = await fetcher(`${API_BASE}/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // Network failure: an untrusted error (status 0 -> functions/internal) so the screen shows its own fallback.
    throw new ApiError(0, (e as Error).message || 'network');
  }
  const text = await res.text();
  const json = text ? safeParse(text) : null;
  if (!res.ok) {
    const j = json as { error?: string; message?: string } | null;
    throw new ApiError(res.status, j?.message ?? j?.error ?? `HTTP ${res.status}`, j?.error, (j ?? undefined) as Record<string, unknown> | undefined);
  }
  return json as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const apiGet = <T>(path: string) => apiFetch<T>('GET', path);
export const apiPost = <T>(path: string, body?: unknown) => apiFetch<T>('POST', path, body ?? {});
export const apiPut = <T>(path: string, body?: unknown) => apiFetch<T>('PUT', path, body ?? {});
export const apiPatch = <T>(path: string, body?: unknown) => apiFetch<T>('PATCH', path, body ?? {});
export const apiDelete = <T>(path: string) => apiFetch<T>('DELETE', path);
