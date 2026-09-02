import type { DesignSource, FabricGarmentType, StyleCategory } from "../types";
import {
  getConfirmedDesignSourceKeyAfterSourceChange,
  resolveActiveDesignSource,
} from "./designSourceState";
import { getUploadedDesignStep1Readiness } from "./uploadedDesignStep1";

export const isDesignStylePricingActive = (
  selectedStyleId: string | null | undefined,
  confirmedStyleId: string | null | undefined,
  selectedFabricCode: string | null | undefined,
  priceActivatedFabricCode: string | null | undefined,
): boolean =>
  Boolean(selectedStyleId) &&
  selectedStyleId === confirmedStyleId &&
  Boolean(selectedFabricCode) &&
  selectedFabricCode === priceActivatedFabricCode;

export const isDesignSourcePricingActive = ({
  designSource,
  selectedStyle,
  confirmedStyleId,
  confirmedDesignSourceKey,
  selectedFabricCode,
  priceActivatedFabricCode,
  step1GarmentTypes,
}: {
  designSource: DesignSource | null | undefined;
  selectedStyle: StyleCategory | null | undefined;
  confirmedStyleId: string | null | undefined;
  confirmedDesignSourceKey: string | null | undefined;
  selectedFabricCode: string | null | undefined;
  priceActivatedFabricCode: string | null | undefined;
  step1GarmentTypes: readonly FabricGarmentType[];
}): boolean => {
  const activeSource = resolveActiveDesignSource(designSource, selectedStyle);
  if (activeSource?.kind === "catalog") {
    return isDesignStylePricingActive(
      selectedStyle?.id,
      confirmedStyleId,
      selectedFabricCode,
      priceActivatedFabricCode,
    );
  }

  if (!activeSource || activeSource.kind !== "uploaded") {
    return false;
  }

  const uploadReadiness = getUploadedDesignStep1Readiness(
    {
      uploadReference: activeSource.uploadReference,
      fabricCapacityComposition: activeSource.fabricCapacityComposition,
      demographic: activeSource.demographic,
    },
    step1GarmentTypes,
  );

  return Boolean(
    uploadReadiness.isReady &&
      confirmedDesignSourceKey === activeSource.sourceKey &&
      selectedFabricCode &&
      selectedFabricCode === priceActivatedFabricCode,
  );
};

export const getConfirmedStyleIdAfterSelection = (
  currentConfirmedStyleId: string | null,
  selectedStyleId: string,
): string | null =>
  currentConfirmedStyleId === selectedStyleId
    ? currentConfirmedStyleId
    : null;

export const getPriceActivatedFabricCodeAfterSelection = (
  currentPriceActivatedFabricCode: string | null,
  selectedFabricCode: string,
): string | null =>
  currentPriceActivatedFabricCode === selectedFabricCode
    ? currentPriceActivatedFabricCode
    : null;

export const getPriceActivatedFabricCodeAfterDesignSourceChange = ({
  currentSource,
  currentConfirmedDesignSourceKey,
  currentPriceActivatedFabricCode,
  nextSource,
}: {
  currentSource: DesignSource | null | undefined;
  currentConfirmedDesignSourceKey: string | null | undefined;
  currentPriceActivatedFabricCode: string | null | undefined;
  nextSource: DesignSource | null | undefined;
}): string | null =>
  getConfirmedDesignSourceKeyAfterSourceChange(
    currentSource,
    currentConfirmedDesignSourceKey,
    nextSource,
  )
    ? currentPriceActivatedFabricCode || null
    : null;
