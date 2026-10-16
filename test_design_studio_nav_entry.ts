import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IndividualOrderStartDialog } from "./src/components/IndividualOrderStartDialog";
import {
  classifyDesignStudioNavEntry,
  describeUnfinishedOrder,
  designStudioNavResumeActionLabel,
} from "./src/utils/individualOrderStart";
import type { HomepageDraftInspectionResult } from "./src/services/homepageDraftReplacement";
import type { GuestDesignDraft } from "./src/types";

assert.deepEqual(classifyDesignStudioNavEntry({ status: "empty" }), {
  kind: "start_fresh",
});

const unavailable = classifyDesignStudioNavEntry({
  status: "unavailable",
  reason: "guest_draft_read_failed",
});
assert.equal(unavailable.kind, "blocked");

const communityDraft = {
  batchType: "community",
  batchId: "batch-6",
  batchName: "Avatars",
  currentStageId: "garment_type",
} as GuestDesignDraft;

const communityDecision = classifyDesignStudioNavEntry({
  status: "valid",
  existing: { draft: communityDraft },
} as HomepageDraftInspectionResult);
assert.equal(communityDecision.kind, "confirm_replacement");
assert.equal(
  communityDecision.kind === "confirm_replacement" &&
    communityDecision.existing.draft,
  communityDraft,
  "A Community draft is kept for an explicit resume or replace choice.",
);
assert.equal(
  describeUnfinishedOrder(communityDraft),
  "Avatars, Step 1 of 10",
);
assert.equal(
  describeUnfinishedOrder({
    batchType: "community",
    currentStageId: "garment_type",
  } as GuestDesignDraft),
  "Community order, Step 1 of 10",
);
assert.equal(
  designStudioNavResumeActionLabel(communityDraft),
  "Resume community order",
);
assert.equal(
  designStudioNavResumeActionLabel({ batchType: "alone" } as GuestDesignDraft),
  "Resume individual order",
);
assert.equal(
  designStudioNavResumeActionLabel({
    batchType: "personalized",
  } as GuestDesignDraft),
  "Resume group order",
);

const individualDraft = {
  batchType: "alone",
  currentStageId: "shipping",
  futureShippingState: {
    schemaVersion: 1,
    customerInformation: { fullName: "Test Guest" },
  },
} as GuestDesignDraft;
const individualDecision = classifyDesignStudioNavEntry({
  status: "valid",
  existing: { draft: individualDraft },
} as HomepageDraftInspectionResult);
assert.equal(individualDecision.kind, "confirm_replacement");
assert.equal(
  designStudioNavResumeActionLabel(individualDraft),
  "Resume individual order",
);

const navMarkup = renderToStaticMarkup(
  createElement(IndividualOrderStartDialog, {
    unfinishedOrderLabel: "Community order, Step 1 of 10",
    canResume: true,
    busy: false,
    entry: "design-studio",
    resumeLabel: "Resume community order",
    onResume: () => undefined,
    onStartNew: () => undefined,
    onCancel: () => undefined,
  }),
);
assert.match(navMarkup, /data-order-start-entry="design-studio"/);
assert.match(navMarkup, /Open Design Studio\?/);
assert.match(navMarkup, /Resume community order/);
assert.match(navMarkup, /Start fresh/);
assert.match(navMarkup, /Community order, Step 1 of 10/);
assert.match(navMarkup, /will not open that saved order unless you resume it/);
assert.equal(navMarkup.includes("Start new Individual Order"), false);

const appSource = readFileSync(new URL("./src/App.tsx", import.meta.url), "utf8");
const navHandler = appSource.slice(
  appSource.indexOf("const handleRequestDesignStudioFromNav"),
  appSource.indexOf("const handleRequestFreshIndividualOrder"),
);
assert.match(navHandler, /classifyDesignStudioNavEntry\(inspected\)/);
assert.match(navHandler, /activeTab === "design"/);
assert.match(navHandler, /entry: "design-studio"/);
assert.match(navHandler, /designStudioNavResumeActionLabel/);
assert.match(navHandler, /openDesignStudioForOrder\(freshIndividualOrderContext\(\)\)/);
assert.match(navHandler, /authority\.discard\(inspected\.existing\)/);
assert.equal(
  navHandler.includes('setActiveTab("design")'),
  false,
  "The nav handler must not open Design Studio before the draft decision.",
);
const resumeHandler = appSource.slice(
  appSource.indexOf("const handleResumeIndividualOrderFromDialog"),
  appSource.indexOf("const handleConfirmFreshIndividualOrder"),
);
assert.equal(resumeHandler.includes(".discard("), false);

const headerSource = readFileSync(
  new URL("./src/components/Header.tsx", import.meta.url),
  "utf8",
);
assert.match(headerSource, /tab\.id === "design"/);
assert.match(headerSource, /requestDesignStudioFromNav\(\)/);
const mobileSource = readFileSync(
  new URL("./src/components/MobileMenu.tsx", import.meta.url),
  "utf8",
);
assert.match(mobileSource, /tab\.id === "design"/);
assert.match(mobileSource, /requestDesignStudioFromNav\(\)/);
const footerSource = readFileSync(
  new URL("./src/components/Footer.tsx", import.meta.url),
  "utf8",
);
assert.match(footerSource, /tab === "design"/);
assert.match(footerSource, /requestDesignStudioFromNav\(\)/);

console.log("PASS: Design Studio nav confirms a saved draft before opening it");
