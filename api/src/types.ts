export type Env = {
  DB: D1Database;
  /** R2 bucket for profile photos and gym logos. */
  MEDIA: R2Bucket;
  /** Origin used in media URLs (the custom domain); falls back to the request origin. */
  PUBLIC_BASE_URL?: string;
  FIREBASE_PROJECT_ID: string;
  /** Maintenance gate: only the exact value "1" opens /v1/*. Unset or anything else answers 503 maintenance (fail closed). */
  API_OPEN?: string;
  /** Resend API key (secret). Without it e-mail outbox rows retry, then die: never silently dropped. */
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** Recipient of exercise-report e-mails, read at DELIVERY time. Set in the Cloudflare dashboard or as a secret, never in the repo. Unset = those mail rows fail visibly and end 'dead'. */
  EXERCISE_REPORT_TO?: string;
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
