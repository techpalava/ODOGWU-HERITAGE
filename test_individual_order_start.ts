import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IndividualOrderStartDialog } from "./src/components/IndividualOrderStartDialog";
import HomepageOrderGateway from "./src/components/HomepageOrderGateway";
import { getHomepageOrderGatewayState } from "./src/utils/homepageOrderGateway";
import {
  classifyIndividualOrderStart,
  describeUnfinishedOrder,
} from "./src/utils/individualOrderStart";
import type { HomepageDraftInspectionResult } from "./src/services/homepageDraftReplacement";
import type { GuestDesignDraft } from "./src/types";

const blocked = classifyIndividualOrderStart({
  status: "invalid",
  reason: "persisted_order_identity_invalid",
});
assert.equal(blocked.kind, "blocked");
assert.equal(blocked.kind === "blocked" && blocked.reason, "persisted_order_identity_invalid");

const unavailable = classifyIndividualOrderStart({
  status: "unavailable",
  reason: "guest_draft_read_failed",
});
assert.equal(unavailable.kind, "blocked");

assert.deepEqual(classifyIndividualOrderStart({ status: "empty" }), {
  kind: "start_fresh",
});

const draft = {
  batchType: "alone",
  currentStageId: "shipping",
  customerName: "Older Name",
  futureShippingState: {
    schemaVersion: 1,
    customerInformation: { fullName: "Test Guest" },
  },
} as GuestDesignDraft;

const valid = classifyIndividualOrderStart({
  status: "valid",
  existing: { draft },
} as HomepageDraftInspectionResult);
assert.equal(valid.kind, "confirm_replacement");
assert.equal(
  valid.kind === "confirm_replacement" && valid.existing.draft,
  draft,
  "A valid draft is offered for confirmation and is not discarded by classification.",
);
assert.equal(
  describeUnfinishedOrder(draft),
  "Individual Order, Step 9 of 10, recipient Test Guest",
);
assert.equal(describeUnfinishedOrder(draft).includes("abc"), false);
assert.equal(describeUnfinishedOrder(draft).includes("not-an-email"), false);

const appSource = readFileSync(new URL("./src/App.tsx", import.meta.url), "utf8");
assert.match(appSource, /classifyIndividualOrderStart\(inspected\)/);
assert.match(appSource, /onStartIndividualOrder=\{handleRequestFreshIndividualOrder\}/);
assert.match(appSource, /handleConfirmFreshIndividualOrder/);
assert.match(appSource, /authority\.discard\(\s*request\.existing/);
assert.equal(
  appSource.includes("setActiveTab(\"design\")") &&
    appSource.includes("handleRequestFreshIndividualOrder"),
  true,
);
const freshHandler = appSource.slice(
  appSource.indexOf("const handleRequestFreshIndividualOrder"),
  appSource.indexOf("const resumePersistedDraft"),
);
assert.equal(
  freshHandler.includes("openDesignStudioForOrder"),
  true,
);
assert.equal(
  freshHandler.includes("discard("),
  true,
  "Parked bag copies are still discarded before a fresh Individual Order.",
);
assert.equal(
  freshHandler.includes("setIndividualOrderStartRequest"),
  true,
  "A live draft opens a confirmation instead of the studio.",
);
const confirmHandler = appSource.slice(
  appSource.indexOf("const handleConfirmFreshIndividualOrder"),
  appSource.indexOf("const createPrivateBatchFromSetup"),
);
assert.match(confirmHandler, /\.discard\(/);
const resumeHandler = appSource.slice(
  appSource.indexOf("const handleResumeIndividualOrderFromDialog"),
  appSource.indexOf("const handleConfirmFreshIndividualOrder"),
);
assert.equal(resumeHandler.includes(".discard("), false);
assert.match(resumeHandler, /resumePersistedDraft/);

const customOrderSource = readFileSync(
  new URL("./src/components/CustomOrderView.tsx", import.meta.url),
  "utf8",
);
assert.match(customOrderSource, /if \(onStartIndividualOrder\) \{\s*onStartIndividualOrder\(\);/s);
assert.match(customOrderSource, /id="btn-resume-unfinished-order"/);
assert.match(customOrderSource, /id="btn-start-individual-order"/);

const dialogMarkup = renderToStaticMarkup(
  createElement(IndividualOrderStartDialog, {
    unfinishedOrderLabel: "Individual Order, Step 9 of 10, recipient Test Guest",
    canResume: true,
    busy: false,
    onResume: () => undefined,
    onStartNew: () => undefined,
    onCancel: () => undefined,
  }),
);
assert.match(dialogMarkup, /data-individual-order-start-dialog="true"/);
assert.match(dialogMarkup, /Resume unfinished order/);
assert.match(dialogMarkup, /Start new Individual Order/);
assert.match(dialogMarkup, /Cancel/);
assert.match(dialogMarkup, /Test Guest/);
assert.equal(dialogMarkup.includes("not-an-email"), false);

const blockedResumeMarkup = renderToStaticMarkup(
  createElement(IndividualOrderStartDialog, {
    unfinishedOrderLabel: "Group order, Step 2 of 10",
    canResume: false,
    busy: false,
    onResume: () => undefined,
    onStartNew: () => undefined,
    onCancel: () => undefined,
  }),
);
assert.equal(blockedResumeMarkup.includes("Resume unfinished order"), false);
assert.match(blockedResumeMarkup, /cannot be reopened from here/);
assert.match(blockedResumeMarkup, /Start new Individual Order/);

const gateway = getHomepageOrderGatewayState([]);
const gatewayMarkup = renderToStaticMarkup(
  createElement(HomepageOrderGateway, {
    state: gateway,
    onStartIndividualOrder: () => undefined,
    unfinishedOrderLabel: "Individual Order, Step 9 of 10, recipient Test Guest",
    onResumeUnfinishedOrder: () => undefined,
    onJoinBatch: () => undefined,
    onCreatePrivateBatch: () => undefined,
    onBrowseGallery: () => undefined,
  }),
);
assert.match(gatewayMarkup, /id="btn-start-individual-order"/);
assert.match(gatewayMarkup, /id="btn-resume-unfinished-order"/);
assert.match(gatewayMarkup, /Start Individual Order/);
assert.match(gatewayMarkup, /Resume unfinished order/);

const gatewayWithoutDraft = renderToStaticMarkup(
  createElement(HomepageOrderGateway, {
    state: gateway,
    onStartIndividualOrder: () => undefined,
    onJoinBatch: () => undefined,
    onCreatePrivateBatch: () => undefined,
    onBrowseGallery: () => undefined,
  }),
);
assert.equal(gatewayWithoutDraft.includes("btn-resume-unfinished-order"), false);
assert.match(gatewayWithoutDraft, /id="btn-start-individual-order"/);

console.log("PASS: individual order start keeps drafts until the customer confirms");
