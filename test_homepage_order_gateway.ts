import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Batch, OrderContext } from "./src/types";
import HomepageOrderGateway, {
  getJoinCurrentBatchButtonLabel,
  resolveHomepageJoinSlot,
} from "./src/components/HomepageOrderGateway";
import { createJoinRenderedBatchAction } from "./src/utils/homepageCurrentBatchAction";
import {
  getHomepageJoinBatchDeadlinePill,
  getHomepageJoinBatchDescription,
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
  "Eindhoven",
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
  pickupLocation: "Eindhoven",
});
assert.equal(
  resolveHomepageCommunityBatchEntry(
    [makeBatch({ id: "batch-8", name: "Pioneers" })],
    "batch-6",
    "Eindhoven",
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
    "Eindhoven",
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
    pickupLocation: "Eindhoven",
  },
  "Reload must resolve a Community draft by its retained batch ID, not the current homepage batch.",
);
assert.deepEqual(
  resolvePersistedDraftOrderContext(
    persistedAvatarsDraft,
    [makeBatch({ id: "batch-8", name: "Pioneers" })],
    "Eindhoven",
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

const manualOverrideBatches = (overrides: Partial<Batch> = {}) => [
  makeBatch({
    id: "batch-auto",
    name: "Automatic Batch",
    startDate: "2026-07-01",
    endDate: "2026-07-31",
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
    ...overrides,
  }),
];
const manualOverrideState = getHomepageOrderGatewayState(
  manualOverrideBatches({ keepOpenAfterEndDate: true }),
  closingDay,
);
assert.equal(
  manualOverrideState.joinBatch?.name,
  "Admin Override",
  "An active manual override kept open after its end date must take precedence over an automatic batch",
);
// MANUAL + OPEN alone no longer reopens a batch past its end date (#785):
// the homepage never offers a batch the Studio, cart and server call closed.
assert.equal(
  getHomepageOrderGatewayState(manualOverrideBatches(), closingDay).joinBatch
    ?.name,
  "Automatic Batch",
  "A manual OPEN batch past its end date without the keep-open toggle is not the homepage batch",
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
// Refined cards (2026-10-20): batch name is a gold badge, not part of the title.
assert.match(joinMarkup, /<h3[^>]*>Join an Existing Batch or Group<\/h3>/);
assert.match(joinMarkup, /<span data-join-batch-badge="true"[^>]*>Avatars<\/span>/);
assert.match(joinMarkup, /Join the Avatars/);
assert.match(joinMarkup, /Join an Existing Batch or Group/);
assert.match(joinMarkup, /Individual Custom Order/);
assert.match(joinMarkup, /Ready to Wear/);
assert.match(joinMarkup, /aria-label="Ready to Wear - Coming Soon"[^>]*>Coming Soon<\/button>/);
assert.match(
  joinMarkup,
  /Shipping from Eindhoven to Location applies\./,
);
assert.equal(
  (joinMarkup.match(/Shipping from Eindhoven to Location applies\./g) || []).length,
  1,
  "Only Ready to Wear should show the Eindhoven-to-location shipping copy",
);
assert.doesNotMatch(
  joinMarkup,
  /Shipping from Lagos to Location applies/,
  "Ready to Wear shipping chip must no longer say Lagos",
);
assert.doesNotMatch(joinMarkup, /Order Type [ABCD]/);
assert.match(joinMarkup, /Manage Sourcing Batches/);
assert.ok(
  joinMarkup.indexOf("Join an Existing Batch or Group") <
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
assert.doesNotMatch(unnamedBatchMarkup, /data-join-batch-badge/, "No empty name badge");

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
// Four hero CTAs are plain buttons in HomeView; the fifth is the community
// showcase button, wired once through its onPrimaryAction prop.
assert.equal(
  (homeViewSource.match(/onClick=\{handleHeroPrimaryAction\}/g) || []).length,
  4,
  "The four direct hero CTAs must use the one no-argument rendered-batch action.",
);
assert.equal(
  (homeViewSource.match(/onPrimaryAction=\{handleHeroPrimaryAction\}/g) || []).length,
  1,
  "The community showcase CTA must use the same rendered-batch action, wired once.",
);
assert.equal(
  (
    homeViewSource.match(
      /(?:onClick|onPrimaryAction)=\{handleHeroPrimaryAction\}/g,
    ) || []
  ).length,
  5,
  "All five hero CTAs must use the one no-argument rendered-batch action.",
);
assert.doesNotMatch(homeViewSource, /onClick=\{onJoinCommunityBatch\}/);
assert.match(batchManagementSource, /getHomepageOrderGatewayState\(batches\)/);
assert.match(batchManagementSource, /getHomepageJoinBatchLabel\(homepageState\.joinBatch\.name\)/);

// Join card copy follows the shared community-batch closure rule.
assert.match(joinMarkup, /data-join-batch-state="open"/);
assert.match(joinMarkup, /Join the currently open community batch before ordering closes on /);
const openDescription = getHomepageJoinBatchDescription(
  makeBatch({ startDate: "2026-10-01", endDate: "2026-12-15" }),
  new Date("2026-10-18T12:00:00Z"),
);
assert.deepEqual(openDescription, {
  closed: false,
  text: "Join the currently open community batch before ordering closes on 15 December 2026.",
});
assert.equal(
  getHomepageJoinBatchDescription(
    makeBatch({ startDate: "2026-10-01", endDate: "" }),
    new Date("2026-10-18T12:00:00Z"),
  ).text,
  "Join the currently open community batch before its ordering deadline.",
);
// Live Avatars shape: admin status still OPEN with a manual override, but the
// ordering deadline (endDate) has passed, so Studio/cart/payment treat it closed.
const pastDeadlineAvatars = makeBatch({
  startDate: "2026-07-06",
  endDate: "2026-09-30",
  status: "OPEN",
  isAutoScheduled: false,
  isActive: true,
  targetGarments: 72,
});
const closedDescription = getHomepageJoinBatchDescription(
  pastDeadlineAvatars,
  new Date("2026-10-18T12:00:00Z"),
);
assert.equal(closedDescription.closed, true);
assert.match(closedDescription.text, /^The Avatars batch closed on 30 Sept? 2026\./);
assert.match(closedDescription.text, /You can still start an individual order or create a private batch\.$/);
// Closed by something other than its date: no "closed on" date to show.
assert.match(
  getHomepageJoinBatchDescription(makeBatch({ allowOrders: false })).text,
  /^The Avatars batch is closed and is no longer accepting new orders\./,
);
assert.doesNotMatch(closedDescription.text, /currently open/);
assert.equal(
  getHomepageJoinBatchDescription(
    makeBatch({ allowOrders: false }),
    new Date(),
  ).closed,
  true,
);
const closedMarkup = renderToStaticMarkup(
  createElement(HomepageOrderGateway, {
    state: { joinBatch: pastDeadlineAvatars, minimumGarments: 10 },
    onStartIndividualOrder: () => undefined,
    onJoinBatch: () => undefined,
    onCreatePrivateBatch: () => undefined,
    onBrowseGallery: () => undefined,
  }),
);
assert.match(closedMarkup, /data-join-batch-state="closed"/);
assert.match(closedMarkup, /The Avatars batch closed on 30 Sept? 2026\./);
assert.doesNotMatch(closedMarkup, /currently open community batch/);

// Refined cards: deadline pill, readable meta chips, CTA labels, closed state.
const deadlineBatch = makeBatch({ startDate: "2026-10-01", endDate: "2026-11-16" });
assert.equal(
  getHomepageJoinBatchDeadlinePill(deadlineBatch, new Date("2026-10-20T12:00:00Z")),
  "16 Nov 2026",
);
assert.equal(getHomepageJoinBatchDeadlinePill(pastDeadlineAvatars, new Date("2026-10-18T12:00:00Z")), null);
assert.equal(getHomepageJoinBatchDeadlinePill(makeBatch({ endDate: "" }), new Date("2026-10-18T12:00:00Z")), null);
assert.equal(getHomepageJoinBatchDeadlinePill(null), null);
assert.match(joinMarkup, /data-join-batch-deadline="true"[^>]*>.*Closes \d{1,2} [A-Z][a-z]{2,4} \d{4}<\/p>/);
assert.equal(
  (joinMarkup.match(/<li[^>]*>Group minimum: 10 garments total<\/li>/g) || []).length,
  2,
  "Join and Private cards show the group minimum as a chip",
);
assert.equal((joinMarkup.match(/<li[^>]*>Shared shipping<\/li>/g) || []).length, 2);
assert.match(joinMarkup, /<li[^>]*>Independent order<\/li>/);
assert.match(joinMarkup, /<li[^>]*>Higher direct shipping cost<\/li>/);
assert.doesNotMatch(joinMarkup, /garments total \| Shared/, "Meta is chips, not a pipe-joined line");
assert.match(joinMarkup, /Choose how you order/);
for (const [id, label] of [
  ["btn-quick-join-cohort", "Join the Avatars"],
  ["btn-create-private-batch", "Create Private Batch"],
  ["btn-start-individual-order", "Start Individual Order"],
  ["btn-quick-gallery", "Browse Style Gallery"],
] as const) {
  assert.match(joinMarkup, new RegExp(`id="${id}"[^>]*>(?:<svg[\\s\\S]*?</svg>)?${label}`), `${id} keeps its label`);
}
assert.match(joinMarkup, /id="btn-ready-to-wear"[^>]*disabled=""/);
assert.doesNotMatch(joinMarkup, /\buppercase\b[^"]*text-\[11px\][^"]*text-white/, "Old tiny uppercase CTA style is gone");
// Open join card is the gold featured card; closed falls back to the plain card with no deadline pill.
assert.match(joinMarkup, /border-2 border-heritage-gold[\s\S]*?data-join-batch-badge/);
assert.doesNotMatch(closedMarkup, /data-join-batch-deadline/);
assert.doesNotMatch(closedMarkup, /border-2 border-heritage-gold/);
assert.match(closedMarkup, /<span data-join-batch-badge="true"[^>]*>Avatars<\/span>/);
// No next open batch: the closed card stays, with no join button (the
// Individual and Private cards beside it are unchanged).
assert.doesNotMatch(closedMarkup, /id="btn-quick-join-cohort"/);
assert.doesNotMatch(closedMarkup, /Join next open batch/);
assert.match(closedMarkup, /id="btn-start-individual-order"/);
assert.match(closedMarkup, /id="btn-create-private-batch"/);

// Homepage keeps a Join card while the current batch is closed (#1108).
const closedCardNow = new Date("2026-10-26T12:00:00Z");
const liveAvatars = makeBatch({
  id: "batch-6",
  name: "Avatars",
  startDate: "2026-07-06",
  endDate: "2026-09-30",
  status: "OPEN",
  isAutoScheduled: false,
  isActive: true,
  targetGarments: 72,
  currentGarments: 26,
});
const openMusketeers = makeBatch({
  id: "batch-8",
  batchNumber: 8,
  name: "Musketeers",
  startDate: "2026-10-12",
  endDate: "2026-11-16",
  status: "OPEN",
});
const notYetOpenPowerRangers = makeBatch({
  id: "batch-7",
  batchNumber: 7,
  name: "Power Rangers",
  startDate: "2026-09-07",
  endDate: "2026-10-12",
  status: "YET_TO_START",
  isAutoScheduled: false,
  isActive: false,
});
const closedWithNextState = getHomepageOrderGatewayState(
  [liveAvatars, notYetOpenPowerRangers, openMusketeers],
  closedCardNow,
);
assert.equal(closedWithNextState.closedBatch?.id, "batch-6");
assert.equal(closedWithNextState.nextOpenBatch?.id, "batch-8");
assert.equal(closedWithNextState.joinBatch?.id, "batch-8");
const closedWithNextSlot = resolveHomepageJoinSlot(
  closedWithNextState.joinBatch,
  false,
  null,
  closedCardNow,
  closedWithNextState,
);
assert.equal(closedWithNextSlot.kind, "live");
if (closedWithNextSlot.kind === "live") {
  assert.equal(closedWithNextSlot.name, "Avatars", "Card stays on the closed batch");
  assert.equal(closedWithNextSlot.closed, true);
  assert.match(closedWithNextSlot.text, /^The Avatars batch closed on 30 Sept? 2026\./);
  assert.equal(closedWithNextSlot.label, "Join next open batch: Musketeers");
  assert.equal(closedWithNextSlot.joinTarget?.id, "batch-8");
  assert.equal(closedWithNextSlot.deadlinePill, null);
}
const closedWithNextJoins: string[] = [];
const closedWithNextElement = HomepageOrderGateway({
  state: closedWithNextState,
  onStartIndividualOrder: () => undefined,
  onJoinBatch: (batch: Batch) => closedWithNextJoins.push(batch.id),
  onCreatePrivateBatch: () => undefined,
  onBrowseGallery: () => undefined,
});
const findById = (node: any, id: string): any => {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findById(child, id);
      if (found) return found;
    }
    return null;
  }
  if (node.props?.id === id) return node;
  return findById(node.props?.children, id);
};
const nextButton = findById(closedWithNextElement, "btn-quick-join-cohort");
assert.ok(nextButton, "Closed card shows the next open batch button");
assert.equal(nextButton.props["data-join-next-open-batch"], "true");
nextButton.props.onClick();
assert.deepEqual(closedWithNextJoins, ["batch-8"], "Button joins only the next open batch");
const closedWithNextMarkup = renderToStaticMarkup(closedWithNextElement);
assert.match(closedWithNextMarkup, /data-join-batch-state="closed"/);
assert.match(closedWithNextMarkup, /<span data-join-batch-badge="true"[^>]*>Avatars<\/span>/);
assert.match(
  closedWithNextMarkup,
  /id="btn-quick-join-cohort"[^>]*>Join next open batch: Musketeers/,
);
assert.doesNotMatch(closedWithNextMarkup, /Join the Musketeers/);

const closedWithoutNextState = getHomepageOrderGatewayState(
  [liveAvatars, notYetOpenPowerRangers],
  closedCardNow,
);
assert.equal(closedWithoutNextState.closedBatch?.id, "batch-6");
assert.equal(closedWithoutNextState.nextOpenBatch, null);
assert.equal(closedWithoutNextState.joinBatch, null);
const closedWithoutNextSlot = resolveHomepageJoinSlot(
  null,
  false,
  null,
  closedCardNow,
  closedWithoutNextState,
);
assert.equal(closedWithoutNextSlot.kind, "live");
if (closedWithoutNextSlot.kind === "live") {
  assert.equal(closedWithoutNextSlot.name, "Avatars");
  assert.equal(closedWithoutNextSlot.closed, true);
  assert.equal(closedWithoutNextSlot.label, null);
  assert.equal(closedWithoutNextSlot.joinTarget, null);
}
const closedWithoutNextMarkup = renderToStaticMarkup(
  createElement(HomepageOrderGateway, {
    state: closedWithoutNextState,
    onStartIndividualOrder: () => undefined,
    onJoinBatch: () => undefined,
    onCreatePrivateBatch: () => undefined,
    onBrowseGallery: () => undefined,
  }),
);
assert.match(closedWithoutNextMarkup, /data-join-batch-state="closed"/);
assert.match(closedWithoutNextMarkup, /The Avatars batch closed on 30 Sept? 2026\./);
assert.doesNotMatch(closedWithoutNextMarkup, /id="btn-quick-join-cohort"/);
assert.doesNotMatch(closedWithoutNextMarkup, /Join next open batch/);

// An open current batch shows no closed card.
const openCurrentState = getHomepageOrderGatewayState(
  [{ ...liveAvatars, keepOpenAfterEndDate: true }, openMusketeers],
  closedCardNow,
);
assert.equal(openCurrentState.closedBatch, null);
assert.equal(openCurrentState.nextOpenBatch, null);
assert.equal(openCurrentState.joinBatch?.id, "batch-6");
// Closed for another reason (orders turned off) is not a date-closed card.
assert.equal(
  getHomepageOrderGatewayState(
    [{ ...liveAvatars, allowOrders: false }, openMusketeers],
    closedCardNow,
  ).closedBatch,
  null,
);

// App wiring: the closed card and next batch reach HomeView; the footer
// link points at the homepage order section while the closed card shows.
const appSource = readFileSync("src/App.tsx", "utf8");
assert.match(appSource, /getHomepageClosedCurrentBatch\(batches\)/);
assert.match(appSource, /getNextOpenCommunityBatch\(batches, homepageClosedBatch\.id\)/);
assert.match(appSource, /closedJoinBatch=\{homepageClosedBatch\}/);
assert.match(appSource, /nextOpenBatch=\{homepageNextOpenBatch\}/);
assert.match(appSource, /<Footer\s+joinBatch=\{homepageClosedBatch \? null : homepageJoinBatch\}/);

console.log(
  "PASS: homepage order gateway source-of-truth, boundaries, and labels",
);
