export type Env = {
  DB: D1Database;
  /** R2 bucket for profile photos and gym logos. */
  MEDIA: R2Bucket;
  /** Origin used in media URLs (the custom domain); falls back to the request origin. */
  PUBLIC_BASE_URL?: string;
  FIREBASE_PROJECT_ID: string;
  /** Resend API key (secret). Without it e-mail outbox rows retry, then die: never silently dropped. */
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** RevenueCat webhook shared secret (secret). Unset = webhook answers 503 (fail closed). */
  REVENUECAT_WEBHOOK_SECRET?: string;
};

export type Role = 'member' | 'trainer' | 'admin';

export type Vars = {
  /** Provider subject (Firebase uid) of the caller. */
  subject: string;
  /** Internal users.id; null until the identity is mapped. */
  userId: string | null;
};
