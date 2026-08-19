import {
  ADDITIONAL_CLOTHES_COST_SECTION_ORDER,
  CUSTOM_DETAIL_SELECTION_GROUP_SUMMARY_TITLE,
  type CustomDetailParentSectionId,
} from "../config/GarmentDetailsConfig";
import { resolveAdditionalGarmentPolicyCandidates } from "../config/AdditionalGarmentPolicy";
import {
  applyLegacyStyleFabricCapacityConfig,
  createStyleBaseGarmentSpec,
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

const CORE_GROUPS_BY_PARENT_SECTION: Readonly<
  Record<Exclude<CustomDetailParentSectionId, "additional_garment">, readonly CustomDetailSelectionGroup[]>
> = {
  shirt: ["shirt_construction", "shirt_pockets"],
  dress: ["dress_construction", "dress_pockets"],
  neck: ["neck_design"],
  standard_shorts: ["standard_shorts_fastening", "standard_shorts_pockets"],
  bum_shorts: ["bum_shorts_fastening", "bum_shorts_pockets"],
  trousers: ["trouser_fastening", "trouser_pockets"],
  skirts: ["skirt_length", "skirt_pockets"],
};

const PARENT_SECTIONS_BY_GARMENT: Readonly<
  Record<CanonicalPhysicalGarmentType, readonly Exclude<CustomDetailParentSectionId, "additional_garment">[]>
> = {
  shirt: ["shirt", "neck"],
  trouser: ["trousers"],
  skirt: ["skirts"],
  standard_shorts: ["standard_shorts"],
  bum_shorts: ["bum_shorts"],
  dress: ["dress", "neck"],
  kaftan: ["shirt", "neck"],
  full_length_gown: ["dress", "neck"],
  agbada: ["shirt", "neck", "trousers"],
};

const ADDITIONAL_COST_PARENT_SECTION: Readonly<
  Record<(typeof ADDITIONAL_CLOTHES_COST_SECTION_ORDER)[number], Exclude<CustomDetailParentSectionId, "additional_garment"> | "personalized">
> = {
  shirt_additional: "shirt",
  dress_additional: "dress",
  neck_additional: "neck",
  trouser_additional: "trousers",
  standard_shorts_additional: "standard_shorts",
  bum_shorts_additional: "bum_shorts",
  skirt_additional: "skirts",
  personalized_additional: "personalized",
};

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

export const filterCatalogueGroupOccurrences = (
  group: FutureCustomDetailsCatalogueGroup,
  predicate: (occurrence: FutureCustomDetailsCatalogueOccurrence) => boolean,
): FutureCustomDetailsCatalogueGroup | null => {
  const occurrences = group.occurrences.filter(predicate);
  return occurrences.length > 0 ? { ...group, occurrences } : null;
};

export const partitionCatalogueGroupsByRole = (
  groups: readonly FutureCustomDetailsCatalogueGroup[],
  role: FutureCustomDetailsCatalogueOccurrence["role"],
  parentGarmentKey?: string,
): FutureCustomDetailsCatalogueGroup[] =>
  groups.flatMap((group) => {
    const next = filterCatalogueGroupOccurrences(
      group,
      (occurrence) =>
        occurrence.role === role &&
        (parentGarmentKey === undefined ||
          occurrence.subject.parentGarmentKey === parentGarmentKey),
    );
    return next ? [next] : [];
  });

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

const getRelevantParentSectionOrder = ({
  garmentTypeSelection,
  style,
  additionalGarments,
}: {
  garmentTypeSelection: GarmentTypeStepSelection;
  style?: StyleCategory | null;
  additionalGarments: readonly FabricGarmentAssignment[];
}): Exclude<CustomDetailParentSectionId, "additional_garment">[] => {
  const normalizedStyle = style
    ? applyLegacyStyleFabricCapacityConfig(style)
    : null;
  const styleComposition = getStyleBaseFabricCapacityComposition(normalizedStyle)
    .filter(
      (spec): spec is typeof spec & { garmentType: CanonicalPhysicalGarmentType } =>
        spec.garmentType !== "other",
    );
  const selectedTypes = getSelectedParentGarmentOrder({
    garmentTypeSelection,
    style,
  });
  const activeAdditionalTypes = additionalGarments.flatMap((assignment) =>
    assignment.sourceRole === "additional" &&
    assignment.dependencyStatus !== "orphaned" &&
    assignment.garmentType !== "other"
      ? [assignment.garmentType as CanonicalPhysicalGarmentType]
      : [],
  );
  const baseComposition = styleComposition.length > 0
    ? styleComposition
    : garmentTypeSelection.garmentTypes.map(createStyleBaseGarmentSpec);
  const policyTypes = resolveAdditionalGarmentPolicyCandidates(
    baseComposition,
    normalizedStyle,
  ).flatMap((candidate) =>
    candidate.garmentType === "other"
      ? []
      : [candidate.garmentType as CanonicalPhysicalGarmentType],
  );
  const orderedGarmentTypes = [
    ...new Set([
      ...selectedTypes,
      ...styleComposition.map((spec) => spec.garmentType),
      ...activeAdditionalTypes,
    ]),
  ];
  const orderedSections = orderedGarmentTypes.flatMap(
    (garmentType) => PARENT_SECTIONS_BY_GARMENT[garmentType],
  );

  const insertPolicySection = (
    section: "standard_shorts" | "bum_shorts",
    anchor: "trousers" | "skirts",
  ) => {
    if (!policyTypes.includes(section === "standard_shorts" ? "standard_shorts" : "bum_shorts")) {
      return;
    }
    const existingIndex = orderedSections.indexOf(section);
    if (existingIndex >= 0) orderedSections.splice(existingIndex, 1);
    const anchorIndex = orderedSections.lastIndexOf(anchor);
    orderedSections.splice(anchorIndex >= 0 ? anchorIndex + 1 : orderedSections.length, 0, section);
  };

  insertPolicySection("bum_shorts", "skirts");
  insertPolicySection("standard_shorts", "trousers");
  policyTypes.forEach((garmentType) => {
    PARENT_SECTIONS_BY_GARMENT[garmentType].forEach((section) => {
      if (!orderedSections.includes(section)) orderedSections.push(section);
    });
  });
  return [...new Set(orderedSections)];
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
  const relevantParentSections = getRelevantParentSectionOrder({
    garmentTypeSelection,
    style,
    additionalGarments,
  });
  const coreOrder = relevantParentSections.flatMap(
    (section) => CORE_GROUPS_BY_PARENT_SECTION[section],
  );
  const relevantParentSectionSet = new Set(relevantParentSections);
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
      (group) =>
        group !== "personalized_additional" &&
        relevantParentSectionSet.has(
          ADDITIONAL_COST_PARENT_SECTION[group] as Exclude<
            CustomDetailParentSectionId,
            "additional_garment"
          >,
        ),
    ).map(makeGroup),
    personalizedGroup: makeGroup("personalized_additional"),
    activeParentGarmentOrder,
  };
};
