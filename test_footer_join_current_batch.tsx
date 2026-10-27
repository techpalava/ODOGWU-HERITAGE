import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import type { Batch } from "./src/types";
import {
  HOMEPAGE_ORDER_GATEWAY_ANCHOR_ID,
  resolveFooterBatchLink,
} from "./src/utils/footerBatchLink";
import { getCurrentRegistrationBatch } from "./src/utils/batchUtils";

const day = 24 * 60 * 60 * 1000;
const now = Date.now();
const musketeers: Batch = {
  id: "batch-8",
  batchNumber: 8,
  name: "Musketeers",
  startDate: new Date(now - day).toISOString(),
  endDate: new Date(now + 30 * day).toISOString(),
  duration: "Open",
  targetGarments: 72,
  currentGarments: 0,
  currentOrders: 0,
  currentCustomers: 0,
  status: "OPEN",
  allowOrders: true,
  visibility: "PUBLIC",
};
const closedAvatars: Batch = {
  ...musketeers,
  id: "batch-6",
  batchNumber: 6,
  name: "Avatars",
  endDate: new Date(now - day).toISOString(),
  status: "CLOSED",
  allowOrders: false,
};

// Same selector App uses for the Home open-batch card.
assert.equal(getCurrentRegistrationBatch([closedAvatars, musketeers])?.id, "batch-8");
assert.equal(getCurrentRegistrationBatch([closedAvatars]) ?? null, null);

// Open batch -> join that batch directly.
const open = resolveFooterBatchLink({ hasLoadedBatches: true, joinBatch: musketeers });
assert.equal(open.label, "Join Current Batch");
assert.equal(open.target.kind, "join-batch");
assert.equal(open.target.kind === "join-batch" && open.target.batch.id, "batch-8");

// No open batch -> Home order section (shows the closed card), same label.
const none = resolveFooterBatchLink({ hasLoadedBatches: true, joinBatch: null });
assert.equal(none.label, "Join Current Batch");
assert.deepEqual(none.target, { kind: "home-order-gateway" });

// Still loading -> never join (or advertise) a batch that isn't confirmed yet.
const loading = resolveFooterBatchLink({ hasLoadedBatches: false, joinBatch: musketeers });
assert.equal(loading.label, "Join Current Batch");
assert.deepEqual(loading.target, { kind: "home-order-gateway" });

// Rendered footer: clicking the link does the right thing.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const { act, create } = await import("react-test-renderer");
const { useAppStore } = await import("./src/store/useAppStore");
const { default: Footer } = await import("./src/components/Footer");
const originalState = useAppStore.getState();
const clickFooterLink = async (
  hasLoadedBatches: boolean,
  joinBatch: Batch | null,
) => {
  useAppStore.setState({ hasLoadedBatches, activeTab: "gallery" } as never);
  const joined: string[] = [];
  let tree: ReturnType<typeof create> | undefined;
  await act(async () => {
    tree = create(
      createElement(Footer, {
        joinBatch,
        onJoinCommunityBatch: (batch: Batch) => joined.push(batch.id),
      }),
    );
  });
  const link = tree!.root.findByProps({ id: "footer-join-current-batch" });
  const label = link.children
    .filter((child): child is string => typeof child === "string")
    .join("");
  const target = link.props["data-footer-target"];
  await act(async () => {
    link.props.onClick({ preventDefault() {} });
  });
  const tab = useAppStore.getState().activeTab;
  await act(async () => tree!.unmount());
  return { joined, target, label, tab };
};
Object.assign(globalThis, {
  window: { setTimeout: () => 0, scrollTo() {} },
  document: { getElementById: () => null },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
});
try {
  const openClick = await clickFooterLink(true, musketeers);
  assert.deepEqual(openClick.joined, ["batch-8"], "opens Musketeers directly");
  assert.equal(openClick.target, "join-batch");
  assert.equal(openClick.label, "Join Current Batch");
  assert.equal(openClick.tab, "gallery", "join handler owns navigation");

  const noneClick = await clickFooterLink(true, null);
  assert.deepEqual(noneClick.joined, []);
  assert.equal(noneClick.target, "home-order-gateway");
  assert.equal(noneClick.label, "Join Current Batch");
  assert.equal(noneClick.tab, "home");

  const loadingClick = await clickFooterLink(false, musketeers);
  assert.deepEqual(loadingClick.joined, []);
  assert.equal(loadingClick.target, "home-order-gateway");
  assert.equal(loadingClick.tab, "home");
} finally {
  useAppStore.setState(originalState, true);
}

// Footer reuses Home's batch and join handler instead of its own rule. While
// Home shows the closed current-batch card, the footer passes no batch, so its
// link goes to the homepage order section (that card).
const app = readFileSync("src/App.tsx", "utf8");
assert.match(
  app,
  /const homepageJoinBatch = activeCommunityBatch\s+\? registrationBatch \?\? null\s+: null;/,
);
assert.match(
  app,
  /<Footer\s+joinBatch=\{homepageClosedBatch \? null : homepageJoinBatch\}\s+onJoinCommunityBatch=\{handleJoinCommunityBatch\}/,
);
assert.match(
  app,
  /onJoinCommunityBatch=\{handleJoinCommunityBatch\}\s+joinBatch=\{homepageJoinBatch\}\s+closedJoinBatch=\{homepageClosedBatch\}/,
);
const footer = readFileSync("src/components/Footer.tsx", "utf8");
assert.equal(footer.includes("getCurrentCommunityBatch"), false);
assert.equal(footer.includes("BatchBusinessRules"), false);
// Fallback anchor exists on the Home gateway section.
assert.match(
  readFileSync("src/components/HomepageOrderGateway.tsx", "utf8"),
  /id=\{HOMEPAGE_ORDER_GATEWAY_ANCHOR_ID\}/,
);
assert.equal(HOMEPAGE_ORDER_GATEWAY_ANCHOR_ID, "homepage-order-gateway");

console.log("PASS: footer Join Current Batch opens the open batch, else Home order section");
