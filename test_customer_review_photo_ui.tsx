import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import type { CustomerReview } from "./src/types";

// Run: npm run test:customer-review-photo-ui (Vite env; the form, panel and
// service import Firebase). Every Firebase call is replaced by injected deps.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, String(value)),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
};
if (typeof globalThis.localStorage === "undefined") {
  Object.assign(globalThis, { localStorage: storage, sessionStorage: storage });
}
let confirmAnswer = true;
if (typeof globalThis.window === "undefined") {
  Object.assign(globalThis, {
    window: {
      addEventListener() {},
      removeEventListener() {},
      confirm: () => confirmAnswer,
      location: { pathname: "/", search: "", hash: "", href: "http://localhost/" },
      history: { replaceState() {}, pushState() {} },
      scrollY: 0,
      scrollTo() {},
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      localStorage: storage,
      sessionStorage: storage,
    },
  });
}

const {
  CustomerReviewPhotoSubmitError,
  approveReviewPhoto,
  deleteReviewPhotoFiles,
  rejectReviewPhoto,
  submitCustomerReviewWithPhoto,
} = await import("./src/services/customerReviewPhotoService");
const { CUSTOMER_REVIEW_CREATE_KEYS } = await import("./src/utils/customerReviews");
const { CustomerReviewPhotoError, CUSTOMER_REVIEW_PHOTO_COMPRESSION_ERROR } = await import("./src/utils/customerReviewPhoto");
const { default: CustomerReviewForm } = await import("./src/components/CustomerReviewForm");
const { default: AdminReviewsPanel } = await import("./src/components/AdminReviewsPanel");
const { StorageService } = await import("./src/services/storageService");
const { useAppStore } = await import("./src/store/useAppStore");

const webp = () => ({ blob: new Blob([new Uint8Array(321)], { type: "image/webp" }), contentType: "image/webp" as const });
const value = { authorName: "Ada Obi", body: "Beautiful agbada, perfect fit.", rating: 5 as const, nationality: "NG" };

// --- Service: submit with injected deps --------------------------------------
function submitDeps(fail: Partial<Record<"identity" | "upload" | "write" | "cleanup", boolean>> = {}) {
  const calls: string[] = [];
  const written: Record<string, unknown>[] = [];
  let n = 0;
  return {
    calls,
    written,
    deps: {
      newReviewId: () => `rev${++n}`,
      ensureUploadUid: async () => {
        calls.push("identity");
        if (fail.identity) throw new Error("auth");
        return "anon-uid";
      },
      uploadPhoto: async (path: string, photo: { blob: Blob; contentType: string }) => {
        calls.push(`upload:${path}:${photo.contentType}:${photo.blob.size}`);
        if (fail.upload) throw new Error("upload");
      },
      deletePhoto: async (path: string) => {
        calls.push(`delete:${path}`);
        if (fail.cleanup) throw new Error("cleanup");
      },
      writeReview: async (id: string, data: Record<string, unknown>) => {
        calls.push(`write:${id}`);
        if (fail.write) throw new Error("write");
        written.push(data);
      },
    },
  };
}
{
  const { deps, calls, written } = submitDeps();
  const id = await submitCustomerReviewWithPhoto(value, webp(), deps);
  assert.equal(id, "rev1");
  assert.deepEqual(calls, ["identity", "upload:customer-review-photos/anon-uid/rev1/photo.webp:image/webp:321", "write:rev1"]);
  const data = written[0];
  assert.equal(data.photoPath, "customer-review-photos/anon-uid/rev1/photo.webp");
  assert.equal(data.photoContentType, "image/webp");
  assert.equal(data.photoSizeBytes, 321);
  assert.equal(data.photoConsent, true);
  assert.equal(data.photoStatus, "pending");
  assert.equal(data.status, "published", "review text still publishes immediately");
  assert.equal(data.createdByUid, "anon-uid", "creator uid matches photo folder");
  assert.equal(data.nationality, "NG");
  assert.equal("createdAt" in data, false, "server timestamp added by writeReview");
  assert.equal("photoUrl" in data, false);
  for (const key of Object.keys(data)) {
    assert.ok((CUSTOMER_REVIEW_CREATE_KEYS as readonly string[]).includes(key), key);
  }
}
{
  const { deps, calls } = submitDeps({ identity: true });
  await assert.rejects(submitCustomerReviewWithPhoto(value, webp(), deps), (e: any) => e instanceof CustomerReviewPhotoSubmitError && e.stage === "identity");
  assert.deepEqual(calls, ["identity"]);
}
{
  const { deps, calls } = submitDeps({ upload: true });
  await assert.rejects(submitCustomerReviewWithPhoto(value, webp(), deps), (e: any) => e.stage === "upload");
  assert.equal(calls.some((c) => c.startsWith("write")), false, "no review written when upload fails");
}
{
  // Review write fails after upload: the uploaded file is cleaned up.
  const { deps, calls } = submitDeps({ write: true });
  await assert.rejects(submitCustomerReviewWithPhoto(value, webp(), deps), (e: any) => e.stage === "write");
  assert.equal(calls.at(-1), "delete:customer-review-photos/anon-uid/rev1/photo.webp");
}
{
  // A failing cleanup does not hide the write error.
  const { deps } = submitDeps({ write: true, cleanup: true });
  const originalError = console.error;
  console.error = () => {};
  await assert.rejects(submitCustomerReviewWithPhoto(value, webp(), deps), (e: any) => e.stage === "write");
  console.error = originalError;
}
{
  // Retries use a fresh review id (no overwrite of an earlier upload).
  const { deps, calls } = submitDeps();
  await submitCustomerReviewWithPhoto(value, webp(), deps);
  await submitCustomerReviewWithPhoto(value, webp(), deps);
  assert.ok(calls.includes("write:rev2"));
}

// --- Service: admin moderation -----------------------------------------------
function adminDeps(opts: { missing?: string[] } = {}) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      downloadUrl: async (path: string) => `https://dl.test/${path}`,
      readPhoto: async (path: string) => {
        calls.push(`read:${path}`);
        return new Blob([new Uint8Array(9)], { type: "image/webp" });
      },
      uploadPublicPhoto: async (path: string, blob: Blob, type: string) => void calls.push(`put:${path}:${type}:${blob.size}`),
      deleteFile: async (path: string) => {
        calls.push(`rm:${path}`);
        if (opts.missing?.includes(path)) throw Object.assign(new Error("nf"), { code: "storage/object-not-found" });
      },
      updateReview: async (id: string, patch: Record<string, unknown>) => void calls.push(`update:${id}:${JSON.stringify(patch)}`),
      removeField: () => "<deleted>",
    },
  };
}
const pendingReview = { id: "r1", photoPath: "customer-review-photos/u/r1/photo.webp", photoContentType: "image/webp" as const };
{
  const { deps, calls } = adminDeps();
  const url = await approveReviewPhoto(pendingReview, deps);
  assert.equal(url, "https://dl.test/communityPhotos/reviews/r1.webp");
  assert.deepEqual(calls, [
    "read:customer-review-photos/u/r1/photo.webp",
    "put:communityPhotos/reviews/r1.webp:image/webp:9",
    `update:r1:${JSON.stringify({ photoStatus: "approved", photoUrl: url })}`,
  ]);
}
{
  const { deps, calls } = adminDeps({ missing: ["communityPhotos/reviews/r1.webp"] });
  await rejectReviewPhoto(pendingReview, deps);
  assert.deepEqual(calls.slice(0, 2), ["rm:customer-review-photos/u/r1/photo.webp", "rm:communityPhotos/reviews/r1.webp"]);
  const patch = JSON.parse(calls[2].slice("update:r1:".length));
  assert.deepEqual(Object.keys(patch).sort(), ["photoConsent", "photoContentType", "photoPath", "photoSizeBytes", "photoStatus", "photoUrl"]);
  assert.ok(Object.values(patch).every((v) => v === "<deleted>"));
}
{
  const { deps } = adminDeps();
  deps.deleteFile = async () => {
    throw Object.assign(new Error("denied"), { code: "storage/unauthorized" });
  };
  await assert.rejects(deleteReviewPhotoFiles(pendingReview, deps), /denied/, "real errors surface");
}

// --- Form ----------------------------------------------------------------------
const textOf = (node: ReactTestInstance | string): string =>
  typeof node === "string" ? node : node.children.map((c) => textOf(c as ReactTestInstance | string)).join("");
const byData = (root: ReactTestInstance, key: string) =>
  root.findAll((node) => typeof node.type === "string" && node.props[key] === "true");

const plainCalls: unknown[] = [];
const originalCreate = StorageService.createCustomerReview;
StorageService.createCustomerReview = async (v) => {
  plainCalls.push(v);
  return "plain-id";
};

function formDeps(opts: { prepareError?: Error; submitError?: Error[] } = {}) {
  const log: string[] = [];
  const submitErrors = [...(opts.submitError ?? [])];
  return {
    log,
    deps: {
      preparePhoto: async (file: File) => {
        log.push(`prepare:${file.type}`);
        if (opts.prepareError) throw opts.prepareError;
        return webp();
      },
      submitWithPhoto: async (v: typeof value, photo: { blob: Blob }) => {
        log.push(`submitPhoto:${v.authorName}:${photo.blob.size}`);
        const next = submitErrors.shift();
        if (next) throw next;
        return "photo-id";
      },
      createPreviewUrl: () => "blob:preview",
      revokePreviewUrl: (url: string) => void log.push(`revoke:${url}`),
    },
  };
}

async function renderForm(deps: ReturnType<typeof formDeps>["deps"]) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(CustomerReviewForm, { open: true, onClose: () => {}, photoDeps: deps as never }), {
      createNodeMock: () => ({ focus() {}, click() {} }),
    });
  });
  const root = renderer.root;
  const fill = async (id: string, v: string) => {
    const node = root.find((n) => n.props.id === id && typeof n.type === "string");
    await act(async () => node.props.onChange({ target: { value: v } }));
  };
  const fillBasics = async () => {
    await fill("review-author-name", "Ada Obi");
    await fill("review-body", "Beautiful agbada, perfect fit for the wedding.");
    await act(async () => root.find((n) => n.props["aria-label"] === "5 stars").props.onClick());
  };
  const pick = async (type = "image/jpeg", input = "data-customer-review-photo-file") => {
    const [node] = byData(root, input);
    const target = { files: [new File([new Uint8Array(10)], "me.jpg", { type })], value: "C:\\fakepath\\me.jpg" };
    await act(async () => node.props.onChange({ target }));
  };
  const consent = async (checked = true) => {
    const [box] = byData(root, "data-customer-review-photo-consent");
    await act(async () => box.props.onChange({ target: { checked } }));
  };
  const submit = async () => {
    await act(async () => root.findByType("form").props.onSubmit({ preventDefault() {} }));
  };
  const click = async (key: string) => {
    await act(async () => byData(root, key)[0].props.onClick());
  };
  return { renderer, root, fill, fillBasics, pick, consent, submit, click };
}

// Layout: section under the review text with picker + camera.
{
  const { deps } = formDeps();
  const { root } = await renderForm(deps);
  const group = byData(root, "data-customer-review-photo-group")[0];
  assert.match(textOf(group), /Add a photo of you wearing it/);
  const [fileInput] = byData(root, "data-customer-review-photo-file");
  const [cameraInput] = byData(root, "data-customer-review-photo-camera");
  assert.equal(fileInput.props.accept, "image/jpeg,image/png,image/webp");
  assert.equal(fileInput.props.type, "file");
  assert.equal(fileInput.props.capture, undefined);
  assert.equal(cameraInput.props.capture, "environment");
  assert.equal(cameraInput.props.accept, "image/jpeg,image/png,image/webp");
  assert.equal(textOf(byData(root, "data-customer-review-photo-take")[0]).trim(), "Take photo");
  // Below the review text.
  const formChildren = root.findByType("form").children as ReactTestInstance[];
  const bodyIndex = formChildren.findIndex((c) => c.findAll((n) => n.props.id === "review-body").length > 0);
  const photoIndex = formChildren.indexOf(group);
  assert.ok(photoIndex === bodyIndex + 1, "photo section directly below the review text");
  // No consent box without a photo.
  assert.equal(byData(root, "data-customer-review-photo-consent").length, 0);
}

// No photo: same path as today, consent not required, plain toast.
{
  plainCalls.length = 0;
  const { deps, log } = formDeps();
  const { fillBasics, submit } = await renderForm(deps);
  await fillBasics();
  await submit();
  assert.equal(plainCalls.length, 1);
  assert.equal(log.some((l) => l.startsWith("submitPhoto")), false);
  assert.equal(useAppStore.getState().notification?.message, "Thank you! Your review has been published.");
}

// Photo: preview + remove, consent required, success toast mentions review.
{
  plainCalls.length = 0;
  const { deps, log } = formDeps();
  const { root, fillBasics, pick, consent, submit, click } = await renderForm(deps);
  await fillBasics();
  await pick();
  assert.deepEqual(log, ["prepare:image/jpeg"]);
  const [preview] = byData(root, "data-customer-review-photo-preview");
  assert.equal(preview.props.src, "blob:preview");
  const consentBox = byData(root, "data-customer-review-photo-consent")[0];
  assert.equal(consentBox.props.checked, false);
  const label = root.find((n) => n.type === "label" && n.findAll((c) => c === consentBox).length > 0);
  assert.equal(textOf(label).trim(), "I agree ODOGWU may show this photo publicly with my review.");
  // Choose/Take buttons are replaced: one photo only.
  assert.equal(byData(root, "data-customer-review-photo-choose").length, 0);
  await submit();
  assert.match(textOf(byData(root, "data-customer-review-error")[0]), /agree/);
  assert.equal(log.some((l) => l.startsWith("submitPhoto")), false, "not submitted without consent");
  await consent();
  await submit();
  assert.ok(log.includes("submitPhoto:Ada Obi:321"));
  assert.equal(plainCalls.length, 0);
  assert.match(useAppStore.getState().notification?.message ?? "", /photo is under review/);
  void click;
}

// Remove clears the photo and consent requirement.
{
  plainCalls.length = 0;
  const { deps, log } = formDeps();
  const { root, fillBasics, pick, submit, click } = await renderForm(deps);
  await fillBasics();
  await pick("image/png", "data-customer-review-photo-camera");
  await click("data-customer-review-photo-remove");
  assert.ok(log.includes("revoke:blob:preview"));
  assert.equal(byData(root, "data-customer-review-photo-preview").length, 0);
  assert.equal(byData(root, "data-customer-review-photo-consent").length, 0);
  assert.equal(byData(root, "data-customer-review-photo-choose").length, 1);
  await submit();
  assert.equal(plainCalls.length, 1, "submits without photo, no consent needed");
}

// Wrong type / too big / compression failure: clear message, no photo kept.
for (const err of [
  new CustomerReviewPhotoError("invalid-file", "Please choose a JPEG, PNG or WebP photo."),
  new CustomerReviewPhotoError("invalid-file", "That photo is larger than 5 MB. Please choose a smaller one."),
  new CustomerReviewPhotoError("compression-failed", CUSTOMER_REVIEW_PHOTO_COMPRESSION_ERROR),
  new Error("unexpected"),
]) {
  const { deps } = formDeps({ prepareError: err });
  const { root, pick } = await renderForm(deps);
  await pick();
  const message = textOf(byData(root, "data-customer-review-photo-error")[0]);
  assert.equal(message, err instanceof CustomerReviewPhotoError ? err.message : CUSTOMER_REVIEW_PHOTO_COMPRESSION_ERROR);
  assert.equal(byData(root, "data-customer-review-photo-preview").length, 0, "nothing to upload");
}

// Upload failure: retry or submit without photo.
{
  plainCalls.length = 0;
  const { deps, log } = formDeps({ submitError: [new CustomerReviewPhotoSubmitError("upload", new Error("net"))] });
  const { root, fillBasics, pick, consent, submit, click } = await renderForm(deps);
  const originalError = console.error;
  console.error = () => {};
  await fillBasics();
  await pick();
  await consent();
  await submit();
  console.error = originalError;
  assert.match(textOf(byData(root, "data-customer-review-error")[0]), /photo could not be uploaded/);
  assert.equal(textOf(byData(root, "data-customer-review-photo-retry")[0]), "Try again");
  assert.equal(textOf(byData(root, "data-customer-review-photo-skip")[0]), "Submit without photo");
  await click("data-customer-review-photo-retry");
  assert.equal(log.filter((l) => l.startsWith("submitPhoto")).length, 2, "retry re-sends with the photo");
  assert.match(useAppStore.getState().notification?.message ?? "", /under review/);
}
{
  plainCalls.length = 0;
  const { deps, log } = formDeps({ submitError: [new CustomerReviewPhotoSubmitError("identity", new Error("auth"))] });
  const { root, fillBasics, pick, consent, submit, click } = await renderForm(deps);
  const originalError = console.error;
  console.error = () => {};
  await fillBasics();
  await pick();
  await consent();
  await submit();
  console.error = originalError;
  assert.equal(byData(root, "data-customer-review-photo-skip").length, 1);
  useAppStore.getState().setNotification(null);
  await click("data-customer-review-photo-skip");
  assert.equal(plainCalls.length, 1, "published without the photo");
  assert.equal(log.filter((l) => l.startsWith("submitPhoto")).length, 1);
  assert.equal(useAppStore.getState().notification?.message, "Thank you! Your review has been published.");
}
// Review write failure after upload: generic retry message (service cleaned up).
{
  const { deps } = formDeps({ submitError: [new CustomerReviewPhotoSubmitError("write", new Error("rules"))] });
  const { root, fillBasics, pick, consent, submit } = await renderForm(deps);
  const originalError = console.error;
  console.error = () => {};
  await fillBasics();
  await pick();
  await consent();
  await submit();
  console.error = originalError;
  assert.equal(textOf(byData(root, "data-customer-review-error")[0]), "We could not publish your review. Please try again.");
  assert.equal(byData(root, "data-customer-review-photo-skip").length, 0);
}
StorageService.createCustomerReview = originalCreate;

// --- Admin panel ---------------------------------------------------------------
function review(id: string, overrides: Partial<CustomerReview> = {}): CustomerReview {
  return {
    id, authorName: `Author ${id}`, body: "A lovely heritage outfit, beautifully made.", rating: 5,
    status: "published", featured: false, displayOrder: 0, createdAt: "2026-10-01T00:00:00.000Z",
    createdByUid: null, ...overrides,
  };
}
{
  const log: string[] = [];
  const actions = {
    resolvePhotoUrl: async (path: string) => {
      log.push(`url:${path}`);
      return `https://dl.test/${path}`;
    },
    approve: async (r: CustomerReview) => void log.push(`approve:${r.id}`),
    reject: async (r: CustomerReview) => void log.push(`reject:${r.id}`),
    deleteFiles: async (r: CustomerReview) => void log.push(`files:${r.id}`),
  };
  const updates: string[] = [];
  const deletes: string[] = [];
  const originalUpdate = StorageService.updateCustomerReview;
  const originalDelete = StorageService.deleteCustomerReview;
  StorageService.updateCustomerReview = async (id, patch) => void updates.push(`${id}:${JSON.stringify(patch)}`);
  StorageService.deleteCustomerReview = async (id) => void deletes.push(id);
  useAppStore.setState({
    adminCustomerReviews: [
      review("pend", { authorName: "Pending", photoPath: "customer-review-photos/u/pend/photo.webp", photoStatus: "pending", photoConsent: true, createdAt: "2026-10-04T00:00:00.000Z" }),
      review("appr", { authorName: "Approved", photoPath: "customer-review-photos/u/appr/photo.webp", photoStatus: "approved", photoUrl: "https://cdn.test/appr.webp", createdAt: "2026-10-03T00:00:00.000Z" }),
      review("plain", { authorName: "Plain", createdAt: "2026-10-02T00:00:00.000Z" }),
    ],
  });
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(AdminReviewsPanel, { photoActions: actions }));
  });
  const root = renderer.root;
  const rows = () => root.findAllByType("tr").slice(1);
  const rowFor = (name: string) => rows().find((r) => textOf(r).includes(name))!;
  // Headers unchanged; every row still has one cell per header.
  const headers = root.findAllByType("th").map((th) => textOf(th));
  assert.deepEqual(headers, ["Name", "Nationality", "Rating", "Status", "Featured", "Order", "Created", "Actions"]);
  for (const row of rows()) assert.equal(row.findAllByType("td").length, headers.length);
  assert.equal(rows().length, 3);
  // Thumbnails: pending via getDownloadURL, approved via its public URL.
  assert.deepEqual(log, ["url:customer-review-photos/u/pend/photo.webp"]);
  const thumbs = root.findAll((n) => n.type === "img" && n.props["data-admin-review-photo-thumb"] === "true");
  assert.deepEqual(thumbs.map((t) => t.props.src), ["https://dl.test/customer-review-photos/u/pend/photo.webp", "https://cdn.test/appr.webp"]);
  assert.match(textOf(rowFor("Pending")), /Photo under review/);
  assert.match(textOf(rowFor("Approved")), /Photo approved/);
  // Buttons: approve only when pending; reject wherever a photo exists.
  const has = (row: ReactTestInstance, key: string) => row.findAll((n) => n.props[key] === "true" && n.type === "button").length;
  assert.equal(has(rowFor("Pending"), "data-admin-review-approve-photo"), 1);
  assert.equal(has(rowFor("Approved"), "data-admin-review-approve-photo"), 0);
  assert.equal(has(rowFor("Plain"), "data-admin-review-approve-photo"), 0);
  assert.equal(has(rowFor("Approved"), "data-admin-review-reject-photo"), 1);
  assert.equal(has(rowFor("Plain"), "data-admin-review-reject-photo"), 0);
  // Filter: Photos under review.
  const filterBtn = root.find((n) => n.type === "button" && n.props["data-admin-review-filter"] === "photos-pending");
  assert.equal(textOf(filterBtn), "Photos under review (1)");
  await act(async () => filterBtn.props.onClick());
  assert.deepEqual(rows().map((r) => textOf(r.findAllByType("strong")[0])), ["Pending"]);
  assert.equal(filterBtn.props["aria-pressed"], true);
  // Approve and reject call the photo actions.
  await act(async () => rowFor("Pending").find((n) => n.type === "button" && n.props["data-admin-review-approve-photo"] === "true").props.onClick());
  assert.ok(log.includes("approve:pend"));
  assert.match(textOf(root.find((n) => n.props.role === "status")), /Photo approved/);
  confirmAnswer = false;
  await act(async () => rowFor("Pending").find((n) => n.type === "button" && n.props["data-admin-review-reject-photo"] === "true").props.onClick());
  assert.equal(log.includes("reject:pend"), false, "cancel keeps the photo");
  confirmAnswer = true;
  await act(async () => rowFor("Pending").find((n) => n.type === "button" && n.props["data-admin-review-reject-photo"] === "true").props.onClick());
  assert.ok(log.includes("reject:pend"));
  // Back to all; existing actions still work.
  await act(async () => root.find((n) => n.type === "button" && n.props["data-admin-review-filter"] === "all").props.onClick());
  assert.equal(rows().length, 3);
  const buttonIn = (row: ReactTestInstance, label: RegExp) =>
    row.findAll((n) => n.type === "button").find((b) => label.test(textOf(b)))!;
  await act(async () => buttonIn(rowFor("Plain"), /Hide/).props.onClick());
  await act(async () => buttonIn(rowFor("Plain"), /^Feature/).props.onClick());
  assert.deepEqual(updates, ['plain:{"status":"hidden"}', 'plain:{"featured":true}']);
  await act(async () => buttonIn(rowFor("Plain"), /Delete/).props.onClick());
  assert.deepEqual(deletes, ["plain"]);
  assert.equal(log.includes("files:plain"), false, "no photo, no file calls");
  await act(async () => buttonIn(rowFor("Approved"), /Delete/).props.onClick());
  assert.deepEqual(deletes, ["plain", "appr"]);
  assert.ok(log.includes("files:appr"), "deleting a review removes its photo files");
  StorageService.updateCustomerReview = originalUpdate;
  StorageService.deleteCustomerReview = originalDelete;
}

console.log("PASS: customer review photo service, form and admin panel");
process.exit(0);
