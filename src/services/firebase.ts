/**
 * ============================================================================
 * DEPLOYMENT CHECKLIST & FIREBASE CONSOLE SETUP NOTE
 * ============================================================================
 * For Google Authentication to work correctly in production and development:
 * 1. Go to Firebase Console -> Authentication -> Sign-in method.
 * 2. Ensure the "Google" provider is ENABLED.
 * 3. Go to Firebase Console -> Authentication -> Settings -> Authorized domains.
 * 4. Add "odogwu-heritage.vercel.app" to the Authorized domains list.
 * 5. Add the staging authorized domain and localhost only after a dedicated
 *    staging Firebase project is configured via ignored `.env.local`.
 * ============================================================================
 *
 * Canonical client Firebase boundary. Local development fails closed unless
 * explicit non-production VITE_FIREBASE_* configuration is present.
 */

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
import committedProductionConfig from "../../firebase-applet-config.json";
import {
  emitFirebaseClientConfigurationDiagnostic,
  readFirebaseClientEnvironmentVariables,
  resolveFirebaseClientConfiguration,
  resolveFirebaseRuntimeMode,
} from "../utils/firebaseClientConfiguration";

const viteEnv = import.meta.env;
const runtimeMode = resolveFirebaseRuntimeMode({
  DEV: viteEnv?.DEV,
  PROD: viteEnv?.PROD,
  MODE: viteEnv?.MODE,
});

const resolvedFirebaseClientConfiguration = resolveFirebaseClientConfiguration({
  runtimeMode,
  variables: readFirebaseClientEnvironmentVariables({
    VITE_APP_ENV: viteEnv?.VITE_APP_ENV,
    VITE_FIREBASE_API_KEY: viteEnv?.VITE_FIREBASE_API_KEY,
    VITE_FIREBASE_AUTH_DOMAIN: viteEnv?.VITE_FIREBASE_AUTH_DOMAIN,
    VITE_FIREBASE_PROJECT_ID: viteEnv?.VITE_FIREBASE_PROJECT_ID,
    VITE_FIREBASE_STORAGE_BUCKET: viteEnv?.VITE_FIREBASE_STORAGE_BUCKET,
    VITE_FIREBASE_MESSAGING_SENDER_ID: viteEnv?.VITE_FIREBASE_MESSAGING_SENDER_ID,
    VITE_FIREBASE_APP_ID: viteEnv?.VITE_FIREBASE_APP_ID,
    VITE_FIREBASE_MEASUREMENT_ID: viteEnv?.VITE_FIREBASE_MEASUREMENT_ID,
    VITE_FIRESTORE_DATABASE_ID: viteEnv?.VITE_FIRESTORE_DATABASE_ID,
  }),
  committedProductionConfig,
});

emitFirebaseClientConfigurationDiagnostic(
  resolvedFirebaseClientConfiguration,
  runtimeMode,
);

const app = initializeApp(
  resolvedFirebaseClientConfiguration.firebaseOptions,
);
const db =
  resolvedFirebaseClientConfiguration.firestoreDatabaseId === null
    ? getFirestore(app)
    : getFirestore(
        app,
        resolvedFirebaseClientConfiguration.firestoreDatabaseId,
      );
const auth = getAuth(app);
const storage = getStorage(app);

export { app, db, auth, storage };
export const firebaseClientConfiguration = resolvedFirebaseClientConfiguration;
