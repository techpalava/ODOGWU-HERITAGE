import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import { getGarmentTypeSelectedDemographics } from "./garmentTypeStepState";
import {
  isFutureDesignStyleSelectable,
  resolveFutureDesignStyleCompatibility,
} from "./designStudioFutureDesignStyle";
import type { StylesLoadState } from "./stylesCatalogueLoadState";
import type {
  GarmentTypeStepSelection,
  StyleCategory,
} from "../types";

export type Step1CatalogueCoverageStatus =
  | "incomplete_selection"
  | "loading"
  | "matched"
  | "no_match"
  | "empty_catalogue"
  | "catalogue_unavailable";

export interface Step1CatalogueCompatibleStyle {
  id: string;
  name: string;
}

export interface Step1CatalogueCoverageResult {
  status: Step1CatalogueCoverageStatus;
  compatibleCount: number;
  compatibleStyles: Step1CatalogueCompatibleStyle[];
  selectedGarments: string[];
  selectedDemographics: string[];
  customerHeadline: string | null;
  customerDetail: string | null;
  /** True when Step 3 Upload Your Own Design remains a valid alternative. */
  uploadAlternativeAvailable: boolean;
}

const emptyResult = (
  status: Step1CatalogueCoverageStatus,
  selectedGarments: string[],
  selectedDemographics: string[],
  customerHeadline: string | null,
  customerDetail: string | null,
): Step1CatalogueCoverageResult => ({
  status,
  compatibleCount: 0,
  compatibleStyles: [],
  selectedGarments,
  selectedDemographics,
  customerHeadline,
  customerDetail,
  uploadAlternativeAvailable: true,
});

/**
 * Step 1 catalogue reachability.
 * Uses authoritative stylesLoadState — never styles.length alone for readiness.
 */
export const resolveStep1CatalogueCoverage = ({
  garmentTypeSelection,
  styles,
  stylesLoadState = "ready",
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  styles: readonly StyleCategory[];
  /** Authoritative Style catalogue load state from the store listener. */
  stylesLoadState?: StylesLoadState;
}): Step1CatalogueCoverageResult => {
  const selectedGarments = [...new Set(garmentTypeSelection.garmentTypes)];
  const selectedDemographics = getGarmentTypeSelectedDemographics(
    garmentTypeSelection,
  );

  if (selectedGarments.length === 0 || selectedDemographics.length === 0) {
    return emptyResult(
      "incomplete_selection",
      selectedGarments,
      selectedDemographics,
      null,
      null,
    );
  }

  if (stylesLoadState === "loading") {
    return emptyResult(
      "loading",
      selectedGarments,
      selectedDemographics,
      null,
      null,
    );
  }

  if (stylesLoadState === "error") {
    return emptyResult(
      "catalogue_unavailable",
      selectedGarments,
      selectedDemographics,
      "Design Style catalogue temporarily unavailable",
      "The Design Style catalogue could not be loaded right now. Your garment selection is preserved. You can continue and use Upload Your Own Design in Step 3, or try again shortly.",
    );
  }

  // stylesLoadState === "ready"
  if (styles.length === 0) {
    return emptyResult(
      "empty_catalogue",
      selectedGarments,
      selectedDemographics,
      "No catalogue designs are available right now",
      "The Design Style catalogue currently has no designs. You can continue and use Upload Your Own Design in Step 3, or wait and try again later.",
    );
  }

  const compatibleStyles = styles
    .map((style) => ({
      style,
      compatibility: resolveFutureDesignStyleCompatibility({
        garmentTypeSelection,
        style,
      }),
    }))
    .filter(({ compatibility }) => isFutureDesignStyleSelectable(compatibility))
    .map(({ style }) => ({
      id: style.id,
      name: style.name,
    }));

  if (compatibleStyles.length > 0) {
    return {
      status: "matched",
      compatibleCount: compatibleStyles.length,
      compatibleStyles,
      selectedGarments,
      selectedDemographics,
      customerHeadline: null,
      customerDetail: null,
      uploadAlternativeAvailable: true,
    };
  }

  const garmentLabels = selectedGarments
    .map((garmentType) => getFabricGarmentLabel(garmentType))
    .join(", ");
  const demographicLabels = selectedDemographics
    .map((demographic) => {
      if (demographic === "male") return "Male";
      if (demographic === "female") return "Female";
      return "Unisex / Family";
    })
    .join(", ");

  return emptyResult(
    "no_match",
    selectedGarments,
    selectedDemographics,
    "No catalogue design matches this selection",
    `None of the current Design Style catalogue entries support ${garmentLabels} for ${demographicLabels}. You can continue and use Upload Your Own Design in Step 3, or change your garment/audience selection.`,
  );
};
