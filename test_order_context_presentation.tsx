import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import {
  OrderContextDetails,
  StudioOrderContextIndicator,
} from "./src/components/CustomerOrderContext";
import { DormantFuturePaymentReviewStep } from "./src/components/DormantFuturePaymentReviewStep";
import { DormantFutureSummaryStep } from "./src/components/DormantFutureSummaryStep";
import { resolveCustomerOrderContextPresentation } from "./src/utils/customerOrderContextPresentation";
import type { FutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import type { FuturePaymentReviewResult } from "./src/utils/designStudioFuturePaymentReview";
import { resolvePersistedDraftOrderContext } from "./src/utils/orderContextIdentity";
import type { Batch } from "./src/types";

const avatars = { id: "batch-7", name: "Avatars" };
const pioneers = { id: "batch-8", name: "Pioneers" };

const retainedAvatars = resolveCustomerOrderContextPresentation(
  { orderType: "Community", batchId: "batch-7", batchName: "Avatars" },
  [avatars, pioneers],
);
assert.deepEqual(retainedAvatars, {
  kind: "community",
  studioLabel: "Community Order",
  detailsOrderType: "Community Batch",
  batchName: "Avatars",
});

const renamedAvatars = resolveCustomerOrderContextPresentation(
  { orderType: "Community", batchId: "batch-7", batchName: "Avatars" },
  [{ id: "batch-7", name: "Heritage Avatars" }, pioneers],
);
assert.equal(renamedAvatars.batchName, "Heritage Avatars");

const missingBatchWithSnapshot = resolveCustomerOrderContextPresentation(
  { orderType: "Community", batchId: "batch-7", batchName: "Avatars" },
  [pioneers],
);
assert.equal(missingBatchWithSnapshot.batchName, "Avatars");

const hydratedRetainedOrder = resolvePersistedDraftOrderContext(
  { batchType: "community", batchId: "batch-7", batchName: "Avatars" },
  [avatars, pioneers] as Batch[],
  "",
);
assert.equal(hydratedRetainedOrder?.batchName, "Avatars");
assert.equal(
  resolveCustomerOrderContextPresentation(hydratedRetainedOrder, [avatars, pioneers])
    .batchName,
  "Avatars",
);

const missingBatchWithoutSnapshot = resolveCustomerOrderContextPresentation(
  { orderType: "Community", batchId: "batch-7" },
  [pioneers],
);
assert.equal(missingBatchWithoutSnapshot.batchName, null);

const unassignedCommunity = resolveCustomerOrderContextPresentation(
  { orderType: "Community", batchName: "No Active Batch" },
  [],
);
assert.equal(unassignedCommunity.batchName, null);

const individual = resolveCustomerOrderContextPresentation(
  { orderType: "Individual" },
  [avatars, pioneers],
);
assert.deepEqual(individual, {
  kind: "individual",
  studioLabel: "Individual Order",
  detailsOrderType: "Individual Order",
  batchName: null,
});

const communityIndicator = renderToStaticMarkup(
  <StudioOrderContextIndicator context={retainedAvatars} />,
);
assert.ok(communityIndicator.includes("Community Order"));
assert.ok(communityIndicator.includes("Avatars"));
assert.equal(communityIndicator.includes("Pioneers"), false);

const longBatchIndicator = renderToStaticMarkup(
  <StudioOrderContextIndicator
    context={{
      ...retainedAvatars,
      batchName: "Avatars Heritage Celebration and Cultural Tailoring Collective",
    }}
  />,
);
assert.ok(longBatchIndicator.includes("flex-wrap"));
assert.ok(longBatchIndicator.includes("break-words"));

const communityDetails = renderToStaticMarkup(
  <OrderContextDetails context={retainedAvatars} />,
);
assert.ok(communityDetails.includes("Order details"));
assert.ok(communityDetails.includes("Community Batch"));
assert.ok(communityDetails.includes(">Batch<"));
assert.ok(communityDetails.includes("Avatars"));

const individualDetails = renderToStaticMarkup(
  <OrderContextDetails context={individual} />,
);
assert.ok(individualDetails.includes("Individual Order"));
assert.equal(individualDetails.includes(">Batch<"), false);

const missingDetails = renderToStaticMarkup(
  <OrderContextDetails context={missingBatchWithoutSnapshot} />,
);
assert.ok(missingDetails.includes("Community Batch"));
assert.equal(missingDetails.includes("batch-7"), false);
assert.equal(missingDetails.includes("Pioneers"), false);

const minimalSummary = {
  status: "ready",
  blockers: [],
  garmentSummary: [],
  fabricSummary: [],
  designStyleSummary: null,
  customDetailsSummary: [],
  aiTryOnSummary: { status: "skipped", label: "Skipped by choice" },
  measurementSummary: {
    routeLabel: "Low-risk measurement route",
    unit: "inch",
    shared: [],
    byGarment: [],
  },
  pricingSummary: {
    status: "exact",
    garmentConstructionSubtotal: 0,
    customDetailsExactSubtotal: 0,
    selectedDesignPrice: null,
  },
} as FutureDesignStudioSummary;

const summaryMarkup = renderToStaticMarkup(
  <DormantFutureSummaryStep
    summary={minimalSummary}
    orderContext={retainedAvatars}
    onBack={() => undefined}
    onEditGarments={() => undefined}
    onEditFabrics={() => undefined}
    onEditDesignStyle={() => undefined}
    onEditCustomDetails={() => undefined}
    onEditAiTryOn={() => undefined}
    onEditMeasurements={() => undefined}
    canContinueToShipping
    onContinueToShipping={() => undefined}
  />,
);
assert.ok(summaryMarkup.includes("Order details"));
assert.ok(summaryMarkup.includes("Community Batch"));
assert.ok(summaryMarkup.includes("Avatars"));

const paymentMarkup = renderToStaticMarkup(
  <DormantFuturePaymentReviewStep
    result={{ status: "blocked", candidate: null, blockers: [] } as unknown as FuturePaymentReviewResult}
    orderContext={retainedAvatars}
    onBack={() => undefined}
    onEditStage={() => undefined}
  />,
);
assert.ok(paymentMarkup.includes("Order details"));
assert.ok(paymentMarkup.includes("Community Batch"));
assert.ok(paymentMarkup.includes("Avatars"));

console.log("PASS: retained customer order-context presentation");
