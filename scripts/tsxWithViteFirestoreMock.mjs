#!/usr/bin/env node
/**
 * Runs a React test with Vite and an inert Firestore module. It is for UI tests
 * that mount an Admin surface while supplying their own in-memory persistence
 * boundary; no Firestore listener or write can reach a configured project.
 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [testFile, ...forwardArgs] = process.argv.slice(2);

if (!testFile) {
  console.error("Usage: node scripts/tsxWithViteFirestoreMock.mjs <test-file> [...args]");
  process.exit(1);
}

const resolvedEntry = path.resolve(repoRoot, testFile);
const relativeEntry = path.relative(repoRoot, resolvedEntry);
if (relativeEntry.startsWith("..") || path.isAbsolute(relativeEntry)) {
  console.error(`Test file must be inside the repository root: ${testFile}`);
  process.exit(1);
}

const moduleId = `/${relativeEntry.split(path.sep).join("/")}`;
const firestoreMockId = "\0odogwu-test-firestore";
const firestoreMockSource = `
  const ref = (...parts) => ({ id: String(parts.at(-1) ?? ""), path: parts.slice(1).join("/"), parts });
  export const getFirestore = () => ({});
  export const collection = (...parts) => ref(...parts);
  export const doc = (...parts) => ref(...parts);
  export const query = (...parts) => ({ parts });
  export const where = (...parts) => ({ parts });
  export const limit = (value) => ({ value });
  export const onSnapshot = () => () => undefined;
  export const deleteDoc = async () => undefined;
  export const setDoc = async () => undefined;
  export const updateDoc = async () => undefined;
  export const getDoc = async () => ({ id: "", exists: () => false, data: () => undefined });
  export const getDocs = async () => ({ empty: true, docs: [] });
  export const runTransaction = async (_db, callback) => callback({ get: getDoc, set: () => undefined, update: () => undefined, delete: () => undefined });
  export const writeBatch = () => ({ set: () => undefined, update: () => undefined, delete: () => undefined, commit: async () => undefined });
  export const serverTimestamp = () => ({ __testServerTimestamp: true });
`;

const previousArgv = process.argv.slice();
process.argv = [previousArgv[0], resolvedEntry, ...forwardArgs];
process.chdir(repoRoot);

let server;
let exitCode = 0;

try {
  server = await createServer({
    configFile: false,
    root: repoRoot,
    envFile: false,
    mode: "production",
    appType: "custom",
    plugins: [
      react(),
      {
        name: "odogwu-test-firestore-mock",
        resolveId(id) {
          return id === "firebase/firestore" ? firestoreMockId : null;
        },
        load(id) {
          return id === firestoreMockId ? firestoreMockSource : null;
        },
      },
    ],
    resolve: { alias: { "@": repoRoot } },
    define: {
      "import.meta.env.DEV": "false",
      "import.meta.env.PROD": "true",
      "import.meta.env.MODE": JSON.stringify("production"),
    },
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await server.ssrLoadModule(moduleId);
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  process.argv = previousArgv;
  if (server) await server.close();
}

process.exit(exitCode);
