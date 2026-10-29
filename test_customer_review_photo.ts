import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { CustomerReviewCard } from "./src/components/CustomerReviewCard";
import type { CustomerReview } from "./src/types";
import {
  CUSTOMER_REVIEW_CREATE_KEYS,
  CUSTOMER_REVIEW_PHOTO_CONSENT_LABEL,
  approvedReviewPhotoUrl,
  buildApprovedCustomerReviewPhotoPath,
  buildCustomerReviewCreatePayload,
  buildCustomerReviewPhotoFields,
  buildCustomerReviewPhotoPath,
  filterReviewsWithPendingPhotos,
  hasPendingReviewPhoto,
  normalizeCustomerReview,
  validateCustomerReviewPhotoConsent,
  validateCustomerReviewPhotoFile,
} from "./src/utils/customerReviews";
import {
  CUSTOMER_REVIEW_PHOTO_COMPRESSION_ERROR,
  CustomerReviewPhotoError,
  prepareCustomerReviewPhoto,
  type CustomerReviewPhotoEncoder,
} from "./src/utils/customerReviewPhoto";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const MB = 1024 * 1024;
const file = (type: string, size: number) =>
  Object.assign(new Blob([new Uint8Array(size)], { type }), { name: "me.jpg" });

// --- File validation ---------------------------------------------------------
assert.equal(validateCustomerReviewPhotoFile({ type: "image/jpeg", size: 1000 }), null);
assert.equal(validateCustomerReviewPhotoFile({ type: "image/png", size: 5 * MB }), null, "exactly 5 MB ok");
assert.equal(validateCustomerReviewPhotoFile({ type: "image/webp", size: 10 }), null);
assert.match(validateCustomerReviewPhotoFile({ type: "image/gif", size: 10 }) ?? "", /JPEG, PNG or WebP/);
assert.match(validateCustomerReviewPhotoFile({ type: "image/heic", size: 10 }) ?? "", /JPEG, PNG or WebP/);
assert.match(validateCustomerReviewPhotoFile({ type: "image/jpeg", size: 5 * MB + 1 }) ?? "", /larger than 5 MB/);
assert.match(validateCustomerReviewPhotoFile({ type: "image/jpeg", size: 0 }) ?? "", /empty/);

// Consent only when a photo is attached.
assert.equal(validateCustomerReviewPhotoConsent(false, false), null);
assert.equal(validateCustomerReviewPhotoConsent(true, true), null);
assert.match(validateCustomerReviewPhotoConsent(true, false) ?? "", /agree/);
assert.equal(
  CUSTOMER_REVIEW_PHOTO_CONSENT_LABEL,
  "I agree ODOGWU may show this photo publicly with my review.",
);

// --- Paths and payload -------------------------------------------------------
assert.equal(buildCustomerReviewPhotoPath("u1", "r1", "image/webp"), "customer-review-photos/u1/r1/photo.webp");
assert.equal(buildCustomerReviewPhotoPath("u1", "r1", "image/jpeg"), "customer-review-photos/u1/r1/photo.jpg");
assert.equal(buildCustomerReviewPhotoPath("u1", "r1", "image/png"), "customer-review-photos/u1/r1/photo.png");
assert.equal(buildApprovedCustomerReviewPhotoPath("r1"), "communityPhotos/reviews/r1.webp");
const fields = buildCustomerReviewPhotoFields({ path: "customer-review-photos/u1/r1/photo.webp", contentType: "image/webp", sizeBytes: 42 });
assert.deepEqual(fields, {
  photoPath: "customer-review-photos/u1/r1/photo.webp",
  photoContentType: "image/webp",
  photoSizeBytes: 42,
  photoConsent: true,
  photoStatus: "pending",
});
for (const key of Object.keys(fields)) {
  assert.ok((CUSTOMER_REVIEW_CREATE_KEYS as readonly string[]).includes(key), key);
}
assert.equal((CUSTOMER_REVIEW_CREATE_KEYS as readonly string[]).includes("photoUrl"), false, "photoUrl never client-created");
// A review without a photo keeps exactly today's payload.
{
  const payload = buildCustomerReviewCreatePayload(
    { authorName: "Ada", body: "Lovely agbada fit.", rating: 5 },
    null,
    "ts",
  );
  assert.equal(Object.keys(payload).some((key) => key.startsWith("photo")), false);
}

// --- Normalising --------------------------------------------------------------
const legacy = normalizeCustomerReview("old", { authorName: "A", body: "b", rating: 5, status: "published" });
assert.equal(Object.keys(legacy).some((key) => key.startsWith("photo")), false, "old reviews unchanged");
const pending = normalizeCustomerReview("p", {
  authorName: "A", body: "b", rating: 5, status: "published",
  photoPath: "customer-review-photos/u/p/photo.webp", photoContentType: "image/webp",
  photoSizeBytes: 10, photoConsent: true, photoStatus: "pending",
});
assert.equal(pending.photoStatus, "pending");
assert.equal(hasPendingReviewPhoto(pending), true);
assert.equal(approvedReviewPhotoUrl(pending), null);
const approved = normalizeCustomerReview("a", {
  authorName: "A", body: "b", rating: 5, status: "published",
  photoPath: "customer-review-photos/u/a/photo.webp", photoStatus: "approved",
  photoUrl: "https://cdn.test/a.webp", photoConsent: true,
});
assert.equal(approvedReviewPhotoUrl(approved), "https://cdn.test/a.webp");
assert.equal(hasPendingReviewPhoto(approved), false);
// A URL without approval is never shown.
assert.equal(approvedReviewPhotoUrl({ photoStatus: "pending", photoUrl: "https://x" }), null);
assert.equal(approvedReviewPhotoUrl({ photoUrl: "https://x" }), null);
const weird = normalizeCustomerReview("w", { photoPath: "x", photoStatus: "live", photoContentType: "image/gif" });
assert.equal(weird.photoStatus, undefined);
assert.equal(weird.photoContentType, undefined);
assert.deepEqual(filterReviewsWithPendingPhotos([legacy, pending, approved]).map((r) => r.id), ["p"]);

// --- Strict compression ------------------------------------------------------
type Canvas = ReturnType<CustomerReviewPhotoEncoder["createCanvas"]>;
function encoder(opts: {
  width?: number;
  height?: number;
  decodeFails?: boolean;
  noContext?: boolean;
  output?: (type: string, quality: number) => Blob | null;
  toBlobThrows?: boolean;
}) {
  const log: string[] = [];
  let canvas!: Canvas;
  let closed = false;
  const enc: CustomerReviewPhotoEncoder = {
    decode: async () => {
      if (opts.decodeFails) throw new Error("decode");
      return { width: opts.width ?? 4000, height: opts.height ?? 3000, close: () => void (closed = true) };
    },
    createCanvas: () => {
      canvas = {
        width: 0,
        height: 0,
        getContext: () => (opts.noContext ? null : { drawImage: (_i, _x, _y, w, h) => void log.push(`draw:${w}x${h}`) }),
        toBlob: (cb, type, quality) => {
          if (opts.toBlobThrows) throw new Error("toBlob");
          log.push(`encode:${type}@${quality}`);
          cb(opts.output ? opts.output(type, quality) : new Blob([new Uint8Array(100)], { type }));
        },
      };
      return canvas;
    },
  };
  return { enc, log, isClosed: () => closed };
}
const big = file("image/jpeg", 3 * MB);

// WebP 0.82 at max 1600 px on the longest side.
{
  const { enc, log, isClosed } = encoder({});
  const out = await prepareCustomerReviewPhoto(big, enc);
  assert.equal(out.contentType, "image/webp");
  assert.notEqual(out.blob, big, "never the original");
  assert.deepEqual(log, ["draw:1600x1200", "encode:image/webp@0.82"]);
  assert.equal(isClosed(), true);
}
// Portrait.
{
  const { enc, log } = encoder({ width: 3000, height: 4000 });
  await prepareCustomerReviewPhoto(big, enc);
  assert.equal(log[0], "draw:1200x1600");
}
// Small photos are still re-encoded (strips EXIF/GPS), never passed through.
{
  const small = file("image/jpeg", 2000);
  const { enc, log } = encoder({ width: 800, height: 600, output: (type) => new Blob([new Uint8Array(5000)], { type }) });
  const out = await prepareCustomerReviewPhoto(small, enc);
  assert.notEqual(out.blob, small);
  assert.equal(out.blob.size, 5000, "re-encoded copy kept even when bigger");
  assert.equal(log[0], "draw:800x600");
}
// JPEG 0.85 fallback when WebP cannot be encoded.
{
  const { enc, log } = encoder({ output: (type) => (type === "image/webp" ? new Blob([new Uint8Array(1)], { type: "image/png" }) : new Blob([new Uint8Array(50)], { type })) });
  const out = await prepareCustomerReviewPhoto(big, enc);
  assert.equal(out.contentType, "image/jpeg");
  assert.deepEqual(log.slice(1), ["encode:image/webp@0.82", "encode:image/jpeg@0.85"]);
}
// STRICT failures: every one rejects, none returns the original.
const failures: Array<[string, Parameters<typeof encoder>[0] | null]> = [
  ["no canvas support", null],
  ["decode fails", { decodeFails: true }],
  ["zero size image", { width: 0, height: 0 }],
  ["no 2d context", { noContext: true }],
  ["toBlob throws", { toBlobThrows: true }],
  ["encoders return null", { output: () => null }],
  ["only PNG comes back", { output: () => new Blob([new Uint8Array(1)], { type: "image/png" }) }],
  ["empty output", { output: (type) => new Blob([], { type }) }],
  ["output over 5 MB", { output: (type) => new Blob([new Uint8Array(5 * MB + 1)], { type }) }],
];
for (const [label, opts] of failures) {
  await assert.rejects(
    prepareCustomerReviewPhoto(big, opts ? encoder(opts).enc : null),
    (error: unknown) =>
      error instanceof CustomerReviewPhotoError &&
      error.code === "compression-failed" &&
      error.message === CUSTOMER_REVIEW_PHOTO_COMPRESSION_ERROR,
    label,
  );
}
// Wrong type / too big are rejected before decoding.
{
  const { enc, log } = encoder({});
  await assert.rejects(prepareCustomerReviewPhoto(file("image/gif", 10), enc), (e: unknown) => e instanceof CustomerReviewPhotoError && e.code === "invalid-file");
  await assert.rejects(prepareCustomerReviewPhoto(file("image/jpeg", 5 * MB + 1), enc), /larger than 5 MB/);
  assert.equal(log.length, 0);
}
// Source check: the strict helper has no path that hands back the input file.
{
  const source = readFileSync("src/utils/customerReviewPhoto.ts", "utf8");
  assert.doesNotMatch(source, /return\s+(original|file)\b/);
  assert.doesNotMatch(source, /blob:\s*file/);
}

// --- Public card ---------------------------------------------------------------
const textOf = (node: ReactTestInstance | string): string =>
  typeof node === "string" ? node : node.children.map((c) => textOf(c as ReactTestInstance | string)).join("");
function review(overrides: Partial<CustomerReview> = {}): CustomerReview {
  return {
    id: "c1", authorName: "Ada Obi", body: "Lovely agbada fit.", rating: 5, status: "published",
    featured: false, displayOrder: 0, createdAt: "2026-10-01T00:00:00.000Z", createdByUid: null, ...overrides,
  };
}
function renderCard(overrides: Partial<CustomerReview>) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(createElement(CustomerReviewCard, { review: review(overrides) }));
  });
  return renderer;
}
{
  const pendingCard = renderCard({ photoPath: "customer-review-photos/u/c1/photo.webp", photoStatus: "pending", photoUrl: "https://leak.test/x" });
  assert.equal(pendingCard.root.findAllByType("img").length, 0, "pending photo hidden");
  const noPhoto = renderCard({});
  assert.equal(noPhoto.root.findAllByType("img").length, 0);
  const approvedNoUrl = renderCard({ photoPath: "p", photoStatus: "approved" });
  assert.equal(approvedNoUrl.root.findAllByType("img").length, 0);
}
{
  const card = renderCard({ photoPath: "p", photoStatus: "approved", photoUrl: "https://cdn.test/c1.webp", location: "Lagos", nationality: "NG" });
  const imgs = card.root.findAllByType("img");
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].props.src, "https://cdn.test/c1.webp");
  assert.match(imgs[0].props.alt, /Ada Obi/);
  assert.equal(
    textOf(card.root.find((n) => n.props["data-customer-review-origin"] === "true")),
    "Lagos · Nigeria",
    "origin line unchanged",
  );
  // Tap to view larger.
  const opener = card.root.find((n) => n.type === "button" && n.props["data-customer-review-photo"] === "true");
  assert.equal(card.root.findAll((n) => n.props["data-customer-review-photo-lightbox"] === "true").length, 0);
  act(() => opener.props.onClick());
  const box = card.root.find((n) => n.type === "div" && n.props["data-customer-review-photo-lightbox"] === "true");
  assert.equal(box.findAllByType("img")[0].props.src, "https://cdn.test/c1.webp");
  const close = box.find((n) => n.type === "button" && n.props["aria-label"] === "Close photo");
  act(() => close.props.onClick());
  assert.equal(card.root.findAll((n) => n.props["data-customer-review-photo-lightbox"] === "true").length, 0);
}

console.log("PASS: customer review photo helpers, strict compression and card");
