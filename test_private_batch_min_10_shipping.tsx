import assert from "node:assert/strict";
import { createElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import DesignStudioView from "./src/components/DesignStudioView";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { DEFAULT_BUSINESS_SETTINGS } from "./src/data/mockData";
import { auth } from "./src/services/firebase";
import { useAppStore } from "./src/store/useAppStore";
import type { Batch, CustomGroup } from "./src/types";
import { createCatalogueAuthoritativeFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import type { FutureOrderCandidateV2 } from "./src/utils/futureOrderCandidate";
import {
  quoteFutureOrderPayableTotal,
  recomputeFutureOrderPayableTotal,
} from "./src/utils/futureOrderPayableTotal";
import {
  formatIndividualShippingNote,
  individualLagosToEindhovenChargeCents,
  isCommunityBatchOrder,
  isPrivateBatchOrder,
  resolveIndividualInboundShippingDisplay,
} from "./src/utils/individualInboundShippingDisplay";
import { projectShippingDisplayEstimate } from "./src/utils/shippingDisplayEstimate";
import { getFuturePaymentReviewPricingRows } from "./src/utils/designStudioFuturePaymentReview";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  clear(): void {
    this.values.clear();
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: storage,
    location: { search: "" },
    scrollY: 0,
    scrollTo: () => undefined,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    },
    cancelAnimationFrame: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    matchMedia: () => ({
      matches: false,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  },
});
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});

const noopAutosaveScheduler = {
  schedule: (_callback: () => void, _delayMs: number) => 0,
  cancel: (_handle: unknown) => undefined,
};

type WritableCandidate = {
  -readonly [K in keyof FutureOrderCandidateV2]: FutureOrderCandidateV2[K];
};

const cloneCandidate = (candidate: FutureOrderCandidateV2): WritableCandidate =>
  structuredClone(candidate) as WritableCandidate;

const replicateGarments = (
  candidate: WritableCandidate,
  count: number,
): WritableCandidate => {
  const template = candidate.garments[0];
  assert.ok(template);
  candidate.garments = Array.from({ length: count }, (_, index) => ({
    ...structuredClone(template),
    garmentKey: `${template.garmentKey}:${index}`,
  }));
  return candidate;
};

const alignToQuote = (candidate: WritableCandidate) => {
  const quote = quoteFutureOrderPayableTotal(candidate);
  assert.ok(quote);
  candidate.pricing = {
    ...candidate.pricing,
    status: "exact",
    garmentConstructionSubtotalCents: quote.garmentConstructionSubtotalCents,
    customDetailsCents: quote.customDetailsCents,
    selectedDesignTotalCents: quote.selectedDesignTotalCents,
    postEindhovenAdjustmentCents: quote.postEindhovenAdjustmentCents,
    exactTotalCents: quote.exactTotalCents,
    components: {
      ...candidate.pricing.components,
      customDetails: {
        status: "separately_charged",
        amountCents: quote.customDetailsCents,
      },
      postEindhovenDelivery: {
        status: "separately_charged",
        amountCents: quote.postEindhovenAdjustmentCents,
      },
      lagosToEindhovenShipping:
        quote.lagosToEindhovenShippingCents === null
          ? { status: "included_in_garment_construction", amountCents: null }
          : {
              status: "separately_charged",
              amountCents: quote.lagosToEindhovenShippingCents,
            },
    },
  };
  candidate.shipping = {
    ...candidate.shipping,
    additionalDeliveryFeeCents: quote.postEindhovenAdjustmentCents,
  };
  return quote;
};

const PRIVATE_BATCH_BELOW_MIN_NOTE =
  "Private Batch orders require at least 10 garments to waive the €131.25 Lagos → Eindhoven shipping fee. Add more garments to reach 10, or continue with €131.25 shipping included.";

// 1. Helper classification tests
assert.equal(isPrivateBatchOrder({ orderType: "Group Organizer" }), true);
assert.equal(isPrivateBatchOrder({ orderType: "Group Member" }), true);
assert.equal(isPrivateBatchOrder({ batchType: "personalized" }), true);
assert.equal(isPrivateBatchOrder({ orderType: "Community" }), false);
assert.equal(isPrivateBatchOrder({ orderType: "Individual" }), false);

assert.equal(isCommunityBatchOrder({ orderType: "Community" }), true);
assert.equal(isCommunityBatchOrder({ batchType: "community" }), true);
assert.equal(isCommunityBatchOrder({ batchType: "actual" }), true);
assert.equal(isCommunityBatchOrder({ orderType: "Group Organizer" }), false);

// 2. Private Batch with 1, 3, 9 garments -> adds 13125 cents (€131.25) in display, estimate, candidate, and payable total
const privateBase = createCatalogueAuthoritativeFutureOrderV2Fixture(
  "private-min-test",
  undefined,
  { orderType: "Group Organizer", batchId: "private_group_min10" },
).cartItem.candidate;

for (const count of [1, 3, 9] as const) {
  for (const orderType of ["Group Organizer", "Group Member"] as const) {
    const display = resolveIndividualInboundShippingDisplay({
      orderType,
      physicalGarmentCount: count,
      fulfilmentMethod: "eindhoven_pickup",
    });
    assert.ok(display, `${orderType} with ${count} garments returns €131.25 display`);
    assert.equal(display.amountCents, 13125);
    assert.equal(display.priceEur, 131.25);
    assert.equal(display.blockCount, 1);
    assert.equal(display.reason, "private_batch_below_minimum");
    assert.equal(formatIndividualShippingNote(display), PRIVATE_BATCH_BELOW_MIN_NOTE);
    assert.equal(
      individualLagosToEindhovenChargeCents({
        orderType,
        physicalGarmentCount: count,
      }),
      13125,
    );

    const estimate = projectShippingDisplayEstimate({
      orderType,
      garmentCount: count,
      selectedDesignPrice: 65 * count,
      fulfilmentMethod: "eindhoven_pickup",
    });
    assert.equal(estimate.lagosAmountCents, 13125);
    assert.equal(estimate.lagosNote, PRIVATE_BATCH_BELOW_MIN_NOTE);
    assert.equal(estimate.allInEstimateCents, 6500 * count + 13125);

    const candidate = replicateGarments(cloneCandidate(privateBase), count);
    candidate.orderIdentity = { orderType, batchId: "private_group_min10" };
    const quote = alignToQuote(candidate);
    assert.equal(quote.lagosToEindhovenShippingCents, 13125);
    assert.equal(
      quote.exactTotalCents,
      quote.garmentConstructionSubtotalCents + 13125,
    );
    assert.equal(recomputeFutureOrderPayableTotal(candidate).status, "exact");

    const rows = getFuturePaymentReviewPricingRows(candidate.pricing, {
      orderType,
      physicalGarmentCount: count,
      fulfilmentMethod: "eindhoven_pickup",
    });
    const lagosRow = rows.find((row) => row.id === "lagos_eindhoven_included");
    assert.ok(lagosRow);
    assert.equal(lagosRow.amountCents, 13125);
    assert.equal(lagosRow.note, PRIVATE_BATCH_BELOW_MIN_NOTE);
  }
}

// 3. Private Batch with 10, 12 garments -> returns null (€0 separate Lagos charge) and does NOT trigger individualLagosMissing
for (const count of [10, 12] as const) {
  for (const orderType of ["Group Organizer", "Group Member"] as const) {
    assert.equal(
      resolveIndividualInboundShippingDisplay({
        orderType,
        physicalGarmentCount: count,
      }),
      null,
    );
    assert.equal(
      individualLagosToEindhovenChargeCents({
        orderType,
        physicalGarmentCount: count,
      }),
      null,
    );

    const estimate = projectShippingDisplayEstimate({
      orderType,
      garmentCount: count,
      selectedDesignPrice: 65 * count,
      fulfilmentMethod: "eindhoven_pickup",
    });
    assert.equal(estimate.lagosAmountCents, null);
    assert.equal(estimate.lagosNote, null);
    assert.equal(
      estimate.allInEstimateCents,
      6500 * count,
      `${orderType} with ${count} garments must not trigger individualLagosMissing`,
    );

    const candidate = replicateGarments(cloneCandidate(privateBase), count);
    candidate.orderIdentity = { orderType, batchId: "private_group_min10" };
    const quote = alignToQuote(candidate);
    assert.equal(quote.lagosToEindhovenShippingCents, null);
    assert.equal(quote.exactTotalCents, quote.garmentConstructionSubtotalCents);
    assert.equal(recomputeFutureOrderPayableTotal(candidate).status, "exact");

    const rows = getFuturePaymentReviewPricingRows(candidate.pricing, {
      orderType,
      physicalGarmentCount: count,
      fulfilmentMethod: "eindhoven_pickup",
    });
    assert.equal(
      rows.some((row) => row.id === "lagos_eindhoven_included"),
      false,
    );
  }
}

// 4. Community Batch with 1-3 garments -> still returns null (unchanged)
for (const count of [1, 2, 3] as const) {
  assert.equal(
    resolveIndividualInboundShippingDisplay({
      orderType: "Community",
      physicalGarmentCount: count,
    }),
    null,
  );
  const estimate = projectShippingDisplayEstimate({
    orderType: "Community",
    garmentCount: count,
    selectedDesignPrice: 65 * count,
    fulfilmentMethod: "eindhoven_pickup",
  });
  assert.equal(estimate.lagosAmountCents, null);
  assert.equal(estimate.allInEstimateCents, 6500 * count);
}

// 5. Individual Order with 1-10 and 11+ garments -> unchanged
assert.equal(
  individualLagosToEindhovenChargeCents({
    orderType: "Individual",
    physicalGarmentCount: 1,
  }),
  13125,
);
assert.equal(
  individualLagosToEindhovenChargeCents({
    orderType: "Individual",
    physicalGarmentCount: 10,
  }),
  13125,
);
assert.equal(
  individualLagosToEindhovenChargeCents({
    orderType: "Individual",
    physicalGarmentCount: 11,
  }),
  26250,
);

// 6. Step 1 Private Batch < 10 popup appears on Continue, lets user stay (Add More Garments) or proceed (Continue (+€131.25 shipping))
const GROUP_ID = "step1_private_batch_min_10";
const group: CustomGroup = {
  batchId: GROUP_ID,
  ownerUid: "owner-step1",
  organizerId: "owner-step1",
  organizer: "Owner Step 1",
  batchName: "Family Heritage Group",
  occasion: "Celebration",
  description: "Family batch",
  country: "Netherlands",
  city: "Eindhoven",
  preferredDeliveryMonth: "December",
  expectedParticipants: 4,
  maxParticipants: 10,
  visibility: "PRIVATE",
  currentMembers: 2,
  closingDate: "2099-01-01",
  deliveryWindow: "December",
  status: "OPEN",
};

const openBatch: Batch = {
  id: "open-community-batch",
  batchNumber: 1,
  name: "Heritage Community Batch",
  startDate: "2026-01-01",
  endDate: "2099-12-31",
  duration: "2 weeks",
  estimatedDelivery: "January",
  status: "OPEN",
  visibility: "PUBLIC",
  isActive: true,
  allowOrders: true,
  targetGarments: 50,
  currentGarments: 5,
  currentOrders: 2,
  currentCustomers: 2,
};

const mutableAuth = auth as unknown as {
  currentUser: unknown;
  notifyAuthListeners(): void;
};
const priorUser = mutableAuth.currentUser;
mutableAuth.currentUser = {
  uid: "owner-step1",
  email: "owner-step1@example.test",
  isAnonymous: false,
};
mutableAuth.notifyAuthListeners();

useAppStore.setState({
  businessSettings: DEFAULT_BUSINESS_SETTINGS,
  isLoadingData: false,
  stylesLoadState: "ready",
  customDetailCatalog: SEED_CUSTOM_DETAIL_CATALOG,
  customGroups: [group],
  customGroupAccessById: { [GROUP_ID]: "owner" },
  customGroupPrivateAccessReady: true,
  customGroupPrivateAccessGeneration: 200,
  customGroupPrivateDiscoveryLifecycleId: 200,
  batches: [openBatch],
  hasLoadedBatches: true,
});

let joinedCommunityBatch: Batch | null = null;
let studio!: ReturnType<typeof create>;
await act(async () => {
  studio = create(
    createElement(DesignStudioView, {
      onAddToCart: () => undefined,
      openCartDrawer: () => undefined,
      onJoinCommunityBatch: (batch) => {
        joinedCommunityBatch = batch;
      },
      currentUser: {
        name: "Owner Step 1",
        email: "owner-step1@example.test",
        ownerUid: "owner-step1",
      },
      orderContext: {
        orderType: "Group Organizer",
        batchId: GROUP_ID,
        batchName: "Family Heritage Group",
      },
      styles: [],
      fabrics: [],
      futureDraftAutosaveScheduler: noopAutosaveScheduler,
    }),
  );
  await Promise.resolve();
  await Promise.resolve();
});

const textOf = (node: ReactTestInstance): string =>
  node.children
    .map((child) => (typeof child === "string" ? child : textOf(child)))
    .join("");

const rootStage = () =>
  studio.root.findByProps({ id: "design-studio-ten-stage-journey" }).props["data-stage-id"];

assert.equal(rootStage(), "garment_type");

// Select 1 garment (Standard Shirt) via its Step 1 toggle button
const shirtToggle = studio.root.findAll(
  (node) =>
    node.type === "button" &&
    typeof node.props["aria-label"] === "string" &&
    node.props["aria-label"].includes("Standard Shirt"),
)[0]!;
await act(async () => {
  shirtToggle.props.onClick();
  await Promise.resolve();
});

// Verify the inline Step 1 banner appears when < 10 garments are selected
const banner = studio.root.findByProps({ "data-testid": "private-batch-minimum-banner" });
assert.match(
  textOf(banner),
  /Private Batch minimum: 1 of 10 garments selected — orders under 10 garments include €131\.25 Lagos → Eindhoven shipping\./,
);

// Click "Continue to Fabric"
const continueButton = studio.root.findAll(
  (node) =>
    node.type === "button" &&
    textOf(node).includes("Continue to Fabric"),
)[0]!;
assert.equal(Boolean(continueButton.props.disabled), false);

await act(async () => {
  continueButton.props.onClick();
  await Promise.resolve();
});

// Modal opens and Studio stays on Step 1
assert.equal(rootStage(), "garment_type");
const modal = studio.root.findByProps({ "data-testid": "private-batch-minimum-modal" });
assert.equal(modal.props.role, "dialog");
assert.equal(modal.props["aria-modal"], "true");
assert.match(
  textOf(modal),
  /Private Batch requires at least 10 garments \(you currently have 1 selected\)\. Orders under 10 garments include the €131\.25 Lagos → Eindhoven shipping charge — the same as an Individual Order\./,
);

// Clicking "Add More Garments" closes the modal and stays on Step 1
const addMoreBtn = studio.root.findByProps({ "data-testid": "private-batch-min-add-more" });
await act(async () => {
  addMoreBtn.props.onClick();
  await Promise.resolve();
});
assert.equal(rootStage(), "garment_type");
assert.equal(
  studio.root.findAllByProps({ "data-testid": "private-batch-minimum-modal" }).length,
  0,
);

// Re-open modal and verify "Switch to Community Batch" action works when an open Community Batch is available
await act(async () => {
  continueButton.props.onClick();
  await Promise.resolve();
});
const switchCommunityBtn = studio.root.findByProps({
  "data-testid": "private-batch-min-switch-community",
});
await act(async () => {
  switchCommunityBtn.props.onClick();
  await Promise.resolve();
});
assert.equal(joinedCommunityBatch?.id, "open-community-batch");
assert.equal(
  studio.root.findAllByProps({ "data-testid": "private-batch-minimum-modal" }).length,
  0,
);

// Re-open modal and click "Continue (+€131.25 shipping)" to proceed to Step 2 (Fabric)
await act(async () => {
  continueButton.props.onClick();
  await Promise.resolve();
});
const proceedBtn = studio.root.findByProps({ "data-testid": "private-batch-min-continue" });
await act(async () => {
  proceedBtn.props.onClick();
  await Promise.resolve();
});
assert.equal(
  studio.root.findAllByProps({ "data-testid": "private-batch-minimum-modal" }).length,
  0,
);
assert.equal(rootStage(), "fabric");

await act(async () => {
  studio.unmount();
});
mutableAuth.currentUser = priorUser;
mutableAuth.notifyAuthListeners();

console.log("test_private_batch_min_10_shipping.tsx: all assertions passed");
