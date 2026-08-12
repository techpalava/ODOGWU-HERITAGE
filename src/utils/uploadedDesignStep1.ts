import {
  FabricCapacityEngine,
  getCustomerFacingFabricQuantityForAssignments,
  getFabricGarmentLabel,
} from "../engine/FabricCapacityEngine";
import {
  createStyleBaseGarmentSpec,
  STYLE_BASE_GARMENT_TYPES,
} from "../config/StyleFabricCapacityConfig";
import type {
  CustomerDesignUploadReference,
  CustomDetailDemographic,
  FabricCapacityGarmentSpec,
  FabricGarmentType,
  UploadedDesignSource,
} from "../types";
import { createUploadedDesignSource } from "./designSourceState";

export const UPLOADED_DESIGN_GARMENT_OPTIONS = STYLE_BASE_GARMENT_TYPES.map(
  (garmentType) => ({
    garmentType,
    label: getFabricGarmentLabel(garmentType),
    fabricUnits: createStyleBaseGarmentSpec(garmentType).fabricUnits,
  }),
);

export interface UploadedDesignStep1Input {
  uploadReference: CustomerDesignUploadReference | null;
  fabricCapacityComposition: readonly FabricCapacityGarmentSpec[];
  demographic: CustomDetailDemographic | null;
}

export const getUploadedDesignStep1Readiness = (
  input: UploadedDesignStep1Input,
) => ({
  hasUpload: input.uploadReference !== null,
  hasComposition: input.fabricCapacityComposition.length > 0,
  hasDemographic: input.demographic !== null,
  isReady:
    input.uploadReference !== null &&
    input.fabricCapacityComposition.length > 0 &&
    input.demographic !== null,
});

export const toggleUploadedDesignGarmentComposition = (
  current: readonly FabricCapacityGarmentSpec[],
  garmentType: FabricGarmentType,
): FabricCapacityGarmentSpec[] => {
  const currentlySelected = new Set(
    current.map((spec) => spec.garmentType),
  );
  if (currentlySelected.has(garmentType)) {
    return current
      .filter((spec) => spec.garmentType !== garmentType)
      .map((spec) => ({ ...spec }));
  }

  const nextSelected = new Set([...currentlySelected, garmentType]);
  return STYLE_BASE_GARMENT_TYPES.filter((type) => nextSelected.has(type)).map(
    (type) => createStyleBaseGarmentSpec(type),
  );
};

export const createUploadedDesignSourceWhenReady = (
  input: UploadedDesignStep1Input,
): UploadedDesignSource | null => {
  if (!getUploadedDesignStep1Readiness(input).isReady) return null;
  return createUploadedDesignSource({
    uploadReference: input.uploadReference!,
    fabricCapacityComposition: input.fabricCapacityComposition.map((spec) => ({
      ...spec,
    })),
    demographic: input.demographic!,
  });
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
