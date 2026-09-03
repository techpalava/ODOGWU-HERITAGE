import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CustomDetailDesignContext } from "./src/types";
import {
  SEED_CUSTOM_DETAIL_CATALOG,
  type CustomDetailParentSectionId,
} from "./src/config/GarmentDetailsConfig";
import { FabricAllocationStateEngine } from "./src/engine/FabricAllocationStateEngine";
import { createStyleBaseGarmentSpec } from "./src/config/StyleFabricCapacityConfig";
import { appendCustomerFabricGarment } from "./src/utils/fabricGarmentAppendFlow";
import {
  createAdditionalGarmentSelection,
  resolveAdditionalGarmentPriceRows,
  resolveAllowedAdditionalGarments,
} from "./src/utils/additionalGarmentDomain";
import {
  composeInlineOptionalShortsSections,
  INLINE_OPTIONAL_SHORTS_LABELS,
} from "./src/utils/optionalShortsPresentation";
import { getRequiredCustomDetailGroups } from "./src/utils/catalogHelpers";
import { resolveShippingGarmentPieceCount } from "./src/utils/shippingPricing";

const composition = [
  { key: "shirt", garmentType: "shirt" as const, fabricUnits: 1 as const },
  { key: "trouser", garmentType: "trouser" as const, fabricUnits: 1 as const },
];

const allowed = resolveAllowedAdditionalGarments(composition);
assert.deepEqual(
  allowed.map((garment) => garment.garmentType),
  ["shirt", "trouser"],
  "the optional UI must only offer physical garment types represented by the main composition",
);

const state = FabricAllocationStateEngine.syncPrimaryGarmentComposition(
  FabricAllocationStateEngine.initialize(),
  "HT-001",
  [{ code: "MAIN_SHIRT", garmentSpec: composition[0], sourceRole: "main" }],
);
const selection = createAdditionalGarmentSelection({
  garmentType: "shirt",
  mainComposition: composition,
  existingAssignments: state.fabricAllocations.flatMap(
    (allocation) => allocation.garmentAssignments,
  ),
});
assert.equal(selection.status, "resolved");
if (selection.status !== "resolved") throw new Error("Expected an allowed additional garment.");

const appended = appendCustomerFabricGarment(state, "HT-001", selection.selection);
const additional = appended.fabricAllocations
  .flatMap((allocation) => allocation.garmentAssignments)
  .find((assignment) => assignment.sourceRole === "additional");
assert.ok(additional, "the UI-facing append helper must create an additional allocation record");

const inherited = resolveAdditionalGarmentPriceRows({
  additionalAssignments: [additional],
  mainGarmentPriceRows: [{ garmentType: "shirt", price: 65 }],
});
assert.deepEqual(inherited.rows, [
  {
    assignmentId: additional.garmentKey,
    garmentType: "shirt",
    label: "Shirt",
    price: 65,
  },
]);

const makeDesign = (
  demographic: "male" | "female" | "unisex",
  garmentTypes: Parameters<typeof createStyleBaseGarmentSpec>[0][],
): CustomDetailDesignContext => ({
  kind: "uploaded",
  sourceKey: `uploaded:${demographic}:${garmentTypes.join("-")}`,
  displayLabel: `${demographic} inline shorts fixture`,
  demographic,
  fabricCapacityComposition: garmentTypes.map(createStyleBaseGarmentSpec),
});

const makeSection = (id: CustomDetailParentSectionId) => ({ id });
const describeComposition = (
  design: CustomDetailDesignContext,
  sectionIds: CustomDetailParentSectionId[],
  baseSectionIds: CustomDetailParentSectionId[],
) => {
  const composition = design.fabricCapacityComposition || [];
  return composeInlineOptionalShortsSections({
    sections: sectionIds.map(makeSection),
    baseSectionIds,
    allowedGarments: resolveAllowedAdditionalGarments(composition, design),
  }).flatMap((entry) =>
    entry.kind === "detail-section"
      ? [`section:${entry.section.id}`]
      : [
          `optional:${entry.garment.garmentType}`,
          ...(entry.detailSection
            ? [`details:${entry.detailSection.id}`]
            : []),
        ],
  );
};

const maleShirtTrouser = makeDesign("male", ["shirt", "trouser"]);
assert.deepEqual(
  describeComposition(
    maleShirtTrouser,
    ["shirt", "neck", "trousers"],
    ["shirt", "neck", "trousers"],
  ),
  ["section:shirt", "section:neck", "section:trousers", "optional:standard_shorts"],
  "Nikka must render immediately after a male base Trouser",
);
assert.deepEqual(
  describeComposition(
    maleShirtTrouser,
    ["shirt", "neck", "trousers", "standard_shorts"],
    ["shirt", "neck", "trousers"],
  ),
  [
    "section:shirt",
    "section:neck",
    "section:trousers",
    "optional:standard_shorts",
    "details:standard_shorts",
  ],
  "Added Nikka details must expand directly under its inline card",
);

assert.deepEqual(
  describeComposition(
    makeDesign("male", ["shirt"]),
    ["shirt", "neck"],
    ["shirt", "neck"],
  ),
  ["section:shirt", "optional:standard_shorts", "section:neck"],
  "Male Nikka without Trouser must follow the last physical base garment",
);

assert.deepEqual(
  describeComposition(
    makeDesign("male", ["standard_shorts"]),
    ["standard_shorts"],
    ["standard_shorts"],
  ),
  ["section:standard_shorts", "optional:standard_shorts"],
  "An explicitly included Nikka must retain its visible base-garment details",
);

assert.deepEqual(
  describeComposition(
    makeDesign("female", ["dress", "skirt"]),
    ["dress", "neck", "skirts"],
    ["dress", "neck", "skirts"],
  ),
  ["section:dress", "section:neck", "section:skirts", "optional:bum_shorts"],
  "Bum Shorts must render immediately after a female base Skirt",
);
assert.deepEqual(
  describeComposition(
    makeDesign("female", ["dress"]),
    ["dress", "neck"],
    ["dress", "neck"],
  ),
  ["section:dress", "optional:bum_shorts", "section:neck"],
  "Bum Shorts without Skirt must follow the applicable female base garment",
);
assert.deepEqual(
  describeComposition(
    makeDesign("female", ["dress", "trouser"]),
    ["dress", "neck", "trousers"],
    ["dress", "neck", "trousers"],
  ),
  [
    "section:dress",
    "optional:bum_shorts",
    "section:neck",
    "section:trousers",
    "optional:standard_shorts",
  ],
  "Female Trouser designs keep Bum Shorts available and place Nikka after Trouser",
);
assert.deepEqual(
  describeComposition(
    makeDesign("unisex", ["shirt", "skirt", "trouser"]),
    ["shirt", "neck", "skirts", "trousers"],
    ["shirt", "neck", "skirts", "trousers"],
  ),
  [
    "section:shirt",
    "section:neck",
    "section:skirts",
    "optional:bum_shorts",
    "section:trousers",
    "optional:standard_shorts",
  ],
  "Unisex compositions must render Skirt, Bum Shorts, Trouser, then Nikka",
);

const pristineState = FabricAllocationStateEngine.initialize();
const pristineStateSnapshot = structuredClone(pristineState);
const requiredGroupsBeforePresentation = getRequiredCustomDetailGroups(
  maleShirtTrouser,
  SEED_CUSTOM_DETAIL_CATALOG,
  null,
  {},
);
composeInlineOptionalShortsSections({
  sections: [makeSection("shirt")],
  baseSectionIds: ["shirt"],
  allowedGarments: resolveAllowedAdditionalGarments(
    maleShirtTrouser.fabricCapacityComposition || [],
    maleShirtTrouser,
  ),
});
assert.deepEqual(
  pristineState,
  pristineStateSnapshot,
  "Rendering an eligible optional card must not add a garment or fabric allocation",
);
assert.equal(
  resolveShippingGarmentPieceCount({
    fabricAllocations: pristineState.fabricAllocations,
    legacyComposition: "2-piece set",
  }),
  2,
  "Rendering an eligible optional card must not increase the garment-piece count",
);
assert.deepEqual(
  getRequiredCustomDetailGroups(
    maleShirtTrouser,
    SEED_CUSTOM_DETAIL_CATALOG,
    null,
    {},
  ),
  requiredGroupsBeforePresentation,
  "Rendering an eligible optional card must not add required Custom Details",
);
assert.equal(
  requiredGroupsBeforePresentation.includes("standard_shorts_fastening"),
  false,
  "Nikka fastening must not become required before Nikka is added",
);
assert.deepEqual(
  resolveAdditionalGarmentPriceRows({
    additionalAssignments: [],
    mainGarmentPriceRows: [],
  }).rows,
  [],
  "Visible optional cards must not add a price before customer activation",
);
assert.equal(
  INLINE_OPTIONAL_SHORTS_LABELS.standard_shorts,
  "Nikka / Standard Shorts",
);
assert.equal(INLINE_OPTIONAL_SHORTS_LABELS.bum_shorts, "Bum Shorts");

const source = readFileSync("src/components/DesignStudioView.tsx", "utf8");
const futureNavigationSource = source.slice(
  source.indexOf("const handleOpenDormantFabricStage"),
  source.indexOf("const handleRefreshDormantShippingQuote"),
);
assert.match(
  futureNavigationSource,
  /setFutureStageId\("custom_details"\)/,
  "completed-step navigation must update the authoritative nine-stage state",
);
assert.doesNotMatch(
  futureNavigationSource,
  /setFabricAllocationState|setDesignSelections|setSelectedFabric/,
  "completed-step navigation must preserve added garments and their selections",
);
assert.ok(
  source.includes("onAddAdditionalGarment={handleAddFutureAdditionalGarment}"),
  "the customer selector must call the UI-facing additional garment handler",
);
const addGarmentHandlerSource = source.slice(
  source.indexOf("const handleAddFutureAdditionalGarment"),
  source.indexOf("const handleCompleteAdditionalGarmentCustomDetails"),
);
const completeCustomDetailsHandlerSource = source.slice(
  source.indexOf("const handleCompleteAdditionalGarmentCustomDetails"),
  source.indexOf("const handleRemoveFuturePhysicalGarmentOccurrence"),
);
assert.match(
  addGarmentHandlerSource,
  /FabricAllocationStateEngine\.beginPendingAdditionalGarmentSelection\(/,
  "the UI-facing handler must park the exact garment in the centralized pending flow",
);
assert.doesNotMatch(
  addGarmentHandlerSource,
  /FabricAllocationStateEngine\.attemptAppendGarment\(/,
  "adding a garment must not consume allocation capacity before explicit Fabric choice",
);
assert.match(
  addGarmentHandlerSource,
  /phase: sameFabricAvailable \? "choice" : "catalogue"/,
  "the existing Fabric chooser must open directly from Add",
);
assert.ok(
  !source.includes("additionalGarmentParentSection"),
  "the old additional physical garment radio section must not remain active",
);
const customDetailsSource = readFileSync(
  "src/components/DormantFutureCustomDetailsStep.tsx",
  "utf8",
);
assert.match(
  customDetailsSource,
  /data-custom-detail-section="add-additional-garment"/,
  "Custom Details must expose one explicit additional-garment section",
);
assert.match(
  customDetailsSource,
  /additionalGarmentConstructionOptions\.map\(\(\{ garmentType, construction \}\) =>/,
  "the additional-garment section must offer canonical physical garments",
);
assert.match(
  customDetailsSource,
  /onAddAdditionalGarment\(garmentType, event\.currentTarget\)/,
  "the customer control must begin the authoritative Fabric transaction directly",
);
assert.doesNotMatch(
  customDetailsSource,
  /setAdditionalGarmentChoice\(\{ garmentType, sourceParentGarmentKey: null \}\)/,
  "the Add button must not open Custom Details before Fabric",
);
assert.match(customDetailsSource, /Use Same Custom Details/);
assert.match(customDetailsSource, /Choose Custom Details/);
assert.match(
  customDetailsSource,
  /Copy the construction and available garment details from an existing matching garment\./,
  "the reuse choice must explain its scoped copy behavior in customer language",
);
assert.match(
  customDetailsSource,
  /Add this garment and choose its construction and details separately\./,
  "the separate-details choice must explain its independent setup behavior",
);
assert.match(
  customDetailsSource,
  /data-added-garment-heading/,
  "a newly added garment must expose a stable focus target",
);
assert.match(
  customDetailsSource,
  /preventScroll:\s*true/,
  "moving focus to a newly added garment must not force an automatic scroll jump",
);
assert.match(
  customDetailsSource,
  /includeAdditionalClothesCosts && partitionAdditionalCostGroups\(mainAdditionalCostGroups\)\.stackedGroups\.length > 0/,
  "an empty relevance projection must not render an Additional Clothes Costs placeholder",
);
assert.match(
  customDetailsSource,
  /data-custom-detail-section="main-garment-details"/,
  "Main garment Custom Details must stay visually separate from Additional Garment options",
);
assert.match(
  customDetailsSource,
  /data-additional-garment-details/,
  "Additional Garment Custom Details must render inside the Add Additional Garment section after add",
);
assert.match(
  customDetailsSource,
  /overflow-y-auto bg-black\/55/,
  "the existing choice dialog must remain usable when its mobile content exceeds the viewport",
);
assert.match(customDetailsSource, /resolveCompatibleGarmentScopedCopySources/);
assert.match(customDetailsSource, /compatibleCopySources\.length === 1/);
assert.match(customDetailsSource, /Select the garment whose Custom Details you want to copy/);
assert.match(
  source,
  /applyAdditionalGarmentConstructionAndCopy/,
  "the committed allocation path must copy through the shared construction/copy helper",
);
const pickerSource = readFileSync(
  new URL("./src/utils/additionalGarmentFabricPicker.ts", import.meta.url),
  "utf8",
);
assert.match(
  pickerSource,
  /copyGarmentScopedCustomDetailsToAdditionalOccurrence/,
  "construction/copy helper must still use the garment-scoped domain copy API",
);
assert.match(
  source,
  /setAdditionalGarmentFabricTransaction\(null\);[\s\S]*FabricAllocationStateEngine\.cancelPendingGarment/,
  "cancelling the Fabric transaction must discard pending construction and copy state",
);
assert.match(
  completeCustomDetailsHandlerSource,
  /phase !== "custom_details_choice"[\s\S]*applyAdditionalGarmentConstructionAndCopy\([\s\S]*phase: "awaiting_commit"/,
  "construction and copy must apply only after the Fabric-first transaction reaches Custom Details",
);
assert.doesNotMatch(
  addGarmentHandlerSource,
  /applyAdditionalGarmentConstructionAndCopy|setDesignSelections/,
  "starting the Fabric-first transaction must not expose provisional construction or details",
);
assert.match(
  source,
  /isAdditionalGarmentCommitPending \|\|[\s\S]*!futureScopedCustomDetailsReconciliation/,
  "transient pre-construction reconciliation must not overwrite a copied occurrence",
);
assert.doesNotMatch(
  customDetailsSource,
  /onClick=\{\(\) => onRemoveAdditionalGarment\(garment\.garmentKey\)\}/,
  "committed additional garments must no longer bypass the shared confirmation flow",
);
assert.match(
  customDetailsSource,
  /data-garment-removal-list="custom_details"[\s\S]*onRequestGarmentRemoval\?\.\(target, event\.currentTarget\)/,
  "the shared Custom Details removal list must request confirmation with the exact projected occurrence target",
);

console.log("Optional additional garment UI regression checks passed.");
