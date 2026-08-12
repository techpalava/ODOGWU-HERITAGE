import type { CustomDetailParentSectionId } from "../config/GarmentDetailsConfig";
import type { FabricGarmentType } from "../types";
import type { AllowedAdditionalGarment } from "./additionalGarmentDomain";

export type InlineOptionalShortsGarmentType = Extract<
  FabricGarmentType,
  "standard_shorts" | "bum_shorts"
>;

export const INLINE_OPTIONAL_SHORTS_LABELS: Readonly<
  Record<InlineOptionalShortsGarmentType, string>
> = {
  standard_shorts: "Nikka / Standard Shorts",
  bum_shorts: "Bum Shorts",
};

const SHORTS_SECTION_BY_GARMENT: Readonly<
  Record<InlineOptionalShortsGarmentType, CustomDetailParentSectionId>
> = {
  standard_shorts: "standard_shorts",
  bum_shorts: "bum_shorts",
};

const PHYSICAL_BASE_SECTION_IDS = new Set<CustomDetailParentSectionId>([
  "shirt",
  "dress",
  "skirts",
  "trousers",
]);

export const isInlineOptionalShortsGarmentType = (
  garmentType: FabricGarmentType,
): garmentType is InlineOptionalShortsGarmentType =>
  garmentType === "standard_shorts" || garmentType === "bum_shorts";

export type InlineOptionalShortsCompositionEntry<T> =
  | { kind: "detail-section"; section: T }
  | {
      kind: "optional-shorts";
      garment: AllowedAdditionalGarment;
      detailSection?: T;
    };

/**
 * Keeps optional shorts next to their customer-facing garment anchor while
 * leaving applicability, allocation, and pricing to their existing engines.
 */
export const composeInlineOptionalShortsSections = <
  T extends { id: CustomDetailParentSectionId },
>({
  sections,
  baseSectionIds,
  allowedGarments,
}: {
  sections: readonly T[];
  baseSectionIds: readonly CustomDetailParentSectionId[];
  allowedGarments: readonly AllowedAdditionalGarment[];
}): InlineOptionalShortsCompositionEntry<T>[] => {
  const inlineGarments = allowedGarments.filter((garment) =>
    isInlineOptionalShortsGarmentType(garment.garmentType),
  );
  const inlineSectionIds = new Set(
    inlineGarments.map(
      (garment) =>
        SHORTS_SECTION_BY_GARMENT[
          garment.garmentType as InlineOptionalShortsGarmentType
      ],
    ),
  );
  const baseSections = new Set(baseSectionIds);
  const detachedInlineSections = new Map(
    sections
      .filter(
        (section) =>
          inlineSectionIds.has(section.id) && !baseSections.has(section.id),
      )
      .map((section) => [section.id, section]),
  );
  const regularSections = sections.filter(
    (section) =>
      !inlineSectionIds.has(section.id) || baseSections.has(section.id),
  );

  const getFallbackAnchorIndex = (): number => {
    for (let index = regularSections.length - 1; index >= 0; index -= 1) {
      const section = regularSections[index];
      if (
        section &&
        baseSections.has(section.id) &&
        PHYSICAL_BASE_SECTION_IDS.has(section.id)
      ) {
        return index;
      }
    }
    return regularSections.length - 1;
  };

  const getAnchorIndex = (
    garmentType: InlineOptionalShortsGarmentType,
  ): number => {
    const ownSectionId = SHORTS_SECTION_BY_GARMENT[garmentType];
    if (baseSections.has(ownSectionId)) {
      const ownSectionIndex = regularSections.findIndex(
        (section) => section.id === ownSectionId,
      );
      if (ownSectionIndex >= 0) return ownSectionIndex;
    }

    const preferredAnchors: CustomDetailParentSectionId[] =
      garmentType === "bum_shorts"
        ? ["skirts", "dress"]
        : ["trousers"];
    for (const anchor of preferredAnchors) {
      const index = regularSections.findIndex(
        (section) => section.id === anchor && baseSections.has(section.id),
      );
      if (index >= 0) return index;
    }
    return getFallbackAnchorIndex();
  };

  const rankedEntries: Array<{
    rank: number;
    entry: InlineOptionalShortsCompositionEntry<T>;
  }> = regularSections.map((section, index) => ({
    rank: index,
    entry: { kind: "detail-section", section },
  }));

  for (const garment of inlineGarments) {
    const garmentType = garment.garmentType as InlineOptionalShortsGarmentType;
    const detailSection = detachedInlineSections.get(
      SHORTS_SECTION_BY_GARMENT[garmentType],
    );
    rankedEntries.push({
      rank:
        getAnchorIndex(garmentType) +
        (garmentType === "bum_shorts" ? 0.25 : 0.5),
      entry: {
        kind: "optional-shorts",
        garment,
        ...(detailSection ? { detailSection } : {}),
      },
    });
  }

  return rankedEntries
    .sort((left, right) => left.rank - right.rank)
    .map(({ entry }) => entry);
};
