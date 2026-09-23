import { initializeApp } from 'firebase/app';
import {
  initializeFirestore,
  connectFirestoreEmulator,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const env = import.meta.env;
export const usingEmulators = env.VITE_USE_EMULATORS === 'true';

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-dairy',
  appId: env.VITE_FIREBASE_APP_ID,
});

// Real project: keep an offline cache so entries can be logged with a weak signal
// at the collection point and sync when the connection returns.
export const db = initializeFirestore(app, {
  localCache: usingEmulators
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (usingEmulators) {
  // Use the page's hostname so a phone on the same Wi-Fi can reach the emulator too.
  const host = window.location.hostname;
  connectFirestoreEmulator(db, host, 8080);
}
