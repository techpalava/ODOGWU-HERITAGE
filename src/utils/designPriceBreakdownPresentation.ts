import type {
  AdditionalGarmentConstructionStateV1,
  FabricGarmentAssignment,
  GarmentConstructionPricingResolution,
  GarmentTypeStepSelection,
} from "../types";
import { createStyleBaseGarmentSpec } from "../config/StyleFabricCapacityConfig";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import type { CustomDetailCatalogInspection } from "./catalogHelpers";
import type { AuthoritativeDesignPricing } from "./designPricing";
import type { FutureCustomDetailPhysicalSubject } from "./garmentScopedCustomDetailsDomain";

export const SELECTED_DESIGN_PRICE_SUPPORTING_TEXT =
  "Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing.";

/**
 * Presentation-only mapping of the pricing engine's explanatory garment rows.
 * It deliberately owns no monetary arithmetic.
 */
export const resolveCustomerDesignPriceBreakdown = (
  pricing: Pick<
    AuthoritativeDesignPricing,
    | "baseGarmentPricingStatus"
    | "baseGarmentPriceRows"
    | "additionalGarmentPricingStatus"
    | "additionalGarmentPriceRows"
  > | null,
) => ({
  baseGarmentRows:
    pricing?.baseGarmentPricingStatus === "resolved"
      ? pricing.baseGarmentPriceRows
      : [],
  additionalGarmentRows:
    pricing?.additionalGarmentPricingStatus === "resolved"
      ? pricing.additionalGarmentPriceRows
      : [],
  requiresPricingReview:
    pricing?.baseGarmentPricingStatus === "unresolved" ||
    pricing?.additionalGarmentPricingStatus === "unresolved",
});

export interface CustomerGarmentConstructionBreakdownRow {
  garmentKey: string;
  garmentLabel: string;
  constructionLabel: string | null;
  role: "main" | "additional" | null;
  priceCents: number | null;
}

export interface CustomerGarmentConstructionBreakdownProjection {
  status: "complete" | "pending";
  rows: CustomerGarmentConstructionBreakdownRow[];
}

export const CONSTRUCTION_OPTION_FALLBACK_LABEL =
  "Selected construction option";

const getConstructionPresentation = (
  construction: GarmentConstructionPricingResolution | undefined,
  catalogInspection: CustomDetailCatalogInspection,
): { label: string; selectionIsResolved: boolean } => {
  if (!construction || construction.status !== "resolved" || construction.components.length === 0) {
    return {
      label: CONSTRUCTION_OPTION_FALLBACK_LABEL,
      selectionIsResolved: false,
    };
  }
  const labels = construction.components.map((component) => {
    const entry = catalogInspection.byOptionId.get(component.optionId);
    return entry?.lifecycleStatus === "active" && entry.option
      ? entry.option.label.trim()
      : "";
  });
  return {
    label: labels.every((label) => label.length > 0)
      ? labels.join(" + ")
      : CONSTRUCTION_OPTION_FALLBACK_LABEL,
    selectionIsResolved: true,
  };
};

/**
 * Joins the pricing engine's keyed rows to the active physical occurrences.
 * Prices always come from the pricing engine; the cents sum is only a
 * fail-closed reconciliation check for this customer-facing presentation.
 */
export const projectCustomerGarmentConstructionBreakdown = ({
  pricing,
  subjects,
  garmentTypeSelection,
  additionalGarments,
  additionalGarmentConstructions,
  catalogInspection,
  constructionSubtotal,
}: {
  pricing: Pick<
    AuthoritativeDesignPricing,
    | "baseGarmentPricingStatus"
    | "baseGarmentPriceRows"
    | "additionalGarmentPricingStatus"
    | "additionalGarmentPriceRows"
  > | null;
  subjects: readonly FutureCustomDetailPhysicalSubject[];
  garmentTypeSelection: GarmentTypeStepSelection;
  additionalGarments: readonly FabricGarmentAssignment[];
  additionalGarmentConstructions: AdditionalGarmentConstructionStateV1;
  catalogInspection: CustomDetailCatalogInspection;
  constructionSubtotal: number | null;
}): CustomerGarmentConstructionBreakdownProjection => {
  const priceBreakdown = resolveCustomerDesignPriceBreakdown(pricing);
  const baseGarmentKeys = new Set(
    garmentTypeSelection.garmentTypes.map(
      (garmentType) => createStyleBaseGarmentSpec(garmentType).key,
    ),
  );
  const additionalGarmentKeys = new Set(
    additionalGarments
      .filter(
        (assignment) =>
          assignment.sourceRole === "additional" &&
          assignment.dependencyStatus !== "orphaned",
      )
      .map((assignment) => assignment.garmentKey),
  );
  const activeOccurrences = new Map<
    string,
    Pick<FutureCustomDetailPhysicalSubject, "parentGarmentKey" | "parentGarmentType">
  >();
  let occurrenceMetadataIsValid = true;
  subjects.forEach((subject) => {
    const existing = activeOccurrences.get(subject.parentGarmentKey);
    if (existing && existing.parentGarmentType !== subject.parentGarmentType) {
      occurrenceMetadataIsValid = false;
      return;
    }
    if (!existing) {
      activeOccurrences.set(subject.parentGarmentKey, {
        parentGarmentKey: subject.parentGarmentKey,
        parentGarmentType: subject.parentGarmentType,
      });
    }
  });

  const authoritativeRows = [
    ...priceBreakdown.baseGarmentRows.map((row) => ({
      garmentKey: row.garmentKey,
      garmentType: row.garmentType,
      garmentLabel: row.label,
      role: "main" as const,
      priceCents: Math.round(row.price * 100),
    })),
    ...priceBreakdown.additionalGarmentRows.map((row) => ({
      garmentKey: row.assignmentId,
      garmentType: row.garmentType,
      garmentLabel: row.label,
      role: "additional" as const,
      priceCents: Math.round(row.price * 100),
    })),
  ];
  const authoritativeRowsByKey = new Map<string, typeof authoritativeRows>();
  authoritativeRows.forEach((row) => {
    authoritativeRowsByKey.set(row.garmentKey, [
      ...(authoritativeRowsByKey.get(row.garmentKey) || []),
      row,
    ]);
  });

  const candidateRows = [...activeOccurrences.values()].map((occurrence) => {
    const role = baseGarmentKeys.has(occurrence.parentGarmentKey)
      ? ("main" as const)
      : additionalGarmentKeys.has(occurrence.parentGarmentKey)
        ? ("additional" as const)
        : null;
    const construction = role === "main"
      ? garmentTypeSelection.constructionByGarment[occurrence.parentGarmentType]
      : role === "additional"
        ? additionalGarmentConstructions.byGarmentKey[occurrence.parentGarmentKey]
        : undefined;
    const matchingRows = authoritativeRowsByKey.get(occurrence.parentGarmentKey) || [];
    const authoritativeRow = matchingRows.length === 1 ? matchingRows[0] : null;
    const exactMatch =
      authoritativeRow !== null &&
      role === authoritativeRow.role &&
      occurrence.parentGarmentType === authoritativeRow.garmentType &&
      Number.isInteger(authoritativeRow.priceCents) &&
      authoritativeRow.priceCents >= 0;
    const constructionPresentation = getConstructionPresentation(
      construction,
      catalogInspection,
    );

    return {
      garmentKey: occurrence.parentGarmentKey,
      garmentLabel:
        authoritativeRow?.garmentLabel.trim() ||
        getFabricGarmentLabel(occurrence.parentGarmentType),
      constructionLabel: constructionPresentation.label,
      role,
      priceCents: exactMatch ? authoritativeRow.priceCents : null,
      exactMatch,
      constructionSelectionIsResolved:
        constructionPresentation.selectionIsResolved,
    };
  });
  const activeKeys = new Set(activeOccurrences.keys());
  const authoritativeKeys = new Set(authoritativeRows.map((row) => row.garmentKey));
  const keySetsMatch =
    activeKeys.size === authoritativeKeys.size &&
    [...activeKeys].every((key) => authoritativeKeys.has(key));
  const authoritativeKeysAreUnique = [...authoritativeRowsByKey.values()].every(
    (rows) => rows.length === 1,
  );
  const expectedSubtotalCents =
    constructionSubtotal !== null &&
    Number.isFinite(constructionSubtotal) &&
    constructionSubtotal >= 0
      ? Math.round(constructionSubtotal * 100)
      : null;
  const displayedSubtotalCents = candidateRows.reduce(
    (total, row) => total + (row.priceCents || 0),
    0,
  );
  const status =
    pricing !== null &&
    pricing.baseGarmentPricingStatus === "resolved" &&
    pricing.additionalGarmentPricingStatus === "resolved" &&
    occurrenceMetadataIsValid &&
    keySetsMatch &&
    authoritativeKeysAreUnique &&
    candidateRows.every(
      (row) =>
        row.exactMatch &&
        row.constructionSelectionIsResolved &&
        row.role !== null,
    ) &&
    expectedSubtotalCents !== null &&
    displayedSubtotalCents === expectedSubtotalCents
      ? "complete"
      : "pending";

  return {
    status,
    rows: candidateRows.map(
      ({
        exactMatch: _exactMatch,
        constructionSelectionIsResolved: _constructionSelectionIsResolved,
        ...row
      }) => ({
        ...row,
        priceCents: status === "complete" ? row.priceCents : null,
      }),
    ),
  };
};
