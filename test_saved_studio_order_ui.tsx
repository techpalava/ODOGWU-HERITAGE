import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { act, create } from "react-test-renderer";
import { SaveOrderActionProvider } from "./src/components/SaveOrderActionContext";
import { SaveOrderButton } from "./src/components/SaveOrderButton";
import { SavedOrderConfirmationDialog } from "./src/components/SavedOrderConfirmationDialog";
import { SavedOrderReplaceDialog } from "./src/components/SavedOrderReplaceDialog";
import { SavedOrderCapDialog } from "./src/components/SavedOrderCapDialog";
import { SavedOrdersSection } from "./src/components/SavedOrdersSection";
import { SavedOrderChangeWarningBanner } from "./src/components/SavedOrderChangeWarningBanner";
import {
  DesignStudioStepActions,
} from "./src/components/DesignStudioBackButton";
import {
  SAVED_STUDIO_ORDER_CAP_MESSAGE,
  SAVED_STUDIO_ORDER_CONFIRMATION_MESSAGE,
  SAVED_STUDIO_ORDER_GARMENT_GATE_REASON,
  type SavedStudioOrderItemV1,
} from "./src/utils/savedStudioOrderModel";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const render = (element: ReactElement) => {
  let renderer: ReturnType<typeof create> | undefined;
  act(() => {
    renderer = create(element);
  });
  return renderer!;
};

const textOf = (node: ReturnType<typeof create>["root"]): string =>
  node.children
    .map((child) => (typeof child === "string" ? child : textOf(child as never)))
    .join("");

let savedFocus: { element: HTMLElement | null; scrollY: number } | null = null;
const gated = render(
  <SaveOrderActionProvider
    value={{
      disabled: true,
      disabledReason: SAVED_STUDIO_ORDER_GARMENT_GATE_REASON,
      busy: false,
      onSave: (focus) => {
        savedFocus = focus ?? null;
      },
    }}
  >
    <DesignStudioStepActions
      slot="footer"
      backDestination="Summary"
      forward={{ label: "Continue", ariaLabel: "Continue" }}
    />
  </SaveOrderActionProvider>,
);
const gatedButtons = gated.root.findAllByType("button");
assert.equal(gatedButtons.length, 3);
assert.equal(gatedButtons[1].props["data-testid"], "save-order-button");
assert.equal(gatedButtons[1].props.disabled, true);
assert.match(textOf(gated.root), new RegExp(SAVED_STUDIO_ORDER_GARMENT_GATE_REASON));
assert.equal(savedFocus, null);

let saveClicks = 0;
const enabled = render(
  <SaveOrderActionProvider
    value={{
      disabled: false,
      disabledReason: null,
      busy: false,
      onSave: () => {
        saveClicks += 1;
      },
    }}
  >
    <SaveOrderButton />
  </SaveOrderActionProvider>,
);
act(() => {
  enabled.root.findByType("button").props.onClick();
});
assert.equal(saveClicks, 1);

let continued = false;
let startedNew = false;
const confirmation = render(
  <SavedOrderConfirmationDialog
    open
    restoreFocusTo={{ element: null, scrollY: 120 }}
    onContinue={() => {
      continued = true;
    }}
    onStartNewOrder={() => {
      startedNew = true;
    }}
  />,
);
assert.match(textOf(confirmation.root), new RegExp(SAVED_STUDIO_ORDER_CONFIRMATION_MESSAGE));
act(() => {
  confirmation.root
    .findByProps({ "data-testid": "saved-order-confirmation-continue" })
    .props.onClick();
});
assert.equal(continued, true);
act(() => {
  confirmation.root
    .findByProps({ "data-testid": "saved-order-confirmation-start-new" })
    .props.onClick();
});
assert.equal(startedNew, true);

const choices: string[] = [];
const replace = render(
  <SavedOrderReplaceDialog
    open
    unfinishedOrderLabel="Standard Shirt"
    onSaveCurrentFirst={() => choices.push("save")}
    onReplace={() => choices.push("replace")}
    onCancel={() => choices.push("cancel")}
  />,
);
act(() => {
  replace.root.findByProps({ "data-testid": "saved-order-replace-save-current" }).props.onClick();
  replace.root.findByProps({ "data-testid": "saved-order-replace-current" }).props.onClick();
  replace.root.findByProps({ "data-testid": "saved-order-replace-cancel" }).props.onClick();
});
assert.deepEqual(choices, ["save", "replace", "cancel"]);

const cap = render(
  <SavedOrderCapDialog open onClose={() => undefined} onOpenDashboard={() => undefined} />,
);
assert.match(textOf(cap.root), new RegExp(SAVED_STUDIO_ORDER_CAP_MESSAGE));
assert.ok(cap.root.findByProps({ "data-testid": "saved-order-cap-dashboard-link" }));

const item: SavedStudioOrderItemV1 = {
  schemaVersion: 1,
  savedOrderId: "savedord00000001",
  ownerUid: "owner",
  name: "Standard Dress, 22 Oct",
  garmentSummary: "Standard Dress",
  savedStage: "fabric",
  savedStep: 2,
  resumeLocus: null,
  draft: {
    journeySchemaVersion: 2,
    currentStageId: "fabric",
    currentStep: 2,
    selectedFabricCode: null,
    selectedStyleId: null,
    selectedGarment: null,
    designSelections: { accessories: [] },
    measurements: {
      height: 0,
      weight: 0,
      age: 0,
      bodyBuild: "Average",
      fitPreference: "Standard",
      neck: 0,
      shoulder: 0,
      chest: 0,
      waist: 0,
      hip: 0,
      sleeve: 0,
      trouserLength: 0,
      isAiEstimated: false,
      unit: "inch",
    },
    sizingMode: "manual",
    deliveryMethod: null,
    deliveryAddress: { addressLine1: "", city: "", postalCode: "", countryCode: "" },
    pickupTime: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    batchType: "alone",
    customGroupCode: "",
    garmentPieceCount: 1,
    specialInstructions: "",
    leftoverFabricChoice: "",
    hasLining: false,
    pricingBreakdown: {
      customDetailsPrice: 0,
      eindhovenToDestinationShipping: null,
    },
    shippingSnapshot: {},
    updatedAt: "2026-10-22T12:00:00.000Z",
  },
  priceSnapshot: {
    schemaVersion: 1,
    total: 70,
    garmentConstructionSubtotal: 70,
    customDetailsPrice: 0,
    capturedAt: "2026-10-22T12:00:00.000Z",
  },
  createdAt: "2026-10-22T12:00:00.000Z",
  updatedAt: "2026-10-22T12:00:00.000Z",
  revision: 1,
};

const actions: string[] = [];
const section = render(
  <SavedOrdersSection
    items={[item]}
    onContinue={() => actions.push("continue")}
    onRename={() => actions.push("rename")}
    onDelete={() => actions.push("delete")}
  />,
);
act(() => {
  section.root.findByProps({ "data-testid": "saved-order-continue" }).props.onClick();
  section.root.findByProps({ "data-testid": "saved-order-delete" }).props.onClick();
});
act(() => {
  section.root.findByProps({ "data-testid": "saved-order-delete-confirm-yes" }).props.onClick();
});
assert.deepEqual(actions, ["continue", "delete"]);

const warnings = render(
  <SavedOrderChangeWarningBanner
    warnings={[
      { code: "fabric_unavailable", message: "Fabric FABRIC-A is sold out or no longer listed." },
      { code: "price_changed", message: "Prices have changed since this order was saved. You will be charged current prices." },
    ]}
  />,
);
assert.match(textOf(warnings.root), /sold out/);
assert.match(textOf(warnings.root), /Prices have changed/);

const studio = readFileSync("src/components/DesignStudioView.tsx", "utf8");
assert.match(studio, /SaveOrderActionProvider/);
assert.match(studio, /beginGuestSaveSignIn/);
assert.match(studio, /consumePendingSave/);
assert.match(studio, /handleRequestFreshIndividualOrder|onStartFreshIndividualOrder/);
assert.match(studio, /isUploadedSourceRetained/);
assert.match(studio, /linkedSavedOrderIdRef/);
assert.match(studio, /SavedOrderConfirmationDialog/);

const cart = readFileSync("src/components/CartDrawer.tsx", "utf8");
assert.match(cart, /saved-order-cart-item/);
assert.match(cart, /Unfinished/);
assert.equal(cart.includes("saved-order-cart-pay"), false);
assert.match(cart, /futureOrderV2CartItems/);

const dashboard = readFileSync("src/components/DashboardView.tsx", "utf8");
assert.match(dashboard, /SavedOrdersSection/);
assert.match(dashboard, /My Draft Designs/);

const payment = readFileSync("src/components/DormantFuturePaymentReviewStep.tsx", "utf8");
assert.match(payment, /SaveOrderButton variant="payment-panel"/);
assert.match(payment, /future-order-v2-add-to-cart/);

const retire = readFileSync("src/services/retirePaidStudioDraft.ts", "utf8");
assert.match(retire, /linkedSavedOrderId/);
assert.match(retire, /removeSavedOrderId/);
// B5: no path infers the saved order to remove from the active draft.
assert.equal(retire.includes("getFutureDesignDraft()?.linkedSavedOrderId"), false);
assert.equal(/removeLinkedSavedOrder/.test(studio), false);
assert.match(studio, /removeSavedOrderId: takeSavedOrderPaymentLink\(result\.orderId\)/);
const cartPay = readFileSync("src/components/FutureOrderV2CartPayPanel.tsx", "utf8");
assert.match(cartPay, /rememberSavedOrderPaymentLink\(/);
assert.match(cartPay, /void retireStudioFutureDesignDraft\(\);/);
assert.equal(/removeLinkedSavedOrder/.test(cartPay), false);
const dashboardSrc = readFileSync("src/components/DashboardView.tsx", "utf8");
assert.equal(/removeLinkedSavedOrder/.test(dashboardSrc), false);
assert.match(dashboardSrc, /takeSavedOrderPaymentLink\(result\.orderId\)/);
// B1: autosave writes the saved-order link into every rebuilt draft.
assert.match(
  studio,
  /fabricAllocations: autosaveAllocationResolution\.fabricAllocations,\s*\.\.\.\(linkedSavedOrderIdRef\.current/,
);
assert.match(studio, /linkedSavedOrderIdRef\.current = storedDraft\?\.linkedSavedOrderId \|\| null;/);
// B2: user-initiated upload removal keeps files a saved order still uses.
assert.match(
  studio,
  /retainedBySavedOrder[\s\S]{0,200}deleteDraft: retainedBySavedOrder\s*\? async \(\) => undefined/,
);
// B4: live price check after Continue.
assert.match(studio, /resolvePriceCheck\(savedOrderLivePriceTotal\)/);
assert.match(studio, /handleConfirmCancelFutureOrder/);
assert.equal(
  /handleConfirmCancelFutureOrder[\s\S]*?retireCurrentStudioDraft\(\);/.test(studio),
  true,
);

console.log("PASS: saved studio order UI");
