import {
  FABRIC_GARMENT_CAPACITY_UNITS,
  applyLegacyStyleFabricCapacityConfig,
  getStyleBaseFabricCapacityComposition,
} from "../config/StyleFabricCapacityConfig";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import { getGarmentTypeStepLabel } from "../components/GarmentTypeStep";
import { getGarmentTypeSelectedDemographics } from "./garmentTypeStepState";
import type {
  CanonicalPhysicalGarmentType,
  CustomDetailDemographic,
  FabricCapacityGarmentSpec,
  FabricGarmentType,
  GarmentTypeStepSelection,
  StyleApplicability,
  StyleCategory,
} from "../types";

export type FutureDesignStyleCompatibilityStatus =
  | "exact_match"
  | "adaptable"
  | "blocked"
  | "indeterminate";

export type FutureDesignStyleCompatibilityCode =
  | "EXACT_MATCH"
  | "ADAPTABLE"
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

export type FutureDesignStyleMatchTier = FutureDesignStyleCompatibilityStatus;

export interface FutureDesignStyleMatchPresentation {
  tier: FutureDesignStyleMatchTier;
  selectable: boolean;
  requiresAdaptationConfirmation: boolean;
  originalCompositionLabel: string;
  selectedGarmentLabels: string[];
  customerReason: string;
}

export const FUTURE_DESIGN_STYLE_TIER_BADGE: Record<
  FutureDesignStyleMatchTier,
  string
> = {
  exact_match: "BEST MATCH",
  adaptable: "CAN BE ADAPTED",
  blocked: "NOT AVAILABLE FOR THIS ORDER",
  indeterminate: "CATALOGUE REVIEW",
};

export interface FutureDesignStyleAdaptationConfirmationCopy {
  title: string;
  body: string;
}

const INDETERMINATE_CUSTOMER_REASON =
  "This design needs catalogue review before it can be selected.";
const EXACT_MATCH_CUSTOMER_REASON = "Designed for your selected garments.";
const BLOCKED_GARMENT_CUSTOMER_REASON =
  "This design is not available for one or more garments in your order.";
const BLOCKED_DEMOGRAPHIC_CUSTOMER_REASON =
  "This design does not match who the order is for.";

const CANONICAL_PHYSICAL_GARMENT_TYPE_SET = new Set<CanonicalPhysicalGarmentType>(
  (Object.keys(FABRIC_GARMENT_CAPACITY_UNITS) as FabricGarmentType[]).filter(
    (garmentType): garmentType is CanonicalPhysicalGarmentType =>
      garmentType !== "other",
  ),
);

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

const isCanonicalPhysicalGarmentType = (
  value: unknown,
): value is CanonicalPhysicalGarmentType =>
  typeof value === "string" &&
  CANONICAL_PHYSICAL_GARMENT_TYPE_SET.has(value as CanonicalPhysicalGarmentType);

const isCustomDetailDemographic = (
  value: unknown,
): value is CustomDetailDemographic =>
  value === "male" || value === "female" || value === "unisex";

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

const selectedDemographicsAreCompatible = (
  selectedDemographics: readonly CustomDetailDemographic[],
  representedDemographics: readonly CustomDetailDemographic[],
): boolean =>
  selectedDemographics.length > 0 &&
  selectedDemographics.some((demographic) =>
    isDemographicCompatible(demographic, representedDemographics),
  );

type NormalizedStyleApplicability =
  | { mode: "exact_only" }
  | {
      mode: "adaptable";
      garmentTypes: CanonicalPhysicalGarmentType[];
      demographics: CustomDetailDemographic[] | null;
    };

/**
 * Missing or malformed applicability fails closed to exact_only.
 * A design is adaptable only when the business explicitly opts in with
 * valid structured garmentTypes.
 */
export const resolveStyleApplicability = (
  style: StyleCategory,
): NormalizedStyleApplicability => {
  const raw = style.styleApplicability as StyleApplicability | undefined;
  if (!raw || typeof raw !== "object") return { mode: "exact_only" };
  if (raw.mode !== "adaptable") return { mode: "exact_only" };

  if (!Array.isArray(raw.garmentTypes) || raw.garmentTypes.length === 0) {
    return { mode: "exact_only" };
  }

  const garmentTypes: CanonicalPhysicalGarmentType[] = [];
  for (const value of raw.garmentTypes) {
    if (!isCanonicalPhysicalGarmentType(value)) {
      return { mode: "exact_only" };
    }
    if (!garmentTypes.includes(value)) garmentTypes.push(value);
  }
  if (garmentTypes.length === 0) return { mode: "exact_only" };

  let demographics: CustomDetailDemographic[] | null = null;
  if (raw.demographics !== undefined) {
    if (!Array.isArray(raw.demographics) || raw.demographics.length === 0) {
      return { mode: "exact_only" };
    }
    const parsed: CustomDetailDemographic[] = [];
    for (const value of raw.demographics) {
      if (!isCustomDetailDemographic(value)) {
        return { mode: "exact_only" };
      }
      if (!parsed.includes(value)) parsed.push(value);
    }
    demographics = parsed;
  }

  return {
    mode: "adaptable",
    garmentTypes: garmentTypes.sort(),
    demographics,
  };
};

const formatCustomerGarmentList = (labels: readonly string[]): string => {
  if (labels.length <= 1) return labels[0] || "selected garments";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
};

const selectedGarmentLabelsFor = (
  garmentTypes: readonly CanonicalPhysicalGarmentType[],
): string[] => garmentTypes.map(getGarmentTypeStepLabel);

const adaptableCustomerReason = (
  selectedGarments: readonly CanonicalPhysicalGarmentType[],
): string =>
  `This design can be adapted to your ${formatCustomerGarmentList(
    selectedGarmentLabelsFor(selectedGarments),
  )}.`;

export const isFutureDesignStyleSelectable = (
  compatibility:
    | FutureDesignStyleCompatibilityStatus
    | Pick<FutureDesignStyleCompatibilityResult, "status">,
): boolean => {
  const status =
    typeof compatibility === "string" ? compatibility : compatibility.status;
  return status === "exact_match" || status === "adaptable";
};

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
      INDETERMINATE_CUSTOMER_REASON,
      "Catalog style has no stable ID.",
    );
  }
  if (!getStyleAvailability(style)) {
    return unavailableResult(
      "STYLE_DISABLED",
      "This design is no longer available.",
      `Catalog style ${style.id} is disabled.`,
      "blocked",
    );
  }

  const composition = normalizeStyleComposition(style);
  if (composition.status === "missing") {
    return unavailableResult(
      "STYLE_COMPOSITION_MISSING",
      INDETERMINATE_CUSTOMER_REASON,
      `Catalog style ${style.id} has no structured fabric-capacity composition.`,
    );
  }
  if (composition.status === "malformed") {
    return unavailableResult(
      "STYLE_COMPOSITION_MALFORMED",
      INDETERMINATE_CUSTOMER_REASON,
      `Catalog style ${style.id} has malformed or duplicate garment composition metadata.`,
    );
  }
  if (composition.status !== "resolved") {
    return unavailableResult(
      "STYLE_COMPOSITION_MALFORMED",
      INDETERMINATE_CUSTOMER_REASON,
      `Catalog style ${style.id} composition could not be resolved.`,
    );
  }

  const representedDemographics = resolveRepresentedDemographics(style);
  if (!representedDemographics) {
    return unavailableResult(
      "STYLE_DEMOGRAPHIC_MISSING",
      INDETERMINATE_CUSTOMER_REASON,
      `Catalog style ${style.id} has no canonical demographic metadata.`,
    );
  }

  const selectedGarments = [
    ...new Set(garmentTypeSelection.garmentTypes),
  ].sort();
  const selectedDemographics = getGarmentTypeSelectedDemographics(
    garmentTypeSelection,
  );

  if (selectedGarments.length === 0) {
    return unavailableResult(
      "GARMENT_COMPOSITION_MISMATCH",
      "Select at least one supported garment in Step 1.",
      `Selected garments are empty; style-supported garments [${composition.garmentTypes.join(", ")}].`,
      "blocked",
    );
  }

  if (selectedDemographics.length === 0) {
    return unavailableResult(
      "DEMOGRAPHIC_MISMATCH",
      BLOCKED_DEMOGRAPHIC_CUSTOMER_REASON,
      `Selected demographics are missing; style demographics [${representedDemographics.join(", ")}].`,
      "blocked",
    );
  }

  const supportedOriginalGarments = new Set(composition.garmentTypes);
  const unsupportedOriginalGarments = selectedGarments.filter(
    (garmentType) => !supportedOriginalGarments.has(garmentType),
  );
  const garmentsExact = unsupportedOriginalGarments.length === 0;
  const demographicExact = selectedDemographicsAreCompatible(
    selectedDemographics,
    representedDemographics,
  );

  if (garmentsExact && demographicExact) {
    return {
      status: "exact_match",
      code: "EXACT_MATCH",
      customerReason: EXACT_MATCH_CUSTOMER_REASON,
      developerReason: `Canonical Step 1 garments are a supported subset of catalog style ${style.id} original composition [${composition.garmentTypes.join(", ")}], with at least one compatible demographic.`,
    };
  }

  const applicability = resolveStyleApplicability(style);
  if (applicability.mode === "adaptable") {
    const unsupportedApplicableGarments = selectedGarments.filter(
      (garmentType) => !applicability.garmentTypes.includes(garmentType),
    );
    const garmentsAdaptable = unsupportedApplicableGarments.length === 0;
    const demographicAdaptable =
      demographicExact ||
      (applicability.demographics !== null &&
        selectedDemographicsAreCompatible(
          selectedDemographics,
          applicability.demographics,
        ));

    if (garmentsAdaptable && demographicAdaptable) {
      return {
        status: "adaptable",
        code: "ADAPTABLE",
        customerReason: adaptableCustomerReason(selectedGarments),
        developerReason: `Catalog style ${style.id} original composition [${composition.garmentTypes.join(", ")}] is not an exact subset match; explicit styleApplicability permits garments [${applicability.garmentTypes.join(", ")}].`,
      };
    }

    if (!demographicAdaptable) {
      return unavailableResult(
        "DEMOGRAPHIC_MISMATCH",
        BLOCKED_DEMOGRAPHIC_CUSTOMER_REASON,
        `Selected demographics [${selectedDemographics.join(", ")}] are not represented by style demographics [${representedDemographics.join(", ")}] or explicit applicability demographics [${applicability.demographics?.join(", ") || "none"}].`,
        "blocked",
      );
    }

    return unavailableResult(
      "GARMENT_COMPOSITION_MISMATCH",
      BLOCKED_GARMENT_CUSTOMER_REASON,
      `Selected garments [${selectedGarments.join(", ")}] are not a subset of original composition [${composition.garmentTypes.join(", ")}] or explicit applicability garments [${applicability.garmentTypes.join(", ")}].`,
      "blocked",
    );
  }

  if (!demographicExact) {
    return unavailableResult(
      "DEMOGRAPHIC_MISMATCH",
      BLOCKED_DEMOGRAPHIC_CUSTOMER_REASON,
      `Selected demographics [${selectedDemographics.join(", ")}] are not represented by style demographics [${representedDemographics.join(", ")}].`,
      "blocked",
    );
  }

  return unavailableResult(
    "GARMENT_COMPOSITION_MISMATCH",
    BLOCKED_GARMENT_CUSTOMER_REASON,
    `Selected garments [${selectedGarments.join(", ")}] are not a subset of style-supported garments [${composition.garmentTypes.join(", ")}].`,
    "blocked",
  );
};

export const getFutureDesignStyleMatchPresentation = ({
  garmentTypeSelection,
  style,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  style: StyleCategory;
}): FutureDesignStyleMatchPresentation => {
  const compatibility = resolveFutureDesignStyleCompatibility({
    garmentTypeSelection,
    style,
  });
  const selectedGarments = [...new Set(garmentTypeSelection.garmentTypes)].sort();
  const originalComposition = normalizeStyleComposition(style);
  const originalCompositionLabel =
    originalComposition.status === "resolved"
      ? originalComposition.garmentTypes.map(getGarmentTypeStepLabel).join(" + ")
      : getFutureDesignStyleCompositionLabel(style);
  return {
    tier: compatibility.status,
    selectable: isFutureDesignStyleSelectable(compatibility),
    requiresAdaptationConfirmation: compatibility.status === "adaptable",
    originalCompositionLabel,
    selectedGarmentLabels: selectedGarmentLabelsFor(selectedGarments),
    customerReason: compatibility.customerReason,
  };
};

export const getFutureDesignStyleAdaptationConfirmationCopy = ({
  garmentTypeSelection,
  style,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  style: StyleCategory;
}): FutureDesignStyleAdaptationConfirmationCopy => {
  const presentation = getFutureDesignStyleMatchPresentation({
    garmentTypeSelection,
    style,
  });
  const selectedList = formatCustomerGarmentList(
    presentation.selectedGarmentLabels,
  );
  return {
    title: "Adapt this design to your garments?",
    body: `This design is shown as ${presentation.originalCompositionLabel}, but it can be adapted to your selected ${selectedList}. Your garments and Fabric selections will not change.`,
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
    status: isFutureDesignStyleSelectable(compatibility)
      ? "selected"
      : "reselection_required",
    compatibility,
  };
};
