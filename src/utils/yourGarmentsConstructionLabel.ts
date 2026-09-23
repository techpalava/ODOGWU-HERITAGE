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

const isAdditionalOccurrence = (
  occurrence: Pick<PhysicalGarmentOccurrence, "garmentKey" | "sourceRole">,
): boolean =>
  occurrence.sourceRole === "additional" ||
  occurrence.garmentKey.startsWith("additional:");

/**
 * Read-only garmentKey -> Your Garments construction label.
 * Missing, ambiguous, or inactive construction data is omitted so the caller
 * keeps the existing broad occurrence label.
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

  const baseCountByType = new Map<CanonicalPhysicalGarmentType, number>();
  physicalOccurrences.forEach((occurrence) => {
    if (
      duplicatePhysicalKeys.has(occurrence.garmentKey) ||
      isAdditionalOccurrence(occurrence)
    ) {
      return;
    }
    baseCountByType.set(
      occurrence.garmentType,
      (baseCountByType.get(occurrence.garmentType) || 0) + 1,
    );
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
    if (
      !isAdditionalOccurrence(physical) &&
      (baseCountByType.get(physical.garmentType) || 0) !== 1
    ) {
      return [];
    }
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
    const exactLabel = readActiveConstructionOptionLabel(
      resolution,
      catalogInspection,
    );
    if (!exactLabel) return [];
    return [
      {
        garmentKey: occurrence.garmentKey,
        exactLabel,
        suffix: readFamilyOrdinalSuffix(
          occurrence.broadLabel,
          occurrence.garmentType,
        ),
      },
    ];
  });

  const groups = new Map<string, typeof candidates>();
  candidates.forEach((candidate) => {
    const group = groups.get(candidate.exactLabel) || [];
    group.push(candidate);
    groups.set(candidate.exactLabel, group);
  });

  const labels: Record<string, string> = {};
  groups.forEach((group, exactLabel) => {
    if (group.length === 1) {
      const only = group[0];
      if (only) labels[only.garmentKey] = exactLabel;
      return;
    }
    const displayLabels = group.map((candidate) =>
      candidate.suffix === null ? null : `${exactLabel}${candidate.suffix}`,
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
