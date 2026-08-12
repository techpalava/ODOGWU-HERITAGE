import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  FABRIC_APPEND_GARMENT_CHOICES,
  type FabricAppendGarmentChoice,
} from "./src/engine/FabricCapacityEngine";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { appendCustomerFabricGarment } from "./src/utils/fabricGarmentAppendFlow";
import { createClearedDesignSelectionStateSnapshot } from "./src/utils/designStyleClearState";

const getChoice = (id: FabricAppendGarmentChoice["id"]) => {
  const choice = FABRIC_APPEND_GARMENT_CHOICES.find((item) => item.id === id);
  assert.ok(choice, `Expected customer garment choice ${id}`);
  return choice;
};

const fabricCode = "ODG-007";
const appendableGarmentTypes = FABRIC_APPEND_GARMENT_CHOICES.map(
  (choice) => choice.id,
).sort();
const customDetailPhysicalGarmentTypes = [
  ...new Set(
    SEED_CUSTOM_DETAIL_CATALOG.filter((option) =>
      Boolean(option.fabricCapacityGarmentSpec),
    )
      .map((option) => option.fabricCapacityGarmentSpec?.garmentType)
      .filter((value): value is NonNullable<typeof value> => Boolean(value)),
  ),
].sort();
assert.deepEqual(
  customDetailPhysicalGarmentTypes,
  appendableGarmentTypes,
  "Custom Details physical-garment options must cover every appendable garment type",
);

let state = FabricAllocationStateEngine.initialize();

state = appendCustomerFabricGarment(state, fabricCode, getChoice("shirt").selection);
assert.equal(state.fabricAllocations.length, 1);
assert.equal(state.fabricAllocations[0]?.garmentAssignments.length, 1);
assert.equal(state.pendingFabricGarment, null);

state = appendCustomerFabricGarment(
  state,
  fabricCode,
  getChoice("trouser").selection,
);
assert.equal(state.fabricAllocations.length, 1);
assert.equal(state.fabricAllocations[0]?.garmentAssignments.length, 2);
assert.equal(state.pendingFabricGarment, null);

state = appendCustomerFabricGarment(state, fabricCode, getChoice("skirt").selection);
assert.equal(state.fabricAllocations.length, 1);
assert.equal(state.fabricAllocations[0]?.garmentAssignments.length, 2);
assert.equal(state.pendingFabricGarment?.garmentType, "skirt");

const beforeClear = {
  selectedStyle: { id: "casual-native", name: "Casual Native" },
  selectedGarment: { code: "G5.2", type: "Shirt + Trouser", fee: 0 },
  selectedFabric: { code: fabricCode, name: "HiTarget Ankara" },
  designSelections: {
    customDetails: {
      shirt_construction: "shirt_std_short",
      trousers_construction: "trouser_flat_front",
      additional_garment: "add_skirt",
    },
    accessories: ["Traditional Hat"],
  },
  fabricAllocationState: state,
};
const afterClear = {
  ...beforeClear,
  ...createClearedDesignSelectionStateSnapshot(1),
};
assert.equal(afterClear.selectedStyle, null);
assert.equal(afterClear.selectedGarment, null);
assert.equal(afterClear.selectedFabric, null);
assert.deepEqual(afterClear.designSelections, { accessories: [] });
assert.equal(afterClear.fabricAllocationState.fabricAllocations.length, 0);
assert.equal(afterClear.fabricAllocationState.activeAllocationId, null);
assert.equal(afterClear.fabricAllocationState.pendingFabricGarment, null);
assert.equal(
  afterClear.fabricAllocationState.awaitingFabricForPendingGarment,
  false,
);
assert.equal(
  "pendingCustomDetailGarmentSelection" in afterClear,
  false,
  "the record-based additional garment flow must not retain the legacy radio pending state",
);
assert.equal(afterClear.currentStep, 1);

const designStudioSource = readFileSync(
  fileURLToPath(new URL("./src/components/DesignStudioView.tsx", import.meta.url)),
  "utf8",
);
const garmentDetailsConfigSource = readFileSync(
  fileURLToPath(new URL("./src/config/GarmentDetailsConfig.ts", import.meta.url)),
  "utf8",
);
const liveSummaryStart = designStudioSource.indexOf("Live Price Summary");
const liveSummaryEnd = designStudioSource.indexOf(
  "Selected summary badges",
  liveSummaryStart,
);
assert.ok(
  liveSummaryStart >= 0 && liveSummaryEnd > liveSummaryStart,
  "Expected to isolate the Live Price Summary rendering block",
);
const liveSummarySource = designStudioSource.slice(
  liveSummaryStart,
  liveSummaryEnd,
);
const activeSummaryStart = designStudioSource.indexOf("Active Selection Summary");
const activeSummaryEnd = designStudioSource.indexOf(
  "Bespoke Escrow Policy",
  activeSummaryStart,
);
assert.ok(
  activeSummaryStart >= 0 && activeSummaryEnd > activeSummaryStart,
  "Expected to isolate the Active Selection summary block",
);
const activeSummarySource = designStudioSource.slice(
  activeSummaryStart,
  activeSummaryEnd,
);
const accessoriesSectionIndex = designStudioSource.indexOf(
  "Select Accessories (Optional)",
);
  const optionalExtraGarmentRenderIndex = designStudioSource.indexOf(
  "<OptionalAdditionalGarmentSection",
);
assert.ok(
  accessoriesSectionIndex >= 0 &&
    optionalExtraGarmentRenderIndex > accessoriesSectionIndex,
  "The additional garment composer must render after ordinary Custom Details sections",
);
assert.match(
  designStudioSource,
  /Add Another Garment/,
  "The customer-facing composer must offer an explicit Add Another Garment action",
);
assert.doesNotMatch(
  designStudioSource,
  /additionalGarmentParentSection/,
  "The legacy additional physical garment radio section must be removed",
);
assert.match(
  designStudioSource,
  /data-testid="selected-style-clear-design"/,
  "The selected style card must expose an explicit Clear Design action",
);
assert.match(
  designStudioSource,
  /handleClearSelectedDesignStyle[\s\S]*?setSelectedStyle\(cleared\.selectedStyle\)/,
  "Clear Design must clear the selected style",
);
assert.match(
  designStudioSource,
  /handleClearSelectedDesignStyle[\s\S]*?setFabricAllocationState\(cleared\.fabricAllocationState\)/,
  "Clear Design must clear fabric allocations and pending allocation state",
);
assert.match(
  designStudioSource,
  /handleClearSelectedDesignStyle[\s\S]*?setSelectedFabric\(cleared\.selectedFabric\)/,
  "Clear Design must clear the selected fabric",
);
assert.match(
  designStudioSource,
  /handleClearSelectedDesignStyle[\s\S]*?setDesignSelections\(cleared\.designSelections\)/,
  "Clear Design must clear design-specific custom details and optional selections",
);
assert.match(
  designStudioSource,
  /handleClearSelectedDesignStyle[\s\S]*?setCurrentStep\(cleared\.currentStep\)/,
  "Clear Design must return the user to the Design Style step",
);
assert.match(
  designStudioSource,
  /onClick=\{\(\) => handleStyleChange\(style\)\}/,
  "Selecting another Design Style still uses the normal style-replacement flow",
);
assert.match(
  designStudioSource,
  /const showStyleProceedDock =[\s\S]*?currentStep === 1[\s\S]*?hasValidDesignSource[\s\S]*?resolvedDesignSource\?\.kind === "catalog";/,
  "Catalog Design contextual proceed dock must require a valid catalog source.",
);
assert.match(
  designStudioSource,
  /const showUploadedDesignProceedDock =[\s\S]*?hasValidDesignSource[\s\S]*?resolvedDesignSource\?\.kind === "uploaded"[\s\S]*?uploadedDesignFormReadiness\.isReady;/,
  "Uploaded Design requires a valid structured source before it receives the same single proceed dock.",
);
assert.match(
  designStudioSource,
  /const showFabricProceedDock =[\s\S]*?currentStep === 2[\s\S]*?Boolean\(selectedFabric\)[\s\S]*?!fabricAllocationState\.pendingFabricGarment[\s\S]*?!fabricAllocationState\.awaitingFabricForPendingGarment[\s\S]*?!hasUnassignedPhysicalGarments;/,
  "Fabric contextual proceed dock must require a selected fabric and complete garment-to-fabric assignments",
);
assert.match(
  designStudioSource,
  /const hideFooterNextAction = currentStep === 1 \|\| currentStep === 2;/,
  "Style and Fabric steps must suppress footer next action to avoid duplicate proceed controls",
);
assert.match(
  designStudioSource,
  /\{showContextualProceedDock && \([\s\S]*?data-testid="contextual-proceed-dock"/,
  "A persistent contextual proceed dock should render when style or fabric selection is valid",
);
assert.match(
  designStudioSource,
  /showUploadedDesignProceedDock \? "Your Uploaded Design" : showStyleProceedDock \? selectedStyle\?\.name : selectedFabric\?\.name/,
  "Dock context label must use the actively selected style or fabric name",
);
assert.match(
  designStudioSource,
  /showUploadedDesignProceedDock\s*\?\s*"contextual-uploaded-design-proceed"\s*:\s*showStyleProceedDock\s*\?\s*"contextual-style-proceed"\s*:\s*"contextual-fabric-proceed"/,
  "Dock must expose a single contextual proceed action identity per active step",
);
assert.match(
  designStudioSource,
  /onClick=\{handleNextStep\}[\s\S]*?showUploadedDesignProceedDock[\s\S]*?"Continue with Uploaded Design"[\s\S]*?journey\.stepperNextLabel/,
  "Dock proceed action must reuse the existing authoritative next-step handler and label",
);
assert.match(
  designStudioSource,
  /currentStep < 9 \? \(\s*hideFooterNextAction \? \(\s*<div \/>\s*\) : \(/,
  "Footer next button must be removed on style/fabric steps so only one proceed CTA is visible",
);
assert.match(
  designStudioSource,
  /onAddAdditionalGarment=\{handleAddAdditionalGarment\}/,
  "The additional garment composer must expose the record-based append entry point",
);
assert.match(
  designStudioSource,
  /handleAddAdditionalGarment[\s\S]*?appendCustomerFabricGarment/,
  "Additional garment changes must flow through the centralized allocation transition",
);
assert.match(
  designStudioSource,
  /primaryParentSections\.map\(renderParentSection\)/,
  "Normal applicable customization groups should render before Optional Extra Garment",
);
assert.match(
  designStudioSource,
  /<OptionalAdditionalGarmentSection[\s\S]*?onChangeFabric=\{onChangeAdditionalGarmentFabric\}/,
  "The additional garment composer must render as the final customization section before continuing",
);
assert.match(
  designStudioSource,
  /Add another piece supported by this design\./,
  "The additional garment composer helper text must be customer-facing",
);
assert.doesNotMatch(
  designStudioSource,
  /Adds one physical garment to fabric capacity and shipping/,
  "Internal fabric-capacity phrasing must not appear in customer-facing helper text",
);
assert.doesNotMatch(
  designStudioSource,
  /additionalGarmentParentSection/,
  "The legacy optional-extra radio presentation must not be rendered",
);
assert.doesNotMatch(
  designStudioSource,
  /Clear all|Clear selection|canClearCustomDetailSelectionGroup/,
  "Custom Details should not expose the removed global/group clear-all control path",
);
assert.match(
  designStudioSource,
  /const CUSTOM_DETAILS_INTERNAL_STEP = getCustomerFlowStepInternal\(\s*"Custom Details"/,
  "Custom Details internal step must be derived from CUSTOMER_FLOW_STEPS semantics",
);
assert.match(
  designStudioSource,
  /const designPricingIsActive =[\s\S]*?currentStep >= CUSTOM_DETAILS_INTERNAL_STEP[\s\S]*?isDesignSourcePricingActive/,
  "Design pricing must stay inactive until the flow has advanced to the semantic Custom Details step through the source-aware gate",
);
assert.match(
  designStudioSource,
  /setPriceActivatedFabricCode\(selectedFabric\.code\)/,
  "Proceed with Fabric must remain the transition that activates design pricing",
);
assert.match(
  liveSummarySource,
  /Selected Design Price:/,
  "Live Price Summary primary amount label must be Selected Design Price",
);
assert.doesNotMatch(
  liveSummarySource,
  /Selected Clothing Price:/,
  "Legacy Selected Clothing Price label must not appear in Live Price Summary",
);
assert.match(
  liveSummarySource,
  /SELECTED_DESIGN_PRICE_SUPPORTING_TEXT/,
  "Selected Design Price should render the centralized all-inclusive helper directly beneath it",
);
assert.match(
  activeSummarySource,
  /Garments &amp; Fabrics[\s\S]*?Fabric Quantities/,
  "Active Selection must show authoritative garment-to-fabric rows and quantities",
);
assert.doesNotMatch(
  liveSummarySource,
  /Fabric Selection \{index \+ 1\}:/,
  "Live Price Summary must not contain Fabric Selection allocation rows",
);
assert.doesNotMatch(
  liveSummarySource,
  /selection\.materialPrice/,
  "Live Price Summary must not expose raw material component values",
);
assert.doesNotMatch(
  liveSummarySource,
  /Fabric Type:/,
  "Live Price Summary must not include a redundant singular Fabric Type row",
);
assert.doesNotMatch(
  liveSummarySource,
  /Fabric Price:|Fabric Material Total:|Fabric Sewing Cost:|Construction Sewing Cost:|Additional Fabric Material/,
  "Live Price Summary must not expose internal fabric and sewing breakdown labels",
);
assert.match(
  designStudioSource,
  /const categoryTitle =[\s\S]*?getCustomDetailSelectionGroupCustomerTitle\(/,
  "Custom Detail rows must resolve category/common titles from configured metadata",
);
assert.doesNotMatch(
  liveSummarySource,
  /{item\.label}\s*\{\s*item\.value\s*\?\s*": "\s*\+\s*item\.value\s*:\s*""\s*\}/,
  "Live Price Summary should not render orphan custom-detail option labels without category context",
);
assert.doesNotMatch(
  liveSummarySource,
  /Included\s*\{currencySymbol\}/,
  "Custom Detail price rows should not prefix prices with Included",
);
assert.match(
  activeSummarySource,
  /garment\.fabricLabel[\s\S]*?fabricAssignmentSummary\.fabricQuantityRows\.map/,
  "Active Selection should display each garment fabric and grouped customer-facing quantities",
);
assert.match(
  activeSummarySource,
  /fabricAssignmentSummary\.garmentRows\.map/,
  "Active Selection must render committed garment assignments from the centralized summary",
);
assert.match(
  designStudioSource,
  /const SHIPPING_DELIVERY_INTERNAL_STEP = getCustomerFlowStepInternal\(\s*"Shipping & Delivery"/,
  "Shipping internal step must be derived from CUSTOMER_FLOW_STEPS semantics",
);
assert.match(
  designStudioSource,
  /const showShippingSummary = currentStep >= SHIPPING_DELIVERY_INTERNAL_STEP;/,
  "Shipping visibility must be gated to Shipping & Delivery semantic step and later steps",
);
assert.match(
  designStudioSource,
  /const isRequiredComplete = isRequired && hasSelectedOption;/,
  "Required-group completion status must be derived from authoritative selected-option state",
);
assert.match(
  designStudioSource,
  /\{isRequired\s*\?\s*isRequiredComplete\s*\?\s*"Complete"\s*:\s*"Required"\s*:\s*"Optional"\}/,
  "Required badge text must switch between Required and Complete while optional stays Optional",
);
assert.match(
  designStudioSource,
  /lowerGarmentTypeComplete[\s\S]*?\{lowerGarmentTypeComplete \? "Complete" : "Required"\}/,
  "Ambiguous lower garment type badge must also switch between Required and Complete",
);
assert.match(
  designStudioSource,
  /setValidationError\(\s*`Please complete \$\{missingCount\} required option\$\{missingCount === 1 \? "" : "s"\} before continuing\.`/,
  "Failed Custom Details continue should present count-based required-field warning",
);
assert.match(
  designStudioSource,
  /Complete the fields still marked Required below\./,
  "Custom Details warning should include secondary guidance beneath the primary warning",
);
assert.match(
  designStudioSource,
  /setInvalidGroups\(missingGroupIds\);/,
  "All incomplete required groups must be highlighted after failed Custom Details continue",
);
assert.match(
  garmentDetailsConfigSource,
  /export const NECK_DESIGN_SUBCATEGORY_ORDER:[\s\S]*?"No Collar"[\s\S]*?"Vertical Collar"[\s\S]*?"Flat Collar"/,
  "Neck options must use structured customer-facing subcategory order metadata",
);
assert.match(
  garmentDetailsConfigSource,
  /export const NECK_DESIGN_SUBCATEGORY_BY_OPTION_ID:[\s\S]*?neck_no_round:\s*"No Collar"[\s\S]*?neck_vert_round:\s*"Vertical Collar"[\s\S]*?neck_flat_round:\s*"Flat Collar"/,
  "Neck option-to-subcategory assignments must be config-driven",
);
assert.match(
  designStudioSource,
  /const isNeckDesignGroup = groupId === "neck_design";/,
  "Neck grouping should be handled inside the existing neck selection group",
);
assert.doesNotMatch(
  designStudioSource,
  /const isAdditionalPhysicalGarmentGroup =\s*groupId === "additional_physical_garment";/,
  "The legacy radio-group layout gate must be removed in favor of the additional garment composer",
);
assert.match(
  designStudioSource,
  /NECK_DESIGN_SUBCATEGORY_ORDER\.map\(\(subcategory\) =>/,
  "Neck rendering must iterate configured subcategories",
);
assert.match(
  designStudioSource,
  /NECK_DESIGN_SUBCATEGORY_BY_OPTION_ID\[opt\.id\] === subcategory/,
  "Neck options should be assigned to subcategories through structured config mapping",
);
assert.match(
  designStudioSource,
  /filter\(\(\{ subcategoryOptions \}\) => subcategoryOptions\.length > 0\)/,
  "Empty neck subcategories must not be rendered",
);
assert.match(
  designStudioSource,
  /grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3/,
  "Neck option subcategories should use responsive 1/2/3-column layout",
);
assert.match(
  designStudioSource,
  /<p className="mb-2 text-\[10px\] font-semibold uppercase tracking-wider text-heritage-ink\/70">\s*\{subcategory\}\s*<\/p>/,
  "Neck subcategory headings should be rendered above grouped options",
);
assert.match(
  designStudioSource,
  /isNeckDesignGroup \? \([\s\S]*?noneOptionElement[\s\S]*?neckSubcategorySections\.map/,
  "Neck section must render the None option once before grouped subcategories",
);
assert.match(
  designStudioSource,
  /grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3[\s\S]*?allowedGarments\.map\(\(garment\) =>/,
  "The additional garment composer should use a responsive physical-garment button grid",
);
assert.match(
  designStudioSource,
  /<input[\s\S]*?type=\{opt\.allowMultiple \? "checkbox" : "radio"\}[\s\S]*?name=\{groupId\}/,
  "All neck options must remain part of one logical selection group via shared radio name",
);
assert.match(
  designStudioSource,
  /if \(!option\.allowMultiple\) \{[\s\S]*?nextCustomDetails\[groupId\] = option\.id;/,
  "Selecting a neck option from any subcategory must replace prior single-select choice",
);
assert.match(
  designStudioSource,
  /if \(missingGroupIds\.length === 0\) \{[\s\S]*?setCustomDetailRequiredWarningCount\(null\);[\s\S]*?setValidationError\(""\);/,
  "Custom Details top warning should clear automatically once required groups become valid",
);
assert.doesNotMatch(
  liveSummarySource,
  /pricing\.showShippingSummary && pricing\.individualShipping/,
  "Live Price Summary must not repeat individual inbound shipping below Selected Design Price",
);
assert.doesNotMatch(
  liveSummarySource,
  /pricing\.showShippingSummary && pricing\.batchShipping/,
  "Live Price Summary must not repeat batch inbound shipping below Selected Design Price",
);
assert.doesNotMatch(
  designStudioSource,
  /currentStep >= 3|currentStep >= 7/,
  "Raw numeric customer-journey step gates should not be used for pricing/shipping visibility",
);

console.log(
  "PASS: Optional extra garment remains structured and is moved to end of Custom Details",
);
