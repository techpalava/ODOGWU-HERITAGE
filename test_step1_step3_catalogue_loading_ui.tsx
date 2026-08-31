/**
 * Step 1 / Step 3 catalogue loading vs empty vs no-match UI regressions.
 * Exercises real coverage resolver + rendered Step messaging (not source regex).
 */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { DormantFutureDesignStyleStep } from "./src/components/DormantFutureDesignStyleStep";
import { GarmentTypeStep } from "./src/components/GarmentTypeStep";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import type {
  CustomDetailDemographic,
  GarmentTypeStepSelection,
  StyleCategory,
} from "./src/types";
import { normalizeCustomDetailCatalog } from "./src/utils/catalogHelpers";
import { resolveStep1CatalogueCoverage } from "./src/utils/step1CatalogueCoverage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const catalog = normalizeCustomDetailCatalog(SEED_CUSTOM_DETAIL_CATALOG);

const selection = (
  garmentTypes: GarmentTypeStepSelection["garmentTypes"],
  demographics: CustomDetailDemographic[],
): GarmentTypeStepSelection => ({
  garmentTypes,
  demographic: demographics[0] || null,
  audienceSelection: { schemaVersion: 1, demographics },
  constructionByGarment: {},
});

const compatibleStyle: StyleCategory = {
  id: "ui-compatible-shirt-trouser",
  name: "UI Compatible Set",
  description: "Shirt + Trouser male.",
  gender: "male",
  options: [],
  fabricCapacityComposition: [
    createStyleBaseGarmentSpec("shirt"),
    createStyleBaseGarmentSpec("trouser"),
  ],
};

const incompatibleStyle: StyleCategory = {
  id: "ui-incompatible-dress",
  name: "UI Dress Only",
  description: "Dress female.",
  gender: "female",
  options: [],
  fabricCapacityComposition: [createStyleBaseGarmentSpec("dress")],
};

const emptyUploaded = {
  source: null,
  reference: null,
  composition: [],
  demographic: null,
  previewUrl: null,
  error: "",
  isUploading: false,
  isReplacing: false,
  isDeleting: false,
  isLoadingPreview: false,
  isConfirmed: false,
  isPricingActive: false,
};

const textContent = (node: ReactTestInstance | string | null): string =>
  typeof node === "string"
    ? node
    : node
      ? node.children
          .map((child) => textContent(child as ReactTestInstance | string))
          .join("")
      : "";

const renderStep1 = (coverage: ReturnType<typeof resolveStep1CatalogueCoverage>) =>
  renderToStaticMarkup(
    createElement(GarmentTypeStep, {
      selectedGarmentTypes: coverage.selectedGarments as never,
      selectedDemographics: coverage.selectedDemographics as never,
      normalizedCustomDetailCatalog: catalog,
      catalogueCoverageMessage:
        (coverage.status === "no_match" ||
          coverage.status === "empty_catalogue") &&
        coverage.customerHeadline &&
        coverage.customerDetail
          ? {
              headline: coverage.customerHeadline,
              detail: coverage.customerDetail,
            }
          : null,
      onGarmentTypesChange: () => undefined,
      onDemographicsChange: () => undefined,
      onConstructionDefaultsChange: () => undefined,
    }),
  );

const renderStep3 = async ({
  styles,
  garmentTypeSelection,
  stylesLoadState,
  selectedStyleId = null,
}: {
  styles: StyleCategory[];
  garmentTypeSelection: GarmentTypeStepSelection;
  stylesLoadState: "loading" | "ready" | "error";
  selectedStyleId?: string | null;
}) => {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      createElement(DormantFutureDesignStyleStep, {
        styles,
        garmentTypeSelection,
        selectedStyleId,
        stagePrice: null,
        uploadedDesign: emptyUploaded,
        pendingCatalogStyleName: null,
        stylesLoadState,
        onSelectStyle: () => undefined,
        onUploadDesignFile: () => undefined,
        onToggleUploadedGarment: () => undefined,
        onUploadedDemographicChange: () => undefined,
        onRemoveUploadedDesign: () => undefined,
        onRetryUploadedDesignDeletion: () => undefined,
        onContinueUploadedDesign: () => undefined,
        onBack: () => undefined,
        onReturnToGarmentType: () => undefined,
        onContinue: () => undefined,
      }),
    );
  });
  const continueButton = renderer.root.findByProps({
    "aria-label": "Continue to Custom Details",
  });
  return {
    text: textContent(renderer.root),
    continueDisabled: Boolean(continueButton.props.disabled),
    stageComplete: renderer.root.findByProps({
      "data-stage-id": "design_style",
    }).props["data-stage-complete"],
    continueDocked: Boolean(
      renderer.root.findByProps({
        "data-testid": "future-design-style-continue-action",
      }).props["data-docked"],
    ),
    selectedStyleIdProp: selectedStyleId,
  };
};

// 1. loading=true + styles=[] => coverage loading; Step1 no warning; Step3 loading copy
{
  const coverage = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    styles: [],
    stylesLoadState: "loading",
  });
  assert.equal(coverage.status, "loading");
  const step1 = renderStep1(coverage);
  assert.equal(step1.includes("No catalogue design matches"), false);
  assert.equal(step1.includes("No catalogue designs are available"), false);
  const step3 = await renderStep3({
    styles: [],
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    stylesLoadState: "loading",
  });
  assert.match(step3.text, /Loading catalogue designs/);
  assert.equal(step3.text.includes("A current catalog design is required"), false);
  assert.equal(step3.continueDisabled, true);
}

// loading with stale/cached incompatible styles must not show zero-match
{
  const step3 = await renderStep3({
    styles: [incompatibleStyle],
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    stylesLoadState: "loading",
  });
  assert.match(step3.text, /Loading catalogue designs/);
  assert.equal(step3.text.includes("No matching design styles are available yet"), false);
  assert.equal(step3.text.includes("NOT COMPATIBLE") || step3.text.includes("Not Compatible"), false);
  assert.equal(step3.continueDisabled, true);
}

// 2. loading=false + styles=[] => empty catalogue + Upload Your Own Design
{
  const coverage = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    styles: [],
    stylesLoadState: "ready",
  });
  assert.equal(coverage.status, "empty_catalogue");
  const step1 = renderStep1(coverage);
  assert.match(step1, /No catalogue designs are available right now/);
  assert.match(step1, /Upload Your Own Design/);
  const step3 = await renderStep3({
    styles: [],
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    stylesLoadState: "ready",
  });
  assert.match(step3.text, /No catalogue designs are available right now/);
  assert.match(step3.text, /upload your own design below/i);
  assert.equal(step3.text.includes("A current catalog design is required"), false);
}

// 3. matched => no warning
{
  const coverage = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    styles: [compatibleStyle],
    stylesLoadState: "ready",
  });
  assert.equal(coverage.status, "matched");
  const step1 = renderStep1(coverage);
  assert.equal(step1.includes("No catalogue design matches"), false);
}

// 4. no_match => upload-later warning
{
  const coverage = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    styles: [incompatibleStyle],
    stylesLoadState: "ready",
  });
  assert.equal(coverage.status, "no_match");
  const step1 = renderStep1(coverage);
  assert.match(step1, /No directly compatible catalogue design found/);
  assert.match(step1, /browse all designs/i);
  assert.match(step1, /upload your own design/i);
  assert.equal(step1.includes("No catalogue design matches this selection"), false);
  const step3 = await renderStep3({
    styles: [incompatibleStyle],
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    stylesLoadState: "ready",
  });
  assert.match(step3.text, /No designs can currently be selected for this order/);
  assert.match(step3.text, /Upload Your Own Design/);
  assert.match(step3.text, /NOT AVAILABLE FOR THIS ORDER/);
  assert.equal(step3.text.includes("No matching design styles are available yet"), false);
}

// blocked/indeterminate catalogue entries do not count as Step 1 selectable matches
{
  const blockedStyle: StyleCategory = {
    id: "blocked-kaftan",
    name: "Palace Kaftan",
    description: "Kaftan only.",
    gender: "male",
    options: [],
    fabricCapacityComposition: [createStyleBaseGarmentSpec("kaftan")],
  };
  const indeterminateStyle: StyleCategory = {
    id: "indeterminate-archive",
    name: "Unreviewed Archive",
    description: "Missing composition metadata.",
    gender: "male",
    options: [],
  };
  const coverage = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    styles: [blockedStyle, indeterminateStyle],
    stylesLoadState: "ready",
  });
  assert.equal(coverage.status, "no_match");
  assert.equal(coverage.compatibleCount, 0);
  assert.equal(
    coverage.customerHeadline,
    "No directly compatible catalogue design found",
  );
  assert.match(coverage.customerDetail || "", /browse all designs/i);
}

// 5. saved selection while loading must not show upload-only; then matched
{
  const whileLoading = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    styles: [],
    stylesLoadState: "loading",
  });
  assert.equal(whileLoading.status, "loading");
  assert.equal(renderStep1(whileLoading).includes("upload later"), false);
  const afterReady = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    styles: [compatibleStyle],
    stylesLoadState: "ready",
  });
  assert.equal(afterReady.status, "matched");
  assert.equal(afterReady.customerHeadline, null);
}

// Case A — restored style id while loading: no false reselection; Continue blocked
{
  const garmentTypeSelection = selection(["shirt", "trouser"], ["male"]);
  const step3 = await renderStep3({
    styles: [],
    garmentTypeSelection,
    stylesLoadState: "loading",
    selectedStyleId: "saved-style",
  });
  assert.match(step3.text, /Loading catalogue designs/);
  assert.equal(step3.text.includes("Select another design"), false);
  assert.equal(step3.text.includes("Selected"), false);
  assert.match(step3.text, /Upload Your Own Design/);
  assert.equal(step3.continueDisabled, true);
  assert.equal(step3.stageComplete, false);
  assert.equal(step3.selectedStyleIdProp, "saved-style");
}

// Case B — restored style id while error: unavailable, no reselection alert
{
  const step3 = await renderStep3({
    styles: [],
    garmentTypeSelection: selection(["shirt", "trouser"], ["male"]),
    stylesLoadState: "error",
    selectedStyleId: "saved-style",
  });
  assert.match(step3.text, /Design Style catalogue temporarily unavailable/);
  assert.equal(step3.text.includes("Select another design"), false);
  assert.match(step3.text, /Upload Your Own Design/);
  assert.equal(step3.continueDisabled, true);
  assert.equal(step3.stageComplete, false);
}

// Case C — loading with cached compatible style is not authoritative; ready restores Selected
{
  const garmentTypeSelection = selection(["shirt", "trouser"], ["male"]);
  const whileLoading = await renderStep3({
    styles: [compatibleStyle],
    garmentTypeSelection,
    stylesLoadState: "loading",
    selectedStyleId: compatibleStyle.id,
  });
  assert.match(whileLoading.text, /Loading catalogue designs/);
  assert.equal(whileLoading.text.includes("Select another design"), false);
  assert.equal(whileLoading.text.includes("Selected"), false);
  assert.equal(whileLoading.continueDisabled, true);
  assert.equal(whileLoading.stageComplete, false);
  assert.equal(whileLoading.continueDocked, false);

  const whenReady = await renderStep3({
    styles: [compatibleStyle],
    garmentTypeSelection,
    stylesLoadState: "ready",
    selectedStyleId: compatibleStyle.id,
  });
  assert.match(whenReady.text, /Selected/);
  assert.match(whenReady.text, /Select Design|Selected/);
  assert.equal(whenReady.text.includes("Select another design"), false);
  assert.equal(whenReady.continueDisabled, false);
  assert.equal(whenReady.stageComplete, true);
  assert.equal(whenReady.continueDocked, true);
}

// 6–7. demographic flip unsupported ↔ supported
{
  let coverage = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["full_length_gown"], ["female"]),
    styles: [
      {
        id: "gown-female",
        name: "Gown",
        description: "",
        gender: "female",
        options: [],
        fabricCapacityComposition: [
          createStyleBaseGarmentSpec("full_length_gown"),
        ],
      },
    ],
  });
  assert.equal(coverage.status, "matched");
  coverage = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["full_length_gown"], ["male"]),
    styles: [
      {
        id: "gown-female",
        name: "Gown",
        description: "",
        gender: "female",
        options: [],
        fabricCapacityComposition: [
          createStyleBaseGarmentSpec("full_length_gown"),
        ],
      },
    ],
  });
  assert.equal(coverage.status, "no_match");
  assert.ok(coverage.customerHeadline);
  coverage = resolveStep1CatalogueCoverage({
    garmentTypeSelection: selection(["full_length_gown"], ["female"]),
    styles: [
      {
        id: "gown-female",
        name: "Gown",
        description: "",
        gender: "female",
        options: [],
        fabricCapacityComposition: [
          createStyleBaseGarmentSpec("full_length_gown"),
        ],
      },
    ],
  });
  assert.equal(coverage.status, "matched");
  assert.equal(coverage.customerHeadline, null);
}

console.log("PASS: Step1/Step3 loading vs empty vs no-match UI regressions");
