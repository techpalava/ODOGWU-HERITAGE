#!/usr/bin/env node
/**
 * Guard: every Vercel function in api/ must load under native Node ESM.
 *
 * Vercel compiles each api/**\/*.ts file (and what it imports) one file at a
 * time and keeps import specifiers as written. With "type": "module", Node then
 * refuses extensionless relative imports (ERR_MODULE_NOT_FOUND) and the
 * function crashes with FUNCTION_INVOCATION_FAILED before any handler runs.
 *
 * This script mirrors that: it transpiles api/ and src/ per file with esbuild
 * (no bundling), then dynamic-imports every function in a fresh Node process.
 */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const walk = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
};

const sources = [...walk(path.join(root, "api")), ...walk(path.join(root, "src"))];
const tsFiles = sources.filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts"));
const functions = walk(path.join(root, "api")).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".d.ts"),
);

const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "check-api-esm-"));
try {
  await build({
    entryPoints: tsFiles,
    outdir: outDir,
    outbase: root,
    bundle: false,
    format: "esm",
    platform: "node",
    target: "esnext",
    jsx: "automatic",
    logLevel: "error",
  });
  // Non-TS assets (JSON, etc.) keep their paths, as on Vercel.
  for (const file of sources.filter((f) => !/\.(ts|tsx)$/.test(f))) {
    const dest = path.join(outDir, path.relative(root, file));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(file, dest);
  }
  for (const file of fs.readdirSync(root)) {
    if (file.endsWith(".json")) fs.copyFileSync(path.join(root, file), path.join(outDir, file));
  }
  fs.symlinkSync(path.join(root, "node_modules"), path.join(outDir, "node_modules"), "dir");

  const failures = [];
  for (const fn of functions) {
    const rel = path.relative(root, fn);
    const compiled = path.join(outDir, rel.replace(/\.ts$/, ".js"));
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import(${JSON.stringify(compiled)}).then(()=>process.exit(0)).catch(e=>{console.error((e&&e.code?e.code+": ":"")+String(e&&e.message||e).split("\\n")[0]);process.exit(1)})`,
      ],
      { cwd: outDir, encoding: "utf8", env: { ...process.env, NODE_ENV: "production" } },
    );
    if (result.status === 0) {
      console.log(`ok    ${rel}`);
    } else {
      const reason = (result.stderr || result.stdout || "").trim().split(outDir + path.sep).join("");
      console.log(`FAIL  ${rel}\n      ${reason}`);
      failures.push(rel);
    }
  }
  if (failures.length) {
    console.error(
      `\n${failures.length} API function(s) cannot load under Node ESM. ` +
        `Relative imports reachable from api/ must end in ".js".`,
    );
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${functions.length} API functions load under Node ESM.`);
  }
} finally {
  fs.rmSync(outDir, { recursive: true, force: true });
}
