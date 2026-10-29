import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";
import {
  buildCustomerReviewCreatePayload,
  buildCustomerReviewPhotoFields,
} from "./src/utils/customerReviews";

// Run: npm run test:customer-review-photo-rules-emulator (Firestore + Storage emulators).
const env = await initializeTestEnvironment({
  projectId: "demo-odogwu-site-feedback",
  firestore: { host: "127.0.0.1", port: 8088, rules: readFileSync("firestore.rules", "utf8") },
  storage: { host: "127.0.0.1", port: 9199, rules: readFileSync("storage.rules", "utf8") },
});

const value = { authorName: "Ada Obi", body: "Beautiful agbada, perfect fit.", rating: 5 as const, nationality: "NG" };
const base = (uid: string | null) => buildCustomerReviewCreatePayload(value, uid, serverTimestamp());
const withPhoto = (
  uid: string | null,
  reviewId: string,
  overrides: Record<string, unknown> = {},
  folderUid: string = uid ?? "anon-1",
) => ({
  ...base(uid),
  ...buildCustomerReviewPhotoFields({
    path: `customer-review-photos/${folderUid}/${reviewId}/photo.webp`,
    contentType: "image/webp",
    sizeBytes: 1234,
  }),
  ...overrides,
});

const guest = env.unauthenticatedContext();
const anon = env.authenticatedContext("anon-1", { firebase: { sign_in_provider: "anonymous" } });
const other = env.authenticatedContext("anon-2", { firebase: { sign_in_provider: "anonymous" } });
const admin = env.authenticatedContext("admin-1", { admin: true });
const reviews = (ctx: typeof guest, id: string) => doc(ctx.firestore(), `customer_reviews/${id}`);

const step = async (n: number, run: () => Promise<unknown>) => {
  try {
    return await run();
  } catch (error) {
    console.error(`rules step ${n} failed`);
    throw error;
  }
};

// --- Firestore -----------------------------------------------------------------
// Reviews without a photo keep working, signed out or not.
await step(1, () => assertSucceeds(setDoc(reviews(guest, "nophoto"), base(null))));
await step(2, () => assertSucceeds(setDoc(reviews(anon, "nophoto2"), base("anon-1"))));
// Photo in the creator's own folder for this review id, pending, with consent.
await step(3, () => assertSucceeds(setDoc(reviews(anon, "r1"), withPhoto("anon-1", "r1"))));
// JPEG and PNG paths match their types.
await step(4, () => assertSucceeds(setDoc(reviews(anon, "r2"), withPhoto("anon-1", "r2", {
  photoContentType: "image/jpeg", photoPath: "customer-review-photos/anon-1/r2/photo.jpg" }))));
// Signed out cannot attach a photo.
await step(5, () => assertFails(setDoc(reviews(guest, "g1"), withPhoto(null, "g1", {}, "anon-1"))));
// Creator uid must be the caller, and the folder must be the creator's.
await step(6, () => assertFails(setDoc(reviews(anon, "c1"), withPhoto(null, "c1", {}, "anon-1"))));
await step(7, () => assertFails(setDoc(reviews(other, "c2"), withPhoto("anon-2", "c2", {}, "anon-1"))));
await step(8, () => assertFails(setDoc(reviews(other, "c3"), withPhoto("anon-1", "c3"))));
// Another review's folder; wrong extension for the type.
await step(9, () => assertFails(setDoc(reviews(anon, "c4"), withPhoto("anon-1", "r1"))));
await step(10, () => assertFails(setDoc(reviews(anon, "c5"), withPhoto("anon-1", "c5", {
  photoContentType: "image/jpeg" }))));
await step(11, () => assertFails(setDoc(reviews(anon, "c6"), withPhoto("anon-1", "c6", {
  photoContentType: "image/gif", photoPath: "customer-review-photos/anon-1/c6/photo.gif" }))));
// photoStatus must start "pending".
await step(12, () => assertFails(setDoc(reviews(anon, "s1"), withPhoto("anon-1", "s1", { photoStatus: "approved" }))));
// Consent must be true.
await step(13, () => assertFails(setDoc(reviews(anon, "s2"), withPhoto("anon-1", "s2", { photoConsent: false }))));
{
  const { photoConsent: _c, ...noConsent } = withPhoto("anon-1", "s3");
  await step(14, () => assertFails(setDoc(reviews(anon, "s3"), noConsent)));
}
// Clients can never set the public URL.
await step(15, () => assertFails(setDoc(reviews(anon, "s4"), withPhoto("anon-1", "s4", { photoUrl: "https://x" }))));
// Size limit and type.
await step(16, () => assertFails(setDoc(reviews(anon, "s5"), withPhoto("anon-1", "s5", { photoSizeBytes: 5 * 1024 * 1024 + 1 }))));
await step(17, () => assertFails(setDoc(reviews(anon, "s6"), withPhoto("anon-1", "s6", { photoSizeBytes: 0 }))));
// Half a photo record.
await step(18, () => assertFails(setDoc(reviews(anon, "s7"), { ...base("anon-1"), photoStatus: "pending" })));
await step(19, () => assertFails(setDoc(reviews(anon, "s8"), { ...base("anon-1"), photoPath: "customer-review-photos/anon-1/s8/photo.webp" })));
// Review text still publishes immediately and stays publicly readable.
await step(20, () => assertSucceeds(getDoc(reviews(guest, "r1"))));
// Only admins moderate the photo.
await step(21, () => assertFails(updateDoc(reviews(anon, "r1"), { photoStatus: "approved" })));
await step(22, () => assertSucceeds(updateDoc(reviews(admin, "r1"), { photoStatus: "approved", photoUrl: "https://example.test/x.webp" })));
const read = (await step(23, () => assertSucceeds(getDoc(reviews(admin, "r1"))))) as any;
assert.equal(read.data()?.photoStatus, "approved");
assert.equal(read.data()?.status, "published");

// --- Storage ---------------------------------------------------------------------
const webp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
const meta = { contentType: "image/webp" };
const path = "customer-review-photos/anon-1/r1/photo.webp";
await step(30, () => assertSucceeds(uploadBytes(ref(anon.storage(), path), webp, meta)));
// No overwrite.
await step(31, () => assertFails(uploadBytes(ref(anon.storage(), path), webp, meta)));
// Signed out, other uid, wrong file name, wrong type, too big, empty.
await step(32, () => assertFails(uploadBytes(ref(guest.storage(), "customer-review-photos/anon-1/x1/photo.webp"), webp, meta)));
await step(33, () => assertFails(uploadBytes(ref(other.storage(), "customer-review-photos/anon-1/x2/photo.webp"), webp, meta)));
await step(34, () => assertFails(uploadBytes(ref(anon.storage(), "customer-review-photos/anon-1/x3/evil.webp"), webp, meta)));
await step(35, () => assertFails(uploadBytes(ref(anon.storage(), "customer-review-photos/anon-1/x4/photo.webp"), webp, { contentType: "image/gif" })));
await step(36, () => assertFails(uploadBytes(ref(anon.storage(), "customer-review-photos/anon-1/x5/photo.webp"), new Uint8Array(5 * 1024 * 1024 + 1), meta)));
await step(37, () => assertFails(uploadBytes(ref(anon.storage(), "customer-review-photos/anon-1/x6/photo.webp"), new Uint8Array(0), meta)));
// Only admins read the private upload.
await step(38, () => assertFails(getBytes(ref(anon.storage(), path))));
await step(39, () => assertFails(getBytes(ref(guest.storage(), path))));
await step(40, () => assertSucceeds(getBytes(ref(admin.storage(), path))));
// Owner cannot delete once the review document exists (r1 written in step 3).
await step(41, () => assertFails(deleteObject(ref(anon.storage(), path))));
// Orphan clean-up: no customer_reviews/{reviewId} doc, so the uploader may
// delete their own file; nobody else (other uid, signed out) may.
const orphan = "customer-review-photos/anon-1/orphan1/photo.webp";
await step(46, () => assertSucceeds(uploadBytes(ref(anon.storage(), orphan), webp, meta)));
await step(47, () => assertFails(deleteObject(ref(other.storage(), orphan))));
await step(48, () => assertFails(deleteObject(ref(guest.storage(), orphan))));
await step(49, () => assertSucceeds(deleteObject(ref(anon.storage(), orphan))));
// Admins can delete an orphan too.
const orphan2 = "customer-review-photos/anon-1/orphan2/photo.webp";
await step(50, () => assertSucceeds(uploadBytes(ref(anon.storage(), orphan2), webp, meta)));
await step(51, () => assertSucceeds(deleteObject(ref(admin.storage(), orphan2))));
// The owner's delete right ends as soon as the review is written.
const late = "customer-review-photos/anon-1/late1/photo.webp";
await step(52, () => assertSucceeds(uploadBytes(ref(anon.storage(), late), webp, meta)));
await step(53, () => assertSucceeds(setDoc(reviews(anon, "late1"), withPhoto("anon-1", "late1"))));
await step(54, () => assertFails(deleteObject(ref(anon.storage(), late))));
// Approval copy: admins write it, everyone can view it.
const publicPath = "communityPhotos/reviews/r1.webp";
await step(42, () => assertFails(uploadBytes(ref(anon.storage(), publicPath), webp, meta)));
await step(43, () => assertSucceeds(uploadBytes(ref(admin.storage(), publicPath), webp, meta)));
await step(44, () => assertSucceeds(getBytes(ref(guest.storage(), publicPath))));
// Admin can still delete once the review exists.
await step(45, () => assertSucceeds(deleteObject(ref(admin.storage(), path))));
await step(55, () => assertSucceeds(deleteObject(ref(admin.storage(), late))));

await env.cleanup();
console.log("PASS: customer review photo Firestore and Storage rules (emulator)");
process.exit(0);
