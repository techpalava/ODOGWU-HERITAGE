import type {
  CanonicalPhysicalGarmentType,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  DesignSelections,
  GarmentConstructionPriceComponent,
  GarmentConstructionPricingResolution,
  GarmentConstructionSelectionMode,
  GarmentTypeStepSelection,
} from "../types";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import {
  getCustomDetailSelectionOptionIds,
  isClothingPriceSelectionGroup,
  normalizeCustomDetailCatalog,
  type ApplicableCustomDetailGroup,
} from "./catalogHelpers";
import { reconcileGarmentTypeStepSelection } from "./garmentTypeStepState";

export const LEGACY_GARMENT_CONSTRUCTION_SELECTION_MODE =
  "legacy_custom_details" as const;

export const normalizeGarmentConstructionSelectionMode = (
  value: unknown,
): GarmentConstructionSelectionMode =>
  value === "garment_type_locked"
    ? "garment_type_locked"
    : LEGACY_GARMENT_CONSTRUCTION_SELECTION_MODE;

export const isGarmentBaseConstructionSelectionGroup = (
  group: CustomDetailSelectionGroup,
): boolean => isClothingPriceSelectionGroup(group);

export interface GarmentConstructionSummaryRow {
  garmentType: CanonicalPhysicalGarmentType;
  garmentLabel: string;
  label: string;
  sourceLabel: "Included from Garment Type";
  priceCents: number;
  price: number;
  components: GarmentConstructionPriceComponent[];
}

export interface LockedGarmentConstructionBridge {
  mode: GarmentConstructionSelectionMode;
  reconciledSelection: GarmentTypeStepSelection | null;
  cleanedSelections: DesignSelections;
  lockedSelectionGroups: CustomDetailSelectionGroup[];
  lockedConstructionSelections: GarmentConstructionPricingResolution[];
  readOnlyConstructionRows: GarmentConstructionSummaryRow[];
  unresolvedGarmentTypes: CanonicalPhysicalGarmentType[];
  removedStaleOptionIds: string[];
}

const deduplicateGarmentComponents = (
  components: readonly GarmentConstructionPriceComponent[],
): GarmentConstructionPriceComponent[] => [
  ...new Map(
    components.map((component) => [
      `${component.selectionGroup}:${component.optionId}`,
      component,
    ]),
  ).values(),
];

export const cleanupLockedGarmentConstructionSelections = (
  selections: DesignSelections,
  lockedSelectionGroups: readonly CustomDetailSelectionGroup[],
): { selections: DesignSelections; removedOptionIds: string[] } => {
  const lockedBaseGroups = new Set(
    lockedSelectionGroups.filter(isGarmentBaseConstructionSelectionGroup),
  );
  const removedOptionIds: string[] = [];
  const nextCustomDetails: NonNullable<DesignSelections["customDetails"]> = {};

  for (const [rawGroup, selection] of Object.entries(
    selections.customDetails || {},
  )) {
    const group = rawGroup as CustomDetailSelectionGroup;
    if (lockedBaseGroups.has(group)) {
      removedOptionIds.push(...getCustomDetailSelectionOptionIds(selection));
      continue;
    }
    nextCustomDetails[group] = selection;
  }

  const nextSnapshots = selections.customDetailSnapshots?.filter((snapshot) => {
    if (!lockedBaseGroups.has(snapshot.selectionGroup)) return true;
    removedOptionIds.push(snapshot.optionId);
    return false;
  });

  return {
    selections: {
      ...selections,
      ...(selections.customDetails
        ? { customDetails: nextCustomDetails }
        : {}),
      ...(selections.customDetailSnapshots
        ? { customDetailSnapshots: nextSnapshots }
        : {}),
    },
    removedOptionIds: [...new Set(removedOptionIds)],
  };
};

export const resolveLockedGarmentConstructionBridge = ({
  mode,
  garmentTypeSelection,
  catalog,
  selections,
}: {
  mode?: unknown;
  garmentTypeSelection?: unknown;
  catalog: readonly CustomDetailOption[];
  selections: DesignSelections;
}): LockedGarmentConstructionBridge => {
  const normalizedMode = normalizeGarmentConstructionSelectionMode(mode);
  if (normalizedMode === LEGACY_GARMENT_CONSTRUCTION_SELECTION_MODE) {
    return {
      mode: normalizedMode,
      reconciledSelection: null,
      cleanedSelections: selections,
      lockedSelectionGroups: [],
      lockedConstructionSelections: [],
      readOnlyConstructionRows: [],
      unresolvedGarmentTypes: [],
      removedStaleOptionIds: [],
    };
  }

  const normalizedCatalog = normalizeCustomDetailCatalog(catalog);
  const reconciliation = reconcileGarmentTypeStepSelection({
    persistedSelection: garmentTypeSelection,
    normalizedCustomDetailCatalog: normalizedCatalog,
  });
  const resolutions = reconciliation.selection.garmentTypes.flatMap(
    (garmentType) => {
      const resolution =
        reconciliation.selection.constructionByGarment[garmentType];
      return resolution ? [resolution] : [];
    },
  );
  const lockedSelectionGroups = new Set<CustomDetailSelectionGroup>();
  resolutions.forEach((resolution) => {
    if (resolution.status === "resolved") {
      resolution.components.forEach((component) =>
        lockedSelectionGroups.add(component.selectionGroup),
      );
    } else if (resolution.selectionGroup) {
      lockedSelectionGroups.add(resolution.selectionGroup);
    }
  });

  const readOnlyConstructionRows = resolutions.flatMap((resolution) => {
    if (resolution.status !== "resolved") return [];
    const components = deduplicateGarmentComponents(resolution.components);
    const priceCents = components.reduce(
      (total, component) => total + component.priceCents,
      0,
    );
    const garmentLabel = getFabricGarmentLabel(resolution.garmentType);
    return [
      {
        garmentType: resolution.garmentType,
        garmentLabel,
        label: `${garmentLabel} construction`,
        sourceLabel: "Included from Garment Type" as const,
        priceCents,
        price: priceCents / 100,
        components,
      },
    ];
  });
  const cleaned = cleanupLockedGarmentConstructionSelections(
    selections,
    [...lockedSelectionGroups],
  );

  return {
    mode: normalizedMode,
    reconciledSelection: reconciliation.selection,
    cleanedSelections: cleaned.selections,
    lockedSelectionGroups: [...lockedSelectionGroups],
    lockedConstructionSelections: resolutions,
    readOnlyConstructionRows,
    unresolvedGarmentTypes: reconciliation.unresolvedGarmentTypes,
    removedStaleOptionIds: cleaned.removedOptionIds,
  };
};

export interface GarmentConstructionCustomDetailsProjection
  extends LockedGarmentConstructionBridge {
  editableGroups: readonly ApplicableCustomDetailGroup[];
  remainingValidSelections: DesignSelections;
  requiredEditableGroups: readonly CustomDetailSelectionGroup[];
  missingRequiredGroups: readonly CustomDetailSelectionGroup[];
  completionBlockers: readonly CanonicalPhysicalGarmentType[];
  isComplete: boolean;
}

export const projectGarmentConstructionCustomDetails = ({
  mode,
  garmentTypeSelection,
  catalog,
  applicableGroups,
  requiredSelectionGroups,
  selections,
}: {
  mode?: unknown;
  garmentTypeSelection?: unknown;
  catalog: readonly CustomDetailOption[];
  applicableGroups: readonly ApplicableCustomDetailGroup[];
  requiredSelectionGroups: readonly CustomDetailSelectionGroup[];
  selections: DesignSelections;
}): GarmentConstructionCustomDetailsProjection => {
  const bridge = resolveLockedGarmentConstructionBridge({
    mode,
    garmentTypeSelection,
    catalog,
    selections,
  });
  const lockedGroups = new Set(bridge.lockedSelectionGroups);
  const editableGroups =
    bridge.mode === LEGACY_GARMENT_CONSTRUCTION_SELECTION_MODE
      ? applicableGroups
      : applicableGroups.filter((group) => !lockedGroups.has(group.id));
  const requiredEditableGroups =
    bridge.mode === LEGACY_GARMENT_CONSTRUCTION_SELECTION_MODE
      ? requiredSelectionGroups
      : requiredSelectionGroups.filter((group) => !lockedGroups.has(group));
  const editableOptionsByGroup = new Map(
    editableGroups.map((group) => [
      group.id,
      new Set(group.options.map((option) => option.id)),
    ]),
  );
  const remainingValidSelections =
    bridge.mode === LEGACY_GARMENT_CONSTRUCTION_SELECTION_MODE
      ? bridge.cleanedSelections
      : {
          ...bridge.cleanedSelections,
          ...(bridge.cleanedSelections.customDetails
            ? {
                customDetails: Object.fromEntries(
                  Object.entries(bridge.cleanedSelections.customDetails).flatMap(
                    ([rawGroup, selection]) => {
                      const group = rawGroup as CustomDetailSelectionGroup;
                      const allowedOptions = editableOptionsByGroup.get(group);
                      if (!allowedOptions) return [];
                      const validOptionIds =
                        getCustomDetailSelectionOptionIds(selection).filter(
                          (optionId) => allowedOptions.has(optionId),
                        );
                      if (validOptionIds.length === 0) return [];
                      return [
                        [
                          group,
                          Array.isArray(selection)
                            ? validOptionIds
                            : validOptionIds[0],
                        ],
                      ];
                    },
                  ),
                ),
              }
            : {}),
          ...(bridge.cleanedSelections.customDetailSnapshots
            ? {
                customDetailSnapshots:
                  bridge.cleanedSelections.customDetailSnapshots.filter(
                    (snapshot) =>
                      editableOptionsByGroup
                        .get(snapshot.selectionGroup)
                        ?.has(snapshot.optionId) === true,
                  ),
              }
            : {}),
        };
  const missingRequiredGroups = requiredEditableGroups.filter(
    (group) =>
      getCustomDetailSelectionOptionIds(
        remainingValidSelections.customDetails?.[group],
      ).length === 0,
  );

  return {
    ...bridge,
    editableGroups,
    remainingValidSelections,
    requiredEditableGroups,
    missingRequiredGroups,
    completionBlockers: bridge.unresolvedGarmentTypes,
    isComplete:
      missingRequiredGroups.length === 0 &&
      bridge.unresolvedGarmentTypes.length === 0,
  };
};
