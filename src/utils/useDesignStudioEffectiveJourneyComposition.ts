import { useMemo } from "react";
import { normalizeCustomDetailCatalog } from "./catalogHelpers";
import type {
  AdditionalGarmentConstructionStateV1,
  CustomDetailOption,
  FabricAllocationState,
  GarmentTypeStepSelection,
  UploadedDesignSource,
} from "../types";
import {
  resolveAuthoritativePhysicalOrder,
  type AuthoritativePhysicalOrderResolution,
} from "./designSourceState";
import { getFutureFabricAllocationStateSignature } from "./designStudioFutureFabricStage";
import { getUploadedDesignCompositionSignature } from "./uploadedDesignStep1";

/**
 * Production orchestration for Design Studio effective journey composition.
 * Extracted so memo/effect stability can be regression-tested at the real boundary.
 */
export const useDesignStudioEffectiveJourneyComposition = ({
  customDetailCatalog,
  garmentTypeSelection,
  activeUploadedDesignSource,
  confirmedDesignSourceKey = null,
  fabricAllocationState = null,
  additionalGarmentConstructionState = null,
}: {
  customDetailCatalog: readonly CustomDetailOption[];
  garmentTypeSelection: GarmentTypeStepSelection;
  activeUploadedDesignSource: UploadedDesignSource | null;
  confirmedDesignSourceKey?: string | null;
  fabricAllocationState?: FabricAllocationState | null;
  additionalGarmentConstructionState?: AdditionalGarmentConstructionStateV1 | null;
}): {
  normalizedGarmentTypeCatalog: CustomDetailOption[];
  effectiveJourneyGarmentTypeSelection: GarmentTypeStepSelection;
  uploadedJourneyCompositionSignature: string | null;
  authoritativePhysicalOrder: AuthoritativePhysicalOrderResolution;
} => {
  const normalizedGarmentTypeCatalog = useMemo(
    () => normalizeCustomDetailCatalog(customDetailCatalog),
    [customDetailCatalog],
  );

  const uploadedJourneyCompositionSignature = activeUploadedDesignSource
    ? getUploadedDesignCompositionSignature(
        activeUploadedDesignSource.fabricCapacityComposition,
      )
    : null;

  const fabricAssignmentSignature = fabricAllocationState
    ? getFutureFabricAllocationStateSignature(fabricAllocationState)
    : null;

  const additionalConstructionSignature = useMemo(
    () =>
      JSON.stringify(
        Object.keys(additionalGarmentConstructionState?.byGarmentKey || {}).sort(),
      ),
    [additionalGarmentConstructionState?.byGarmentKey],
  );

  const authoritativePhysicalOrder = useMemo(
    () =>
      resolveAuthoritativePhysicalOrder({
        garmentTypeSelection,
        designSource: activeUploadedDesignSource,
        confirmedDesignSourceKey,
        normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
        fabricAllocationState,
        additionalGarmentConstructionState,
      }),
    [
      activeUploadedDesignSource?.sourceKey,
      confirmedDesignSourceKey,
      garmentTypeSelection,
      normalizedGarmentTypeCatalog,
      uploadedJourneyCompositionSignature,
      fabricAssignmentSignature,
      additionalConstructionSignature,
    ],
  );

  const effectiveJourneyGarmentTypeSelection = useMemo(() => {
    if (authoritativePhysicalOrder.status === "resolved") {
      return authoritativePhysicalOrder.effectiveGarmentTypeSelection;
    }
    return garmentTypeSelection;
  }, [authoritativePhysicalOrder, garmentTypeSelection]);

  return {
    normalizedGarmentTypeCatalog,
    effectiveJourneyGarmentTypeSelection,
    uploadedJourneyCompositionSignature,
    authoritativePhysicalOrder,
  };
};

/** Test/helper: same signature inputs DesignStudioView uses for composition memo deps. */
export const getEffectiveJourneyCompositionMemoInputs = ({
  sourceKey,
  garmentTypeSelection,
  normalizedGarmentTypeCatalog,
  composition,
}: {
  sourceKey: string | null | undefined;
  garmentTypeSelection: GarmentTypeStepSelection;
  normalizedGarmentTypeCatalog: readonly CustomDetailOption[];
  composition: readonly import("../types").FabricCapacityGarmentSpec[] | null | undefined;
}) => ({
  sourceKey: sourceKey ?? null,
  garmentTypeSelection,
  normalizedGarmentTypeCatalog,
  compositionSignature: composition
    ? getUploadedDesignCompositionSignature(composition)
    : null,
});
