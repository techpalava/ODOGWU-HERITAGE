import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Batch, OrderContext } from "./src/types";
import HomepageOrderGateway, {
  getJoinCurrentBatchButtonLabel,
} from "./src/components/HomepageOrderGateway";
import { getHomepageOrderGatewayState } from "./src/utils/homepageOrderGateway";
import { BatchBusinessRules } from "./src/engine/BatchBusinessRules";
import { OrderRoutingEngine } from "./src/engine/OrderRoutingEngine";

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
assert.equal(getJoinCurrentBatchButtonLabel("Avatars"), "Join Avatars");
assert.equal(
  getJoinCurrentBatchButtonLabel("  Summer Heritage Group  "),
  "Join Summer Heritage Group",
);
assert.equal(
  getJoinCurrentBatchButtonLabel("A Very Long Community Batch Name For Every Family"),
  "Join A Very Long Community Batch Name For Every Family",
);
assert.equal(
  getJoinCurrentBatchButtonLabel("Avatars", true),
  "Join Current Batch",
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
const joinCallback = () => {
  joinCallbackCalls += 1;
};
const joinGatewayTree = HomepageOrderGateway({
  state: openState,
  onStartIndividualOrder: () => undefined,
  onJoinBatch: joinCallback,
  onCreatePrivateBatch: () => undefined,
  onBrowseGallery: () => undefined,
});
const joinButton = findElementById(joinGatewayTree, "btn-quick-join-cohort");
assert.equal(joinButton?.props.onClick, joinCallback);
assert.equal(joinButton?.props.disabled, false);
joinButton.props.onClick();
assert.equal(joinCallbackCalls, 1, "The existing join callback must remain intact");

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
assert.match(joinMarkup, /Join Avatars/);
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

console.log(
  "PASS: homepage order gateway source-of-truth, boundaries, and labels",
);
