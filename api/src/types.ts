export type Env = {
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
};

export type Role = 'member' | 'trainer' | 'admin';

export type Vars = {
  /** Provider subject (Firebase uid) of the caller. */
  subject: string;
  /** Internal users.id; null until the identity is mapped. */
  userId: string | null;
};
