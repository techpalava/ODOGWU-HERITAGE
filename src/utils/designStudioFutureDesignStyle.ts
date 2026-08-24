import {
  FABRIC_GARMENT_CAPACITY_UNITS,
  applyLegacyStyleFabricCapacityConfig,
  getStyleBaseFabricCapacityComposition,
} from "../config/StyleFabricCapacityConfig";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import { getGarmentTypeSelectedDemographics } from "./garmentTypeStepState";
import type {
  CanonicalPhysicalGarmentType,
  CustomDetailDemographic,
  FabricCapacityGarmentSpec,
  GarmentTypeStepSelection,
  StyleCategory,
} from "../types";

export type FutureDesignStyleCompatibilityStatus =
  | "compatible"
  | "incompatible"
  | "indeterminate";

export type FutureDesignStyleCompatibilityCode =
  | "COMPATIBLE"
  | "STYLE_DISABLED"
  | "STYLE_ID_MISSING"
  | "STYLE_COMPOSITION_MISSING"
  | "STYLE_COMPOSITION_MALFORMED"
  | "STYLE_DEMOGRAPHIC_MISSING"
  | "GARMENT_COMPOSITION_MISMATCH"
  | "DEMOGRAPHIC_MISMATCH";

export interface FutureDesignStyleCompatibilityResult {
  status: FutureDesignStyleCompatibilityStatus;
  code: FutureDesignStyleCompatibilityCode;
  customerReason: string;
  developerReason: string;
}

export interface FutureDesignStyleSelectionResolution {
  selectedStyleId: string | null;
  selectedStyle: StyleCategory | null;
  status: "none" | "selected" | "reselection_required";
  compatibility: FutureDesignStyleCompatibilityResult | null;
}

const unavailableResult = (
  code: FutureDesignStyleCompatibilityCode,
  customerReason: string,
  developerReason: string,
  status: FutureDesignStyleCompatibilityStatus = "indeterminate",
): FutureDesignStyleCompatibilityResult => ({
  status,
  code,
  customerReason,
  developerReason,
});

const getStyleAvailability = (style: StyleCategory): boolean => {
  const availability = style as StyleCategory & {
    active?: unknown;
    isActive?: unknown;
  };
  return availability.active !== false && availability.isActive !== false;
};

const normalizeStyleComposition = (
  style: StyleCategory,
):
  | { status: "resolved"; garmentTypes: CanonicalPhysicalGarmentType[] }
  | { status: "missing" | "malformed" } => {
  const normalizedStyle = applyLegacyStyleFabricCapacityConfig(style);
  const composition = getStyleBaseFabricCapacityComposition(normalizedStyle);
  if (composition.length === 0) return { status: "missing" };

  const garmentTypes: CanonicalPhysicalGarmentType[] = [];
  for (const spec of composition) {
    if (
      !isValidPhysicalGarmentSpec(spec) ||
      garmentTypes.includes(spec.garmentType)
    ) {
      return { status: "malformed" };
    }
    garmentTypes.push(spec.garmentType);
  }

  return { status: "resolved", garmentTypes: garmentTypes.sort() };
};

/** Customer-facing composition copy. Compatibility still uses the resolver below. */
export const getFutureDesignStyleCompositionLabel = (
  style: StyleCategory,
): string => {
  const composition = normalizeStyleComposition(style);
  if (composition.status === "resolved") {
    return composition.garmentTypes.map(getFabricGarmentLabel).join(" + ");
  }

  return (
    style.garmentComposition?.trim() ||
    style.outfitType?.trim() ||
    "Garment details to be confirmed"
  );
};

const isValidPhysicalGarmentSpec = (
  spec: FabricCapacityGarmentSpec,
): spec is FabricCapacityGarmentSpec & {
  garmentType: CanonicalPhysicalGarmentType;
} =>
  Boolean(spec.key?.trim()) &&
  spec.garmentType !== "other" &&
  FABRIC_GARMENT_CAPACITY_UNITS[spec.garmentType] === spec.fabricUnits;

const resolveRepresentedDemographics = (
  style: StyleCategory,
): CustomDetailDemographic[] | null => {
  const configured = style.customDetailConfig?.representedGenders;
  if (configured?.length) {
    const represented = [
      ...new Set(
        configured.map((value) => String(value).trim().toLowerCase()),
      ),
    ];
    return represented.every(
      (value) => value === "male" || value === "female",
    )
      ? (represented as CustomDetailDemographic[])
      : null;
  }

  const gender = String(style.gender || "").trim().toLowerCase();
  if (
    style.customDetailConfig?.featuresMaleAndFemale === true ||
    style.featuresMaleAndFemale === true ||
    gender === "family" ||
    gender === "couple"
  ) {
    return ["male", "female"];
  }

  const declared = String(
    style.targetDemographic || style.gender || "",
  )
    .trim()
    .toLowerCase();
  if (declared === "male" || declared === "female") return [declared];
  if (declared === "unisex") return ["male", "female"];
  return null;
};

const isDemographicCompatible = (
  selectedDemographic: CustomDetailDemographic,
  representedDemographics: readonly CustomDetailDemographic[],
): boolean =>
  selectedDemographic === "unisex"
    ? representedDemographics.includes("male") &&
      representedDemographics.includes("female")
    : representedDemographics.includes(selectedDemographic);

export const resolveFutureDesignStyleCompatibility = ({
  garmentTypeSelection,
  style,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  style: StyleCategory;
}): FutureDesignStyleCompatibilityResult => {
  if (!style.id?.trim()) {
    return unavailableResult(
      "STYLE_ID_MISSING",
      "This design needs catalogue review before it can be selected.",
      "Catalog style has no stable ID.",
    );
  }
  if (!getStyleAvailability(style)) {
    return unavailableResult(
      "STYLE_DISABLED",
      "This design is no longer available.",
      `Catalog style ${style.id} is disabled.`,
      "incompatible",
    );
  }

  const composition = normalizeStyleComposition(style);
  if (composition.status === "missing") {
    return unavailableResult(
      "STYLE_COMPOSITION_MISSING",
      "This design needs garment details before it can be selected.",
      `Catalog style ${style.id} has no structured fabric-capacity composition.`,
    );
  }
  if (composition.status === "malformed") {
    return unavailableResult(
      "STYLE_COMPOSITION_MALFORMED",
      "This design needs catalogue review before it can be selected.",
      `Catalog style ${style.id} has malformed or duplicate garment composition metadata.`,
    );
  }
  if (composition.status !== "resolved") {
    return unavailableResult(
      "STYLE_COMPOSITION_MALFORMED",
      "This design needs catalogue review before it can be selected.",
      `Catalog style ${style.id} composition could not be resolved.`,
    );
  }

  const representedDemographics = resolveRepresentedDemographics(style);
  if (!representedDemographics) {
    return unavailableResult(
      "STYLE_DEMOGRAPHIC_MISSING",
      "This design needs demographic details before it can be selected.",
      `Catalog style ${style.id} has no canonical demographic metadata.`,
    );
  }

  const selectedGarments = [
    ...new Set(garmentTypeSelection.garmentTypes),
  ].sort();
  const supportedGarments = new Set(composition.garmentTypes);
  const unsupportedGarments = selectedGarments.filter(
    (garmentType) => !supportedGarments.has(garmentType),
  );
  if (selectedGarments.length === 0 || unsupportedGarments.length > 0) {
    const unsupportedLabels = unsupportedGarments
      .map(getFabricGarmentLabel)
      .join(", ");
    return unavailableResult(
      "GARMENT_COMPOSITION_MISMATCH",
      unsupportedLabels
        ? `This design does not support ${unsupportedLabels}.`
        : "Select at least one supported garment in Step 1.",
      `Selected garments [${selectedGarments.join(", ")}] are not a subset of style-supported garments [${composition.garmentTypes.join(", ")}].`,
      "incompatible",
    );
  }

  const selectedDemographics = getGarmentTypeSelectedDemographics(
    garmentTypeSelection,
  );
  if (
    selectedDemographics.length === 0 ||
    !selectedDemographics.some((demographic) =>
      isDemographicCompatible(demographic, representedDemographics),
    )
  ) {
    return unavailableResult(
      "DEMOGRAPHIC_MISMATCH",
      "This design does not match who the order is for.",
      `Selected demographics [${selectedDemographics.join(", ") || "missing"}] are not represented by style demographics [${representedDemographics.join(", ")}].`,
      "incompatible",
    );
  }

  return {
    status: "compatible",
    code: "COMPATIBLE",
    customerReason: "Compatible with your garment and demographic selections.",
    developerReason: `Canonical Step 1 garments are a supported subset of catalog style ${style.id}, with at least one compatible demographic.`,
  };
};

export const reconcileFutureDesignStyleSelection = ({
  selectedStyleId,
  styles,
  garmentTypeSelection,
}: {
  selectedStyleId: string | null | undefined;
  styles: readonly StyleCategory[];
  garmentTypeSelection: GarmentTypeStepSelection;
}): FutureDesignStyleSelectionResolution => {
  const normalizedStyleId = selectedStyleId?.trim() || null;
  if (!normalizedStyleId) {
    return {
      selectedStyleId: null,
      selectedStyle: null,
      status: "none",
      compatibility: null,
    };
  }

  const selectedStyle =
    styles.find((style) => style.id === normalizedStyleId) || null;
  if (!selectedStyle) {
    return {
      selectedStyleId: normalizedStyleId,
      selectedStyle: null,
      status: "reselection_required",
      compatibility: unavailableResult(
        "STYLE_ID_MISSING",
        "Your saved design is no longer in the catalogue. Select another design.",
        `Persisted style ${normalizedStyleId} is missing from the current catalog.`,
      ),
    };
  }

  const compatibility = resolveFutureDesignStyleCompatibility({
    garmentTypeSelection,
    style: selectedStyle,
  });
  return {
    selectedStyleId: normalizedStyleId,
    selectedStyle,
    status:
      compatibility.status === "compatible"
        ? "selected"
        : "reselection_required",
    compatibility,
  };
};
