import { vi } from 'vitest';

/**
 * Repo files under `src/data/firebase/**` import `@/services/firebase`
 * (which calls `initializeApp` + `AsyncStorage` persistence) purely as a
 * side effect of their `import { db } from '@/services/firebase'` line —
 * even when the test only wants a pure exported function from the same
 * file. These stubs let that import resolve to inert objects instead of
 * crashing outside a React Native runtime.
 */
vi.mock('@/services/firebase', () => ({
  app: {},
  auth: {},
  db: {},
  storage: {},
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {},
}));

vi.mock('firebase/app', () => ({
  initializeApp: () => ({}),
}));

vi.mock('firebase/auth', () => ({
  initializeAuth: () => ({}),
  getReactNativePersistence: () => ({}),
}));

vi.mock('firebase/storage', () => ({
  getStorage: () => ({}),
}));

// firebase/firestore is imported for its named functions (collection, doc,
// query, where, ...) throughout data/firebase/**. Tests only call the pure
// functions in these files, never the Firestore calls themselves, so every
// export just needs to exist and be callable without a real connection.
vi.mock('firebase/firestore', () => ({
  initializeFirestore: () => ({}),
  collection: () => ({}),
  doc: () => ({}),
  getDoc: () => ({}),
  getDocs: () => ({}),
  addDoc: () => ({}),
  updateDoc: () => ({}),
  setDoc: () => ({}),
  deleteDoc: () => ({}),
  onSnapshot: () => () => {},
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  serverTimestamp: () => ({}),
  runTransaction: () => ({}),
  writeBatch: () => ({}),
  Timestamp: {
    fromDate: (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() }),
    now: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }),
  },
}));
