/**
 * Lazy Firebase bootstrap shared by the public site and the admin panel.
 * Everything is dynamically imported so the 3D site's first paint never waits on Firebase.
 * App Check (reCAPTCHA v3) is initialised before any Firestore call when a site key is set.
 */
import type { FirebaseApp } from 'firebase/app';
import type { Firestore } from 'firebase/firestore';
import type { Auth } from 'firebase/auth';

const env = import.meta.env;
export const useEmulators = env.VITE_USE_EMULATORS === 'true';
export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID);
export const adminUids: string[] = String(env.VITE_ADMIN_UIDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

let appP: Promise<FirebaseApp> | null = null;
let dbP: Promise<Firestore> | null = null;
let authP: Promise<Auth> | null = null;

export function getFirebaseApp(): Promise<FirebaseApp> {
  if (!firebaseConfigured) return Promise.reject(new Error('Firebase is not configured'));
  appP ??= (async () => {
    const { initializeApp } = await import('firebase/app');
    const app = initializeApp({
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.VITE_FIREBASE_APP_ID,
    });
    const siteKey = env.VITE_RECAPTCHA_SITE_KEY;
    if (siteKey && !useEmulators) {
      // In local dev, register the printed debug token in Firebase console > App Check.
      if (env.DEV) (self as unknown as Record<string, unknown>).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
      initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
    }
    return app;
  })();
  return appP;
}

export function getDb(): Promise<Firestore> {
  dbP ??= (async () => {
    const app = await getFirebaseApp();
    const { getFirestore, connectFirestoreEmulator } = await import('firebase/firestore');
    const db = getFirestore(app);
    if (useEmulators) connectFirestoreEmulator(db, '127.0.0.1', 8080);
    return db;
  })();
  return dbP;
}

export function getAuthInstance(): Promise<Auth> {
  authP ??= (async () => {
    const app = await getFirebaseApp();
    const { getAuth, connectAuthEmulator, setPersistence, browserSessionPersistence } = await import('firebase/auth');
    const auth = getAuth(app);
    if (useEmulators) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    await setPersistence(auth, browserSessionPersistence); // session only: closes with the tab
    return auth;
  })();
  return authP;
}

/** Ids accepted by the Firestore rules: [A-Za-z0-9-] */
export const safeId = (s: string) => s.replace(/[^A-Za-z0-9-]/g, '-').slice(0, 64);
