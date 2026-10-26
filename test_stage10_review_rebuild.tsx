import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create } from "react-test-renderer";
import { DormantFuturePaymentReviewStep } from "./src/components/DormantFuturePaymentReviewStep";
import { createFutureOrderV2PaymentReviewHandoff } from "./src/utils/designStudioFuturePaymentReview";
import { createFutureOrderV2PreparationAttempt } from "./src/utils/futureOrderV2Preparation";
import { getFuturePaymentReviewGarmentPictures } from "./src/utils/futurePaymentReviewPictures";
import { PAYMENT_REVIEW_PAY_PANEL_ID } from "./src/components/futurePaymentReview/PaymentReviewLayoutParts";
import type { FutureOrderCandidateV2 } from "./src/utils/futureOrderCandidate";
import type { FutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";

const baseCandidate =
  createFutureOrderV2Fixture("stage10-rebuild").cartItem.candidate;

// --- Picture data ----------------------------------------------------------
{
  const candidate = structuredClone(baseCandidate) as FutureOrderCandidateV2 & {
    fabricAllocations: FutureOrderCandidateV2["fabricAllocations"][number][];
  };
  candidate.fabricAllocations = [
    {
      allocationId: "alloc-1",
      fabricId: "fabric-1",
      fabricCode: "ODG-007",
      fabricName: "Classic Ivory Shield",
      availability: "available",
      capacityUnits: 1,
      materialPriceCents: null,
      pricingTreatment: "included_in_garment_construction",
      garmentAssignments: [
        {
          garmentKey: "base:shirt",
          code: "ODG-007",
          garmentType: "shirt",
          fabricUnits: 1,
        },
      ],
    },
    {
      allocationId: "alloc-2",
      fabricId: "fabric-2",
      fabricCode: "ODG-008",
      fabricName: "Indigo Wave",
      availability: "available",
      capacityUnits: 1,
      materialPriceCents: null,
      pricingTreatment: "included_in_garment_construction",
      garmentAssignments: [
        {
          garmentKey: "additional:shirt:1",
          code: "ODG-008",
          garmentType: "shirt",
          fabricUnits: 1,
        },
      ],
    },
  ] as never;
  const summary = {
    garmentSummary: [{ garmentKey: "base:shirt", wearerLabel: "Ada" }],
    fabricSummary: [
      {
        allocationId: "alloc-1",
        fabricCode: "ODG-007",
        image: " https://cdn.example.test/ivory.jpg ",
        colorHex: "#fff",
      },
      {
        allocationId: "other",
        fabricCode: "ODG-008",
        image: null,
        colorHex: "#123456",
      },
    ],
    designStyleOccurrences: [
      {
        garmentKey: "additional:shirt:1",
        sourceKind: "uploaded",
        name: "Upload",
        image: "blob:https://site/abc",
        status: "selected",
        occurrenceLabel: "Shirt 2",
        detail: null,
      },
    ],
  } as unknown as FutureDesignStudioSummary;

  const pictures = getFuturePaymentReviewGarmentPictures(candidate, summary);
  assert.equal(pictures.length, candidate.garments.length);
  const [first, second, third] = pictures;
  assert.equal(first.design.sourceKind, "catalogue");
  assert.equal(first.design.imageUrl, "https://example.test/base:shirt.jpg");
  assert.equal(first.wearerLabel, "Ada");
  assert.deepEqual(
    first.fabrics.map((fabric) => [fabric.fabricName, fabric.imageUrl]),
    [["Classic Ivory Shield", "https://cdn.example.test/ivory.jpg"]],
  );
  assert.equal(
    first.referenceImageUrl,
    "/images/garments/ankara-standard-shirt.webp",
  );
  // Uploaded design: the opaque previewReference is never used as a URL; the
  // Summary preview is.
  assert.equal(second.design.sourceKind, "uploaded");
  assert.equal(second.design.imageUrl, "blob:https://site/abc");
  // Fabric matched by code falls back to its colour when there is no photo.
  assert.deepEqual(
    [second.fabrics[0].imageUrl, second.fabrics[0].colorHex],
    [null, "#123456"],
  );
  assert.equal(third.design.sourceKind, "uploaded");
  assert.equal(third.design.imageUrl, null);
  assert.equal(third.fabrics.length, 0);

  // Without a candidate, the Summary projection alone drives the pictures.
  assert.deepEqual(getFuturePaymentReviewGarmentPictures(null, null), []);
}

// --- Rendered layout ---------------------------------------------------------
const preparedResult = createFutureOrderV2PreparationAttempt({
  candidate: baseCandidate,
  ids: { cartItemId: "future-cart-stage10", orderId: "future-order-stage10" },
});
assert.equal(preparedResult.status, "valid");
if (preparedResult.status !== "valid")
  throw new Error("Expected the fixture to prepare.");
const prepared = preparedResult.attempt;
const handoff = createFutureOrderV2PaymentReviewHandoff(prepared.candidate, {
  status: "prepared",
  cartItemId: prepared.cartItemId,
  orderId: prepared.orderId,
});

let payCalls = 0;
const props = {
  result: handoff,
  onBack: () => undefined,
  onEditStage: () => undefined,
  onPay: () => {
    payCalls += 1;
  },
};
const markup = renderToStaticMarkup(
  createElement(DormantFuturePaymentReviewStep, props),
);

// Pictures come first in the details column, before "Your Order".
assert.ok(markup.includes("data-payment-review-pictures"));
assert.ok(
  markup.indexOf("data-payment-review-pictures") <
    markup.indexOf(">Your Order<"),
);
assert.equal(
  (markup.match(/data-payment-review-picture-card=/g) || []).length,
  prepared.candidate.garments.length,
);
assert.ok(markup.includes('alt="Shirt Historical Style design for Shirt"'));
assert.ok(markup.includes('loading="lazy"'));
assert.ok(markup.includes("/images/garments/ankara-standard-shirt.webp"));

// Two columns: the payment section lives in the sticky aside, after details.
const payColumnAt = markup.indexOf(`id="${PAYMENT_REVIEW_PAY_PANEL_ID}"`);
assert.ok(payColumnAt > markup.indexOf("Price breakdown"));
assert.ok(
  markup.indexOf('aria-labelledby="future-payment-unavailable-title"') >
    payColumnAt,
);
assert.ok(markup.includes("data-payment-review-order-card"));
assert.ok(markup.includes("data-payment-review-picture-strip"));
assert.equal((markup.match(/data-pricing-final-total/g) || []).length, 1);

// Exactly one real Pay button; the sticky bar has its own marker.
assert.equal(
  (markup.match(/data-future-order-v2-pay="true"/g) || []).length,
  1,
);
assert.ok(markup.includes("data-payment-review-sticky-bar"));
const stickyButton =
  markup.match(/<button[^>]*data-payment-review-sticky-pay[^>]*>/)?.[0] ?? "";
assert.ok(stickyButton, "sticky Pay shortcut renders");
assert.equal(stickyButton.includes("data-future-order-v2-pay"), false);
assert.ok(/aria-label="Go to payment: Pay €\d+\.\d{2}"/.test(stickyButton));
assert.ok(markup.includes("lg:hidden"));

// Collapsibles stay mounted and closed by default.
for (const id of ["measurements", "delivery-contact"]) {
  const details = markup.match(
    new RegExp(`<details[^>]*data-payment-review-disclosure="${id}"[^>]*>`),
  )?.[0];
  if (
    id === "measurements" &&
    !markup.includes("Measurement values are pending.")
  ) {
    assert.ok(details, "measurement values sit in a disclosure");
  }
  if (!details) continue;
  assert.equal(/\sopen(=|\s|>)/.test(details), false, `${id} starts collapsed`);
}

// Long construction lists collapse; the construction total stays visible.
{
  const longCandidate = structuredClone(prepared.candidate) as never as {
    garments: Array<{ construction: unknown[] }>;
  };
  longCandidate.garments[0]!.construction = Array.from(
    { length: 5 },
    (_, index) => ({
      componentKey: `component-${index}`,
      selectionGroup: "group",
      optionId: `option-${index}`,
      label: `Construction line ${index + 1}`,
      priceCents: 1000,
    }),
  );
  const longMarkup = renderToStaticMarkup(
    createElement(DormantFuturePaymentReviewStep, {
      ...props,
      result: createFutureOrderV2PaymentReviewHandoff(
        longCandidate as never as FutureOrderCandidateV2,
        {
          status: "prepared",
          cartItemId: prepared.cartItemId,
          orderId: prepared.orderId,
        },
      ),
    }),
  );
  const disclosureAt = longMarkup.indexOf(
    'data-payment-review-disclosure="construction-',
  );
  assert.ok(disclosureAt > 0, "five construction lines collapse");
  assert.ok(longMarkup.includes("Show all 5 construction lines"));
  const closeAt = longMarkup.indexOf("</details>", disclosureAt);
  assert.ok(
    longMarkup.indexOf("Construction line 5", disclosureAt) < closeAt,
    "lines stay mounted",
  );
  assert.ok(
    longMarkup.indexOf("Construction total", disclosureAt) > closeAt,
    "total stays visible",
  );
}

// The sticky shortcut never starts a payment.
{
  let renderer: ReturnType<typeof create> | undefined;
  act(() => {
    renderer = create(createElement(DormantFuturePaymentReviewStep, props));
  });
  const button = renderer!.root.find(
    (node) =>
      node.type === "button" &&
      node.props["data-payment-review-sticky-pay"] !== undefined,
  );
  act(() => button.props.onClick());
  assert.equal(payCalls, 0);
  act(() => renderer?.unmount());
}

// Confirmed payment: no sticky bar.
{
  const confirmed = createFutureOrderV2PaymentReviewHandoff(
    prepared.candidate,
    {
      status: "prepared",
      cartItemId: prepared.cartItemId,
      orderId: prepared.orderId,
    },
    {
      status: "confirmed",
      paymentReference: "future-v2-payment-stage10",
      providerTransactionReference: "pi_test_stage10",
      amountCents: 30000,
      recordedAt: "2026-10-26T15:00:00.000Z",
    },
  );
  const confirmedMarkup = renderToStaticMarkup(
    createElement(DormantFuturePaymentReviewStep, {
      ...props,
      result: confirmed,
    }),
  );
  assert.ok(confirmedMarkup.includes("data-future-order-v2-confirmed"));
  assert.equal(
    confirmedMarkup.includes("data-payment-review-sticky-bar"),
    false,
  );
}

console.log(
  "PASS: Stage 10 review rebuild (pictures, two columns, collapsibles, sticky Pay)",
);
