/**
 * AI Try-on PR 3: the signed-in order image route and the order views
 * (confirmation, My Orders with Delete AI preview, admin with Delete AI
 * preview). All mocked: no Gemini, Firebase, payment or email.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import type { Firestore } from "firebase-admin/firestore";
import type { AiTryOnPreviewBucket } from "./src/server/aiTryOnPreviewStore";
import { AI_TRY_ON_ORDER_IMAGE_COLLECTION } from "./src/server/aiTryOnOrderImages";
import { handleAiTryOn, type AiTryOnHttpDependencies } from "./src/server/aiTryOnHttp";
import type { HttpResponse } from "./src/server/httpTypes";
import { createAiTryOnOrderImageService, type AiTryOnOrderImageService } from "./src/services/aiTryOnOrderImages";
import { AdminAiTryOnOrderImage, AiTryOnOrderImagePanel } from "./src/components/AiTryOnOrderImagePanel";
import { AI_TRY_ON_ORDER_IMAGE_CLASS } from "./src/components/AiTryOnOrderPreviewThumbnails";
import { AI_TRY_ON_ORDER_IMAGE_COPY as COPY } from "./src/utils/aiTryOnOrderImageCopy";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
type Doc = Record<string, unknown>;
const docs = new Map<string, Doc>();
const db = {
  collection: (name: string) => ({
    doc: (id: string) => {
      const path = `${name}/${id}`;
      return {
        get: async () => ({ exists: docs.has(path), data: () => (docs.has(path) ? { ...docs.get(path)! } : undefined) }),
        set: async (data: Doc) => void docs.set(path, { ...data }),
        delete: async () => void docs.delete(path),
      };
    },
  }),
} as unknown as Firestore;
const objects = new Map<string, Buffer>();
const bucket: AiTryOnPreviewBucket = {
  file: (path) => ({
    save: async (data) => void objects.set(path, data),
    download: async () => {
      const bytes = objects.get(path);
      if (!bytes) throw new Error("missing");
      return [bytes];
    },
    delete: async () => void objects.delete(path),
  }),
};
const NOW = Date.UTC(2026, 10, 2, 17);
const ORDER = "future-order-pr3";
const PATH = `ai-try-on-order-images/${ORDER}/abc.webp`;
const seed = (overrides: Doc = {}) => {
  objects.set(PATH, Buffer.from("ada-webp"));
  docs.set(`orders/${ORDER}`, { ownerUid: "uid-ada" });
  docs.set(`${AI_TRY_ON_ORDER_IMAGE_COLLECTION}/${ORDER}`, {
    orderId: ORDER,
    ownerUid: "uid-ada",
    status: "saved",
    images: [{ wearerKey: "w-ada", label: "Ada", onModel: false, path: PATH, mimeType: "image/webp", bytes: 8 }],
    createdAt: new Date(NOW - 86400000),
    expiresAt: new Date(NOW + 59 * 86400000),
    ...overrides,
  });
};
const deps: AiTryOnHttpDependencies = {
  environment: {},
  getDb: () => db,
  getOrderImageBucket: () => bucket,
  now: () => NOW,
  verifyIdToken: async (token) => {
    if (token === "ada") return { uid: "uid-ada", firebase: { sign_in_provider: "password" } };
    if (token === "obi") return { uid: "uid-obi", firebase: { sign_in_provider: "password" } };
    if (token === "admin") return { uid: "uid-admin", admin: true, firebase: { sign_in_provider: "password" } };
    if (token === "anon") return { uid: "uid-anon", firebase: { sign_in_provider: "anonymous" } };
    throw new Error("bad");
  },
  log: () => undefined,
};
const call = async (method: "GET" | "DELETE", query: Record<string, string>, token: string | null) => {
  const state: { status: number; body: unknown; headers: Record<string, string> } = { status: 200, body: undefined, headers: {} };
  const res: HttpResponse = {
    status(code) { state.status = code; return res; },
    setHeader(name, value) { state.headers[name] = String(value); return res; },
    json(body) { state.body = body; return body; },
  };
  await handleAiTryOn({ method, query, headers: token ? { authorization: `Bearer ${token}` } : {} } as never, res, deps);
  return state;
};
const list = { action: "order-images", orderId: ORDER };
const one = { action: "order-image", orderId: ORDER, wearerKey: "w-ada" };

// ------------------------------------------------------------ route: owner or admin only, signed in
seed();
assert.equal((await call("GET", list, null)).status, 401);
assert.equal((await call("GET", list, "anon")).status, 401);
assert.equal((await call("GET", list, "bad")).status, 401);
assert.equal((await call("GET", list, "obi")).status, 404, "another customer can't see it (or that it exists)");
assert.equal((await call("GET", { ...list, orderId: "../x" }, "ada")).status, 400);
const owner = await call("GET", list, "ada");
assert.deepEqual(owner.body, { status: "saved", expiresAt: new Date(NOW + 59 * 86400000).toISOString(), images: [{ wearerKey: "w-ada", label: "Ada", onModel: false }] });
assert.equal(JSON.stringify(owner.body).includes(PATH), false, "no storage path leaves the server");
assert.equal(owner.headers["X-Content-Type-Options"], "nosniff");
const admin = await call("GET", list, "admin");
assert.equal((admin.body as { status: string }).status, "saved", "admins (team, tailors) can see it");
const image = await call("GET", one, "ada");
assert.deepEqual(image.body, { image: { mimeType: "image/webp", data: Buffer.from("ada-webp").toString("base64") } });
assert.equal(image.headers["Cache-Control"], "private, no-store");
assert.equal((await call("GET", one, "obi")).status, 404);
assert.equal((await call("GET", { ...one, wearerKey: "w-x" }, "ada")).status, 404);
// Expired: listed as expired, image never served.
seed({ expiresAt: new Date(NOW - 1) });
assert.deepEqual((await call("GET", list, "ada")).body, { status: "expired" });
assert.equal((await call("GET", one, "ada")).status, 404);
// No preview with a paid order.
docs.delete(`${AI_TRY_ON_ORDER_IMAGE_COLLECTION}/${ORDER}`);
assert.deepEqual((await call("GET", list, "ada")).body, { status: "none" });
assert.equal((await call("GET", list, "obi")).status, 404);
// Delete: another customer can't; the owner deletes (customer); an admin deletes (admin).
seed();
assert.equal((await call("DELETE", list, "obi")).status, 404);
assert.equal(objects.has(PATH), true);
assert.deepEqual((await call("DELETE", list, "admin")).body, { status: "deleted", deleted: 1 });
assert.equal(objects.has(PATH), false);
assert.equal(docs.get(`${AI_TRY_ON_ORDER_IMAGE_COLLECTION}/${ORDER}`)!.deletedReason, "admin");
assert.deepEqual((await call("GET", list, "ada")).body, { status: "deleted" });
seed();
assert.deepEqual((await call("DELETE", list, "ada")).body, { status: "deleted", deleted: 1 });
assert.equal(docs.get(`${AI_TRY_ON_ORDER_IMAGE_COLLECTION}/${ORDER}`)!.deletedReason, "customer");

// ------------------------------------------------------------ browser service
{
  const calls: string[] = [];
  const service = createAiTryOnOrderImageService({
    getIdToken: async () => "ada",
    fetchImpl: async (url, init) => {
      calls.push(`${init?.method} ${url} ${(init?.headers as Record<string, string>).Authorization}`);
      if (String(url).includes("order-image&")) return new Response(JSON.stringify({ image: { mimeType: "image/webp", data: "AAAA" } }));
      if (init?.method === "DELETE") return new Response(JSON.stringify({ status: "deleted", deleted: 1 }));
      return new Response(JSON.stringify({ status: "saved", expiresAt: "2027-01-01T00:00:00.000Z", images: [{ wearerKey: "w-ada", label: "Ada", onModel: true }] }));
    },
  });
  assert.deepEqual(await service.list(ORDER), { status: "saved", expiresAt: "2027-01-01T00:00:00.000Z", images: [{ wearerKey: "w-ada", label: "Ada", onModel: true }] });
  assert.deepEqual(await service.image(ORDER, "w-ada"), { mimeType: "image/webp", data: "AAAA" });
  assert.equal(await service.remove(ORDER), true);
  assert.deepEqual(calls, [
    `GET /api/ai-try-on?action=order-images&orderId=${ORDER} Bearer ada`,
    `GET /api/ai-try-on?action=order-image&orderId=${ORDER}&wearerKey=w-ada Bearer ada`,
    `DELETE /api/ai-try-on?action=order-images&orderId=${ORDER} Bearer ada`,
  ]);
  const signedOut = createAiTryOnOrderImageService({ getIdToken: async () => null, fetchImpl: async () => { throw new Error("no call"); } });
  assert.equal(await signedOut.list(ORDER), null);
}

// ------------------------------------------------------------ panels
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const fakeService = (status: "saved" | "deleted" | "expired" | "none", removeOk = true) => {
  const removed: string[] = [];
  const service: AiTryOnOrderImageService = {
    list: async () => ({
      status,
      expiresAt: status === "saved" ? "2027-01-01T12:00:00.000Z" : null,
      images: status === "saved" ? [{ wearerKey: "w-ada", label: "Ada", onModel: false }, { wearerKey: "w-obi", label: "Obi", onModel: true }] : [],
    }),
    image: async () => ({ mimeType: "image/webp", data: "AAAA" }),
    remove: async (orderId) => { removed.push(orderId); return removeOk; },
  };
  return { service, removed };
};
const render = async (element: ReturnType<typeof createElement>) => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => { renderer = create(element); await flush(); await flush(); });
  return renderer;
};
const textOf = (renderer: ReturnType<typeof create>) => JSON.stringify(renderer.toJSON());
const buttons = (renderer: ReturnType<typeof create>, label: string) =>
  renderer.root.findAll((node) => node.type === "button" && [node.props.children].flat().some((child) => child === label));

// Confirmation: large images, saved-until note, no delete.
{
  const { service } = fakeService("saved");
  const renderer = await render(createElement(AiTryOnOrderImagePanel, { orderId: ORDER, variant: "confirmation", service }));
  const text = textOf(renderer);
  assert.ok(text.includes(COPY.orderImageSectionTitle));
  assert.ok(text.includes(COPY.thumbnailLabel("Ada")) && text.includes(COPY.thumbnailLabelOnModel("Obi")));
  assert.ok(text.includes(COPY.orderImageSavedNote("1 January 2027")));
  const imgs = renderer.root.findAll((node) => node.type === "img");
  assert.equal(imgs.length, 2);
  assert.ok(imgs.every((img) => img.props.className === AI_TRY_ON_ORDER_IMAGE_CLASS), "same large size as Summary/Review");
  assert.ok(text.includes("sm:grid-cols-2"), "several wearers side by side, wrapping");
  assert.equal(buttons(renderer, COPY.deleteButton).length, 0);
}
// Customer (My Orders): delete with the approved dialog.
{
  const { service, removed } = fakeService("saved");
  const renderer = await render(createElement(AiTryOnOrderImagePanel, { orderId: ORDER, variant: "customer", service }));
  await act(async () => { buttons(renderer, COPY.deleteButton)[0].props.onClick(); });
  let text = textOf(renderer);
  assert.ok(text.includes(COPY.deleteDialogTitle) && text.includes(COPY.deleteDialogBody));
  assert.equal(text.includes(COPY.adminDeleteDialogBody), false);
  await act(async () => { buttons(renderer, COPY.deleteDialogCancel)[0].props.onClick(); });
  assert.equal(removed.length, 0, "Keep it does nothing");
  await act(async () => { buttons(renderer, COPY.deleteButton)[0].props.onClick(); });
  await act(async () => { buttons(renderer, COPY.deleteDialogConfirm)[0].props.onClick(); await flush(); });
  assert.deepEqual(removed, [ORDER]);
  text = textOf(renderer);
  assert.ok(text.includes(COPY.deleteSuccess) && text.includes(COPY.orderImageDeletedNote));
  assert.equal(renderer.root.findAll((node) => node.type === "img").length, 0);
}
{
  const { service } = fakeService("saved", false);
  const renderer = await render(createElement(AiTryOnOrderImagePanel, { orderId: ORDER, variant: "customer", service }));
  await act(async () => { buttons(renderer, COPY.deleteButton)[0].props.onClick(); });
  await act(async () => { buttons(renderer, COPY.deleteDialogConfirm)[0].props.onClick(); await flush(); });
  assert.ok(textOf(renderer).includes(COPY.deleteFailed));
  assert.equal(renderer.root.findAll((node) => node.type === "img").length, 2, "still shown after a failed delete");
}
// Customer: no preview renders nothing; expired / deleted notes.
assert.equal((await render(createElement(AiTryOnOrderImagePanel, { orderId: ORDER, variant: "customer", service: fakeService("none").service }))).toJSON(), null);
assert.ok(textOf(await render(createElement(AiTryOnOrderImagePanel, { orderId: ORDER, variant: "customer", service: fakeService("expired").service }))).includes(COPY.orderImageExpiredNote));
assert.ok(textOf(await render(createElement(AiTryOnOrderImagePanel, { orderId: ORDER, variant: "customer", service: fakeService("deleted").service }))).includes(COPY.orderImageDeletedNote));
assert.ok(textOf(await render(createElement(AiTryOnOrderImagePanel, { orderId: ORDER, variant: "customer", service: { ...fakeService("saved").service, list: async () => null } }))).includes(COPY.orderImageUnavailable));
// Admin: loads only when opened; reference note; delete with the admin (draft) body.
{
  const { service, removed } = fakeService("saved");
  let lists = 0;
  const counted = { ...service, list: async (id: string) => { lists += 1; return service.list(id); } };
  const renderer = await render(createElement(AdminAiTryOnOrderImage, { orderId: ORDER, service: counted }));
  assert.equal(lists, 0, "nothing loaded until the row's preview is opened");
  const details = renderer.root.findByType("details");
  await act(async () => { details.props.onToggle({ currentTarget: { open: true } }); await flush(); await flush(); });
  assert.equal(lists, 1);
  let text = textOf(renderer);
  assert.ok(text.includes(COPY.adminSectionTitle) && text.includes(COPY.adminSectionNote));
  assert.ok(renderer.root.findAll((node) => node.type === "img").every((img) => img.props.className === AI_TRY_ON_ORDER_IMAGE_CLASS));
  await act(async () => { buttons(renderer, COPY.deleteButton)[0].props.onClick(); });
  text = textOf(renderer);
  assert.ok(text.includes(COPY.deleteDialogTitle) && text.includes(COPY.adminDeleteDialogBody));
  assert.equal(text.includes(COPY.deleteDialogBody), false, "line 18 is customer wording");
  await act(async () => { buttons(renderer, COPY.deleteDialogConfirm)[0].props.onClick(); await flush(); });
  assert.deepEqual(removed, [ORDER]);
  text = textOf(renderer);
  assert.ok(text.includes(COPY.deleteSuccess) && text.includes(COPY.adminNoImage));
}
assert.ok(textOf(await render(createElement(AiTryOnOrderImagePanel, { orderId: ORDER, variant: "admin", service: fakeService("none").service }))).includes(COPY.adminNoImage));

// ------------------------------------------------------------ wiring
const review = readFileSync("src/components/DormantFuturePaymentReviewStep.tsx", "utf8");
assert.match(review, /<AiTryOnOrderImagePanel orderId=\{preparation\.orderId\} variant="confirmation" \/>/);
const details = readFileSync("src/components/CustomerFutureOrderV2Details.tsx", "utf8");
assert.match(details, /\{payment \? \(\s*<div className="print:hidden"[^>]*>\s*<AiTryOnOrderImagePanel orderId=\{order\.orderId\} variant="customer" \/>/);
const adminView = readFileSync("src/components/DatabaseView.tsx", "utf8");
assert.match(adminView, /\{basePayment \? <AdminAiTryOnOrderImage orderId=\{history\.orderId\} \/> : null\}/);
assert.match(COPY.adminDeleteDialogBody, /cancelling or refunding/);
const copySource = readFileSync("src/utils/aiTryOnOrderImageCopy.ts", "utf8");
assert.match(copySource, /DRAFT, NOT YET APPROVED[^\n]*\n[^\n]*\n\s*\*\/\n\s*adminDeleteDialogBody:/, "the admin body stays marked DRAFT until approved");
// No automatic deletion: only the request route calls the delete helper.
const http = readFileSync("src/server/aiTryOnHttp.ts", "utf8");
assert.equal((http.match(/deleteAiTryOnOrderImages\(/g) || []).length, 1);
for (const file of ["src/server/futureOrderV2PaymentRecord.ts", "src/server/futureOrderV2PayPalPayment.ts", "src/server/aiTryOnPaymentCleanup.ts"]) {
  assert.equal(readFileSync(file, "utf8").includes("deleteAiTryOnOrderImages"), false, file);
}

console.log("PASS: AI Try-on order image route and views (confirmation, My Orders delete, admin delete)");
