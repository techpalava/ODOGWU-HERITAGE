import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Batch } from "./src/types";
import HomepageOrderGateway from "./src/components/HomepageOrderGateway";
import { getHomepageOrderGatewayState } from "./src/utils/homepageOrderGateway";

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
    onJoinBatch: () => undefined,
    onCreatePrivateBatch: () => undefined,
    onBrowseGallery: () => undefined,
    onManageSourcingBatches: () => undefined,
  }),
);
assert.match(joinMarkup, /Join Avatars/);
assert.match(joinMarkup, /Manage Sourcing Batches/);

const customerMarkup = renderToStaticMarkup(
  createElement(HomepageOrderGateway, {
    state: privateState,
    onJoinBatch: () => undefined,
    onCreatePrivateBatch: () => undefined,
    onBrowseGallery: () => undefined,
  }),
);
assert.doesNotMatch(customerMarkup, /Order Type B/);
assert.doesNotMatch(customerMarkup, /Manage Sourcing Batches/);

console.log(
  "PASS: homepage order gateway source-of-truth, boundaries, and labels",
);
