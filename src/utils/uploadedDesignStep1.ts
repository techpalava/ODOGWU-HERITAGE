import {
  FabricCapacityEngine,
  getCustomerFacingFabricQuantityForAssignments,
  getFabricGarmentLabel,
} from "../engine/FabricCapacityEngine";
import {
  createStyleBaseGarmentSpec,
  FABRIC_GARMENT_CAPACITY_UNITS,
} from "../config/StyleFabricCapacityConfig";
import type {
  CustomerDesignUploadReference,
  CustomDetailDemographic,
  CustomDetailOption,
  FabricCapacityGarmentSpec,
  FabricGarmentType,
  GarmentTypeStepSelection,
  UploadedDesignSource,
} from "../types";
import { createUploadedDesignSource } from "./designSourceState";
import { updateDormantGarmentTypeSelection } from "./designStudioJourneyMode";
import {
  CANONICAL_PHYSICAL_GARMENT_TYPES,
  CUSTOMER_SELECTABLE_GARMENT_TYPES,
  getCustomerSelectableGarmentTypes,
  isCanonicalPhysicalGarmentType,
  isCustomerSelectableGarmentType,
} from "./garmentConstructionPricing";

export const UPLOADED_DESIGN_GARMENT_OPTIONS =
  CUSTOMER_SELECTABLE_GARMENT_TYPES.map((garmentType) => ({
    garmentType,
    label: getFabricGarmentLabel(garmentType),
    fabricUnits: createStyleBaseGarmentSpec(garmentType).fabricUnits,
  }));

export const UPLOADED_DESIGN_COMPOSITION_NEEDS_REVIEW_MESSAGE =
  "Design garment data needs review. Replace or remove the uploaded design to continue.";

export interface UploadedDesignStep1Input {
  uploadReference: CustomerDesignUploadReference | null;
  fabricCapacityComposition: readonly FabricCapacityGarmentSpec[];
  demographic: CustomDetailDemographic | null;
}

export const cloneFabricCapacityGarmentSpec = (
  spec: FabricCapacityGarmentSpec,
): FabricCapacityGarmentSpec => ({
  key: spec.key,
  garmentType: spec.garmentType,
  fabricUnits: spec.fabricUnits,
  ...(spec.lowerGarmentType
    ? { lowerGarmentType: spec.lowerGarmentType }
    : {}),
});

/**
 * Valid preserved hidden legacy specs (e.g. Agbada) must match canonical capacity
 * and identity rules. Malformed specs are never auto-corrected.
 */
export const isValidPreservedHiddenUploadedGarmentSpec = (
  spec: FabricCapacityGarmentSpec,
): boolean => {
  if (typeof spec.key !== "string" || spec.key.trim().length === 0) {
    return false;
  }
  if (!isCanonicalPhysicalGarmentType(spec.garmentType)) {
    return false;
  }
  if (isCustomerSelectableGarmentType(spec.garmentType)) {
    return false;
  }
  if (spec.fabricUnits !== FABRIC_GARMENT_CAPACITY_UNITS[spec.garmentType]) {
    return false;
  }
  if (
    spec.lowerGarmentType !== undefined &&
    spec.lowerGarmentType !== "trousers" &&
    spec.lowerGarmentType !== "skirt"
  ) {
    return false;
  }
  return true;
};

export type HiddenUploadedGarmentEvaluation = {
  validSpecs: FabricCapacityGarmentSpec[];
  malformedSpecs: FabricCapacityGarmentSpec[];
  needsReview: boolean;
};

/**
 * Separates VALID hidden legacy garments (preserve as-is) from MALFORMED ones
 * (fail closed — never manufacture a corrected canonical replacement).
 */
export const evaluatePreservedHiddenUploadedGarments = (
  composition: readonly FabricCapacityGarmentSpec[] | null | undefined,
): HiddenUploadedGarmentEvaluation => {
  if (!composition?.length) {
    return { validSpecs: [], malformedSpecs: [], needsReview: false };
  }

  const validByType = new Map<FabricGarmentType, FabricCapacityGarmentSpec>();
  const malformedSpecs: FabricCapacityGarmentSpec[] = [];
  const seenKeys = new Set<string>();

  for (const spec of composition) {
    if (
      !isCanonicalPhysicalGarmentType(spec.garmentType) ||
      isCustomerSelectableGarmentType(spec.garmentType)
    ) {
      continue;
    }

    const clone = cloneFabricCapacityGarmentSpec(spec);
    if (!isValidPreservedHiddenUploadedGarmentSpec(clone)) {
      malformedSpecs.push(clone);
      continue;
    }

    if (seenKeys.has(clone.key) || validByType.has(clone.garmentType)) {
      malformedSpecs.push(clone);
      continue;
    }

    seenKeys.add(clone.key);
    validByType.set(clone.garmentType, clone);
  }

  const validSpecs = CANONICAL_PHYSICAL_GARMENT_TYPES.filter((garmentType) =>
    validByType.has(garmentType),
  ).map((garmentType) => validByType.get(garmentType)!);

  return {
    validSpecs,
    malformedSpecs,
    needsReview: malformedSpecs.length > 0,
  };
};

export const getUploadedDesignCompositionNeedsReview = (
  composition: readonly FabricCapacityGarmentSpec[] | null | undefined,
): boolean => evaluatePreservedHiddenUploadedGarments(composition).needsReview;

export const getUploadedDesignStep1Readiness = (
  input: UploadedDesignStep1Input,
) => {
  const needsReview = getUploadedDesignCompositionNeedsReview(
    input.fabricCapacityComposition,
  );
  return {
    hasUpload: input.uploadReference !== null,
    hasComposition: input.fabricCapacityComposition.length > 0,
    hasDemographic: input.demographic !== null,
    needsReview,
    isReady:
      input.uploadReference !== null &&
      input.fabricCapacityComposition.length > 0 &&
      input.demographic !== null &&
      !needsReview,
  };
};

/** Step 1 garments that are required / non-removable in Upload Your Own Design. */
export const getUploadedDesignRequiredStep1GarmentTypes = (
  step1GarmentTypes: readonly FabricGarmentType[],
): FabricGarmentType[] => getCustomerSelectableGarmentTypes(step1GarmentTypes);

/**
 * Customer-added upload garments beyond the current Step 1 required set.
 * Preserves only customer-selectable types (never offers agbada as new).
 */
export const getUploadedDesignAdditionalGarmentTypes = ({
  step1GarmentTypes,
  composition,
  additionalGarmentTypes,
}: {
  step1GarmentTypes: readonly FabricGarmentType[];
  composition?: readonly FabricCapacityGarmentSpec[];
  additionalGarmentTypes?: readonly FabricGarmentType[];
}): FabricGarmentType[] => {
  const required = new Set(
    getUploadedDesignRequiredStep1GarmentTypes(step1GarmentTypes),
  );
  const sourceTypes =
    additionalGarmentTypes ||
    (composition || []).map((spec) => spec.garmentType);
  const selected = new Set(
    sourceTypes.filter(
      (garmentType) =>
        isCustomerSelectableGarmentType(garmentType) && !required.has(garmentType),
    ),
  );
  return CUSTOMER_SELECTABLE_GARMENT_TYPES.filter((garmentType) =>
    selected.has(garmentType),
  );
};

/**
 * Already-persisted VALID hidden canonical garments (e.g. legacy Agbada).
 * Malformed hidden specs are never auto-corrected into this list.
 */
export const getPreservedHiddenUploadedGarmentSpecs = (
  composition: readonly FabricCapacityGarmentSpec[] | null | undefined,
): FabricCapacityGarmentSpec[] =>
  evaluatePreservedHiddenUploadedGarments(composition).validSpecs;

/**
 * Authoritative effective upload composition:
 * required visible Step 1 garments
 * ∪ customer-added visible garments
 * ∪ already-persisted VALID hidden canonical legacy garments
 * ∪ MALFORMED hidden specs preserved as-is (never auto-corrected)
 *
 * When malformed hidden specs are present, readiness/progression must fail closed.
 */
export const mergeUploadedDesignCompositionWithStep1 = ({
  step1GarmentTypes,
  additionalGarmentTypes = [],
  preservedHiddenComposition = [],
}: {
  step1GarmentTypes: readonly FabricGarmentType[];
  additionalGarmentTypes?: readonly FabricGarmentType[];
  preservedHiddenComposition?: readonly FabricCapacityGarmentSpec[];
}): FabricCapacityGarmentSpec[] => {
  const required = getUploadedDesignRequiredStep1GarmentTypes(step1GarmentTypes);
  const additional = getUploadedDesignAdditionalGarmentTypes({
    step1GarmentTypes,
    additionalGarmentTypes,
  });
  const selectedPublic = new Set<FabricGarmentType>([...required, ...additional]);
  const publicSpecs = CUSTOMER_SELECTABLE_GARMENT_TYPES.filter((garmentType) =>
    selectedPublic.has(garmentType),
  ).map((garmentType) => createStyleBaseGarmentSpec(garmentType));
  const hidden = evaluatePreservedHiddenUploadedGarments(
    preservedHiddenComposition,
  );
  // Preserve malformed originals verbatim so hydration/autosave never silently
  // rewrites them into a corrected canonical shape.
  return [...publicSpecs, ...hidden.validSpecs, ...hidden.malformedSpecs];
};

export const getUploadedDesignCompositionSignature = (
  composition: readonly FabricCapacityGarmentSpec[],
): string =>
  composition
    .map((spec) => `${spec.garmentType}:${spec.fabricUnits}:${spec.key}`)
    .join("|");

/**
 * Effective Garment Type selection for uploaded-mode Fabric / Custom Details /
 * pricing / Summary. Step 1 UI selection is left untouched.
 */
export const buildEffectiveUploadedJourneyGarmentTypeSelection = ({
  step1Selection,
  uploadedComposition,
  normalizedCustomDetailCatalog,
}: {
  step1Selection: GarmentTypeStepSelection;
  uploadedComposition: readonly FabricCapacityGarmentSpec[];
  normalizedCustomDetailCatalog: readonly CustomDetailOption[];
}): GarmentTypeStepSelection =>
  updateDormantGarmentTypeSelection({
    currentSelection: step1Selection,
    normalizedCustomDetailCatalog,
    selectedGarmentTypes: uploadedComposition.map((spec) => spec.garmentType),
  });

/**
 * Fabric Step 2 must always render against the effective journey composition
 * (uploaded extras authoritative when upload is active). Catalogue mode naturally
 * resolves effective === Step 1.
 */
export const resolveFabricStepGarmentTypeSelection = ({
  effectiveJourneyGarmentTypeSelection,
}: {
  step1GarmentTypeSelection: GarmentTypeStepSelection;
  effectiveJourneyGarmentTypeSelection: GarmentTypeStepSelection;
}): GarmentTypeStepSelection => effectiveJourneyGarmentTypeSelection;

export const toggleUploadedDesignGarmentComposition = (
  current: readonly FabricCapacityGarmentSpec[],
  garmentType: FabricGarmentType,
  options: {
    step1GarmentTypes?: readonly FabricGarmentType[];
  } = {},
): FabricCapacityGarmentSpec[] => {
  // Defense-in-depth: never add hidden/non-customer garments as a new selection.
  if (!isCustomerSelectableGarmentType(garmentType)) {
    return mergeUploadedDesignCompositionWithStep1({
      step1GarmentTypes: options.step1GarmentTypes || [],
      additionalGarmentTypes: getUploadedDesignAdditionalGarmentTypes({
        step1GarmentTypes: options.step1GarmentTypes || [],
        composition: current,
      }),
      preservedHiddenComposition: current,
    });
  }

  const step1GarmentTypes = options.step1GarmentTypes || [];
  const required = new Set(
    getUploadedDesignRequiredStep1GarmentTypes(step1GarmentTypes),
  );
  const additional = new Set(
    getUploadedDesignAdditionalGarmentTypes({
      step1GarmentTypes,
      composition: current,
    }),
  );

  if (required.has(garmentType)) {
    return mergeUploadedDesignCompositionWithStep1({
      step1GarmentTypes,
      additionalGarmentTypes: [...additional],
      preservedHiddenComposition: current,
    });
  }

  if (additional.has(garmentType)) {
    additional.delete(garmentType);
  } else {
    additional.add(garmentType);
  }

  return mergeUploadedDesignCompositionWithStep1({
    step1GarmentTypes,
    additionalGarmentTypes: [...additional],
    preservedHiddenComposition: current,
  });
};

export const createUploadedDesignSourceWhenReady = (
  input: UploadedDesignStep1Input,
): UploadedDesignSource | null => {
  // Create when basics are present so malformed legacy data is never silently
  // dropped by clearing the source. Progression uses isReady (!needsReview).
  if (
    input.uploadReference === null ||
    input.fabricCapacityComposition.length === 0 ||
    input.demographic === null
  ) {
    return null;
  }
  return createUploadedDesignSource({
    uploadReference: input.uploadReference,
    fabricCapacityComposition: input.fabricCapacityComposition.map((spec) => ({
      ...spec,
    })),
    demographic: input.demographic,
  });
};

/**
 * Authoritative Step 3 transition after a successful Upload Your Own Design
 * preview is accepted. Always clears catalogue Design Style authority so a
 * catalogue selection and uploaded preview cannot coexist.
 *
 * - Ready form => uploaded designSource becomes authoritative
 * - Incomplete form => designSource null (local draft/preview remain intact)
 */
export const resolveAuthorityAfterSuccessfulUploadedDesignPreview = (
  input: UploadedDesignStep1Input,
): {
  selectedStyleId: null;
  designSource: UploadedDesignSource | null;
  confirmedDesignSourceKey: null;
  priceActivatedFabricCode: null;
} => ({
  selectedStyleId: null,
  designSource: createUploadedDesignSourceWhenReady(input),
  confirmedDesignSourceKey: null,
  priceActivatedFabricCode: null,
});

export type UploadedDesignOperationKind = "upload" | "replacement";

export interface UploadedDesignOperationIdentity {
  generation: number;
  kind: UploadedDesignOperationKind;
}

export interface UploadedDesignOperationCoordinator {
  begin: (
    kind: UploadedDesignOperationKind,
  ) => UploadedDesignOperationIdentity;
  invalidate: () => void;
  isCurrent: (operation: UploadedDesignOperationIdentity) => boolean;
  finish: (operation: UploadedDesignOperationIdentity) => boolean;
}

/**
 * Owns upload/replacement authority independently from React render timing.
 * Beginning or invalidating an operation makes every older async completion stale.
 */
export const createUploadedDesignOperationCoordinator =
  (): UploadedDesignOperationCoordinator => {
    let generation = 0;
    let activeGeneration: number | null = null;

    const isCurrent = (operation: UploadedDesignOperationIdentity) =>
      operation.generation === generation &&
      operation.generation === activeGeneration;

    return {
      begin: (kind) => {
        const operation = { generation: ++generation, kind };
        activeGeneration = operation.generation;
        return operation;
      },
      invalidate: () => {
        generation += 1;
        activeGeneration = null;
      },
      isCurrent,
      finish: (operation) => {
        if (!isCurrent(operation)) return false;
        activeGeneration = null;
        return true;
      },
    };
  };

export type UploadedDesignOperationResult<T> =
  | { status: "succeeded"; value: T }
  | { status: "failed"; error: unknown }
  | { status: "stale" };

export interface RunUploadedDesignOperationInput<T> {
  coordinator: UploadedDesignOperationCoordinator;
  kind: UploadedDesignOperationKind;
  onBegin: (operation: UploadedDesignOperationIdentity) => void;
  validate: () => Promise<void>;
  execute: () => Promise<T>;
  onSuccess: (
    value: T,
    operation: UploadedDesignOperationIdentity,
  ) => void;
  onError: (
    error: unknown,
    operation: UploadedDesignOperationIdentity,
  ) => void;
  onFinish: (operation: UploadedDesignOperationIdentity) => void;
}

/**
 * Runs the customer upload transition with current-operation checks after every
 * asynchronous boundary. Stale operations cannot publish state, errors, or
 * busy finalization.
 */
export const runUploadedDesignOperation = async <T>({
  coordinator,
  kind,
  onBegin,
  validate,
  execute,
  onSuccess,
  onError,
  onFinish,
}: RunUploadedDesignOperationInput<T>): Promise<
  UploadedDesignOperationResult<T>
> => {
  const operation = coordinator.begin(kind);
  onBegin(operation);

  try {
    await validate();
    if (!coordinator.isCurrent(operation)) return { status: "stale" };

    const value = await execute();
    if (!coordinator.isCurrent(operation)) return { status: "stale" };

    onSuccess(value, operation);
    return { status: "succeeded", value };
  } catch (error) {
    if (!coordinator.isCurrent(operation)) return { status: "stale" };
    onError(error, operation);
    return { status: "failed", error };
  } finally {
    if (coordinator.finish(operation)) onFinish(operation);
  }
};

export interface UploadedDesignCapacitySummary {
  garmentCount: number;
  fabricQuantity: number;
  requiresAdditionalAllocation: boolean;
}

export const getUploadedDesignCapacitySummary = (
  composition: readonly FabricCapacityGarmentSpec[],
): UploadedDesignCapacitySummary => {
  const assignments = composition.flatMap((spec) => {
    const resolved = FabricCapacityEngine.resolveGarmentAssignment({
      code: `UPLOADED_${spec.garmentType.toUpperCase()}`,
      garmentSpec: spec,
    });
    return resolved.status === "resolved" ? resolved.assignments : [];
  });
  const quantitySummary = getCustomerFacingFabricQuantityForAssignments(
    assignments,
  );

  return {
    garmentCount: quantitySummary.garmentCount,
    fabricQuantity: quantitySummary.fabricQuantity,
    requiresAdditionalAllocation: quantitySummary.fabricQuantity > 1,
  };
};
