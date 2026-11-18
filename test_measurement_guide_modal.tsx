import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createElement, useState } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import {
  DesignStudioBlockingOverlayProvider,
  useDesignStudioBlockingOverlayOpen,
} from "./src/components/designStudioBlockingOverlay";
import { DormantFutureMeasurementStep } from "./src/components/DormantFutureMeasurementStep";
import {
  MEASUREMENT_GUIDE_CHECKLIST_SECTIONS,
  MEASUREMENT_GUIDE_PDF_DOWNLOAD_FILENAME,
  MEASUREMENT_GUIDE_PDF_HREF,
  MeasurementGuideModal,
} from "./src/components/MeasurementGuideModal";
import type {
  CustomDetailSelectionGroup,
  FutureMeasurementStateV1,
  GarmentTypeStepSelection,
} from "./src/types";
import {
  createEmptyFutureMeasurementState,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementInput,
  setFutureMeasurementRoute,
} from "./src/utils/measurementBlueprint";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const collectText = (
  node:
    | ReactTestInstance
    | { children?: unknown; props?: { children?: unknown } }
    | string
    | number
    | boolean
    | null
    | undefined,
): string => {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node !== "object") return "";
  const children =
    "props" in node && node.props?.children != null
      ? node.props.children
      : "children" in node
        ? node.children
        : undefined;
  const list = Array.isArray(children)
    ? children
    : children != null
      ? [children]
      : [];
  return list.map((child) => collectText(child as never)).join(" ");
};

// 1. Verify the 25-page PDF exists in public/guides and is a real non-empty PDF.
const pdfPath = "public/guides/odogwu-heritage-measurement-guide.pdf";
const pdfStat = statSync(pdfPath);
assert.ok(pdfStat.isFile(), "measurement guide PDF exists as a file");
assert.ok(
  pdfStat.size > 100_000,
  `measurement guide PDF should be non-empty (got ${pdfStat.size} bytes)`,
);
const pdfPrefix = readFileSync(pdfPath).subarray(0, 5).toString("ascii");
assert.equal(pdfPrefix, "%PDF-", "measurement guide asset starts with %PDF-");

// 2. Verify DormantFutureMeasurementStep renders the callout banner and preserves entered inputs.
const construction = (
  garmentType: keyof GarmentTypeStepSelection["constructionByGarment"],
  optionId: string,
  selectionGroup: CustomDetailSelectionGroup,
) => ({
  status: "resolved" as const,
  garmentType,
  components: [
    {
      componentKey: `${garmentType}:${selectionGroup}:${optionId}`,
      optionId,
      selectionGroup,
      priceCents: 1,
      price: 0.01,
    },
  ],
  totalPriceCents: 1,
  totalPrice: 0.01,
});

const shirtSelection: GarmentTypeStepSelection = {
  garmentTypes: ["shirt"],
  demographic: "male",
  constructionByGarment: {
    shirt: construction("shirt", "shirt_std_short", "shirt_construction"),
  },
};
const physicalGarments = [
  { garmentKey: "base:shirt", garmentType: "shirt" as const },
];

const initialPlan = planMeasurementRequirements({
  route: "high_risk",
  garmentTypeSelection: shirtSelection,
  physicalGarments,
});
const totalHeightReq = initialPlan.requirements.find(
  (item) => item.measurementId === "total_height",
);
assert.ok(totalHeightReq, "total_height requirement exists");

let seededState = setFutureMeasurementRoute(
  createEmptyFutureMeasurementState("high_risk", "inch"),
  "high_risk",
);
seededState = setFutureMeasurementInput({
  state: seededState,
  requirement: totalHeightReq,
  displayValue: 71,
});
seededState = reconcileFutureMeasurementState({
  state: seededState,
  plan: initialPlan,
});

let onChangeCalls = 0;
let blockingOverlayOpen = false;

const OverlayProbe = () => {
  blockingOverlayOpen = useDesignStudioBlockingOverlayOpen();
  return null;
};

const StepHarness = () => {
  const [state, setState] = useState<FutureMeasurementStateV1>(seededState);
  const plan = planMeasurementRequirements({
    route: state.route,
    garmentTypeSelection: shirtSelection,
    physicalGarments,
  });
  const reconciled = reconcileFutureMeasurementState({ state, plan });
  return createElement(
    DesignStudioBlockingOverlayProvider,
    null,
    createElement(OverlayProbe),
    createElement(DormantFutureMeasurementStep, {
      plan,
      state: reconciled,
      physicalGarments,
      onChange: (next) => {
        onChangeCalls += 1;
        setState(next);
      },
      onRouteChange: (route) => {
        setState((current) => setFutureMeasurementRoute(current, route));
      },
      onBack: () => undefined,
      onContinue: () => undefined,
    }),
  );
};

let stepRenderer!: ReactTestRenderer;
act(() => {
  stepRenderer = create(createElement(StepHarness));
});

const openButton = stepRenderer.root.findByProps({
  "data-measurement-guide-open": "true",
});
assert.equal(openButton.type, "button");
assert.equal(openButton.props.type, "button");
assert.ok(collectText(openButton).includes("View Measurement Guide"));

const downloadLink = stepRenderer.root.findByProps({
  "data-measurement-guide-download": "true",
});
assert.equal(downloadLink.type, "a");
assert.equal(downloadLink.props.href, MEASUREMENT_GUIDE_PDF_HREF);
assert.equal(
  downloadLink.props.download,
  MEASUREMENT_GUIDE_PDF_DOWNLOAD_FILENAME,
);
assert.ok(collectText(downloadLink).includes("Download PDF Guide"));

assert.equal(
  stepRenderer.root.findAllByProps({ "data-testid": "measurement-guide-modal" })
    .length,
  0,
  "modal starts closed",
);
assert.equal(blockingOverlayOpen, false);

const totalHeightInputBefore = stepRenderer.root
  .findByProps({ "data-measurement-field": "total_height" })
  .findByType("input");
assert.equal(totalHeightInputBefore.props.value, 71);

// Open modal from the callout banner and ensure no measurements were reset or mutated.
act(() => {
  openButton.props.onClick();
});
assert.equal(
  onChangeCalls,
  0,
  "opening the guide modal must not trigger measurement state changes",
);
assert.equal(blockingOverlayOpen, true);

const modal = stepRenderer.root.findByProps({
  "data-testid": "measurement-guide-modal",
});
assert.equal(modal.props.role, "dialog");
assert.equal(modal.props["aria-modal"], "true");

const totalHeightInputWhileOpen = stepRenderer.root
  .findByProps({ "data-measurement-field": "total_height" })
  .findByType("input");
assert.equal(
  totalHeightInputWhileOpen.props.value,
  71,
  "entered measurement stays intact while guide modal is open",
);

// 3. Verify sticky header controls.
const modalHeader = modal.findByProps({
  "data-measurement-guide-modal-header": "true",
});
const modalHeaderText = collectText(modalHeader);
assert.ok(modalHeaderText.includes("Measurement Guide & How-To"));

const modalDownload = modalHeader.findByProps({
  "data-measurement-guide-modal-download": "true",
});
assert.equal(modalDownload.props.href, MEASUREMENT_GUIDE_PDF_HREF);
assert.equal(
  modalDownload.props.download,
  MEASUREMENT_GUIDE_PDF_DOWNLOAD_FILENAME,
);
assert.ok(collectText(modalDownload).includes("Download PDF"));

const modalOpenNewTab = modalHeader.findByProps({
  "data-measurement-guide-modal-open-new-tab": "true",
});
assert.equal(modalOpenNewTab.props.href, MEASUREMENT_GUIDE_PDF_HREF);
assert.equal(modalOpenNewTab.props.target, "_blank");
assert.equal(modalOpenNewTab.props.rel, "noopener noreferrer");
assert.ok(collectText(modalOpenNewTab).includes("Open Full PDF in New Tab"));

const modalCloseButton = modalHeader.findByProps({
  "data-measurement-guide-modal-close": "true",
});
assert.equal(modalCloseButton.type, "button");

// 4. Verify Tab 1 (default): Close-to-Body instructions, 5 canonical checklists, and zero retired leaks.
const checklistsTab = modal.findByProps({
  "data-measurement-guide-tab": "checklists",
});
const pdfTab = modal.findByProps({
  "data-measurement-guide-tab": "pdf",
});
assert.equal(checklistsTab.props["aria-selected"], true);
assert.equal(pdfTab.props["aria-selected"], false);
assert.ok(collectText(checklistsTab).includes("Quick Reference & Checklists"));
assert.ok(collectText(pdfTab).includes("Illustrated PDF Guide (25 Pages)"));

const tab1Panel = modal.findByProps({
  "data-measurement-guide-panel": "checklists",
});
const tab1Text = collectText(tab1Panel);
assert.ok(tab1Text.includes("flexible measuring tape"));
assert.ok(tab1Text.includes("snug (not tight)"));
assert.ok(tab1Text.includes("do not suck in your stomach"));
assert.ok(tab1Text.includes("Record measurements in inches"));
assert.ok(tab1Text.includes("1–2 fingers"));
assert.ok(tab1Text.includes("index or middle finger"));

for (const section of MEASUREMENT_GUIDE_CHECKLIST_SECTIONS) {
  assert.ok(
    tab1Text.includes(section.title),
    `checklist section renders: ${section.title}`,
  );
  for (const item of section.items) {
    assert.ok(tab1Text.includes(item), `checklist item renders: ${item}`);
  }
}

assert.ok(tab1Text.includes("Long Shirt"));
assert.ok(tab1Text.includes("Standard Knicker Shorts"));
assert.ok(tab1Text.includes("Standard Bum Shorts"));
assert.doesNotMatch(tab1Text, /\bnikka\b/i);
assert.doesNotMatch(tab1Text, /\bkaftan\b/i);
assert.doesNotMatch(tab1Text, /\bgowns?\b/i);

const fullModalText = collectText(modal);
assert.doesNotMatch(fullModalText, /\bnikka\b/i);
assert.doesNotMatch(fullModalText, /\bkaftan\b/i);
assert.doesNotMatch(fullModalText, /\bgowns?\b/i);

// Verify category filter buttons narrow and restore checklist sections.
const lowerBodyFilter = modal.findByProps({
  "data-measurement-guide-filter": "lower_body",
});
act(() => {
  lowerBodyFilter.props.onClick();
});
assert.equal(
  modal.findAllByProps({ "data-measurement-guide-section": "lower_body" })
    .length,
  1,
);
assert.equal(
  modal.findAllByProps({ "data-measurement-guide-section": "shirts" }).length,
  0,
);
const allFilter = modal.findByProps({
  "data-measurement-guide-filter": "all",
});
act(() => {
  allFilter.props.onClick();
});
assert.equal(
  modal.findAllByProps({ "data-measurement-guide-section": "shirts" }).length,
  1,
);

// 5. Switch to Tab 2 and verify responsive PDF iframe & mobile fallback helpers.
act(() => {
  pdfTab.props.onClick();
});
assert.equal(
  modal.findByProps({ "data-measurement-guide-tab": "pdf" }).props[
    "aria-selected"
  ],
  true,
);
const iframe = modal.findByType("iframe");
assert.equal(iframe.props.src, MEASUREMENT_GUIDE_PDF_HREF);
assert.equal(
  iframe.props.title,
  "Odogwu Heritage Illustrated Measurement Guide",
);

// 6. Verify Close button, Escape key, and backdrop click all close the modal cleanly.
act(() => {
  modalCloseButton.props.onClick();
});
assert.equal(
  stepRenderer.root.findAllByProps({ "data-testid": "measurement-guide-modal" })
    .length,
  0,
  "Close button closes modal",
);
assert.equal(blockingOverlayOpen, false);

// Reopen and close via Escape key.
act(() => {
  stepRenderer.root
    .findByProps({ "data-measurement-guide-open": "true" })
    .props.onClick();
});
assert.equal(
  stepRenderer.root.findAllByProps({ "data-testid": "measurement-guide-modal" })
    .length,
  1,
);
const overlayForEscape = stepRenderer.root.findByProps({
  "data-testid": "measurement-guide-modal-overlay",
});
act(() => {
  overlayForEscape.props.onKeyDown({
    key: "Escape",
    preventDefault() {},
    stopPropagation() {},
  });
});
assert.equal(
  stepRenderer.root.findAllByProps({ "data-testid": "measurement-guide-modal" })
    .length,
  0,
  "Escape key closes modal",
);

// Reopen and close via backdrop click.
act(() => {
  stepRenderer.root
    .findByProps({ "data-measurement-guide-open": "true" })
    .props.onClick();
});
const backdrop = stepRenderer.root.findByProps({
  "data-measurement-guide-backdrop": "true",
});
act(() => {
  backdrop.props.onClick();
});
assert.equal(
  stepRenderer.root.findAllByProps({ "data-testid": "measurement-guide-modal" })
    .length,
  0,
  "Backdrop click closes modal",
);

// Confirm measurement input remains untouched after opening and closing multiple times.
const totalHeightInputAfter = stepRenderer.root
  .findByProps({ "data-measurement-field": "total_height" })
  .findByType("input");
assert.equal(totalHeightInputAfter.props.value, 71);
assert.equal(onChangeCalls, 0);

// Standalone MeasurementGuideModal open=false returns empty tree.
let closedRenderer!: ReactTestRenderer;
act(() => {
  closedRenderer = create(
    createElement(MeasurementGuideModal, { open: false, onClose: () => undefined }),
  );
});
assert.equal(closedRenderer.toJSON(), null);

console.log("Measurement guide modal and download checks passed.");
