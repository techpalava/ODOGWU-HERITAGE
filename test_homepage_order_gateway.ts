import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Batch, OrderContext } from "./src/types";
import HomepageOrderGateway, {
  getJoinCurrentBatchButtonLabel,
} from "./src/components/HomepageOrderGateway";
import { createJoinRenderedBatchAction } from "./src/utils/homepageCurrentBatchAction";
import {
  getHomepageJoinBatchLabel,
  getHomepageOrderGatewayState,
  resolveHomepageCommunityBatchEntry,
} from "./src/utils/homepageOrderGateway";
import { BatchBusinessRules } from "./src/engine/BatchBusinessRules";
import { OrderRoutingEngine } from "./src/engine/OrderRoutingEngine";
import {
  getCanonicalOrderIdentity,
  getPersistedDraftOrderIdentity,
  resolvePersistedDraftOrderContext,
} from "./src/utils/orderContextIdentity";

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

const makeBatch = (overrides: Partial<Batch> = {}): Batch => ({
  id: "batch-6",
  batchNumber: 6,
  name: "Avatars",
  startDate: new Date(now - day).toISOString(),
  endDate: new Date(now + day).toISOString(),
  duration: "2 days",
  targetGarments: 40,
  currentGarments: 12,
  currentOrders: 10,
  currentCustomers: 10,
  status: "OPEN",
  allowOrders: true,
  visibility: "PUBLIC",
  ...overrides,
});

const openState = getHomepageOrderGatewayState([makeBatch()]);
assert.equal(openState.joinBatch?.id, "batch-6");
assert.equal(openState.joinBatch?.name, "Avatars");
assert.equal(openState.minimumGarments, 10);
assert.equal(getJoinCurrentBatchButtonLabel("Avatars"), "Join the Avatars");
assert.equal(
  getJoinCurrentBatchButtonLabel("  Summer Heritage Group  "),
  "Join the   Summer Heritage Group  ",
);
assert.equal(
  getJoinCurrentBatchButtonLabel("A Very Long Community Batch Name For Every Family"),
  "Join the A Very Long Community Batch Name For Every Family",
);
assert.equal(
  getJoinCurrentBatchButtonLabel("Avatars", true),
  "Join Current Batch",
);

const pioneersState = getHomepageOrderGatewayState([
  makeBatch({ id: "batch-8", name: "Pioneers" }),
]);
assert.equal(pioneersState.joinBatch?.id, "batch-8");
assert.equal(
  getHomepageJoinBatchLabel(pioneersState.joinBatch?.name),
  "Join the Pioneers",
  "The homepage label must use the exact current Admin batch name.",
);
assert.equal(getJoinCurrentBatchButtonLabel(" "), "Join Current Batch");
assert.equal(getJoinCurrentBatchButtonLabel(null), "Join Current Batch");
assert.equal(
  getJoinCurrentBatchButtonLabel({} as unknown as string),
  "Join Current Batch",
);

const findElementById = (node: any, id: string): any => {
  if (!node || typeof node !== "object") return null;
  if (node.props?.id === id) return node;
  const children = node.props?.children;
  if (Array.isArray(children)) {
    return children.map((child) => findElementById(child, id)).find(Boolean);
  }
  return findElementById(children, id);
};

let joinCallbackCalls = 0;
let joinedBatchId: string | null = null;
const joinCallback = (batch: Batch) => {
  joinCallbackCalls += 1;
  joinedBatchId = batch.id;
};
const joinGatewayTree = HomepageOrderGateway({
  state: openState,
  onStartIndividualOrder: () => undefined,
  onJoinBatch: joinCallback,
  onCreatePrivateBatch: () => undefined,
  onBrowseGallery: () => undefined,
});
const joinButton = findElementById(joinGatewayTree, "btn-quick-join-cohort");
assert.equal(typeof joinButton?.props.onClick, "function");
assert.equal(joinButton?.props.disabled, false);
joinButton.props.onClick();
assert.equal(joinCallbackCalls, 1, "The existing join callback must remain intact");
assert.equal(
  joinedBatchId,
  "batch-6",
  "Join action must hand off the exact rendered batch ID.",
);

let heroJoinedBatchId: string | null = null;
const renderedHeroJoin = createJoinRenderedBatchAction(
  makeBatch({ id: "batch-8", name: "Pioneers" }),
  (batch) => {
    heroJoinedBatchId = batch.id;
  },
);
renderedHeroJoin();
assert.equal(
  heroJoinedBatchId,
  "batch-8",
  "Every hero CTA must close over the exact rendered batch, not receive a click event.",
);

const homepageEntry = resolveHomepageCommunityBatchEntry(
  [makeBatch()],
  "batch-6",
  "Veldhoven Campus Lockers",
  new Date(now),
);
assert.deepEqual(homepageEntry?.orderContext, {
  orderType: "Community",
  batchId: "batch-6",
  batchName: "Avatars",
  closingDate: new Date(now + day).toISOString(),
  deliveryWindow: "",
  expectedParticipants: 40,
  currentMembers: 12,
  allowOrders: true,
  batchStatus: "OPEN",
  pickupLocation: "Veldhoven Campus Lockers",
});
assert.equal(
  resolveHomepageCommunityBatchEntry(
    [makeBatch({ id: "batch-8", name: "Pioneers" })],
    "batch-6",
    "Veldhoven Campus Lockers",
    new Date(now),
  ),
  null,
  "A stale Avatars CTA must not silently switch the customer into Pioneers.",
);

const openCommunityContext: OrderContext = {
  orderType: "Community",
  batchId: "batch-6",
  batchName: "Avatars",
  closingDate: new Date(now + day).toISOString(),
  expectedParticipants: 40,
  currentMembers: 12,
  allowOrders: true,
  batchStatus: "OPEN",
};
assert.equal(
  BatchBusinessRules.canAcceptOrders(openCommunityContext).canAcceptOrders,
  true,
  "A community order context must not require a batch-only startDate field",
);
assert.equal(
  OrderRoutingEngine.evaluateOrder(openCommunityContext, [makeBatch()]).mode,
  "COMMUNITY_OPEN",
  "The routing engine must preserve an eligible homepage community context",
);
assert.equal(
  OrderRoutingEngine.evaluateOrder(
    { orderType: "Individual" },
    [makeBatch()],
  ).mode,
  "INDIVIDUAL",
  "Individual entry must remain separate from the current community batch.",
);

const persistedAvatarsDraft = {
  batchType: "community" as const,
  batchId: "batch-7",
  batchName: "Avatars",
};
assert.deepEqual(getPersistedDraftOrderIdentity(persistedAvatarsDraft), {
  orderType: "Community",
  batchId: "batch-7",
});
assert.deepEqual(
  getPersistedDraftOrderIdentity({ batchType: "alone" }),
  { orderType: "Individual" },
  "An Individual draft remains separate from a Community batch identity.",
);
assert.deepEqual(
  resolvePersistedDraftOrderContext(
    persistedAvatarsDraft,
    [
      makeBatch({ id: "batch-7", name: "Avatars", status: "CLOSED" }),
      makeBatch({ id: "batch-8", name: "Pioneers" }),
    ],
    "Veldhoven Campus Lockers",
  ),
  {
    orderType: "Community",
    batchId: "batch-7",
    batchName: "Avatars",
    closingDate: new Date(now + day).toISOString(),
    deliveryWindow: "",
    expectedParticipants: 40,
    currentMembers: 12,
    allowOrders: true,
    batchStatus: "CLOSED",
    pickupLocation: "Veldhoven Campus Lockers",
  },
  "Reload must resolve a Community draft by its retained batch ID, not the current homepage batch.",
);
assert.deepEqual(
  resolvePersistedDraftOrderContext(
    persistedAvatarsDraft,
    [makeBatch({ id: "batch-8", name: "Pioneers" })],
    "Veldhoven Campus Lockers",
  ),
  {
    orderType: "Community",
    batchId: "batch-7",
    batchName: "Avatars",
  },
  "A missing saved batch must remain unbound rather than fall back to the current registration batch.",
);
assert.deepEqual(
  getCanonicalOrderIdentity({ orderType: "Individual" }),
  { orderType: "Individual" },
);
assert.equal(
  getCanonicalOrderIdentity({ orderType: "Community" }),
  null,
  "Community identity cannot be inferred from a display name or current batch.",
);

const productionState = getHomepageOrderGatewayState([
  makeBatch({
    id: "batch-5",
    name: "Gladiators",
    status: "PRODUCTION_STARTED",
  }),
  makeBatch(),
]);
assert.equal(
  productionState.joinBatch?.name,
  "Avatars",
  "An open registration batch must take priority over a production batch",
);

const fullState = getHomepageOrderGatewayState([
  makeBatch({ currentGarments: 40 }),
]);
assert.equal(
  fullState.joinBatch,
  null,
  "A full batch must not produce a Join action",
);

const closedState = getHomepageOrderGatewayState([
  makeBatch({
    status: "CLOSED",
    endDate: new Date(now - day).toISOString(),
  }),
]);
assert.equal(
  closedState.joinBatch,
  null,
  "A closed batch must not produce a Join action",
);

const futureState = getHomepageOrderGatewayState([
  makeBatch({
    status: "YET_TO_START",
    startDate: new Date(now + day).toISOString(),
    endDate: new Date(now + day * 2).toISOString(),
  }),
]);
assert.equal(
  futureState.joinBatch,
  null,
  "A future batch must not produce a Join action",
);

const closingDay = new Date("2026-07-31T20:00:00+01:00");
const closingDayState = getHomepageOrderGatewayState(
  [
    makeBatch({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    }),
  ],
  closingDay,
);
assert.equal(
  closingDayState.joinBatch?.name,
  "Avatars",
  "A date-only closing date must remain open through the end of that day",
);

const rescheduledClosedBatchState = getHomepageOrderGatewayState(
  [
    makeBatch({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      status: "CLOSED",
      isAutoScheduled: true,
    }),
  ],
  closingDay,
);
assert.equal(
  rescheduledClosedBatchState.joinBatch?.name,
  "Avatars",
  "Auto-scheduling must reopen a formerly closed batch when an admin moves its dates into the current window",
);

const expiredDateOnlyState = getHomepageOrderGatewayState(
  [
    makeBatch({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
    }),
  ],
  new Date("2026-08-01T00:00:00+01:00"),
);
assert.equal(
  expiredDateOnlyState.joinBatch,
  null,
  "The button must disappear after the date-only registration window ends",
);

const manualOverrideState = getHomepageOrderGatewayState(
  [
    makeBatch({
      id: "batch-auto",
      name: "Automatic Batch",
      displayOrder: 1,
    }),
    makeBatch({
      id: "batch-manual",
      name: "Admin Override",
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      status: "Open" as Batch["status"],
      isAutoScheduled: false,
      isActive: true,
      displayOrder: 2,
    }),
  ],
  closingDay,
);
assert.equal(
  manualOverrideState.joinBatch?.name,
  "Admin Override",
  "An active manual override must take precedence over an automatic batch",
);

const inactiveManualState = getHomepageOrderGatewayState(
  [
    makeBatch({
      startDate: "2025-01-01",
      endDate: "2025-01-31",
      status: "OPEN",
      isAutoScheduled: false,
      isActive: false,
    }),
  ],
  closingDay,
);
assert.equal(
  inactiveManualState.joinBatch,
  null,
  "A manual batch must be marked active before it can control the homepage",
);

const manuallyClosedState = getHomepageOrderGatewayState(
  [
    makeBatch({
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      status: "CLOSED",
      isAutoScheduled: false,
      isActive: true,
    }),
  ],
  closingDay,
);
assert.equal(
  manuallyClosedState.joinBatch,
  null,
  "A manually closed batch must remain closed even inside its date window",
);

const privateState = getHomepageOrderGatewayState([
  makeBatch({ visibility: "PRIVATE" }),
]);
assert.equal(
  privateState.joinBatch,
  null,
  "Private batches must never populate the public homepage button",
);

const belowMinimumState = getHomepageOrderGatewayState([
  makeBatch({ targetGarments: 9 }),
]);
assert.equal(
  belowMinimumState.joinBatch,
  null,
  "A Type B batch below the 10-garment group minimum must not be advertised",
);

const ordersDisabledState = getHomepageOrderGatewayState([
  makeBatch({ allowOrders: false }),
]);
assert.equal(
  ordersDisabledState.joinBatch,
  null,
  "Disabling orders in Sourcing Batches must hide the Join action",
);

assert.equal(
  getHomepageOrderGatewayState([]).joinBatch,
  null,
  "No eligible batch must produce no community join target.",
);

const joinMarkup = renderToStaticMarkup(
  createElement(HomepageOrderGateway, {
    state: openState,
    onStartIndividualOrder: () => undefined,
    onJoinBatch: () => undefined,
    onCreatePrivateBatch: () => undefined,
    onBrowseGallery: () => undefined,
    onManageSourcingBatches: () => undefined,
  }),
);
assert.match(joinMarkup, /Join an Existing Batch or Group \(Avatars\)/);
assert.match(joinMarkup, /Join the Avatars/);
assert.match(joinMarkup, /Join an Existing Batch or Group/);
assert.match(joinMarkup, /Individual Custom Order/);
assert.match(joinMarkup, /Ready to Wear/);
assert.match(joinMarkup, /Ready to Wear - Coming Soon/);
assert.match(
  joinMarkup,
  /Shipping from Lagos to Location applies\./,
);
assert.equal(
  (joinMarkup.match(/Shipping from Lagos to Location applies\./g) || []).length,
  1,
  "Only Ready to Wear should show the Lagos-to-location shipping copy",
);
assert.doesNotMatch(joinMarkup, /Order Type [ABCD]/);
assert.match(joinMarkup, /Manage Sourcing Batches/);
assert.ok(
  joinMarkup.indexOf("Join an Existing Batch or Group (Avatars)") <
    joinMarkup.indexOf("Create a Private Batch") &&
    joinMarkup.indexOf("Create a Private Batch") <
      joinMarkup.indexOf("Individual Custom Order") &&
    joinMarkup.indexOf("Individual Custom Order") <
      joinMarkup.indexOf("Ready to Wear"),
  "Batch actions must appear before individual and ready-to-wear actions",
);

const unnamedBatchMarkup = renderToStaticMarkup(
  createElement(HomepageOrderGateway, {
    state: {
      ...openState,
      joinBatch: { ...openState.joinBatch!, name: " " },
    },
    onStartIndividualOrder: () => undefined,
    onJoinBatch: () => undefined,
    onCreatePrivateBatch: () => undefined,
    onBrowseGallery: () => undefined,
  }),
);
assert.match(unnamedBatchMarkup, /Join an Existing Batch or Group/);
assert.doesNotMatch(unnamedBatchMarkup, /Join an Existing Batch or Group \(\s*\)/);

const customerMarkup = renderToStaticMarkup(
  createElement(HomepageOrderGateway, {
    state: privateState,
    onStartIndividualOrder: () => undefined,
    onJoinBatch: () => undefined,
    onCreatePrivateBatch: () => undefined,
    onBrowseGallery: () => undefined,
  }),
);
assert.doesNotMatch(customerMarkup, /Order Type B/);
assert.match(customerMarkup, /Individual Custom Order/);
assert.match(customerMarkup, /Ready to Wear/);
assert.doesNotMatch(customerMarkup, /Order Type [ABCD]/);
assert.doesNotMatch(customerMarkup, /Manage Sourcing Batches/);
assert.ok(
  customerMarkup.indexOf("Create a Private Batch") <
    customerMarkup.indexOf("Individual Custom Order") &&
    customerMarkup.indexOf("Individual Custom Order") <
      customerMarkup.indexOf("Ready to Wear"),
  "Private batch must remain first when no community batch is joinable",
);

const homeViewSource = readFileSync("src/components/HomeView.tsx", "utf8");
const batchManagementSource = readFileSync(
  "src/components/BatchManagementPanel.tsx",
  "utf8",
);
assert.match(homeViewSource, /getJoinCurrentBatchButtonLabel\([\s\S]{0,120}joinBatch\?\.name/);
assert.equal(
  (homeViewSource.match(/onClick=\{handleHeroPrimaryAction\}/g) || []).length,
  5,
  "All five hero CTAs must use the one no-argument rendered-batch action.",
);
assert.doesNotMatch(homeViewSource, /onClick=\{onJoinCommunityBatch\}/);
assert.match(batchManagementSource, /getHomepageOrderGatewayState\(batches\)/);
assert.match(batchManagementSource, /getHomepageJoinBatchLabel\(homepageState\.joinBatch\.name\)/);

console.log(
  "PASS: homepage order gateway source-of-truth, boundaries, and labels",
);
