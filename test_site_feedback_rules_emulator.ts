import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";
import { buildSiteFeedbackCreatePayload } from "./src/utils/siteFeedback";

// Run: npm run test:site-feedback-rules-emulator (Firestore + Storage emulators).
const env = await initializeTestEnvironment({
  projectId: "demo-odogwu-site-feedback",
  firestore: { host: "127.0.0.1", port: 8088, rules: readFileSync("firestore.rules", "utf8") },
  storage: { host: "127.0.0.1", port: 9199, rules: readFileSync("storage.rules", "utf8") },
});

const context = { page: "/", tab: "home", studioStep: null, userAgent: "UA", viewport: "1280x800", uid: null };
const value = { type: "bug" as const, message: "Rules emulator check", email: null };
const v2 = (photo: Parameters<typeof buildSiteFeedbackCreatePayload>[3] = null, extra: Record<string, unknown> = {}) => ({
  ...buildSiteFeedbackCreatePayload({ ...value, nationality: "NG" }, context, serverTimestamp(), photo),
  ...extra,
});
const v1 = () => {
  const { nationality: _n, photoPath: _p, photoContentType: _c, photoSizeBytes: _s, ...rest } = v2();
  return { ...rest, schemaVersion: 1 };
};

const guest = env.unauthenticatedContext();
const anon = env.authenticatedContext("anon-1", { firebase: { sign_in_provider: "anonymous" } });
const other = env.authenticatedContext("anon-2", { firebase: { sign_in_provider: "anonymous" } });
const admin = env.authenticatedContext("admin-1", { admin: true });

const step = async (n: number, run: () => Promise<unknown>) => {
  try {
    return await run();
  } catch (error) {
    console.error(`rules step ${n} failed`);
    throw error;
  }
};

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

// --- Firestore -----------------------------------------------------------------
// The live v1 form keeps working (no new keys).
await step(1, () => assertSucceeds(setDoc(doc(guest.firestore(), "site_feedback/v1doc"), v1())));
// v2 without a photo: nationality only.
await step(2, () => assertSucceeds(setDoc(doc(guest.firestore(), "site_feedback/v2nophoto"), v2())));
// Bad nationality.
await step(3, () => assertFails(setDoc(doc(guest.firestore(), "site_feedback/badnat"), v2(null, { nationality: "Nigeria" }))));
// Unknown extra key.
await step(4, () => assertFails(setDoc(doc(guest.firestore(), "site_feedback/extra"), v2(null, { photoUrl: "x" }))));
// Wrong schema version.
await step(5, () => assertFails(setDoc(doc(guest.firestore(), "site_feedback/v3"), v2(null, { schemaVersion: 3 }))));
// v2 with a photo in the caller's own folder for this doc id.
const photo = { path: "site-feedback/anon-1/withphoto/photo.png", contentType: "image/png" as const, sizeBytes: 12 };
await step(6, () => assertSucceeds(setDoc(doc(anon.firestore(), "site_feedback/withphoto"), v2(photo))));
// Signed out cannot attach a photo.
await step(7, () => assertFails(setDoc(doc(guest.firestore(), "site_feedback/withphoto2"), v2({ ...photo, path: "site-feedback/anon-1/withphoto2/photo.png" }))));
// Someone else's folder, another doc's folder, wrong extension, too big.
await step(8, () => assertFails(setDoc(doc(other.firestore(), "site_feedback/p1"), v2({ ...photo, path: "site-feedback/anon-1/p1/photo.png" }))));
await step(9, () => assertFails(setDoc(doc(anon.firestore(), "site_feedback/p2"), v2({ ...photo, path: "site-feedback/anon-1/withphoto/photo.png" }))));
await step(10, () => assertFails(setDoc(doc(anon.firestore(), "site_feedback/p3"), v2({ ...photo, path: "site-feedback/anon-1/p3/photo.jpg" }))));
await step(11, () => assertFails(setDoc(doc(anon.firestore(), "site_feedback/p4"), v2({ ...photo, path: "site-feedback/anon-1/p4/photo.png", sizeBytes: 5 * 1024 * 1024 + 1 }))));
// Half a photo record.
await step(12, () => assertFails(setDoc(doc(anon.firestore(), "site_feedback/p5"), v2(null, { photoPath: "site-feedback/anon-1/p5/photo.png" }))));
// Visitors still cannot read or edit; admins can read.
await step(13, () => assertFails(getDoc(doc(anon.firestore(), "site_feedback/withphoto"))));
await step(14, () => assertFails(updateDoc(doc(anon.firestore(), "site_feedback/withphoto"), { status: "new" })));
const adminRead = (await step(15, () => assertSucceeds(getDoc(doc(admin.firestore(), "site_feedback/withphoto"))))) as any;
assert.equal(adminRead.data()?.nationality, "NG");

// --- Storage ---------------------------------------------------------------------
const meta = { contentType: "image/png" };
await step(16, () => assertSucceeds(uploadBytes(ref(anon.storage(), "site-feedback/anon-1/withphoto/photo.png"), png, meta)));
// No overwrite.
await step(17, () => assertFails(uploadBytes(ref(anon.storage(), "site-feedback/anon-1/withphoto/photo.png"), png, meta)));
// Signed out, other uid, wrong file name, wrong type, too big.
await step(18, () => assertFails(uploadBytes(ref(guest.storage(), "site-feedback/anon-1/x1/photo.png"), png, meta)));
await step(19, () => assertFails(uploadBytes(ref(other.storage(), "site-feedback/anon-1/x2/photo.png"), png, meta)));
await step(20, () => assertFails(uploadBytes(ref(anon.storage(), "site-feedback/anon-1/x3/evil.png"), png, meta)));
await step(21, () => assertFails(uploadBytes(ref(anon.storage(), "site-feedback/anon-1/x4/photo.png"), png, { contentType: "image/gif" })));
await step(22, () => assertFails(uploadBytes(ref(anon.storage(), "site-feedback/anon-1/x5/photo.png"), new Uint8Array(5 * 1024 * 1024 + 1), meta)));
// Only admins read it back.
await step(23, () => assertFails(getBytes(ref(anon.storage(), "site-feedback/anon-1/withphoto/photo.png"))));
await step(24, () => assertSucceeds(getBytes(ref(admin.storage(), "site-feedback/anon-1/withphoto/photo.png"))));

await env.cleanup();
console.log("PASS: site feedback Firestore and Storage rules (emulator)");
process.exit(0);
