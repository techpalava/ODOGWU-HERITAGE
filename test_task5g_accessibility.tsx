import assert from "node:assert/strict";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { DormantFuturePaymentReviewStep } from "./src/components/DormantFuturePaymentReviewStep";
import { DesignStudioOrderSummary } from "./src/components/DesignStudioOrderSummary";
import { DormantFutureSummaryStep } from "./src/components/DormantFutureSummaryStep";
import type { FutureDesignStudioSummary } from "./src/utils/designStudioFutureSummary";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { createDesignStyleOccurrences, createDesignStyleStepRenderProps, createDesignStyleStepTestModel } from "./testing/designStyleStepFixtures";
import { createFutureOrderV2Fixture } from "./testing/futureOrderV2Fixture";
import { createPhysicalGarmentOccurrenceIdentityToken } from "./src/utils/physicalGarmentOccurrenceIdentity";
import { createFutureOrderV2PaymentReviewHandoff, type FutureOrderV2PreparationPresentation, type FutureOrderV2PaymentPresentation } from "./src/utils/designStudioFuturePaymentReview";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const noop = () => undefined;
const text = (node: ReactTestInstance): string => node.children.map(child =>
  typeof child === "string" ? child : text(child)).join("");
const occurrences = createDesignStyleOccurrences(["shirt", "shirt"]);
const longName = "LongSubmittedStyle".repeat(8);
const model = createDesignStyleStepTestModel({
  styles: [{ id: "style", name: longName, description: "Catalogue design", gender: "male", options: [],
    fabricCapacityComposition: [createStyleBaseGarmentSpec("shirt")] }],
  garmentTypeSelection: { garmentTypes: ["shirt"], demographic: "male", constructionByGarment: {} },
  occurrences,
  activeTarget: { garmentKey: occurrences[1].garmentKey, occurrenceToken: createPhysicalGarmentOccurrenceIdentityToken({ garmentKey: occurrences[1].garmentKey, generation: occurrences[1].occurrenceGeneration! }) },
  selectedStyleIdByGarmentKey: Object.fromEntries(occurrences.map(o => [o.garmentKey, "style"])),
});
const baseProps = createDesignStyleStepRenderProps(model);
const second = baseProps.occurrences[1];
let cleared: unknown;
let selected: unknown;
let tree!: ReturnType<typeof create>;
act(() => { tree = create(<DormantFutureDesignStyleStep {...baseProps}
  activeOccurrenceTarget={second.target}
  onSelectOccurrence={target => { selected = target; }}
  onClearAssignment={request => { cleared = request; }} onSelectUploadFile={noop} />); });
const clear = tree.root.findByProps({ "aria-label": "Clear design for Standard Shirt 2" });
assert.equal(clear.type, "button");
act(() => clear.props.onClick());
const secondClearRequest = baseProps.clearRequests.find(request =>
  request.target.occurrenceToken === second.target.occurrenceToken);
assert.ok(secondClearRequest);
assert.equal(cleared, secondClearRequest, "UI forwards the existing authority request unchanged");
assert.deepEqual(cleared, baseProps.clearRequest, "the row request matches the active-occurrence request");
// Each garment row has its own Change Design control for that exact occurrence.
const changeButtons = tree.root.findAll(node =>
  node.type === "button" && /^(Choose|Change) Design$/.test(text(node)));
assert.equal(changeButtons.length, 2);
act(() => changeButtons[0].props.onClick({ stopPropagation: noop }));
assert.deepEqual(selected, baseProps.occurrences[0].target);
act(() => changeButtons[1].props.onClick({ stopPropagation: noop }));
assert.deepEqual(selected, second.target);
const input = tree.root.findAll(node => node.type === "input" && node.props.type === "file")
  .find(node => node.props["aria-label"] === "Upload a design for Standard Shirt 2")!;
assert.ok(input);
assert.equal(input.props["aria-label"], "Upload a design for Standard Shirt 2");
assert.equal(tree.root.findByProps({ htmlFor: input.props.id }).type, "label");
act(() => tree.unmount());

// Re-render the same payment component through its real presentation states.
// A stable live region announces transitions without moving keyboard focus.
const order = createFutureOrderV2Fixture("order-" + "x".repeat(180), longName);
const candidate = order.cartItem.candidate;
const snapshotBefore = JSON.stringify(candidate);
const prepared: FutureOrderV2PreparationPresentation = {
  status: "prepared", orderId: order.orderId, cartItemId: order.cartItem.cartItemId,
};
let payCalls = 0;
const renderPayment = (preparation: FutureOrderV2PreparationPresentation, payment?: FutureOrderV2PaymentPresentation) => {
  const element = <DormantFuturePaymentReviewStep
    result={createFutureOrderV2PaymentReviewHandoff(candidate, preparation, payment)}
    onBack={noop} onEditStage={noop}
    onPay={() => { payCalls += 1; }} />;
  act(() => { if (tree) tree.update(element); else tree = create(element); });
};
// The previous renderer is unmounted; create the payment renderer first.
act(() => { tree = create(<></>); });
const payButtons = () => tree.root.findAll((node) => node.type === "button" && node.props["data-future-order-v2-pay"] === true);
renderPayment({ status: "preparing" });
const status = () => tree.root.findByProps({ id: "future-payment-pending-explanation" });
assert.equal(status().props.role, "status");
assert.equal(status().props["aria-atomic"], "true");
assert.match(text(status()), /Saving your order/);
assert.equal(payButtons().length, 1, "one Pay button while the order is saved");
const saving = payButtons()[0];
assert.equal(saving.props.disabled, true);
assert.equal(saving.props["aria-busy"], true);
assert.equal(saving.props["aria-describedby"], status().props.id);
assert.match(text(saving), /Saving your order/);
renderPayment({ status: "error", message: "Could not prepare. Try again." });
assert.match(text(status()), /Could not prepare/);
renderPayment(prepared, { status: "processing", paymentReference: "stable-reference" });
assert.match(text(status()), /Processing your payment/);
assert.equal(payButtons().length, 1);
const processing = payButtons()[0];
assert.equal(processing.props.disabled, true);
assert.equal(processing.props["aria-busy"], true);
assert.match(text(processing), /Processing payment/);
renderPayment(prepared, { status: "failed", paymentReference: "stable-reference", message: "Payment failed. Try again." });
// A declined payment is announced in its own alert, not the status line.
const failureAlert = tree.root.findByProps({ role: "alert" });
assert.match(text(failureAlert), /Payment not completed/);
assert.match(text(failureAlert), /Payment failed\. Try again\./);
assert.equal(payButtons().length, 1, "a declined card leaves the Pay button available");
const retry = payButtons()[0];
assert.equal(retry.props["aria-describedby"], status().props.id);
assert.equal(retry.props["aria-busy"], false);
assert.match(text(retry), /Pay €\d+\.\d{2}/);
act(() => retry.props.onClick());
assert.equal(payCalls, 1);
renderPayment(prepared, { status: "authorized", paymentReference: "stable-reference", providerTransactionReference: "provider-" + "r".repeat(180) });
assert.match(text(status()), /Payment received/);
assert.equal(payButtons().length, 0);
assert.ok(text(tree.root).includes(order.orderId), "Long order IDs remain discoverable in full");
assert.ok(text(tree.root).includes(longName), "Long submitted names are not truncated");
assert.equal(JSON.stringify(candidate), snapshotBefore);
assert.ok(!text(tree.root).includes("shared-uploaded-source-ref"), "Private upload references remain hidden");
act(() => tree.unmount());

let edited: unknown;
act(() => { tree = create(<DesignStudioOrderSummary
  // The live summary stays hidden until a garment is committed, so seed one.
  view={{ sections: [{ id: "construction", title: "Garments", editStage: "garment_type",
    lines: [{ id: "garment-shirt", label: "Standard Shirt", detail: null, amountLabel: null }] },
    { id: "design_style", title: "Design Style", editStage: "design_style",
    lines: ["Standard Shirt", "Standard Shirt 2", "Standard Shirt 3"].map((label, index) => ({
      id: String(index), label, detail: index === 0 ? longName : index === 1 ? "Uploaded design" : "Not selected", amountLabel: null,
    })) }], totalStatus: "hidden", totalLabel: "Total", totalValueLabel: "Pending", totalAmountCents: null, quoteRequired: false }}
  unlockedStages={new Set(["design_style"])} currentStageId="custom_details"
  onEditStage={stage => { edited = stage; }} />); });
assert.deepEqual(tree.root.findByProps({ "data-testid": "live-order-summary-section-design_style" }).findAllByType("li").map(row => text(row.findAllByType("p")[0])), ["Standard Shirt", "Standard Shirt 2", "Standard Shirt 3"]);
assert.ok(text(tree.root).includes(longName));
const edit = tree.root.findByProps({ "aria-label": "Edit Design Style" });
assert.equal(edit.type, "button");
act(() => edit.props.onClick());
assert.equal(edited, "design_style");
act(() => tree.unmount());

const summary: FutureDesignStudioSummary = {
  status: "incomplete", blockers: [], garmentSummary: [], fabricSummary: [],
  designStyleSummary: null,
  designStyleOccurrences: [
    { garmentKey: "base:shirt", occurrenceLabel: "Standard Shirt", sourceKind: "catalogue", status: "selected", name: longName, image: "https://example.test/style.jpg", detail: "Catalogue design" },
    { garmentKey: "additional:shirt:1", occurrenceLabel: "Standard Shirt 2", sourceKind: "uploaded", status: "selected", name: "Uploaded design", image: null, detail: "Confirmed uploaded design" },
    { garmentKey: "additional:shirt:2", occurrenceLabel: "Standard Shirt 3", sourceKind: "unassigned", status: "needs_review", name: "Not selected", image: null, detail: null },
  ],
  customDetailsSummary: [], aiTryOnSummary: { status: "skipped", label: "Skipped" },
  measurementSummary: { route: "low_risk", routeLabel: "Low risk", unit: "inch", shared: [], byGarment: [] },
  pricingSummary: { status: "pending", garmentConstructionSubtotal: 100, customDetailsExactSubtotal: 0, selectedDesignPrice: null },
};
act(() => { tree = create(<DormantFutureSummaryStep summary={summary}
  onBack={noop} onEditGarments={noop} onEditFabrics={noop} onEditDesignStyle={noop}
  onEditCustomDetails={noop} onEditAiTryOn={noop} onEditMeasurements={noop}
  canContinueToShipping={false} onContinueToShipping={noop} />); });
assert.deepEqual(tree.root.findAllByType("h4").map(text), [
  `Standard Shirt: ${longName}`, "Standard Shirt 2: Uploaded design", "Standard Shirt 3: Not selected",
]);
assert.equal(tree.root.findByType("img").props.alt, `${longName} design for Standard Shirt`);
assert.ok(text(tree.root).includes("needs review"));
const delivery = tree.root.findByProps({ "aria-describedby": "summary-shipping-lock-reason" });
assert.equal(delivery.props.disabled, true);
assert.ok(text(tree.root.findByProps({ id: "summary-shipping-lock-reason" })).includes("fully ready"));
act(() => tree.unmount());
console.log("PASS: Task 5G occurrence controls, readable history, and accessible payment transitions");
