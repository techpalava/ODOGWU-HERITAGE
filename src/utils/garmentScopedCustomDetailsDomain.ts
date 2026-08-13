import type {
  CanonicalPhysicalGarmentType,
  CustomDetailDemographic,
  CustomDetailGarmentGroup,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  GarmentScopedCustomDetailSelection,
  GarmentScopedCustomDetailInputsV1,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  StyleCategory,
} from "../types";
import {
  ALL_CUSTOM_DETAIL_SELECTION_GROUPS,
} from "../config/GarmentDetailsConfig";
import {
  createStyleBaseGarmentSpec,
} from "../config/StyleFabricCapacityConfig";
import {
  resolveCustomDetailPhysicalComponents,
} from "../config/CustomDetailPhysicalComponentConfig";
import {
  type CustomDetailCatalogInspection,
  type ProvenanceAwareCustomDetailCatalogEntry,
  isClothingPriceSelectionGroup,
  sortCustomDetailOptions,
} from "./catalogHelpers";
import { normalizePersistedGarmentTypeStepSelection } from "./garmentTypeStepState";
import {
  createEmptyGarmentScopedCustomDetailsState,
  enumerateGarmentScopedCustomDetails,
  normalizeGarmentScopedCustomDetailsState,
  setGarmentScopedCustomDetailSelection,
  setGarmentScopedCustomDetailSnapshot,
} from "./garmentScopedCustomDetailsState";
import {
  enumerateGarmentScopedCustomDetailInputs,
  normalizeGarmentScopedCustomDetailInputs,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  retainGarmentScopedCustomDetailInputIdentities,
  validateGarmentScopedCustomDetailText,
} from "./garmentScopedCustomDetailInputsState";

const FUTURE_CUSTOM_DETAIL_GARMENT_ORDER: readonly CanonicalPhysicalGarmentType[] = [
  "shirt",
  "trouser",
  "standard_shorts",
  "skirt",
  "bum_shorts",
  "dress",
  "kaftan",
  "full_length_gown",
  "agbada",
];

const GARMENT_ORDER = new Map(
  FUTURE_CUSTOM_DETAIL_GARMENT_ORDER.map((garmentType, index) => [
    garmentType,
    (index + 1) * 100,
  ]),
);
const SELECTION_GROUP_ORDER = new Map(
  ALL_CUSTOM_DETAIL_SELECTION_GROUPS.map((group, index) => [group, index]),
);
const CONSTRUCTION_GROUP_GARMENT_GROUP: Readonly<
  Partial<Record<CustomDetailSelectionGroup, CustomDetailGarmentGroup>>
> = {
  shirt_construction: "shirt",
  dress_construction: "dress",
  standard_shorts_fastening: "standard_shorts",
  bum_shorts_fastening: "bum_shorts",
  trouser_fastening: "trousers",
  skirt_length: "skirt",
};

const compareSelectionGroups = (
  left: CustomDetailSelectionGroup,
  right: CustomDetailSelectionGroup,
): number =>
  (SELECTION_GROUP_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
    (SELECTION_GROUP_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER) ||
  left.localeCompare(right);

const getSelectionOptionIds = (
  selection: GarmentScopedCustomDetailSelection,
): string[] => (Array.isArray(selection) ? [...selection] : [selection]);

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

export type GarmentScopedCustomDetailsDomainDiagnosticCode =
  | "missing_demographic"
  | "unsupported_physical_garment"
  | "invalid_physical_component_configuration"
  | "demographic_mismatch"
  | "construction_unresolved"
  | "style_custom_details_disabled"
  | "garment_removed"
  | "group_locked_by_garment_type"
  | "group_no_longer_applicable"
  | "option_disabled"
  | "option_deleted"
  | "option_missing"
  | "malformed_selection"
  | "malformed_catalog_option";

export type GarmentScopedPersonalizedTextDiagnosticCode =
  | "personalized_text_garment_removed"
  | "personalized_text_group_removed"
  | "personalized_text_option_deselected"
  | "personalized_text_option_deleted"
  | "personalized_text_option_disabled"
  | "personalized_text_no_longer_required"
  | "personalized_text_malformed"
  | "personalized_text_too_long";

export interface GarmentScopedPersonalizedTextDiagnostic {
  code: GarmentScopedPersonalizedTextDiagnosticCode;
  garmentKey?: string;
  selectionGroup?: CustomDetailSelectionGroup;
  optionId?: string;
}

export interface GarmentScopedCustomDetailsDomainDiagnostic {
  code: GarmentScopedCustomDetailsDomainDiagnosticCode;
  garmentKey?: string;
  selectionGroup?: CustomDetailSelectionGroup;
  optionId?: string;
  detail?: string;
}

export interface FutureCustomDetailPhysicalSubject {
  garmentKey: string;
  parentGarmentKey: string;
  parentGarmentType: CanonicalPhysicalGarmentType;
  garmentType: CanonicalPhysicalGarmentType;
  garmentGroups: readonly CustomDetailGarmentGroup[];
  demographic: CustomDetailDemographic | null;
  order: number;
  componentOrder: number;
  lockedSelectionGroups: readonly CustomDetailSelectionGroup[];
}

export interface FutureCustomDetailPhysicalSubjectResolution {
  garmentTypeSelection: GarmentTypeStepSelection;
  subjects: FutureCustomDetailPhysicalSubject[];
  diagnostics: GarmentScopedCustomDetailsDomainDiagnostic[];
}

const resolveLockedGroupsForSubject = (
  selection: GarmentTypeStepSelection,
  parentGarmentType: CanonicalPhysicalGarmentType,
  subjectGroups: readonly CustomDetailGarmentGroup[],
): CustomDetailSelectionGroup[] => {
  const construction = selection.constructionByGarment[parentGarmentType];
  const groups =
    construction?.status === "resolved"
      ? construction.components.map((component) => component.selectionGroup)
      : construction?.selectionGroup
        ? [construction.selectionGroup]
        : [];
  return [...new Set(groups)].filter((group) => {
    if (!isClothingPriceSelectionGroup(group)) return false;
    const garmentGroup = CONSTRUCTION_GROUP_GARMENT_GROUP[group];
    return garmentGroup ? subjectGroups.includes(garmentGroup) : false;
  });
};

export const resolveFutureCustomDetailPhysicalSubjects = (
  garmentTypeSelection: unknown,
): FutureCustomDetailPhysicalSubjectResolution => {
  const selection = normalizePersistedGarmentTypeStepSelection(
    garmentTypeSelection,
  );
  const diagnostics: GarmentScopedCustomDetailsDomainDiagnostic[] = [];
  if (!selection.demographic) {
    diagnostics.push({ code: "missing_demographic" });
  }
  const selectedTypes = new Set(selection.garmentTypes);
  const subjects: FutureCustomDetailPhysicalSubject[] = [];

  FUTURE_CUSTOM_DETAIL_GARMENT_ORDER.forEach((parentGarmentType) => {
    if (!selectedTypes.has(parentGarmentType)) return;
    const parentGarmentKey = createStyleBaseGarmentSpec(parentGarmentType).key;
    const components = resolveCustomDetailPhysicalComponents({
      parentGarmentKey,
      garmentType: parentGarmentType,
    });
    if (components.status !== "resolved") {
      diagnostics.push({
        code:
          components.code === "unsupported_garment_type"
            ? "unsupported_physical_garment"
            : "invalid_physical_component_configuration",
        garmentKey: parentGarmentKey,
        detail: components.code,
      });
      return;
    }

    if (
      parentGarmentType === "bum_shorts" &&
      selection.demographic === "male"
    ) {
      diagnostics.push({
        code: "demographic_mismatch",
        garmentKey: parentGarmentKey,
        detail: "Bum Shorts require a female or unisex/family demographic.",
      });
    }
    const construction = selection.constructionByGarment[parentGarmentType];
    if (!construction || construction.status === "unresolved") {
      diagnostics.push({
        code: "construction_unresolved",
        garmentKey: parentGarmentKey,
        detail:
          construction?.status === "unresolved"
            ? construction.code
            : "missing_construction_resolution",
      });
    }

    components.components.forEach((component) => {
      const parentOrder = GARMENT_ORDER.get(parentGarmentType) || 0;
      subjects.push({
        garmentKey: component.garmentKey,
        parentGarmentKey,
        parentGarmentType,
        garmentType: component.garmentType,
        garmentGroups: [...component.garmentGroups],
        demographic: selection.demographic,
        order: parentOrder + component.order,
        componentOrder: component.order,
        lockedSelectionGroups: resolveLockedGroupsForSubject(
          selection,
          parentGarmentType,
          component.garmentGroups,
        ),
      });
    });
  });

  return {
    garmentTypeSelection: selection,
    subjects: subjects.sort(
      (left, right) =>
        left.order - right.order || left.garmentKey.localeCompare(right.garmentKey),
    ),
    diagnostics,
  };
};

export interface ResolvedGarmentScopedCustomDetailGroup {
  garmentKey: string;
  selectionGroup: CustomDetailSelectionGroup;
  garmentGroup: CustomDetailGarmentGroup;
  required: boolean;
  allowMultiple: boolean;
  options: readonly CustomDetailOption[];
}

export interface GarmentScopedCustomDetailApplicability {
  subject: FutureCustomDetailPhysicalSubject;
  groups: readonly ResolvedGarmentScopedCustomDetailGroup[];
  diagnostics: readonly GarmentScopedCustomDetailsDomainDiagnostic[];
}

const optionMatchesDemographic = (
  option: CustomDetailOption,
  demographic: CustomDetailDemographic | null,
): boolean => {
  if (!demographic) return false;
  if (demographic === "unisex") return true;
  return (
    option.eligibleDemographics.includes("unisex") ||
    option.eligibleDemographics.includes(demographic)
  );
};

const optionMatchesSubject = (
  option: CustomDetailOption,
  subject: FutureCustomDetailPhysicalSubject,
  style: StyleCategory | null,
): boolean => {
  if (
    subject.parentGarmentType === "bum_shorts" &&
    subject.demographic === "male"
  ) {
    return false;
  }
  if (option.selectionGroup === "additional_physical_garment") return false;
  const isPersonalized = option.garmentGroup === "personalized";
  if (!isPersonalized && !subject.garmentGroups.includes(option.garmentGroup)) {
    return false;
  }
  const configuredGroups = style?.customDetailConfig?.supportedGarmentGroups || [];
  if (
    !isPersonalized &&
    configuredGroups.length > 0 &&
    !configuredGroups.includes(option.garmentGroup)
  ) {
    return false;
  }
  return optionMatchesDemographic(option, subject.demographic);
};

export const resolveGarmentScopedCustomDetailApplicability = ({
  subject,
  style,
  catalogInspection,
}: {
  subject: FutureCustomDetailPhysicalSubject;
  style?: StyleCategory | null;
  catalogInspection: CustomDetailCatalogInspection;
}): GarmentScopedCustomDetailApplicability => {
  if (style?.customDetailConfig?.enabled === false) {
    return {
      subject,
      groups: [],
      diagnostics: [
        {
          code: "style_custom_details_disabled",
          garmentKey: subject.garmentKey,
        },
      ],
    };
  }
  const lockedGroups = new Set(subject.lockedSelectionGroups);
  const applicableOptions = catalogInspection.activeOptions.filter(
    (option) =>
      option.active &&
      !lockedGroups.has(option.selectionGroup) &&
      optionMatchesSubject(option, subject, style || null),
  );
  const optionsByGroup = new Map<
    CustomDetailSelectionGroup,
    CustomDetailOption[]
  >();
  applicableOptions.forEach((option) => {
    const options = optionsByGroup.get(option.selectionGroup) || [];
    options.push(option);
    optionsByGroup.set(option.selectionGroup, options);
  });
  const configuredRequired = new Set(
    style?.customDetailConfig?.requiredSelectionGroups || [],
  );
  const groups = [...optionsByGroup.entries()]
    .sort(([left], [right]) => compareSelectionGroups(left, right))
    .map(([selectionGroup, options]) => {
      const sortedOptions = sortCustomDetailOptions(options);
      return {
        garmentKey: subject.garmentKey,
        selectionGroup,
        garmentGroup: sortedOptions[0].garmentGroup,
        required:
          configuredRequired.has(selectionGroup) ||
          sortedOptions.some((option) => option.required),
        allowMultiple: sortedOptions.some((option) => option.allowMultiple),
        options: sortedOptions,
      };
    });
  return { subject, groups, diagnostics: [] };
};

export interface GarmentScopedCustomDetailsReconciliationResult {
  subjects: readonly FutureCustomDetailPhysicalSubject[];
  applicabilityByGarmentKey: ReadonlyMap<
    string,
    GarmentScopedCustomDetailApplicability
  >;
  state: GarmentScopedCustomDetailsStateV1;
  diagnostics: readonly GarmentScopedCustomDetailsDomainDiagnostic[];
  stateChanged: boolean;
}

export interface GarmentScopedPersonalizedInputsReconciliationResult {
  state: GarmentScopedCustomDetailInputsV1;
  diagnostics: readonly GarmentScopedPersonalizedTextDiagnostic[];
  stateChanged: boolean;
}

export const reconcileGarmentScopedPersonalizedInputs = ({
  reconciliation,
  catalogInspection,
  existingInputs,
}: {
  reconciliation: GarmentScopedCustomDetailsReconciliationResult;
  catalogInspection: CustomDetailCatalogInspection;
  existingInputs: unknown;
}): GarmentScopedPersonalizedInputsReconciliationResult => {
  const normalized = normalizeGarmentScopedCustomDetailInputs(existingInputs);
  const diagnostics: GarmentScopedPersonalizedTextDiagnostic[] =
    normalized.diagnostics.map((diagnostic) =>
      diagnostic.code === "TEXT_TOO_LONG"
        ? { code: "personalized_text_too_long" as const }
        : { code: "personalized_text_malformed" as const },
    );
  const subjectKeys = new Set(
    reconciliation.subjects.map((subject) => subject.garmentKey),
  );
  const retained = enumerateGarmentScopedCustomDetailInputs(normalized.state)
    .flatMap((entry) => {
      if (!subjectKeys.has(entry.garmentKey)) {
        diagnostics.push({
          code: "personalized_text_garment_removed",
          garmentKey: entry.garmentKey,
          selectionGroup: entry.selectionGroup,
          optionId: entry.optionId,
        });
        return [];
      }
      const applicability = reconciliation.applicabilityByGarmentKey.get(
        entry.garmentKey,
      );
      const catalogEntry = catalogInspection.byOptionId.get(entry.optionId);
      if (catalogEntry?.lifecycleStatus === "explicitly_deleted") {
        diagnostics.push({
          code: "personalized_text_option_deleted",
          garmentKey: entry.garmentKey,
          selectionGroup: entry.selectionGroup,
          optionId: entry.optionId,
        });
        return [];
      }
      if (!catalogEntry?.option?.active) {
        diagnostics.push({
          code: "personalized_text_option_disabled",
          garmentKey: entry.garmentKey,
          selectionGroup: entry.selectionGroup,
          optionId: entry.optionId,
        });
        return [];
      }
      if (
        catalogEntry.option.id !== PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID ||
        !catalogEntry.option.requiresEvaluation
      ) {
        diagnostics.push({
          code: "personalized_text_no_longer_required",
          garmentKey: entry.garmentKey,
          selectionGroup: entry.selectionGroup,
          optionId: entry.optionId,
        });
        return [];
      }
      const group = applicability?.groups.find(
        (candidate) => candidate.selectionGroup === entry.selectionGroup,
      );
      if (!group) {
        diagnostics.push({
          code: "personalized_text_group_removed",
          garmentKey: entry.garmentKey,
          selectionGroup: entry.selectionGroup,
          optionId: entry.optionId,
        });
        return [];
      }
      const selection = reconciliation.state.selectionsByGarmentKey[
        entry.garmentKey
      ]?.[entry.selectionGroup];
      if (!selection || !getSelectionOptionIds(selection).includes(entry.optionId)) {
        diagnostics.push({
          code: "personalized_text_option_deselected",
          garmentKey: entry.garmentKey,
          selectionGroup: entry.selectionGroup,
          optionId: entry.optionId,
        });
        return [];
      }
      const validation = validateGarmentScopedCustomDetailText(entry.text);
      if (validation.status === "too_long") {
        diagnostics.push({
          code: "personalized_text_too_long",
          garmentKey: entry.garmentKey,
          selectionGroup: entry.selectionGroup,
          optionId: entry.optionId,
        });
      }
      return [entry];
    });
  const state = retainGarmentScopedCustomDetailInputIdentities(
    normalized.state,
    retained,
  );
  return {
    state,
    diagnostics,
    stateChanged:
      normalized.diagnostics.length > 0 ||
      stableSerialize(normalized.state) !== stableSerialize(state),
  };
};

const classifyUnavailableOption = ({
  entry,
  optionId,
  subject,
  selectionGroup,
  style,
}: {
  entry: ProvenanceAwareCustomDetailCatalogEntry | undefined;
  optionId: string;
  subject: FutureCustomDetailPhysicalSubject;
  selectionGroup: CustomDetailSelectionGroup;
  style: StyleCategory | null;
}): GarmentScopedCustomDetailsDomainDiagnostic => {
  const base = { garmentKey: subject.garmentKey, selectionGroup, optionId };
  if (!entry) return { ...base, code: "option_missing" };
  if (entry.lifecycleStatus === "explicitly_deleted") {
    return { ...base, code: "option_deleted" };
  }
  if (entry.lifecycleStatus === "malformed" || !entry.option) {
    return { ...base, code: "malformed_catalog_option" };
  }
  if (!entry.option.active) return { ...base, code: "option_disabled" };
  if (!optionMatchesDemographic(entry.option, subject.demographic)) {
    return { ...base, code: "demographic_mismatch" };
  }
  if (!optionMatchesSubject(entry.option, subject, style)) {
    return { ...base, code: "group_no_longer_applicable" };
  }
  return { ...base, code: "group_no_longer_applicable" };
};

export const reconcileGarmentScopedCustomDetails = ({
  garmentTypeSelection,
  style,
  catalogInspection,
  existingState,
}: {
  garmentTypeSelection: unknown;
  style?: StyleCategory | null;
  catalogInspection: CustomDetailCatalogInspection;
  existingState: unknown;
}): GarmentScopedCustomDetailsReconciliationResult => {
  const subjectResolution = resolveFutureCustomDetailPhysicalSubjects(
    garmentTypeSelection,
  );
  const normalizedExisting = normalizeGarmentScopedCustomDetailsState(existingState);
  const diagnostics: GarmentScopedCustomDetailsDomainDiagnostic[] = [
    ...subjectResolution.diagnostics,
    ...normalizedExisting.diagnostics.map((diagnostic) => ({
      code: "malformed_selection" as const,
      detail: `${diagnostic.code}:${diagnostic.path}`,
    })),
  ];
  const subjectByKey = new Map(
    subjectResolution.subjects.map((subject) => [subject.garmentKey, subject]),
  );
  const applicabilityByGarmentKey = new Map(
    subjectResolution.subjects.map((subject) => {
      const applicability = resolveGarmentScopedCustomDetailApplicability({
        subject,
        style: style || null,
        catalogInspection,
      });
      diagnostics.push(...applicability.diagnostics);
      return [subject.garmentKey, applicability] as const;
    }),
  );
  let state = createEmptyGarmentScopedCustomDetailsState();

  Object.entries(normalizedExisting.state.selectionsByGarmentKey)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([garmentKey, garmentSelections]) => {
      const subject = subjectByKey.get(garmentKey);
      if (!subject) {
        diagnostics.push({ code: "garment_removed", garmentKey });
        return;
      }
      const applicability = applicabilityByGarmentKey.get(garmentKey)!;
      const groupsById = new Map(
        applicability.groups.map((group) => [group.selectionGroup, group]),
      );
      Object.entries(garmentSelections)
        .sort(([left], [right]) =>
          compareSelectionGroups(
            left as CustomDetailSelectionGroup,
            right as CustomDetailSelectionGroup,
          ),
        )
        .forEach(([rawGroup, rawSelection]) => {
          const selectionGroup = rawGroup as CustomDetailSelectionGroup;
          const optionIds = getSelectionOptionIds(rawSelection);
          if (subject.lockedSelectionGroups.includes(selectionGroup)) {
            optionIds.forEach((optionId) =>
              diagnostics.push({
                code: "group_locked_by_garment_type",
                garmentKey,
                selectionGroup,
                optionId,
              }),
            );
            return;
          }
          const applicableGroup = groupsById.get(selectionGroup);
          if (!applicableGroup) {
            optionIds.forEach((optionId) =>
              diagnostics.push(
                classifyUnavailableOption({
                  entry: catalogInspection.byOptionId.get(optionId),
                  optionId,
                  subject,
                  selectionGroup,
                  style: style || null,
                }),
              ),
            );
            return;
          }
          if (!applicableGroup.allowMultiple && optionIds.length > 1) {
            diagnostics.push({
              code: "malformed_selection",
              garmentKey,
              selectionGroup,
              detail: "multiple_options_in_single_select_group",
            });
            return;
          }
          const optionsById = new Map(
            applicableGroup.options.map((option) => [option.id, option]),
          );
          const validOptions = optionIds.flatMap((optionId) => {
            const option = optionsById.get(optionId);
            if (option) return [option];
            diagnostics.push(
              classifyUnavailableOption({
                entry: catalogInspection.byOptionId.get(optionId),
                optionId,
                subject,
                selectionGroup,
                style: style || null,
              }),
            );
            return [];
          });
          if (validOptions.length === 0) return;
          const selection: GarmentScopedCustomDetailSelection = Array.isArray(
            rawSelection,
          )
            ? validOptions.map((option) => option.id)
            : validOptions[0].id;
          state = setGarmentScopedCustomDetailSelection(
            state,
            garmentKey,
            selectionGroup,
            selection,
          );
          validOptions.forEach((option) => {
            state = setGarmentScopedCustomDetailSnapshot(
              state,
              garmentKey,
              selectionGroup,
              {
                optionId: option.id,
                label: option.label,
                description: option.description,
                garmentGroup: option.garmentGroup,
                selectionGroup: option.selectionGroup,
                priceCents: option.priceCents,
                ...(option.informational !== undefined
                  ? { informational: option.informational }
                  : {}),
                ...(option.requiresEvaluation !== undefined
                  ? { requiresEvaluation: option.requiresEvaluation }
                  : {}),
              },
            );
          });
        });
    });

  state = normalizeGarmentScopedCustomDetailsState(state).state;
  const stateChanged =
    normalizedExisting.diagnostics.length > 0 ||
    stableSerialize(normalizedExisting.state) !== stableSerialize(state);
  return {
    subjects: subjectResolution.subjects,
    applicabilityByGarmentKey,
    state,
    diagnostics,
    stateChanged,
  };
};

export type GarmentScopedCustomDetailsCompletionStatus =
  | "complete"
  | "incomplete"
  | "invalid"
  | "pricing_pending";

export interface GarmentScopedCustomDetailsCompletionBlocker {
  code:
    | "earlier_stage_incomplete"
    | "physical_subject_invalid"
    | "required_selection_missing"
    | "selection_reconciled"
    | "snapshot_missing"
    | "personalized_requirement_missing"
    | "personalized_requirement_invalid"
    | "pricing_evaluation_required";
  message: string;
  garmentKey?: string;
  selectionGroup?: CustomDetailSelectionGroup;
  optionId?: string;
}

export interface GarmentScopedCustomDetailsCompletionResult {
  status: GarmentScopedCustomDetailsCompletionStatus;
  blockers: readonly GarmentScopedCustomDetailsCompletionBlocker[];
}

const RECONCILIATION_SELECTION_CODES = new Set<
  GarmentScopedCustomDetailsDomainDiagnosticCode
>([
  "garment_removed",
  "group_locked_by_garment_type",
  "group_no_longer_applicable",
  "option_disabled",
  "option_deleted",
  "option_missing",
  "malformed_selection",
  "malformed_catalog_option",
]);

export const validateGarmentScopedCustomDetailsCompletion = ({
  earlierStagesComplete,
  reconciliation,
  personalizedInputs,
}: {
  earlierStagesComplete: boolean;
  reconciliation: GarmentScopedCustomDetailsReconciliationResult;
  personalizedInputs?: GarmentScopedPersonalizedInputsReconciliationResult;
}): GarmentScopedCustomDetailsCompletionResult => {
  const blockers: GarmentScopedCustomDetailsCompletionBlocker[] = [];
  if (!earlierStagesComplete) {
    blockers.push({
      code: "earlier_stage_incomplete",
      message: "Complete the earlier Design Studio stages first.",
    });
  }
  reconciliation.diagnostics.forEach((diagnostic) => {
    if (
      diagnostic.code === "missing_demographic" ||
      diagnostic.code === "unsupported_physical_garment" ||
      diagnostic.code === "invalid_physical_component_configuration" ||
      diagnostic.code === "demographic_mismatch" ||
      diagnostic.code === "construction_unresolved"
    ) {
      blockers.push({
        code: "physical_subject_invalid",
        message:
          diagnostic.detail ||
          "A selected garment requires attention before customization.",
        garmentKey: diagnostic.garmentKey,
      });
    } else if (RECONCILIATION_SELECTION_CODES.has(diagnostic.code)) {
      blockers.push({
        code: "selection_reconciled",
        message: "A saved Custom Details selection is no longer valid.",
        garmentKey: diagnostic.garmentKey,
        selectionGroup: diagnostic.selectionGroup,
        optionId: diagnostic.optionId,
      });
    }
  });

  reconciliation.subjects.forEach((subject) => {
    const applicability = reconciliation.applicabilityByGarmentKey.get(
      subject.garmentKey,
    );
    applicability?.groups.forEach((group) => {
      const selection = reconciliation.state.selectionsByGarmentKey[
        subject.garmentKey
      ]?.[group.selectionGroup];
      if (group.required && !selection) {
        blockers.push({
          code: "required_selection_missing",
          message: "Choose an option for this required garment detail.",
          garmentKey: subject.garmentKey,
          selectionGroup: group.selectionGroup,
        });
      }
    });
  });

  enumerateGarmentScopedCustomDetails(reconciliation.state).forEach(
    (occurrence) => {
      if (!occurrence.snapshot) {
        blockers.push({
          code: "snapshot_missing",
          message: "Refresh this garment detail before continuing.",
          garmentKey: occurrence.garmentKey,
          selectionGroup: occurrence.selectionGroup,
          optionId: occurrence.optionId,
        });
      } else if (occurrence.snapshot.requiresEvaluation) {
        blockers.push({
          code: "pricing_evaluation_required",
          message: "This personalized detail requires a price evaluation.",
          garmentKey: occurrence.garmentKey,
          selectionGroup: occurrence.selectionGroup,
          optionId: occurrence.optionId,
        });
      }
    },
  );

  const inputEntries = new Map(
    (personalizedInputs
      ? enumerateGarmentScopedCustomDetailInputs(personalizedInputs.state)
      : []
    ).map((entry) => [
      `${entry.garmentKey}\u0000${entry.selectionGroup}\u0000${entry.optionId}`,
      entry,
    ]),
  );
  enumerateGarmentScopedCustomDetails(reconciliation.state).forEach(
    (occurrence) => {
      if (
        occurrence.optionId !==
          PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID ||
        !occurrence.snapshot?.requiresEvaluation
      ) {
        return;
      }
      const input = inputEntries.get(
        `${occurrence.garmentKey}\u0000${occurrence.selectionGroup}\u0000${occurrence.optionId}`,
      );
      const text = input && validateGarmentScopedCustomDetailText(input.text);
      if (!text || text.status === "empty") {
        blockers.push({
          code: "personalized_requirement_missing",
          message: "Describe your personalized requirement before continuing.",
          garmentKey: occurrence.garmentKey,
          selectionGroup: occurrence.selectionGroup,
          optionId: occurrence.optionId,
        });
      } else if (text.status !== "valid") {
        blockers.push({
          code: "personalized_requirement_invalid",
          message: "Your personalized requirement needs attention before continuing.",
          garmentKey: occurrence.garmentKey,
          selectionGroup: occurrence.selectionGroup,
          optionId: occurrence.optionId,
        });
      }
    },
  );

  const hasInvalid = blockers.some(
    (blocker) =>
      blocker.code === "physical_subject_invalid" ||
      blocker.code === "selection_reconciled" ||
      blocker.code === "snapshot_missing" ||
      blocker.code === "personalized_requirement_invalid",
  );
  const hasPending = blockers.some(
    (blocker) => blocker.code === "pricing_evaluation_required",
  );
  const hasIncomplete = blockers.some(
    (blocker) =>
      blocker.code === "earlier_stage_incomplete" ||
      blocker.code === "required_selection_missing" ||
      blocker.code === "personalized_requirement_missing",
  );
  return {
    status: hasInvalid
      ? "invalid"
      : hasIncomplete
        ? "incomplete"
        : hasPending
          ? "pricing_pending"
          : "complete",
    blockers,
  };
};

export interface GarmentScopedCustomDetailPricingLine {
  occurrenceKey: string;
  garmentKey: string;
  selectionGroup: CustomDetailSelectionGroup;
  optionId: string;
  label: string;
  quantity: 1;
  status: "exact" | "evaluation_required" | "invalid";
  unitPriceCents?: number;
  lineTotalCents?: number;
}

export type GarmentScopedCustomDetailsPricingResult =
  | {
      status: "exact";
      subtotalCents: number;
      subtotal: number;
      lines: readonly GarmentScopedCustomDetailPricingLine[];
    }
  | {
      status: "pending" | "invalid";
      exactSubtotalCents: number;
      lines: readonly GarmentScopedCustomDetailPricingLine[];
    };

export const calculateGarmentScopedCustomDetailsPricing = ({
  reconciliation,
  catalogInspection,
}: {
  reconciliation: GarmentScopedCustomDetailsReconciliationResult;
  catalogInspection: CustomDetailCatalogInspection;
}): GarmentScopedCustomDetailsPricingResult => {
  const lines = enumerateGarmentScopedCustomDetails(reconciliation.state).map(
    (occurrence): GarmentScopedCustomDetailPricingLine => {
      const entry = catalogInspection.byOptionId.get(occurrence.optionId);
      const option = entry?.option;
      const occurrenceKey = `${occurrence.garmentKey}:${occurrence.selectionGroup}:${occurrence.optionId}`;
      if (
        !entry ||
        entry.lifecycleStatus !== "active" ||
        !option ||
        !option.active ||
        option.selectionGroup !== occurrence.selectionGroup ||
        reconciliation.applicabilityByGarmentKey
          .get(occurrence.garmentKey)
          ?.groups.find(
            (group) => group.selectionGroup === occurrence.selectionGroup,
          )
          ?.options.some((candidate) => candidate.id === occurrence.optionId) !==
          true
      ) {
        return {
          occurrenceKey,
          garmentKey: occurrence.garmentKey,
          selectionGroup: occurrence.selectionGroup,
          optionId: occurrence.optionId,
          label: option?.label || occurrence.optionId,
          quantity: 1,
          status: "invalid",
        };
      }
      if (entry.priceStatus === "evaluation_required") {
        return {
          occurrenceKey,
          garmentKey: occurrence.garmentKey,
          selectionGroup: occurrence.selectionGroup,
          optionId: option.id,
          label: option.label,
          quantity: 1,
          status: "evaluation_required",
        };
      }
      if (entry.priceStatus !== "exact" || entry.priceCents === undefined) {
        return {
          occurrenceKey,
          garmentKey: occurrence.garmentKey,
          selectionGroup: occurrence.selectionGroup,
          optionId: option.id,
          label: option.label,
          quantity: 1,
          status: "invalid",
        };
      }
      return {
        occurrenceKey,
        garmentKey: occurrence.garmentKey,
        selectionGroup: occurrence.selectionGroup,
        optionId: option.id,
        label: option.label,
        quantity: 1,
        status: "exact",
        unitPriceCents: entry.priceCents,
        lineTotalCents: entry.priceCents,
      };
    },
  );
  const exactSubtotalCents = lines.reduce(
    (total, line) => total + (line.lineTotalCents || 0),
    0,
  );
  if (
    lines.some((line) => line.status === "invalid") ||
    reconciliation.diagnostics.some((diagnostic) =>
      RECONCILIATION_SELECTION_CODES.has(diagnostic.code),
    )
  ) {
    return { status: "invalid", exactSubtotalCents, lines };
  }
  if (lines.some((line) => line.status === "evaluation_required")) {
    return { status: "pending", exactSubtotalCents, lines };
  }
  return {
    status: "exact",
    subtotalCents: exactSubtotalCents,
    subtotal: exactSubtotalCents / 100,
    lines,
  };
};
