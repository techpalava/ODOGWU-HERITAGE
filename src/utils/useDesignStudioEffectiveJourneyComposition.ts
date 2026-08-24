import { useMemo } from "react";
import { normalizeCustomDetailCatalog } from "./catalogHelpers";
import type {
  CustomDetailOption,
  FabricCapacityGarmentSpec,
  GarmentTypeStepSelection,
  UploadedDesignSource,
} from "../types";
import {
  buildEffectiveUploadedJourneyGarmentTypeSelection,
  getUploadedDesignCompositionSignature,
} from "./uploadedDesignStep1";

/**
 * Production orchestration for Design Studio effective journey composition.
 * Extracted so memo/effect stability can be regression-tested at the real boundary.
 */
export const useDesignStudioEffectiveJourneyComposition = ({
  customDetailCatalog,
  garmentTypeSelection,
  activeUploadedDesignSource,
}: {
  customDetailCatalog: readonly CustomDetailOption[];
  garmentTypeSelection: GarmentTypeStepSelection;
  activeUploadedDesignSource: UploadedDesignSource | null;
}): {
  normalizedGarmentTypeCatalog: CustomDetailOption[];
  effectiveJourneyGarmentTypeSelection: GarmentTypeStepSelection;
  uploadedJourneyCompositionSignature: string | null;
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

  const effectiveJourneyGarmentTypeSelection = useMemo(() => {
    if (!activeUploadedDesignSource) {
      return garmentTypeSelection;
    }
    return buildEffectiveUploadedJourneyGarmentTypeSelection({
      step1Selection: garmentTypeSelection,
      uploadedComposition:
        activeUploadedDesignSource.fabricCapacityComposition,
      normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
    });
  }, [
    activeUploadedDesignSource?.sourceKey,
    garmentTypeSelection,
    normalizedGarmentTypeCatalog,
    uploadedJourneyCompositionSignature,
  ]);

  return {
    normalizedGarmentTypeCatalog,
    effectiveJourneyGarmentTypeSelection,
    uploadedJourneyCompositionSignature,
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
  composition: readonly FabricCapacityGarmentSpec[] | null | undefined;
}) => ({
  sourceKey: sourceKey ?? null,
  garmentTypeSelection,
  normalizedGarmentTypeCatalog,
  compositionSignature: composition
    ? getUploadedDesignCompositionSignature(composition)
    : null,
});
