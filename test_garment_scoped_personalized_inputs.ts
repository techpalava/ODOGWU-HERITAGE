import assert from "node:assert/strict";
import { SEED_CUSTOM_DETAIL_CATALOG } from "./src/config/GarmentDetailsConfig";
import type {
  CanonicalPhysicalGarmentType,
  CustomDetailDemographic,
  CustomDetailOption,
  GarmentScopedCustomDetailsStateV1,
  GuestDesignDraft,
  StyleCategory,
} from "./src/types";
import {
  createCustomDetailCatalogTombstone,
  inspectCustomDetailCatalog,
} from "./src/utils/catalogHelpers";
import {
  calculateGarmentScopedCustomDetailsPricing,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  validateGarmentScopedCustomDetailsCompletion,
} from "./src/utils/garmentScopedCustomDetailsDomain";
import {
  createEmptyGarmentScopedCustomDetailInputs,
  GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH,
  getGarmentScopedCustomDetailText,
  isGarmentScopedCustomDetailInputsEmpty,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  removeGarmentScopedCustomDetailInputs,
  retainGarmentScopedCustomDetailInputGarmentKeys,
  setGarmentScopedCustomDetailText,
} from "./src/utils/garmentScopedCustomDetailInputsState";
import {
  createEmptyGarmentScopedCustomDetailsState,
  setGarmentScopedCustomDetailSelection,
} from "./src/utils/garmentScopedCustomDetailsState";
import { reconcileGarmentTypeStepSelection } from "./src/utils/garmentTypeStepState";

const seedInspection = inspectCustomDetailCatalog([]);
const buildStepSelection = (
  garmentTypes: readonly CanonicalPhysicalGarmentType[],
  demographic: CustomDetailDemographic,
) =>
  reconcileGarmentTypeStepSelection({
    selectedGarmentTypes: garmentTypes,
    selectedDemographic: demographic,
    normalizedCustomDetailCatalog: seedInspection.activeOptions,
  }).selection;

const findSeed = (optionId: string): CustomDetailOption => {
  const option = SEED_CUSTOM_DETAIL_CATALOG.find(
    (candidate) => candidate.id === optionId,
  );
  assert.ok(option, `Missing seed ${optionId}`);
  return option;
};

const selectPersonalized = (
  garmentKeys: readonly string[],
): GarmentScopedCustomDetailsStateV1 => {
  let state = createEmptyGarmentScopedCustomDetailsState();
  garmentKeys.forEach((garmentKey) => {
    state = setGarmentScopedCustomDetailSelection(
      state,
      garmentKey,
      PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
      [PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID],
    );
    state = setGarmentScopedCustomDetailSelection(
      state,
      garmentKey,
      "shirt_pockets",
      "shirt_pocket_0",
    );
    state = setGarmentScopedCustomDetailSelection(
      state,
      garmentKey,
      "neck_design",
      "neck_no_round",
    );
  });
  return state;
};

const reconcile = ({
  garmentTypes = ["shirt", "kaftan"] as const,
  demographic = "male" as const,
  state = selectPersonalized(["base:shirt", "base:kaftan"]),
  inspection = seedInspection,
  style,
}: {
  garmentTypes?: readonly CanonicalPhysicalGarmentType[];
  demographic?: CustomDetailDemographic;
  state?: GarmentScopedCustomDetailsStateV1;
  inspection?: ReturnType<typeof inspectCustomDetailCatalog>;
  style?: StyleCategory | null;
} = {}) =>
  reconcileGarmentScopedCustomDetails({
    garmentTypeSelection: buildStepSelection(garmentTypes, demographic),
    catalogInspection: inspection,
    existingState: state,
    style,
  });

const empty = createEmptyGarmentScopedCustomDetailInputs();
assert.deepEqual(empty, { schemaVersion: 1, textByGarmentKey: {} });
assert.equal(isGarmentScopedCustomDetailInputsEmpty(empty), true);

let inputState = setGarmentScopedCustomDetailText({
  state: empty,
  garmentKey: "base:shirt",
  selectionGroup: PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  optionId: PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  text: "Add a subtle gold trim.\r\nKeep the neckline open.",
});
assert.equal(inputState.status, "saved");
assert.equal(
  inputState.status === "saved" ? inputState.text : null,
  "Add a subtle gold trim.\nKeep the neckline open.",
);
inputState = setGarmentScopedCustomDetailText({
  state: inputState.state,
  garmentKey: "base:kaftan",
  selectionGroup: PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  optionId: PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  text: "Use a plain collar.",
});
assert.equal(
  getGarmentScopedCustomDetailText(
    inputState.state,
    "base:shirt",
    PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
    PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  ),
  "Add a subtle gold trim.\nKeep the neckline open.",
);
assert.equal(
  getGarmentScopedCustomDetailText(
    inputState.state,
    "base:kaftan",
    PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
    PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  ),
  "Use a plain collar.",
  "same option IDs remain independent by garment key",
);
assert.deepEqual(
  JSON.parse(JSON.stringify(inputState.state)),
  inputState.state,
  "versioned text state survives JSON round-trip",
);

const independentPhysicalSubjects = [
  "base:dress",
  "base:full_length_gown",
  "base:agbada:shirt",
  "base:shirt",
] as const;
const independentSubjectInputs = independentPhysicalSubjects.reduce(
  (state, garmentKey, index) =>
    setGarmentScopedCustomDetailText({
      state,
      garmentKey,
      selectionGroup: PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
      optionId: PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
      text: `Requirement ${index + 1}`,
    }).state,
  createEmptyGarmentScopedCustomDetailInputs(),
);
assert.equal(
  Object.keys(independentSubjectInputs.textByGarmentKey).length,
  4,
  "dress, gown, compound components, and standalone garments never share text",
);
let multiOptionState = setGarmentScopedCustomDetailText({
  state: createEmptyGarmentScopedCustomDetailInputs(),
  garmentKey: "base:shirt",
  selectionGroup: PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  optionId: PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  text: "First selected requirement",
}).state;
multiOptionState = setGarmentScopedCustomDetailText({
  state: multiOptionState,
  garmentKey: "base:shirt",
  selectionGroup: PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  optionId: "future-second-personalized-option",
  text: "Second selected requirement",
}).state;
assert.equal(
  getGarmentScopedCustomDetailText(
    multiOptionState,
    "base:shirt",
    PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
    "future-second-personalized-option",
  ),
  "Second selected requirement",
);
assert.equal(
  getGarmentScopedCustomDetailText(
    setGarmentScopedCustomDetailText({
      state: multiOptionState,
      garmentKey: "base:shirt",
      selectionGroup: PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
      optionId: PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
      text: " ",
    }).state,
    "base:shirt",
    PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
    "future-second-personalized-option",
  ),
  "Second selected requirement",
  "clearing one multi-select identity cannot clear another option in the group",
);

const overLimit = setGarmentScopedCustomDetailText({
  state: inputState.state,
  garmentKey: "base:shirt",
  selectionGroup: PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  optionId: PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  text: "x".repeat(GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH + 1),
});
assert.equal(overLimit.status, "too_long");
assert.equal(
  getGarmentScopedCustomDetailText(
    overLimit.state,
    "base:shirt",
    PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
    PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  ),
  "Add a subtle gold trim.\nKeep the neckline open.",
  "over-limit text is never silently truncated or stored",
);
assert.equal(
  setGarmentScopedCustomDetailText({
    state: inputState.state,
    garmentKey: "base:shirt",
    selectionGroup: PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
    optionId: PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
    text: { invalid: true },
  }).status,
  "invalid_type",
);
const whitespace = setGarmentScopedCustomDetailText({
  state: inputState.state,
  garmentKey: "base:shirt",
  selectionGroup: PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  optionId: PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  text: "  \n  ",
});
assert.equal(whitespace.status, "cleared");
assert.equal(
  getGarmentScopedCustomDetailText(
    whitespace.state,
    "base:shirt",
    PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
    PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  ),
  undefined,
);

const fullReconciliation = reconcile();
const reconciledInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: fullReconciliation,
  catalogInspection: seedInspection,
  existingInputs: inputState.state,
});
assert.deepEqual(reconciledInputs.state, inputState.state);
assert.equal(reconciledInputs.diagnostics.length, 0);
assert.equal(reconciledInputs.stateChanged, false);

const onlyShirt = reconcile({
  garmentTypes: ["shirt"],
  state: selectPersonalized(["base:shirt"]),
});
const garmentRemoved = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: onlyShirt,
  catalogInspection: seedInspection,
  existingInputs: inputState.state,
});
assert.equal(
  getGarmentScopedCustomDetailText(
    garmentRemoved.state,
    "base:kaftan",
    PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
    PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  ),
  undefined,
);
assert.equal(
  garmentRemoved.diagnostics.some(
    (diagnostic) => diagnostic.code === "personalized_text_garment_removed",
  ),
  true,
);

const deselected = reconcile({
  state: selectPersonalized(["base:shirt"]),
});
const deselectedInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: deselected,
  catalogInspection: seedInspection,
  existingInputs: inputState.state,
});
assert.equal(
  getGarmentScopedCustomDetailText(
    deselectedInputs.state,
    "base:kaftan",
    PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
    PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  ),
  undefined,
);
assert.equal(
  deselectedInputs.diagnostics.some(
    (diagnostic) => diagnostic.code === "personalized_text_option_deselected",
  ),
  true,
);

const deletedInspection = inspectCustomDetailCatalog([
  createCustomDetailCatalogTombstone(
    PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  ),
]);
const deletedReconciliation = reconcile({ inspection: deletedInspection });
const deletedInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: deletedReconciliation,
  catalogInspection: deletedInspection,
  existingInputs: inputState.state,
});
assert.equal(isGarmentScopedCustomDetailInputsEmpty(deletedInputs.state), true);
assert.equal(
  deletedInputs.diagnostics.some(
    (diagnostic) => diagnostic.code === "personalized_text_option_deleted",
  ),
  true,
);

const disabledInspection = inspectCustomDetailCatalog([
  { ...findSeed(PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID), active: false },
]);
const disabledReconciliation = reconcile({ inspection: disabledInspection });
const disabledInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: disabledReconciliation,
  catalogInspection: disabledInspection,
  existingInputs: inputState.state,
});
assert.equal(
  disabledInputs.diagnostics.some(
    (diagnostic) => diagnostic.code === "personalized_text_option_disabled",
  ),
  true,
);

const noLongerRequiredInspection = inspectCustomDetailCatalog([
  {
    ...findSeed(PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID),
    requiresEvaluation: false,
  },
]);
const noLongerRequiredReconciliation = reconcile({
  inspection: noLongerRequiredInspection,
});
const noLongerRequiredInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: noLongerRequiredReconciliation,
  catalogInspection: noLongerRequiredInspection,
  existingInputs: inputState.state,
});
assert.equal(
  noLongerRequiredInputs.diagnostics.some(
    (diagnostic) => diagnostic.code === "personalized_text_no_longer_required",
  ),
  true,
);

const groupRemovedReconciliation = reconcile({
  style: {
    id: "custom-details-disabled",
    name: "No detail configuration",
    customDetailConfig: { enabled: false },
  } as StyleCategory,
});
const groupRemovedInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: groupRemovedReconciliation,
  catalogInspection: seedInspection,
  existingInputs: inputState.state,
});
assert.equal(
  groupRemovedInputs.diagnostics.some(
    (diagnostic) => diagnostic.code === "personalized_text_group_removed",
  ),
  true,
);

const persistedOverLimitInputs = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: fullReconciliation,
  catalogInspection: seedInspection,
  existingInputs: {
    schemaVersion: 1,
    textByGarmentKey: {
      "base:shirt": {
        personalized_additional: {
          personalized_additional_evaluation: "x".repeat(
            GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH + 1,
          ),
        },
      },
    },
  },
});
assert.equal(
  validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation: fullReconciliation,
    personalizedInputs: persistedOverLimitInputs,
  }).status,
  "invalid",
  "over-limit persisted text is retained for correction but blocks continuation",
);

const noText = reconcileGarmentScopedPersonalizedInputs({
  reconciliation: fullReconciliation,
  catalogInspection: seedInspection,
  existingInputs: createEmptyGarmentScopedCustomDetailInputs(),
});
assert.equal(
  validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete: true,
    reconciliation: fullReconciliation,
    personalizedInputs: noText,
  }).status,
  "incomplete",
  "selected personalized requirements need content before continuation",
);
const completeWithText = validateGarmentScopedCustomDetailsCompletion({
  earlierStagesComplete: true,
  reconciliation: fullReconciliation,
  personalizedInputs: reconciledInputs,
});
assert.equal(completeWithText.status, "pricing_pending");
assert.equal(
  completeWithText.blockers.some(
    (blocker) => blocker.code === "personalized_requirement_missing",
  ),
  false,
);
assert.equal(
  calculateGarmentScopedCustomDetailsPricing({
    reconciliation: fullReconciliation,
    catalogInspection: seedInspection,
  }).status,
  "pending",
  "text never adds a second price occurrence or converts evaluation pricing",
);

assert.deepEqual(
  removeGarmentScopedCustomDetailInputs(inputState.state, "base:shirt")
    .textByGarmentKey["base:kaftan"],
  inputState.state.textByGarmentKey["base:kaftan"],
  "removing one garment leaves other input identities untouched",
);
assert.deepEqual(
  retainGarmentScopedCustomDetailInputGarmentKeys(inputState.state, [
    "base:shirt",
  ]).textByGarmentKey["base:kaftan"],
  undefined,
);

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) || null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { localStorage: storage },
});
const { StorageService } = await import("./src/services/storageService");
const { GuestOrderSessionService } = await import(
  "./src/services/guestOrderSessionService"
);
const draft: GuestDesignDraft = {
  currentStep: 4,
  selectedFabricCode: null,
  selectedStyleId: null,
  selectedGarment: null,
  designSelections: {
    customDetails: { neck_design: "legacy-preserved" },
    garmentScopedCustomDetails: fullReconciliation.state,
    garmentScopedCustomDetailInputs: inputState.state,
  },
  measurements: {
    height: 175,
    weight: 70,
    age: 30,
    bodyBuild: "Average",
    fitPreference: "Standard",
    neck: 15,
    shoulder: 18,
    chest: 40,
    waist: 33,
    hip: 40,
    sleeve: 24,
    trouserLength: 41,
    isAiEstimated: false,
  },
  sizingMode: "manual",
  deliveryMethod: null,
  deliveryAddress: {
    addressLine1: "",
    city: "",
    postalCode: "",
    countryCode: "",
  },
  pickupTime: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  batchType: "alone",
  customGroupCode: "",
  garmentPieceCount: null,
  specialInstructions: "unrelated note",
  leftoverFabricChoice: "",
  hasLining: false,
  pricingBreakdown: {
    fabricPrice: 0,
    fabricSewingCost: 0,
    constructionSewingCost: 0,
    customDetailsPrice: 0,
    lagosToEindhovenShipping: 0,
    eindhovenToDestinationShipping: 0,
    total: 0,
  },
  shippingSnapshot: {},
  updatedAt: "2026-08-13T00:00:00.000Z",
};
StorageService.clearGuestOrderSession();
GuestOrderSessionService.saveGuestDesignDraft(draft);
const restored = GuestOrderSessionService.getGuestDesignDraft();
assert.deepEqual(restored?.designSelections.garmentScopedCustomDetailInputs, inputState.state);
assert.deepEqual(restored?.designSelections.customDetails, {
  neck_design: "legacy-preserved",
});
assert.equal(restored?.journeySchemaVersion, undefined);
assert.equal(restored?.currentStageId, undefined);
assert.equal(restored?.specialInstructions, "unrelated note");

StorageService.clearGuestOrderSession();
GuestOrderSessionService.saveGuestDesignDraft({
  ...draft,
  designSelections: {
    ...draft.designSelections,
    garmentScopedCustomDetailInputs: {
      schemaVersion: 1,
      textByGarmentKey: { "base:shirt": { personalized_additional: { bad: 42 } } },
    } as unknown as typeof inputState.state,
  },
});
assert.deepEqual(
  GuestOrderSessionService.getGuestDesignDraft()?.designSelections
    .garmentScopedCustomDetailInputs,
  createEmptyGarmentScopedCustomDetailInputs(),
  "malformed persisted inputs are inert and never crash loading",
);

console.log("PASS: garment-scoped personalized text input persistence and validation");
