import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Batch } from "./src/types";
import HomepageOrderGateway, {
  resolveHomepageJoinSlot,
} from "./src/components/HomepageOrderGateway";
import {
  HOMEPAGE_JOIN_BATCH_CACHE_KEY,
  getHomepageProvisionalJoinBatchView,
  readHomepageJoinBatchCache,
  writeHomepageJoinBatchCache,
  type HomepageJoinBatchCacheEntry,
} from "./src/utils/homepageJoinBatchCache";
import { getHomepageHeroPrimaryActionLabel } from "./src/utils/homepageOrderGateway";

const day = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-21T08:00:00Z");

const makeBatch = (overrides: Partial<Batch> = {}): Batch => ({
  id: "batch-9",
  batchNumber: 9,
  name: "Musketeers",
  startDate: new Date(now.getTime() - 5 * day).toISOString(),
  endDate: "2026-11-16",
  duration: "4 weeks",
  targetGarments: 40,
  currentGarments: 12,
  currentOrders: 10,
  currentCustomers: 10,
  status: "OPEN",
  allowOrders: true,
  visibility: "PUBLIC",
  ...overrides,
});

class MemoryStorage {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const findById = (node: any, id: string): any => {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) return node.map((c) => findById(c, id)).find(Boolean) ?? null;
  if (node.props?.id === id) return node;
  return findById(node.props?.children, id);
};

const calls: string[] = [];
const baseProps = {
  state: { joinBatch: null as Batch | null, minimumGarments: 10 },
  onStartIndividualOrder: () => calls.push("individual"),
  onJoinBatch: (batch: Batch) => calls.push(`join:${batch.id}`),
  onCreatePrivateBatch: () => calls.push("private"),
  onBrowseGallery: () => calls.push("gallery"),
};

// 1. Cards render while loading; only the Join slot waits (placeholder).
const loadingProps = {
  ...baseProps,
  isLoading: true,
  unfinishedOrderLabel: "Agbada draft",
  onResumeUnfinishedOrder: () => calls.push("resume"),
};
const loadingMarkup = renderToStaticMarkup(createElement(HomepageOrderGateway, loadingProps));
assert.doesNotMatch(loadingMarkup, /Loading current order options/, "No whole-gateway skeleton");
for (const id of [
  "btn-create-private-batch",
  "btn-start-individual-order",
  "btn-resume-unfinished-order",
  "btn-ready-to-wear",
  "btn-quick-gallery",
]) {
  assert.match(loadingMarkup, new RegExp(`id="${id}"`), `${id} renders while loading`);
}
assert.match(loadingMarkup, /data-join-batch-placeholder="true"[^>]*aria-busy="true"/);
assert.match(loadingMarkup, /Join an Existing Batch or Group/);
assert.doesNotMatch(loadingMarkup, /id="btn-quick-join-cohort"/, "No clickable Join button in the placeholder");
assert.match(loadingMarkup, /xl:grid-cols-4/, "Placeholder keeps the 4-column layout");
assert.doesNotMatch(loadingMarkup, /id="btn-create-private-batch"[^>]*disabled/, "Create Private works while loading");
assert.match(loadingMarkup, /id="btn-ready-to-wear"[^>]*disabled=""/, "Ready to Wear stays disabled");

const loadingTree = HomepageOrderGateway(loadingProps);
calls.length = 0;
findById(loadingTree, "btn-create-private-batch").props.onClick();
findById(loadingTree, "btn-start-individual-order").props.onClick();
findById(loadingTree, "btn-resume-unfinished-order").props.onClick();
findById(loadingTree, "btn-quick-gallery").props.onClick();
assert.deepEqual(calls, ["private", "individual", "resume", "gallery"], "Non-Join buttons work while loading");

// 2. Cache hit renders the Join card instantly, but the click is blocked until confirmed.
const cachedEntry: HomepageJoinBatchCacheEntry = {
  kind: "batch",
  batch: { id: "batch-9", name: "Musketeers", endDate: "2026-11-16" },
};
const cachedSlot = resolveHomepageJoinSlot(null, true, cachedEntry, now);
assert.equal(cachedSlot.kind, "cached");
const cachedProps = { ...baseProps, isLoading: true, provisionalJoin: cachedEntry };
const cachedTree = HomepageOrderGateway(cachedProps);
const cachedJoin = findById(cachedTree, "btn-quick-join-cohort");
assert.ok(cachedJoin, "Join button renders from cache");
assert.equal(cachedJoin.props.disabled, true, "Cached Join is disabled until the live snapshot");
assert.equal(cachedJoin.props.onClick, undefined, "Cached Join has no click handler");
const cachedMarkup = renderToStaticMarkup(createElement(HomepageOrderGateway, cachedProps));
assert.match(cachedMarkup, /data-join-batch-source="cached"/);
assert.match(cachedMarkup, /<span data-join-batch-badge="true"[^>]*>Musketeers<\/span>/);
assert.match(cachedMarkup, /Join the Musketeers/);
assert.doesNotMatch(cachedMarkup, /data-join-batch-placeholder/);

// Once live data confirms the batch, the same button gets the live handler.
const liveBatch = makeBatch();
const liveTree = HomepageOrderGateway({ ...baseProps, state: { joinBatch: liveBatch, minimumGarments: 10 }, isLoading: false, provisionalJoin: cachedEntry });
const liveJoin = findById(liveTree, "btn-quick-join-cohort");
assert.equal(liveJoin.props.disabled, false);
calls.length = 0;
liveJoin.props.onClick();
assert.deepEqual(calls, ["join:batch-9"]);
assert.match(
  renderToStaticMarkup(createElement(HomepageOrderGateway, { ...baseProps, state: { joinBatch: liveBatch, minimumGarments: 10 } })),
  /data-join-batch-source="live"/,
);

// A cached deadline that has already passed falls back to the placeholder.
assert.equal(
  getHomepageProvisionalJoinBatchView({ id: "b", name: "Old", endDate: "2026-10-20" }, now),
  null,
);
assert.equal(resolveHomepageJoinSlot(null, true, { kind: "batch", batch: { id: "b", name: "Old", endDate: "2026-10-20" } }, now).kind, "placeholder");
// Same-day date-only deadline is still open until the end of that day (UTC).
assert.ok(getHomepageProvisionalJoinBatchView({ id: "b", name: "Today", endDate: "2026-10-21" }, now));

// "none" cache (last visit had no open batch) keeps the 3-column layout: no jump.
const noneMarkup = renderToStaticMarkup(
  createElement(HomepageOrderGateway, { ...baseProps, isLoading: true, provisionalJoin: { kind: "none" } }),
);
assert.doesNotMatch(noneMarkup, /data-join-batch-placeholder|btn-quick-join-cohort/);
assert.match(noneMarkup, /xl:grid-cols-3/);
const loadedNoneMarkup = renderToStaticMarkup(createElement(HomepageOrderGateway, { ...baseProps }));
assert.match(loadedNoneMarkup, /xl:grid-cols-3/);
assert.doesNotMatch(loadedNoneMarkup, /data-join-batch-placeholder|btn-quick-join-cohort/);

// 3. Cache write/clear from live data.
const storage = new MemoryStorage();
assert.equal(readHomepageJoinBatchCache(storage), null, "Empty cache");
writeHomepageJoinBatchCache(liveBatch, storage, now);
const stored = JSON.parse(storage.getItem(HOMEPAGE_JOIN_BATCH_CACHE_KEY)!);
assert.deepEqual(stored, { v: 1, kind: "batch", id: "batch-9", name: "Musketeers", endDate: "2026-11-16" }, "Only id, name, endDate are stored");
assert.deepEqual(readHomepageJoinBatchCache(storage), cachedEntry);

// Renamed batch refreshes the cache.
writeHomepageJoinBatchCache(makeBatch({ name: "Musketeers II" }), storage, now);
assert.equal((readHomepageJoinBatchCache(storage) as any).batch.name, "Musketeers II");

// Batch closes: cache becomes "none", and the live card shows the closed state.
const closedBatch = makeBatch({ endDate: new Date(now.getTime() - day).toISOString() });
writeHomepageJoinBatchCache(closedBatch, storage, now);
assert.deepEqual(readHomepageJoinBatchCache(storage), { kind: "none" });
const closedSlot = resolveHomepageJoinSlot(closedBatch, false, cachedEntry, now);
assert.equal(closedSlot.kind, "live");
assert.equal((closedSlot as any).closed, true, "Live closed batch renders the closed state, not the cached open one");
assert.equal((closedSlot as any).deadlinePill, null);
const statusClosed = makeBatch({ status: "CLOSED" as Batch["status"], allowOrders: false });
writeHomepageJoinBatchCache(statusClosed, storage, now);
assert.deepEqual(readHomepageJoinBatchCache(storage), { kind: "none" });
writeHomepageJoinBatchCache(null, storage, now);
assert.deepEqual(readHomepageJoinBatchCache(storage), { kind: "none" }, "No batch clears to none");

// 4. Corrupt or tampered cache is ignored and removed.
for (const bad of [
  "{not json",
  "null",
  "42",
  JSON.stringify({ v: 2, kind: "batch", id: "x", name: "y", endDate: "" }),
  JSON.stringify({ v: 1, kind: "batch", id: "", name: "y", endDate: "" }),
  JSON.stringify({ v: 1, kind: "batch", id: "x", name: "   ", endDate: "" }),
  JSON.stringify({ v: 1, kind: "batch", id: "x", name: { evil: 1 }, endDate: "" }),
  JSON.stringify({ v: 1, kind: "batch", id: "x", name: "y".repeat(500), endDate: "" }),
  JSON.stringify({ v: 1, kind: "other" }),
]) {
  storage.setItem(HOMEPAGE_JOIN_BATCH_CACHE_KEY, bad);
  assert.equal(readHomepageJoinBatchCache(storage), null, `Corrupt cache ignored: ${bad.slice(0, 40)}`);
  assert.equal(storage.getItem(HOMEPAGE_JOIN_BATCH_CACHE_KEY), null, "Corrupt cache removed");
}
const throwing = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceeded"); },
  removeItem: () => { throw new Error("SecurityError"); },
};
assert.equal(readHomepageJoinBatchCache(throwing), null, "Unreadable storage is ignored");
assert.doesNotThrow(() => writeHomepageJoinBatchCache(liveBatch, throwing, now));
assert.equal(readHomepageJoinBatchCache(null), null);
// Unknown fields in the cache are never rendered.
storage.setItem(HOMEPAGE_JOIN_BATCH_CACHE_KEY, JSON.stringify({ v: 1, kind: "batch", id: "x", name: "Real", endDate: "2026-11-16", script: "<img onerror>" }));
assert.deepEqual(readHomepageJoinBatchCache(storage), { kind: "batch", batch: { id: "x", name: "Real", endDate: "2026-11-16" } });

// 5. Hero button: no stuck loading label.
assert.equal(getHomepageHeroPrimaryActionLabel({ isLoading: true, joinLabel: null }), "Start Your Order");
assert.equal(getHomepageHeroPrimaryActionLabel({ isLoading: false, joinLabel: "Join the Musketeers" }), "Join the Musketeers");
assert.equal(getHomepageHeroPrimaryActionLabel({ isLoading: false, joinLabel: null }), "Explore Options");
const homeSource = readFileSync("src/components/HomeView.tsx", "utf8");
assert.doesNotMatch(homeSource, /Loading Order Options/);
assert.doesNotMatch(homeSource, /disabled=\{isBatchGatewayLoading\}/, "Hero buttons are not disabled while batches load");
assert.match(homeSource, /provisionalJoin=\{provisionalJoin\}/);
assert.match(homeSource, /writeHomepageJoinBatchCache\(joinBatch \?\? null\)/);

// 6. Preconnect hints.
const indexHtml = readFileSync("index.html", "utf8");
assert.match(indexHtml, /<link rel="preconnect" href="https:\/\/firestore\.googleapis\.com" crossorigin \/>/);
assert.match(indexHtml, /<link rel="preconnect" href="https:\/\/firebasestorage\.googleapis\.com" \/>/);

console.log("PASS: homepage gateway renders cards instantly, Join card from cache or placeholder");
