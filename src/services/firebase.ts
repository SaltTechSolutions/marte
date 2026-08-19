import AsyncStorage from '@react-native-async-storage/async-storage';
import { Auth, getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Firestore, initializeFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';

// Same Firebase project as marte06 (tarabyamarte). Tarabya Marte is the
// seeded test tenant — its data stays in place; new tenants start empty.
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const app: FirebaseApp = initializeApp(firebaseConfig);

export const auth: Auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

export const db: Firestore = initializeFirestore(app, {});

export const storage: FirebaseStorage = getStorage(app);
