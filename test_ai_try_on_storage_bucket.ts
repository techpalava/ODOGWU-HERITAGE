/**
 * AI Try-on private bucket: previews and shared model results go to the
 * dedicated bucket named by AI_TRY_ON_STORAGE_BUCKET; catalogue pictures stay
 * in the default bucket; outside production an unset name falls back to the
 * default bucket (logged once); in production an unset name keeps AI Try-on
 * unavailable. No network, no real bucket, no Gemini.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Firestore } from "firebase-admin/firestore";
import {
  AI_TRY_ON_STORAGE_BUCKET_ENV,
  aiTryOnStorageBucket,
  isAiTryOnStorageReady,
  readAiTryOnStorageBucketName,
  resetAiTryOnStorageBucketLogForTests,
} from "./src/server/aiTryOnStorageBucket";
import { handleAiTryOn, isAiTryOnEnabled } from "./src/server/aiTryOnHttp";
import type { HttpResponse } from "./src/server/httpTypes";

const DEDICATED = "gen-lang-client-0614710868-ai-try-on";
const FAKE_KEY = "AIza" + "x".repeat(35);
const ON = { AI_TRY_ON_ENABLED: "true", GEMINI_API_KEY: FAKE_KEY };

// ------------------------------------------------------------ bucket name
assert.equal(readAiTryOnStorageBucketName({ [AI_TRY_ON_STORAGE_BUCKET_ENV]: DEDICATED }), DEDICATED);
assert.equal(readAiTryOnStorageBucketName({ [AI_TRY_ON_STORAGE_BUCKET_ENV]: `  ${DEDICATED}\n` }), DEDICATED, "trimmed");
assert.equal(readAiTryOnStorageBucketName({}), null);
assert.equal(readAiTryOnStorageBucketName({ [AI_TRY_ON_STORAGE_BUCKET_ENV]: "" }), null);
for (const invalid of ["my.bucket.example.com", "Upper-Case", "a", "-leading", "trailing-", "x".repeat(64), "gs://bucket", "has space"]) {
  assert.equal(readAiTryOnStorageBucketName({ [AI_TRY_ON_STORAGE_BUCKET_ENV]: invalid }), null, `rejects ${invalid}`);
}

// ------------------------------------------------------------ production gate
assert.equal(isAiTryOnStorageReady({}), true, "local/dev: fallback allowed");
assert.equal(isAiTryOnStorageReady({ VERCEL_ENV: "preview" }), true, "Preview: fallback allowed");
assert.equal(isAiTryOnStorageReady({ VERCEL_ENV: "production" }), false, "production needs the bucket");
assert.equal(isAiTryOnStorageReady({ VERCEL_ENV: "production", [AI_TRY_ON_STORAGE_BUCKET_ENV]: "bad.name" }), false);
assert.equal(isAiTryOnStorageReady({ VERCEL_ENV: "production", [AI_TRY_ON_STORAGE_BUCKET_ENV]: DEDICATED }), true);

assert.equal(isAiTryOnEnabled(ON), true, "unchanged outside production");
assert.equal(isAiTryOnEnabled({ ...ON, VERCEL_ENV: "preview" }), true, "unchanged on Preview");
assert.equal(isAiTryOnEnabled({ ...ON, VERCEL_ENV: "production" }), false, "production without the bucket: unavailable");
assert.equal(isAiTryOnEnabled({ ...ON, VERCEL_ENV: "production", [AI_TRY_ON_STORAGE_BUCKET_ENV]: DEDICATED }), true);
assert.equal(isAiTryOnEnabled({ VERCEL_ENV: "production", [AI_TRY_ON_STORAGE_BUCKET_ENV]: DEDICATED }), false, "bucket alone does not switch it on");

const response = () => {
  const state: { status: number; body: unknown } = { status: 200, body: undefined };
  const res: HttpResponse = {
    status(code) { state.status = code; return res; },
    setHeader() { return res; },
    json(body) { state.body = body; return body; },
  };
  return { res, state };
};
{
  let dbCalls = 0;
  const deps = { environment: { ...ON, VERCEL_ENV: "production" }, getDb: () => { dbCalls += 1; return {} as Firestore; } };
  const get = response();
  await handleAiTryOn({ method: "GET", headers: {} }, get.res, deps);
  assert.deepEqual(get.state.body, { status: "unavailable", code: "NOT_CONFIGURED" }, "GET reports unavailable");
  const post = response();
  await handleAiTryOn({ method: "POST", headers: {}, body: {} }, post.res, deps);
  assert.equal(post.state.status, 503, "POST refused");
  assert.equal((post.state.body as { code: string }).code, "NOT_CONFIGURED");
  assert.equal(dbCalls, 0, "Firestore is never touched");
}

// ------------------------------------------------------------ bucket choice
const fakeStorage = () => {
  const asked: Array<string | undefined> = [];
  return { asked, storage: { bucket: (name?: string) => { asked.push(name); return { name: name ?? "<default>" }; } } };
};
{
  const { asked, storage } = fakeStorage();
  const lines: string[] = [];
  const bucket = aiTryOnStorageBucket({ environment: { [AI_TRY_ON_STORAGE_BUCKET_ENV]: DEDICATED }, storage, log: (line) => lines.push(line) });
  assert.deepEqual(bucket, { name: DEDICATED });
  assert.deepEqual(asked, [DEDICATED]);
  assert.equal(lines.length, 0, "nothing logged when configured");
}
{
  resetAiTryOnStorageBucketLogForTests();
  const { asked, storage } = fakeStorage();
  const lines: string[] = [];
  const log = (line: string) => lines.push(line);
  assert.deepEqual(aiTryOnStorageBucket({ environment: {}, storage, log }), { name: "<default>" });
  aiTryOnStorageBucket({ environment: { [AI_TRY_ON_STORAGE_BUCKET_ENV]: "bad.name" }, storage, log });
  assert.deepEqual(asked, [undefined, undefined], "falls back to the default bucket");
  assert.deepEqual(lines, ["AI Try-on storage: using the default bucket (AI_TRY_ON_STORAGE_BUCKET not set)"], "logged once, no details");
}

// ------------------------------------------------------------ wiring (static)
const http = readFileSync("src/server/aiTryOnHttp.ts", "utf8");
const cleanup = readFileSync("src/server/aiTryOnPaymentCleanup.ts", "utf8");
const block = (source: string, start: string) => source.slice(source.indexOf(start), source.indexOf(";\n", source.indexOf(start)) + 2);
assert.match(block(http, "const defaultPreviewStore"), /aiTryOnStorageBucket\(\)/, "preview store uses the dedicated bucket");
assert.match(block(http, "const defaultModelResultCache"), /aiTryOnStorageBucket\(\)/, "model cache uses the dedicated bucket");
assert.match(block(http, "const defaultLoadReferenceImage"), /getAdminServices\(\)\.storage\.bucket\(\)/, "catalogue pictures stay in the default bucket");
assert.doesNotMatch(block(http, "const defaultLoadReferenceImage"), /aiTryOnStorageBucket/);
// The store and the copy to a paid order (PR 2) share one dedicated bucket.
assert.match(cleanup, /dependencies\.getBucket \?\? \(\(\) => aiTryOnStorageBucket\(\) as unknown as AiTryOnPreviewBucket\)/, "payment cleanup uses the dedicated bucket");
assert.match(cleanup, /createAiTryOnPreviewStore\(database, bucket\(\)\)/, "the preview store gets that bucket");
assert.doesNotMatch(cleanup, /storage\.bucket\(\)/, "payment cleanup no longer uses the default bucket");

// The bucket name is server-only configuration.
const clientFiles: string[] = [];
const walk = (dir: string) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { if (entry !== "server") walk(path); }
    else if (/\.(ts|tsx)$/.test(entry)) clientFiles.push(path);
  }
};
walk("src");
for (const file of clientFiles) {
  assert.doesNotMatch(readFileSync(file, "utf8"), /AI_TRY_ON_STORAGE_BUCKET/, `${file} must not mention the server bucket`);
}

console.log("test_ai_try_on_storage_bucket: all assertions passed");
