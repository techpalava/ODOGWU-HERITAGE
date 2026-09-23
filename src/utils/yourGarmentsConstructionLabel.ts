import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import type {
  AdditionalGarmentConstructionStateV1,
  CanonicalPhysicalGarmentType,
  GarmentConstructionPricingResolution,
  GarmentTypeStepSelection,
} from "../types";
import type { CustomDetailCatalogInspection } from "./catalogHelpers";
import {
  resolveOccurrenceConstruction,
  type PhysicalGarmentOccurrence,
} from "./designSourceState";
import { CUSTOM_DETAILS_CONSTRUCTION_GROUPS } from "./futureCustomDetailsCatalogue";
import { getStep1GarmentDisplayLabel } from "./garmentConstructionPricing";

export interface YourGarmentsConstructionLabelOccurrence {
  readonly garmentKey: string;
  readonly garmentType: CanonicalPhysicalGarmentType;
  readonly broadLabel: string;
}

export interface ProjectYourGarmentsConstructionDisplayLabelsInput {
  readonly presentationOccurrences: readonly YourGarmentsConstructionLabelOccurrence[];
  readonly physicalOccurrences: readonly Pick<
    PhysicalGarmentOccurrence,
    "garmentKey" | "garmentType" | "sourceRole"
  >[];
  readonly garmentTypeSelection: GarmentTypeStepSelection;
  readonly additionalGarmentConstructionState?: AdditionalGarmentConstructionStateV1 | null;
  readonly catalogInspection: CustomDetailCatalogInspection;
}

/**
 * Reads the family ordinal already encoded in the broad occurrence label.
 * "Shirt" -> ""; "Shirt 2" -> " 2". Returns null when the broad label does
 * not use that existing pattern.
 */
const readFamilyOrdinalSuffix = (
  broadLabel: string,
  garmentType: CanonicalPhysicalGarmentType,
): string | null => {
  const familyLabel = getFabricGarmentLabel(garmentType);
  if (broadLabel === familyLabel) return "";
  const prefix = `${familyLabel} `;
  if (!broadLabel.startsWith(prefix)) return null;
  const ordinal = broadLabel.slice(prefix.length);
  if (!/^[1-9][0-9]*$/.test(ordinal)) return null;
  return ` ${ordinal}`;
};

const readActiveConstructionOptionLabel = (
  resolution: GarmentConstructionPricingResolution | undefined,
  catalogInspection: CustomDetailCatalogInspection,
): string | null => {
  if (!resolution || resolution.status !== "resolved") return null;
  const constructionComponents = resolution.components.filter((component) =>
    CUSTOM_DETAILS_CONSTRUCTION_GROUPS.has(component.selectionGroup),
  );
  if (constructionComponents.length !== 1) return null;
  const component = constructionComponents[0];
  if (!component) return null;
  const entry = catalogInspection.byOptionId.get(component.optionId);
  if (!entry || entry.lifecycleStatus !== "active" || !entry.option) return null;
  if (
    entry.option.id !== component.optionId ||
    entry.option.selectionGroup !== component.selectionGroup
  ) {
    return null;
  }
  const label = entry.option.label.trim();
  return label.length > 0 ? label : null;
};

/**
 * Read-only garmentKey -> Your Garments concise variant name.
 * The name is the Step 1 display label of the physical garment type.
 * Missing or inactive construction data is omitted so the caller keeps the
 * existing broad occurrence label. Repeated occurrences of one variant stay
 * distinguishable through the ordinal already present on the broad label.
 */
export const projectYourGarmentsConstructionDisplayLabels = ({
  presentationOccurrences,
  physicalOccurrences,
  garmentTypeSelection,
  additionalGarmentConstructionState = null,
  catalogInspection,
}: ProjectYourGarmentsConstructionDisplayLabelsInput): Readonly<
  Record<string, string>
> => {
  const physicalByKey = new Map<
    string,
    Pick<PhysicalGarmentOccurrence, "garmentKey" | "garmentType" | "sourceRole">
  >();
  const duplicatePhysicalKeys = new Set<string>();
  physicalOccurrences.forEach((occurrence) => {
    if (physicalByKey.has(occurrence.garmentKey)) {
      duplicatePhysicalKeys.add(occurrence.garmentKey);
    }
    physicalByKey.set(occurrence.garmentKey, occurrence);
  });

  const presentationCountByKey = new Map<string, number>();
  presentationOccurrences.forEach((occurrence) => {
    presentationCountByKey.set(
      occurrence.garmentKey,
      (presentationCountByKey.get(occurrence.garmentKey) || 0) + 1,
    );
  });

  const candidates = presentationOccurrences.flatMap((occurrence) => {
    if ((presentationCountByKey.get(occurrence.garmentKey) || 0) !== 1) {
      return [];
    }
    if (duplicatePhysicalKeys.has(occurrence.garmentKey)) return [];
    const physical = physicalByKey.get(occurrence.garmentKey);
    if (!physical || physical.garmentType !== occurrence.garmentType) return [];
    const resolution = resolveOccurrenceConstruction({
      garmentKey: physical.garmentKey,
      garmentType: physical.garmentType,
      sourceRole: physical.sourceRole,
      garmentTypeSelection,
      additionalGarmentConstructionState,
    });
    if (
      resolution?.status === "resolved" &&
      resolution.garmentType !== physical.garmentType
    ) {
      return [];
    }
    if (!readActiveConstructionOptionLabel(resolution, catalogInspection)) {
      return [];
    }
    return [
      {
        garmentKey: occurrence.garmentKey,
        conciseLabel: getStep1GarmentDisplayLabel(physical.garmentType),
        suffix: readFamilyOrdinalSuffix(
          occurrence.broadLabel,
          occurrence.garmentType,
        ),
      },
    ];
  });

  const groups = new Map<string, typeof candidates>();
  candidates.forEach((candidate) => {
    const group = groups.get(candidate.conciseLabel) || [];
    group.push(candidate);
    groups.set(candidate.conciseLabel, group);
  });

  const labels: Record<string, string> = {};
  groups.forEach((group, conciseLabel) => {
    if (group.length === 1) {
      const only = group[0];
      if (only) labels[only.garmentKey] = conciseLabel;
      return;
    }
    const displayLabels = group.map((candidate) =>
      candidate.suffix === null ? null : `${conciseLabel}${candidate.suffix}`,
    );
    if (
      displayLabels.some((label) => !label) ||
      new Set(displayLabels).size !== displayLabels.length
    ) {
      return;
    }
    group.forEach((candidate, index) => {
      const displayLabel = displayLabels[index];
      if (displayLabel) labels[candidate.garmentKey] = displayLabel;
    });
  });
  return labels;
};
