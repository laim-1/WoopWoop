import { getApps, initializeApp } from "firebase/app";
import type { FirebaseOptions } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth, signInAnonymously, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { getDatabase } from "firebase/database";

const envConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const missingConfig = Object.entries(envConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const isFirebaseConfigured = missingConfig.length === 0;

// Allow the app shell to load even when .env.local is missing.
// Network actions will still fail until real Firebase values are added.
const firebaseConfig: FirebaseOptions = isFirebaseConfigured
  ? envConfig
  : {
      apiKey: "dev-missing-config",
      authDomain: "dev-missing-config.firebaseapp.com",
      databaseURL: "https://dev-missing-config-default-rtdb.firebaseio.com",
      projectId: "dev-missing-config",
      storageBucket: "dev-missing-config.appspot.com",
      messagingSenderId: "000000000000",
      appId: "1:000000000000:web:devmissingconfig",
    };

if (!isFirebaseConfigured) {
  console.warn(
    `Missing Firebase config values: ${missingConfig.join(", ")}. Add them to .env.local for multiplayer.`,
  );
}

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const database = getDatabase(app, firebaseConfig.databaseURL);

export async function signInPlayer(): Promise<string> {
  if (auth.currentUser) {
    return auth.currentUser.uid;
  }

  const credential = await signInAnonymously(auth);
  return credential.user.uid;
}

export async function createFirebaseAccount(username: string, email: string, password: string): Promise<string> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const displayName = username.trim();
  await updateProfile(credential.user, { displayName });
  return displayName;
}

export async function signInFirebaseAccount(email: string, password: string): Promise<string> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user.displayName?.trim() || email;
}
