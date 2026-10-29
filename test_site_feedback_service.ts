import assert from "node:assert/strict";
import { SITE_FEEDBACK_CREATE_KEYS } from "./src/utils/siteFeedback";

// Run with scripts/tsxWithViteProductionFirebase.mjs (the service imports
// Firebase). Every Firebase call is replaced by the injected deps below.
const { submitSiteFeedback } = await import("./src/services/siteFeedbackService");

const context = { page: "/", tab: "home", studioStep: null, userAgent: "UA", viewport: "1280x800", uid: "ignored" };

const makeDeps = (calls: string[], signedInUid: string | null = null) => {
  const written: Record<string, unknown>[] = [];
  return {
    written,
    deps: {
      newFeedbackId: () => "fb1",
      ensureUploadUid: async () => {
        calls.push("identity");
        return "anon-uid";
      },
      preparePhoto: async (file: File) => {
        calls.push("prepare");
        return { blob: new Blob([new Uint8Array(321)], { type: "image/webp" }), contentType: "image/webp" as const, original: file };
      },
      uploadPhoto: async (path: string) => {
        calls.push(`upload:${path}`);
      },
      signedInUid: () => signedInUid,
      writeFeedback: async (id: string, data: Record<string, unknown>) => {
        calls.push(`write:${id}`);
        written.push(data);
      },
    },
  };
};

// No photo: no anonymous sign-in, no upload, photo fields null.
{
  const calls: string[] = [];
  const { deps, written } = makeDeps(calls);
  const id = await submitSiteFeedback({ type: "bug", message: "Broken button", email: null }, context, null, deps);
  assert.equal(id, "fb1");
  assert.deepEqual(calls, ["write:fb1"]);
  assert.equal(written[0].photoPath, null);
  assert.equal(written[0].nationality, null);
  assert.equal(written[0].uid, null, "guests keep uid null");
  assert.equal(written[0].schemaVersion, 2);
  assert.deepEqual(
    [...Object.keys(written[0]), "createdAt"].sort(),
    [...SITE_FEEDBACK_CREATE_KEYS].sort(),
    "service adds createdAt (serverTimestamp) on write",
  );
}

// Photo: identity, shrink, upload to the doc's own folder, THEN write.
{
  const calls: string[] = [];
  const { deps, written } = makeDeps(calls);
  const file = new File([new Uint8Array(4096)], "shot.png", { type: "image/png" });
  await submitSiteFeedback({ type: "idea", message: "See photo", email: null, nationality: "NG" }, context, file, deps);
  assert.deepEqual(calls, ["identity", "prepare", "upload:site-feedback/anon-uid/fb1/photo.webp", "write:fb1"]);
  assert.equal(written[0].photoPath, "site-feedback/anon-uid/fb1/photo.webp");
  assert.equal(written[0].photoContentType, "image/webp");
  assert.equal(written[0].photoSizeBytes, 321);
  assert.equal(written[0].nationality, "NG");
  assert.equal(written[0].uid, null, "anonymous upload identity is not recorded as a signed-in uid");
}

// Signed-in user: uid recorded.
{
  const calls: string[] = [];
  const { deps, written } = makeDeps(calls, "real-uid");
  await submitSiteFeedback({ type: "other", message: "Hello there", email: null }, context, null, deps);
  assert.equal(written[0].uid, "real-uid");
}

// Upload failure: nothing is written, the error reaches the form.
{
  const calls: string[] = [];
  const { deps, written } = makeDeps(calls);
  deps.uploadPhoto = async () => {
    throw new Error("storage/unauthorized");
  };
  const file = new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" });
  await assert.rejects(
    submitSiteFeedback({ type: "bug", message: "Upload fails", email: null }, context, file, deps),
    /storage\/unauthorized/,
  );
  assert.equal(written.length, 0);
}

console.log("PASS: site feedback service");
process.exit(0);
