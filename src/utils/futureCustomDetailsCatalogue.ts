import {
  ADDITIONAL_CLOTHES_COST_SECTION_ORDER,
  CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE,
} from "../config/GarmentDetailsConfig";
import {
  applyLegacyStyleFabricCapacityConfig,
  getStyleBaseFabricCapacityComposition,
} from "../config/StyleFabricCapacityConfig";
import type {
  AdditionalGarmentConstructionStateV1,
  CanonicalPhysicalGarmentType,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  FabricGarmentAssignment,
  GarmentConstructionPricingResolution,
  GarmentTypeStepSelection,
  StyleCategory,
} from "../types";
import { sortCustomDetailOptions } from "./catalogHelpers";
import type {
  FutureCustomDetailPhysicalSubject,
  GarmentScopedCustomDetailsReconciliationResult,
} from "./garmentScopedCustomDetailsDomain";
import { getGarmentTypeSelectedDemographics } from "./garmentTypeStepState";

export const CUSTOM_DETAILS_CORE_SECTION_ORDER = [
  "shirt_construction",
  "shirt_pockets",
  "dress_construction",
  "dress_pockets",
  "neck_design",
  "standard_shorts_fastening",
  "standard_shorts_pockets",
  "bum_shorts_fastening",
  "bum_shorts_pockets",
  "trouser_fastening",
  "trouser_pockets",
  "skirt_length",
  "skirt_pockets",
] as const satisfies readonly CustomDetailSelectionGroup[];

export const CUSTOM_DETAILS_CONSTRUCTION_GROUPS = new Set<
  CustomDetailSelectionGroup
>([
  "shirt_construction",
  "dress_construction",
  "standard_shorts_fastening",
  "bum_shorts_fastening",
  "trouser_fastening",
  "skirt_length",
]);

const PRIMARY_GROUPS_BY_GARMENT: Readonly<
  Record<CanonicalPhysicalGarmentType, readonly CustomDetailSelectionGroup[]>
> = {
  shirt: ["shirt_construction", "shirt_pockets"],
  trouser: ["trouser_fastening", "trouser_pockets"],
  skirt: ["skirt_length", "skirt_pockets"],
  standard_shorts: [
    "standard_shorts_fastening",
    "standard_shorts_pockets",
  ],
  bum_shorts: ["bum_shorts_fastening", "bum_shorts_pockets"],
  dress: ["dress_construction", "dress_pockets"],
  kaftan: ["shirt_construction", "shirt_pockets"],
  full_length_gown: ["dress_construction", "dress_pockets"],
  agbada: [
    "shirt_construction",
    "shirt_pockets",
    "trouser_fastening",
    "trouser_pockets",
  ],
};

export interface FutureCustomDetailsCatalogueOccurrence {
  subject: FutureCustomDetailPhysicalSubject;
  role: "main" | "additional";
  construction: GarmentConstructionPricingResolution | null;
}

export interface FutureCustomDetailsCatalogueGroup {
  selectionGroup: CustomDetailSelectionGroup;
  title: string;
  options: readonly CustomDetailOption[];
  occurrences: readonly FutureCustomDetailsCatalogueOccurrence[];
  isConstruction: boolean;
  allowMultiple: boolean;
}

export interface FutureCustomDetailsCatalogueProjection {
  coreGroups: readonly FutureCustomDetailsCatalogueGroup[];
  additionalCostGroups: readonly FutureCustomDetailsCatalogueGroup[];
  personalizedGroup: FutureCustomDetailsCatalogueGroup;
  activeParentGarmentOrder: readonly CanonicalPhysicalGarmentType[];
}

const getSelectedParentGarmentOrder = ({
  garmentTypeSelection,
  style,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  style?: StyleCategory | null;
}): CanonicalPhysicalGarmentType[] => {
  const selected = new Set(garmentTypeSelection.garmentTypes);
  const styleOrder = style
    ? getStyleBaseFabricCapacityComposition(
        applyLegacyStyleFabricCapacityConfig(style),
      )
        .map((spec) => spec.garmentType)
        .filter(
          (garmentType): garmentType is CanonicalPhysicalGarmentType =>
            garmentType !== "other" && selected.has(garmentType),
        )
    : [];
  const ordered = [
    ...new Set([
      ...styleOrder,
      ...garmentTypeSelection.garmentTypes,
    ]),
  ];
  if (
    getGarmentTypeSelectedDemographics(garmentTypeSelection).includes(
      "unisex",
    ) &&
    ordered.includes("trouser")
  ) {
    return ["trouser", ...ordered.filter((type) => type !== "trouser")];
  }
  return ordered;
};

const getConstructionForSubject = ({
  subject,
  garmentTypeSelection,
  additionalGarmentConstructions,
}: {
  subject: FutureCustomDetailPhysicalSubject;
  garmentTypeSelection: GarmentTypeStepSelection;
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
}): GarmentConstructionPricingResolution | null =>
  subject.parentGarmentKey.startsWith("base:")
    ? garmentTypeSelection.constructionByGarment[
        subject.parentGarmentType
      ] || null
    : additionalGarmentConstructions?.byGarmentKey[
        subject.parentGarmentKey
      ] || null;

export const projectFutureCustomDetailsCatalogue = ({
  garmentTypeSelection,
  style,
  reconciliation,
  activeOptions,
  additionalGarments,
  additionalGarmentConstructions,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  style?: StyleCategory | null;
  reconciliation: GarmentScopedCustomDetailsReconciliationResult;
  activeOptions: readonly CustomDetailOption[];
  additionalGarments: readonly FabricGarmentAssignment[];
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
}): FutureCustomDetailsCatalogueProjection => {
  const activeParentGarmentOrder = getSelectedParentGarmentOrder({
    garmentTypeSelection,
    style,
  });
  const promotedGroups = activeParentGarmentOrder.flatMap(
    (garmentType) => PRIMARY_GROUPS_BY_GARMENT[garmentType],
  );
  const coreOrder = [
    ...new Set([
      ...promotedGroups,
      ...CUSTOM_DETAILS_CORE_SECTION_ORDER,
    ]),
  ];
  const additionalRoleByKey = new Set(
    additionalGarments
      .filter((assignment) => assignment.sourceRole === "additional")
      .map((assignment) => assignment.garmentKey),
  );
  const makeGroup = (
    selectionGroup: CustomDetailSelectionGroup,
  ): FutureCustomDetailsCatalogueGroup => {
    const options = sortCustomDetailOptions(
      activeOptions.filter(
        (option) =>
          option.active && option.selectionGroup === selectionGroup,
      ),
    );
    const occurrences = reconciliation.subjects.flatMap((subject) => {
      const ownsGroup = CUSTOM_DETAILS_CONSTRUCTION_GROUPS.has(selectionGroup)
        ? subject.lockedSelectionGroups.includes(selectionGroup)
        : reconciliation.applicabilityByGarmentKey
            .get(subject.garmentKey)
            ?.groups.some((group) => group.selectionGroup === selectionGroup) ===
          true;
      if (!ownsGroup) return [];
      return [
        {
          subject,
          role: additionalRoleByKey.has(subject.parentGarmentKey)
            ? ("additional" as const)
            : ("main" as const),
          construction: getConstructionForSubject({
            subject,
            garmentTypeSelection,
            additionalGarmentConstructions,
          }),
        },
      ];
    });
    return {
      selectionGroup,
      title: CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE[selectionGroup],
      options,
      occurrences,
      isConstruction: CUSTOM_DETAILS_CONSTRUCTION_GROUPS.has(selectionGroup),
      allowMultiple: options.some((option) => option.allowMultiple),
    };
  };

  return {
    coreGroups: coreOrder.map(makeGroup),
    additionalCostGroups: ADDITIONAL_CLOTHES_COST_SECTION_ORDER.filter(
      (group) => group !== "personalized_additional",
    ).map(makeGroup),
    personalizedGroup: makeGroup("personalized_additional"),
    activeParentGarmentOrder,
  };
};
