/**
 * Staging-only Storage smoke script.
 *
 * This file must never fall back to firebase-applet-config.json as initializeApp
 * input. Supply explicit staging VITE_FIREBASE_* values in the process
 * environment before running it directly. It does not load dotenv or .env files.
 * The current committed Web app is staging and may be used when every field is
 * supplied explicitly. A dedicated production Firebase project does not exist.
 */
import { fileURLToPath } from "node:url";
import path from "node:path";
import { initializeApp } from "firebase/app";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadString,
} from "firebase/storage";
import committedStagingConfig from "./firebase-applet-config.json" with {
  type: "json",
};
import {
  resolveExplicitStagingFirebaseClientConfiguration,
  type ResolvedFirebaseClientConfiguration,
} from "./src/utils/firebaseClientConfiguration";

export const isTestStorageExecutedDirectly = (
  moduleUrl: string,
  argv1: string | undefined,
): boolean => {
  if (!argv1) return false;
  try {
    return path.resolve(fileURLToPath(moduleUrl)) === path.resolve(argv1);
  } catch {
    return false;
  }
};

export const resolveTestStorageFirebaseClientConfiguration = (
  environment: Readonly<Record<string, unknown>> = process.env,
): ResolvedFirebaseClientConfiguration =>
  resolveExplicitStagingFirebaseClientConfiguration({
    environment,
    committedStagingConfig,
  });

export const createTestStorageFirebaseApp = (
  environment: Readonly<Record<string, unknown>> = process.env,
  initialize: (
    options: ResolvedFirebaseClientConfiguration["firebaseOptions"],
  ) => unknown = initializeApp,
) => {
  const resolved = resolveTestStorageFirebaseClientConfiguration(environment);
  return initialize(resolved.firebaseOptions);
};

export async function runStagingStorageSmokeTest(
  environment: Readonly<Record<string, unknown>> = process.env,
): Promise<void> {
  const resolved = resolveTestStorageFirebaseClientConfiguration(environment);
  const app = initializeApp(resolved.firebaseOptions);
  const storage = getStorage(app);
  const r = ref(storage, "test.txt");
  const snap = await uploadString(r, "hello", "raw");
  const url = await getDownloadURL(snap.ref);
  console.log("Success! URL:", url);
}

if (isTestStorageExecutedDirectly(import.meta.url, process.argv[1])) {
  void runStagingStorageSmokeTest().catch((error: unknown) => {
    const err = error as { code?: string; message?: string };
    console.error("Failed:", err.code, err.message);
    process.exitCode = 1;
  });
}
