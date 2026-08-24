#!/usr/bin/env node
/**
 * Runs a Node test that may transitively import src/services/firebase.ts.
 *
 * Why raw `tsx` fails:
 *   firebase.ts calls resolveFirebaseRuntimeMode(import.meta.env).
 *   Under plain Node/tsx, import.meta.env has no Vite DEV/PROD/MODE.
 *
 * Why createServer({ mode: "production" }) alone is insufficient:
 *   Vite's middleware/dev server still sets DEV=true / PROD=false, which
 *   contradicts MODE=production and fails resolveFirebaseRuntimeMode.
 *
 * Why configFile must not be an absolute Windows path:
 *   Vite mis-resolves absolute vite.config.ts paths and throws
 *   "Cannot read directory ../../../../.." Access is denied.
 *   This harness uses configFile: false and inlines only the minimal
 *   React plugin needed for .tsx tests.
 *
 * Usage:
 *   node scripts/tsxWithViteProductionFirebase.mjs <test-file> [...args]
 *   npm run test:fabric-allocation-persistence
 *   npm run test:with-vite-firebase -- test_design_source_draft.ts
 */
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [testFile, ...forwardArgs] = process.argv.slice(2);

if (!testFile) {
  console.error(
    "Usage: node scripts/tsxWithViteProductionFirebase.mjs <test-file> [...args]",
  );
  process.exit(1);
}

const resolvedEntry = path.resolve(repoRoot, testFile);
const relativeEntry = path.relative(repoRoot, resolvedEntry);
if (relativeEntry.startsWith("..") || path.isAbsolute(relativeEntry)) {
  console.error(
    `Test file must be inside the repository root: ${testFile}`,
  );
  process.exit(1);
}

/** Vite module URL: repo-relative POSIX path with leading slash. */
const moduleId = `/${relativeEntry.split(path.sep).join("/")}`;

const previousArgv = process.argv.slice();
process.argv = [previousArgv[0], resolvedEntry, ...forwardArgs];
process.chdir(repoRoot);

let server;
let exitCode = 0;

try {
  server = await createServer({
    // Never pass an absolute Windows configFile path — Vite fails on it.
    configFile: false,
    root: repoRoot,
    envFile: false,
    mode: "production",
    appType: "custom",
    plugins: [react()],
    resolve: {
      alias: {
        "@": repoRoot,
      },
    },
    define: {
      "import.meta.env.DEV": "false",
      "import.meta.env.PROD": "true",
      "import.meta.env.MODE": JSON.stringify("production"),
    },
    server: {
      middlewareMode: true,
      hmr: false,
      watch: null,
      // Avoid colliding with another Vite instance on the default HMR port.
      ws: false,
    },
    optimizeDeps: {
      noDiscovery: true,
      include: [],
    },
  });

  await server.ssrLoadModule(moduleId);
} catch (error) {
  exitCode = 1;
  console.error(error);
} finally {
  process.argv = previousArgv;
  if (server) {
    await server.close();
  }
}

process.exit(exitCode);
