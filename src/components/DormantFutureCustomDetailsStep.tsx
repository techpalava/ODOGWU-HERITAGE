import { Plus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CUSTOM_DETAIL_PARENT_SECTION_PRESENTATION,
  CUSTOM_DETAIL_SELECTION_GROUP_TO_PARENT_SECTION,
  NECK_DESIGN_SUBCATEGORY_BY_OPTION_ID,
  NECK_DESIGN_SUBCATEGORY_ORDER,
  isCompanionCustomerAdditionalClothesCostGroup,
} from "../config/GarmentDetailsConfig";
import { getCustomDetailsGarmentLabel } from "../utils/optionalShortsPresentation";
import { DesignStudioStepActions } from "./DesignStudioBackButton";
import { projectOccurrenceDisplayLabels } from "../utils/occurrenceDisplayLabel";
import type {
  CanonicalPhysicalGarmentType,
  FabricGarmentType,
  CustomDetailOption,
  CustomDetailSelectionGroup,
  DecorativeFeature,
  DesignSelections,
  Fabric,
  FabricAllocationState,
  FabricGarmentAssignment,
  GarmentConstructionPricingResolution,
  GarmentScopedCustomDetailInputsV1,
  GarmentScopedCustomDetailsStateV1,
  MonogramPlacement,
  StyleCategory,
} from "../types";
import { AssignedFabricPreview } from "./AssignedFabricPreview";
import {
  getStep1GarmentReferenceAlt,
  getStep1GarmentReferenceImage,
  isStep1GarmentReferenceType,
} from "../utils/step1GarmentReferenceImages";
import { getStep1GarmentDisplayLabel } from "../utils/garmentConstructionPricing";
import type { TraditionalAccessory } from "../utils/decorativePricing";
import {
  DECORATIVE_FEATURE_DESCRIPTIONS,
  TRADITIONAL_ACCESSORY_DESCRIPTIONS,
  TRADITIONAL_ACCESSORY_OPTIONS,
  getAvailableMonogramPlacements,
  getCustomerSelectableDecorativeFeatures,
  getDecorativeFeaturePrice,
  getTraditionalAccessoryPrice,
} from "../utils/decorativePricing";
import type {
  GarmentScopedCustomDetailsCompletionResult,
  GarmentScopedCustomDetailsPricingResult,
  GarmentScopedCustomDetailsReconciliationResult,
} from "../utils/garmentScopedCustomDetailsDomain";
import { resolveCompatibleGarmentScopedCopySources } from "../utils/garmentScopedCustomDetailsDomain";
import { getGarmentScopedCustomDetailSelection } from "../utils/garmentScopedCustomDetailsState";
import {
  GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH,
  getGarmentScopedCustomDetailText,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID,
  PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP,
  validateGarmentScopedCustomDetailText,
} from "../utils/garmentScopedCustomDetailInputsState";
import {
  partitionCatalogueGroupsByRole,
  type FutureCustomDetailsCatalogueGroup,
  type FutureCustomDetailsCatalogueOccurrence,
  type FutureCustomDetailsCatalogueProjection,
} from "../utils/futureCustomDetailsCatalogue";
import type { CustomDetailsPresentationStageId } from "../utils/customDetailsStageOwnership";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";
import { isFutureCustomDetailsContentReady } from "../utils/aiTryOnWorkflow";
import type { CustomerGarmentConstructionBreakdownProjection } from "../utils/designPriceBreakdownPresentation";
import {
  attachCustomDetailsGoToTopObserver,
  scrollCustomDetailsToTop,
} from "../utils/customDetailsGoToTop";
import {
  CustomDetailsGoToTopButton,
  shouldShowCustomDetailsGoToTop,
} from "./CustomDetailsGoToTopButton";
import type { FutureGarmentRemovalTarget } from "./FutureGarmentRemovalConfirmationDialog";

interface DormantFutureCustomDetailsStepProps {
  /** Defaults to the retained Step 4 surface for existing consumers. */
  stage?: CustomDetailsPresentationStageId;
  reconciliation: GarmentScopedCustomDetailsReconciliationResult;
  catalogue: FutureCustomDetailsCatalogueProjection;
  personalizedInputs: GarmentScopedCustomDetailInputsV1;
  completion: GarmentScopedCustomDetailsCompletionResult;
  pricing: GarmentScopedCustomDetailsPricingResult;
  orderLevelCustomDetailsPrice: number;
  constructionBreakdown: CustomerGarmentConstructionBreakdownProjection;
  constructionSubtotal: number | null;
  designSelections: DesignSelections;
  showAdditionalClothesCosts?: boolean;
  selectedStyle: StyleCategory | null;
  additionalGarments: readonly FabricGarmentAssignment[];
  additionalGarmentConstructionOptions: readonly {
    garmentType: CanonicalPhysicalGarmentType;
    construction: GarmentConstructionPricingResolution;
  }[];
  onSingleSelect: (garmentKey: string, selectionGroup: CustomDetailSelectionGroup, optionId: string) => void;
  onClearSelection: (garmentKey: string, selectionGroup: CustomDetailSelectionGroup) => void;
  onConstructionSelect: (parentGarmentKey: string, garmentType: CanonicalPhysicalGarmentType, selectionGroup: CustomDetailSelectionGroup, optionId: string) => void;
  onToggleMultiSelect: (garmentKey: string, selectionGroup: CustomDetailSelectionGroup, optionId: string) => void;
  onPersonalizedTextChange: (garmentKey: string, selectionGroup: CustomDetailSelectionGroup, optionId: string, text: string) => void;
  onDecorativeFeatureToggle: (feature: DecorativeFeature) => void;
  onClearDecorativeFeatures: () => void;
  onMonogramPlacementChange: (placement: MonogramPlacement) => void;
  onAccessoryToggle: (accessory: TraditionalAccessory) => void;
  onClearAccessories: () => void;
  onAddAdditionalGarment: (
    garmentType: CanonicalPhysicalGarmentType,
    triggerElement?: HTMLElement | null,
  ) => void;
  additionalGarmentCustomDetailsRequest?: AdditionalGarmentCustomDetailsRequest | null;
  onCompleteAdditionalGarmentCustomDetails?: (
    request: AdditionalGarmentCustomDetailsRequest,
    choice: AdditionalGarmentCustomDetailsChoice,
  ) => boolean;
  onCancelAdditionalGarmentCustomDetails?: (
    request: AdditionalGarmentCustomDetailsRequest,
  ) => boolean;
  /** Retained for test/consumer compatibility; committed removal uses the shared confirmation flow. */
  onRemoveAdditionalGarment?: (garmentKey: string) => void;
  removalTargets?: readonly FutureGarmentRemovalTarget[];
  onRequestGarmentRemoval?: (
    target: FutureGarmentRemovalTarget,
    trigger: HTMLButtonElement,
  ) => void;
  onChangeAdditionalGarmentFabric?: (
    garmentKey: string,
    triggerElement?: HTMLElement | null,
  ) => void;
  fabrics?: readonly Fabric[];
  fabricAllocationState?: FabricAllocationState | null;
  fabricAnnouncement?: string;
  fabricPersistentError?: string | null;
  focusAdditionalGarmentKey?: string | null;
  /** A one-shot Order Summary focus request that can re-fire for the same target. */
  additionalGarmentNavigationRequestId?: number | null;
  onAdditionalGarmentNavigationHandled?: (requestId: number) => void;
  fabricModalOpen?: boolean;
  onViewAdditionalGarment?: (garmentKey: string) => void;
  onBack: () => void;
  onContinue: () => void;
  orderSummary?: ReactNode;
}

export type AdditionalGarmentCustomDetailsChoice =
  | { mode: "choose" }
  | { mode: "copy"; sourceParentGarmentKey: string };

export type AdditionalGarmentCustomDetailsRequest = {
  transactionId: number;
  garmentKey: string;
  garmentType: CanonicalPhysicalGarmentType;
  occurrenceGeneration: number;
};

const money = (amount: number): string => `${PRICING_CURRENCY_SYMBOL}${amount.toFixed(2)}`;

const parentTypeFromKey = (garmentKey: string): FabricGarmentType | null => {
  const additional = garmentKey.match(/^additional:([^:]+):\d+$/);
  const repeatedBase = garmentKey.match(/^base:([^:]+):\d+$/);
  const base = garmentKey.match(/^base:([^:]+)$/);
  const token = additional?.[1] || repeatedBase?.[1] || base?.[1];
  return token ? (token as FabricGarmentType) : null;
};

const exactParentLabel = (
  labels: ReadonlyMap<string, { conciseLabel: string }>,
  parentGarmentKey: string,
  parentGarmentType: FabricGarmentType,
): string =>
  labels.get(parentGarmentKey)?.conciseLabel ||
  getStep1GarmentDisplayLabel(parentGarmentType);

const getSubjectLabel = (
  subject: GarmentScopedCustomDetailsReconciliationResult["subjects"][number],
  labels: ReadonlyMap<string, { conciseLabel: string }>,
): string => {
  if (subject.parentGarmentType === subject.garmentType) {
    return exactParentLabel(labels, subject.parentGarmentKey, subject.parentGarmentType);
  }
  const garmentLabel = getCustomDetailsGarmentLabel(subject.garmentType);
  return `${getCustomDetailsGarmentLabel(subject.parentGarmentType)} ${garmentLabel}`;
};

const getSelection = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
) => getGarmentScopedCustomDetailSelection(state, garmentKey, selectionGroup);

const isSelected = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
  optionId: string,
): boolean => {
  const selection = getSelection(state, garmentKey, selectionGroup);
  return Array.isArray(selection) ? selection.includes(optionId) : selection === optionId;
};

const hasSelection = (
  state: GarmentScopedCustomDetailsStateV1,
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
): boolean => {
  const selection = getSelection(state, garmentKey, selectionGroup);
  return Array.isArray(selection) ? selection.length > 0 : Boolean(selection);
};

const getOptionPriceLabel = (
  option: CustomDetailOption,
  isConstruction: boolean,
  selected: boolean,
): string =>
  option.requiresEvaluation
    ? "Price requires evaluation."
    : isConstruction
      ? selected
        ? "Included"
        : money(option.priceCents / 100)
      : option.priceCents === 0
        ? "Included"
        : `+${money(option.priceCents / 100)}`;

const getParentSectionTitle = (
  selectionGroup: CustomDetailSelectionGroup,
  fallback: string,
): string => {
  const parent = CUSTOM_DETAIL_SELECTION_GROUP_TO_PARENT_SECTION[
    selectionGroup as keyof typeof CUSTOM_DETAIL_SELECTION_GROUP_TO_PARENT_SECTION
  ];
  return parent
    ? CUSTOM_DETAIL_PARENT_SECTION_PRESENTATION[parent].title
    : fallback.toUpperCase();
};

const getIdentityKey = (
  garmentKey: string,
  selectionGroup: CustomDetailSelectionGroup,
  optionId: string,
): string => `${garmentKey}\u0000${selectionGroup}\u0000${optionId}`;

const getSelectedConstructionId = (
  occurrence: FutureCustomDetailsCatalogueOccurrence,
  selectionGroup: CustomDetailSelectionGroup,
): string | null =>
  occurrence.construction?.status === "resolved"
    ? occurrence.construction.components.find(
        (component) => component.selectionGroup === selectionGroup,
      )?.optionId || null
    : null;

const getGarmentFirstLabel = (
  occurrence: FutureCustomDetailsCatalogueOccurrence,
  labels: ReadonlyMap<string, { conciseLabel: string }>,
): string => {
  if (occurrence.subject.parentGarmentType === occurrence.subject.garmentType) {
    return exactParentLabel(
      labels,
      occurrence.subject.parentGarmentKey,
      occurrence.subject.parentGarmentType,
    );
  }
  const parentLabel = getStep1GarmentDisplayLabel(occurrence.subject.parentGarmentType);
  return `${parentLabel} - ${getStep1GarmentDisplayLabel(occurrence.subject.garmentType)}`;
};

const getNeckDesignOccurrenceHeading = (
  occurrence: FutureCustomDetailsCatalogueOccurrence,
  labels: ReadonlyMap<string, { conciseLabel: string }>,
): string => `Neck Design for ${getGarmentFirstLabel(occurrence, labels)}`;

const CUSTOM_DETAIL_SUBSECTION_HEADING_CLASS =
  "break-words text-sm font-extrabold uppercase tracking-wide";

const CUSTOM_DETAIL_SUBSECTION_HEADING_ROW_CLASS =
  "flex w-full min-w-0 flex-wrap items-start gap-x-2 gap-y-1.5";

const CUSTOM_DETAIL_SUBSECTION_HEADING_TEXT_CLASS =
  `max-w-full min-w-[min(100%,max-content)] grow ${CUSTOM_DETAIL_SUBSECTION_HEADING_CLASS}`;

const CUSTOM_DETAIL_STATUS_BADGE_CLASS =
  "mt-0.5 shrink-0 rounded-full border border-heritage-gold/30 bg-heritage-cream/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-heritage-gold";

/** Neck collar columns use 20rem auto-fit. Garment Main/Pocket pairs use the same idea with a slightly smaller floor so two readable columns appear when the container is wide enough, then stack instead of squeezing. */
const CUSTOM_DETAIL_BALANCED_PAIR_GRID_CLASS =
  "grid min-w-0 w-full items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr))]";

const CUSTOM_DETAIL_COMPANION_PAIR_GRID_CLASS =
  "mt-4 grid min-w-0 max-w-full w-full items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr))]";

const CUSTOM_DETAIL_FIELDSET_CLASS =
  "min-w-0 w-full max-w-full [min-inline-size:0]";

const customDetailOptionCardClassName = (checked: boolean) =>
  `flex min-h-20 w-full min-w-0 cursor-pointer items-start gap-3 rounded-xl border-2 p-3 text-left transition hover:border-heritage-gold focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${checked ? "border-heritage-green bg-heritage-green/5" : "border-heritage-green/65 bg-white"}`;

const getConstructionPresentationPrefix = (
  occurrence: FutureCustomDetailsCatalogueOccurrence,
  selectionGroup: CustomDetailSelectionGroup,
): string | null => {
  switch (selectionGroup) {
    case "shirt_construction":
      return occurrence.subject.parentGarmentType === "kaftan"
        ? "shirt_long_"
        : "shirt_std_";
    case "dress_construction":
      return occurrence.subject.parentGarmentType === "full_length_gown"
        ? "dress_long_"
        : "dress_std_";
    case "skirt_length":
      return occurrence.subject.parentGarmentType === "long_skirt"
        ? "skirt_long"
        : "skirt_std";
    default:
      return null;
  }
};

const getGarmentFirstDetailLabel = (
  selectionGroup: CustomDetailSelectionGroup,
): string => {
  switch (selectionGroup) {
    case "shirt_construction":
    case "dress_construction":
    case "standard_shorts_fastening":
    case "bum_shorts_fastening":
    case "trouser_fastening":
    case "skirt_length":
      return "Main Garment";
    case "neck_design":
      return "Neck Design";
    case "shirt_pockets":
    case "dress_pockets":
    case "standard_shorts_pockets":
    case "bum_shorts_pockets":
    case "trouser_pockets":
    case "skirt_pockets":
      return "Pockets";
    default:
      return getParentSectionTitle(selectionGroup, selectionGroup);
  }
};

const getMainGarmentFamily = (
  occurrence: FutureCustomDetailsCatalogueOccurrence,
  selectionGroup: CustomDetailSelectionGroup,
  labels: ReadonlyMap<string, { conciseLabel: string }>,
): { id: string; title: string } => {
  if (selectionGroup === "neck_design") {
    return { id: "neck", title: "NECK DESIGN" };
  }
  switch (occurrence.subject.parentGarmentType) {
    case "shirt":
    case "kaftan":
      return { id: "shirts", title: "SHIRTS" };
    case "dress":
    case "full_length_gown":
      return { id: "dresses", title: "DRESSES" };
    case "skirt":
    case "long_skirt":
      return { id: "skirts", title: "SKIRTS" };
    case "standard_shorts":
    case "bum_shorts":
      return { id: "shorts", title: "SHORTS" };
    case "trouser":
      return { id: "trouser", title: "TROUSER" };
    default:
      return {
        id: occurrence.subject.parentGarmentKey,
        title: getGarmentFirstLabel(occurrence, labels).toUpperCase(),
      };
  }
};

const MAIN_GARMENT_FAMILY_PRESENTATION_ORDER: Readonly<Record<string, number>> = {
  shirts: 10,
  dresses: 20,
  neck: 30,
  trouser: 40,
  skirts: 50,
  shorts: 60,
};

const getMainGarmentFamilyPresentationOrder = (familyId: string): number =>
  MAIN_GARMENT_FAMILY_PRESENTATION_ORDER[familyId] ?? 100;

export const DormantFutureCustomDetailsStep = ({
  stage = "custom_details",
  reconciliation,
  catalogue,
  personalizedInputs,
  completion,
  pricing,
  orderLevelCustomDetailsPrice,
  constructionBreakdown,
  constructionSubtotal,
  designSelections,
  showAdditionalClothesCosts,
  selectedStyle,
  additionalGarments,
  additionalGarmentConstructionOptions,
  onSingleSelect,
  onClearSelection,
  onConstructionSelect,
  onToggleMultiSelect,
  onPersonalizedTextChange,
  onDecorativeFeatureToggle,
  onClearDecorativeFeatures,
  onMonogramPlacementChange,
  onAccessoryToggle,
  onClearAccessories,
  onAddAdditionalGarment,
  additionalGarmentCustomDetailsRequest,
  onCompleteAdditionalGarmentCustomDetails,
  onCancelAdditionalGarmentCustomDetails,
  onChangeAdditionalGarmentFabric,
  removalTargets = [],
  onRequestGarmentRemoval,
  fabrics = [],
  fabricAllocationState = null,
  fabricAnnouncement = "",
  fabricPersistentError = null,
  focusAdditionalGarmentKey,
  additionalGarmentNavigationRequestId = null,
  onAdditionalGarmentNavigationHandled,
  fabricModalOpen = false,
  onViewAdditionalGarment,
  onBack,
  onContinue,
  orderSummary = null,
}: DormantFutureCustomDetailsStepProps) => {
  const isPersonalizedAdditionsStage = stage === "personalized_additions";
  const isCustomDetailsStage = !isPersonalizedAdditionsStage;
  const stageTitle = isPersonalizedAdditionsStage
    ? "Personalized Additions"
    : "Custom Details";
  const previousStageLabel = isPersonalizedAdditionsStage
    ? "Custom Details"
    : "Design Style";
  const nextStageLabel = isPersonalizedAdditionsStage
    ? "AI Try-on"
    : "Personalized Additions";
  const [overLimitText, setOverLimitText] = useState<Record<string, string>>({});
  void showAdditionalClothesCosts;
  const [additionalGarmentChoice, setAdditionalGarmentChoice] = useState<
    AdditionalGarmentCustomDetailsRequest & {
    sourceParentGarmentKey: string | null;
    }
  | null>(() =>
    isCustomDetailsStage && additionalGarmentCustomDetailsRequest
      ? {
          ...additionalGarmentCustomDetailsRequest,
          sourceParentGarmentKey: null,
        }
      : null,
  );
  const choiceDialogRef = useRef<HTMLDivElement>(null);
  const autoChosenRequestIdentityRef = useRef<string | null>(null);
  const choiceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const additionalGarmentTargetRefs = useRef(
    new Map<string, HTMLDivElement>(),
  );
  const lastFocusedAdditionalGarmentKeyRef = useRef<string | null>(null);
  const lastHandledAdditionalGarmentNavigationRequestIdRef = useRef<
    number | null
  >(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const goToTopDetachRef = useRef<(() => void) | null>(null);
  const [showGoToTop, setShowGoToTop] = useState(false);
  const setTopSentinelRef = useCallback((node: HTMLDivElement | null) => {
    topSentinelRef.current = node;
    goToTopDetachRef.current?.();
    goToTopDetachRef.current = null;
    if (!node) return;
    goToTopDetachRef.current = attachCustomDetailsGoToTopObserver({
      sentinel: node,
      onVisibilityChange: setShowGoToTop,
    });
  }, []);
  const selectedPersonalizedIdentities = useMemo(
    () => reconciliation.subjects.flatMap((subject) => {
      const group = reconciliation.applicabilityByGarmentKey
        .get(subject.garmentKey)
        ?.groups.find((candidate) => candidate.selectionGroup === PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP);
      return group?.options.some((option) =>
        option.id === PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID &&
        isSelected(reconciliation.state, subject.garmentKey, group.selectionGroup, option.id),
      )
        ? [getIdentityKey(subject.garmentKey, PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP, PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID)]
        : [];
    }),
    [reconciliation],
  );
  const selectedPersonalizedSignature = selectedPersonalizedIdentities.join(",");

  useEffect(() => {
    const retained = new Set(selectedPersonalizedIdentities);
    setOverLimitText((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([key]) => retained.has(key)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [selectedPersonalizedSignature, selectedPersonalizedIdentities]);

  const customDetailsSubtotal =
    (pricing.status === "exact" ? pricing.subtotal : pricing.exactSubtotalCents / 100) +
    orderLevelCustomDetailsPrice;
  const estimatedTotal =
    pricing.status === "exact" &&
    constructionBreakdown.status === "complete" &&
    constructionSubtotal !== null
      ? constructionSubtotal + customDetailsSubtotal
      : null;
  const parentOccurrenceLabels = useMemo(() => {
    const seen = new Set<string>();
    const parents: { garmentKey: string; garmentType: FabricGarmentType }[] = [];
    reconciliation.subjects.forEach((subject) => {
      if (seen.has(subject.parentGarmentKey)) return;
      seen.add(subject.parentGarmentKey);
      parents.push({
        garmentKey: subject.parentGarmentKey,
        garmentType: subject.parentGarmentType,
      });
    });
    const extras = constructionBreakdown.rows.flatMap((row) => {
      if (seen.has(row.garmentKey)) return [];
      const garmentType = parentTypeFromKey(row.garmentKey);
      if (!garmentType) return [];
      seen.add(row.garmentKey);
      return [{ garmentKey: row.garmentKey, garmentType }];
    });
    const isAdditional = (garmentKey: string) => garmentKey.startsWith("additional:");
    const ordered = [
      ...parents.filter((parent) => !isAdditional(parent.garmentKey)),
      ...extras.filter((parent) => !isAdditional(parent.garmentKey)).sort((left, right) =>
        left.garmentKey.localeCompare(right.garmentKey),
      ),
      ...parents.filter((parent) => isAdditional(parent.garmentKey)),
      ...extras.filter((parent) => isAdditional(parent.garmentKey)).sort((left, right) =>
        left.garmentKey.localeCompare(right.garmentKey),
      ),
    ];
    return projectOccurrenceDisplayLabels(ordered);
  }, [reconciliation.subjects, constructionBreakdown.rows]);
  const constructionBreakdownRows = constructionBreakdown.rows.map((row) => ({
    ...row,
    occurrenceLabel:
      parentOccurrenceLabels.get(row.garmentKey)?.conciseLabel ||
      getStep1GarmentDisplayLabel(
        parentTypeFromKey(row.garmentKey) || "other",
      ),
  }));
  const subjectLabelByGarmentKey = new Map(
    reconciliation.subjects.map((subject) => [
      subject.garmentKey,
      getSubjectLabel(subject, parentOccurrenceLabels),
    ]),
  );
  const canContinue = isFutureCustomDetailsContentReady(completion);
  const selectedDecorativeFeatures = new Set(designSelections.decorativeFeatures || []);
  const customerSelectableDecorativeFeatures =
    getCustomerSelectableDecorativeFeatures();
  const availableMonogramPlacements = getAvailableMonogramPlacements(designSelections, selectedStyle);
  const selectedAccessories = new Set(designSelections.accessories || []);
  const compatibleCopySources = useMemo(() => {
    if (!additionalGarmentChoice) return [];
    let additionalIndex = 0;
    return resolveCompatibleGarmentScopedCopySources(
      reconciliation.subjects,
      additionalGarmentChoice.garmentType,
    )
      .filter(
        (source) =>
          source.parentGarmentKey !== additionalGarmentChoice.garmentKey,
      )
      .map((source) => ({
      ...source,
      role: source.role === "main"
        ? "Base garment"
        : `Added garment ${++additionalIndex}`,
    }));
  }, [additionalGarmentChoice, reconciliation.subjects]);
  const selectedCopySource =
    additionalGarmentChoice?.sourceParentGarmentKey ||
    (compatibleCopySources.length === 1
      ? compatibleCopySources[0].parentGarmentKey
      : null);

  useEffect(() => {
    if (!additionalGarmentCustomDetailsRequest) {
      setAdditionalGarmentChoice(null);
      return;
    }
    setAdditionalGarmentChoice((current) =>
      current?.transactionId ===
          additionalGarmentCustomDetailsRequest.transactionId &&
        current.garmentKey === additionalGarmentCustomDetailsRequest.garmentKey &&
        current.occurrenceGeneration ===
          additionalGarmentCustomDetailsRequest.occurrenceGeneration
        ? current
        : {
            ...additionalGarmentCustomDetailsRequest,
            sourceParentGarmentKey: null,
          },
    );
  }, [additionalGarmentCustomDetailsRequest]);

  useEffect(() => {
    if (!additionalGarmentChoice) return;
    const dialog = choiceDialogRef.current;
    dialog?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled])")?.focus();
  }, [additionalGarmentChoice]);

  useEffect(() => {
    const explicitNavigationRequested =
      additionalGarmentNavigationRequestId !== null;
    if (
      !explicitNavigationRequested &&
      !focusAdditionalGarmentKey
    ) {
      lastFocusedAdditionalGarmentKeyRef.current = null;
      return;
    }
    if (
      !explicitNavigationRequested &&
      lastFocusedAdditionalGarmentKeyRef.current === focusAdditionalGarmentKey
    ) {
      return;
    }
    if (
      explicitNavigationRequested &&
      lastHandledAdditionalGarmentNavigationRequestIdRef.current ===
        additionalGarmentNavigationRequestId
    ) {
      return;
    }
    const target = focusAdditionalGarmentKey
      ? additionalGarmentTargetRefs.current.get(focusAdditionalGarmentKey) ||
        Array.from(
          contentRef.current?.querySelectorAll<HTMLElement>(
            "[data-parent-garment-key]",
          ) || [],
        ).find(
          (element) =>
            element.dataset.parentGarmentKey === focusAdditionalGarmentKey,
        ) || null
      : contentRef.current?.querySelector<HTMLElement>(
          "[data-additional-garment-management]",
        ) || null;
    const heading = focusAdditionalGarmentKey
      ? target?.querySelector<HTMLElement>("[data-added-garment-heading]") ||
        target
      : target?.querySelector<HTMLElement>(
          "[data-additional-garment-management-heading]",
        ) || target;
    const repairControl = focusAdditionalGarmentKey
      ? target?.querySelector<HTMLButtonElement>(
          "[data-additional-garment-fabric-action]",
        )
      : null;
    const focusTarget = repairControl || heading;
    if (!focusTarget) return;
    let focusFrame: number | null = null;
    let timer: number | null = null;
    const scrollFrame = window.requestAnimationFrame(() => {
      // A Summary Edit can cause Chromium to scroll its source button into
      // view after the click. Defer this explicit target until that browser
      // behavior has settled so a repeated Edit always lands here again.
      focusTarget.scrollIntoView({ behavior: "smooth", block: "center" });
      focusFrame = window.requestAnimationFrame(() => {
        focusTarget.focus({ preventScroll: true });
        target?.setAttribute("data-additional-garment-highlight", "true");
        lastFocusedAdditionalGarmentKeyRef.current =
          focusAdditionalGarmentKey || null;
        if (explicitNavigationRequested) {
          lastHandledAdditionalGarmentNavigationRequestIdRef.current =
            additionalGarmentNavigationRequestId;
          onAdditionalGarmentNavigationHandled?.(
            additionalGarmentNavigationRequestId,
          );
        }
        timer = window.setTimeout(() => {
          target?.removeAttribute("data-additional-garment-highlight");
        }, 2400);
      });
    });
    return () => {
      window.cancelAnimationFrame(scrollFrame);
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [
    additionalGarmentNavigationRequestId,
    additionalGarments,
    catalogue.coreGroups,
    focusAdditionalGarmentKey,
    onAdditionalGarmentNavigationHandled,
  ]);

  useEffect(() => {
    return () => {
      goToTopDetachRef.current?.();
      goToTopDetachRef.current = null;
    };
  }, []);

  const handleGoToTop = () => {
    scrollCustomDetailsToTop({ title: titleRef.current });
  };

  const getAssignedFabricForGarment = (garmentKey: string) => {
    if (!fabricAllocationState) return null;
    const allocation = fabricAllocationState.fabricAllocations.find((candidate) =>
      candidate.garmentAssignments.some(
        (assignment) => assignment.garmentKey === garmentKey,
      ),
    );
    if (!allocation) return null;
    const fabric =
      fabrics.find((candidate) => candidate.code === allocation.fabricCode) ||
      null;
    const selectionIndex =
      fabricAllocationState.fabricAllocations.findIndex(
        (candidate) => candidate.allocationId === allocation.allocationId,
      ) + 1;
    return {
      fabric,
      fabricCode: allocation.fabricCode,
      selectionIndex: selectionIndex > 0 ? selectionIndex : null,
    };
  };
  const additionalGarmentKeys = new Set(
    additionalGarments
      .filter((garment) => garment.sourceRole === "additional")
      .map((garment) => garment.garmentKey),
  );
  const garmentFabricContexts = Array.from(
    reconciliation.subjects.reduce(
      (contexts, subject) => {
        if (!contexts.has(subject.parentGarmentKey)) {
          contexts.set(subject.parentGarmentKey, {
            garmentKey: subject.parentGarmentKey,
            garmentType: subject.parentGarmentType,
            sourceRole: additionalGarmentKeys.has(subject.parentGarmentKey)
              ? "additional"
              : "main",
          });
        }
        return contexts;
      },
      new Map<string, {
        garmentKey: string;
        garmentType: CanonicalPhysicalGarmentType;
        sourceRole: "main" | "additional";
      }>(),
    ).values(),
  );

  const closeAdditionalGarmentChoice = ({
    restoreFocus = true,
  }: {
    restoreFocus?: boolean;
  } = {}) => {
    setAdditionalGarmentChoice(null);
    if (!restoreFocus) return;
    window.requestAnimationFrame(() => {
      const trigger = choiceTriggerRef.current;
      if (trigger?.isConnected) {
        trigger.focus({ preventScroll: true });
      }
    });
  };
  const handleChoiceDialogKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "Escape") {
      if (
        additionalGarmentChoice &&
        onCancelAdditionalGarmentCustomDetails?.(additionalGarmentChoice)
      ) {
        closeAdditionalGarmentChoice({ restoreFocus: false });
      }
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      choiceDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const submitAdditionalGarmentChoice = (
    choice: AdditionalGarmentCustomDetailsChoice,
  ) => {
    if (!additionalGarmentChoice) return;
    if (
      onCompleteAdditionalGarmentCustomDetails?.(
        additionalGarmentChoice,
        choice,
      )
    ) {
      closeAdditionalGarmentChoice({ restoreFocus: false });
    }
  };
  const cancelAdditionalGarmentChoice = () => {
    if (!additionalGarmentChoice) return;
    if (onCancelAdditionalGarmentCustomDetails?.(additionalGarmentChoice)) {
      closeAdditionalGarmentChoice({ restoreFocus: false });
    }
  };
  const showAdditionalGarmentChoiceDialog =
    isCustomDetailsStage &&
    additionalGarmentChoice !== null &&
    compatibleCopySources.length > 0;

  useEffect(() => {
    if (!isCustomDetailsStage || !additionalGarmentChoice) return;
    if (compatibleCopySources.length > 0) return;
    const identity = `${additionalGarmentChoice.transactionId}:${additionalGarmentChoice.garmentKey}:${additionalGarmentChoice.occurrenceGeneration}`;
    if (autoChosenRequestIdentityRef.current === identity) return;
    autoChosenRequestIdentityRef.current = identity;
    submitAdditionalGarmentChoice({ mode: "choose" });
  }, [
    additionalGarmentChoice,
    compatibleCopySources.length,
    isCustomDetailsStage,
  ]);

  const renderOptions = (
    group: FutureCustomDetailsCatalogueGroup,
    occurrence: FutureCustomDetailsCatalogueOccurrence,
  ) => {
    const garmentKey = occurrence.subject.garmentKey;
    const groupId = `future-custom-detail-${garmentKey}-${group.selectionGroup}`;
    const groupBlocker = completion.blockers.find((blocker) =>
      blocker.garmentKey === occurrence.subject.garmentKey && blocker.selectionGroup === group.selectionGroup,
    );
    const selectedConstructionId = group.isConstruction
      ? getSelectedConstructionId(occurrence, group.selectionGroup)
      : null;
    const constructionPresentationPrefix = getConstructionPresentationPrefix(
      occurrence,
      group.selectionGroup,
    );
    const presentationOptions = constructionPresentationPrefix
      ? group.options.filter((option) =>
          option.id.startsWith(constructionPresentationPrefix),
        )
      : group.options;
    const noneSelected = !group.isConstruction && !hasSelection(
      reconciliation.state,
      occurrence.subject.garmentKey,
      group.selectionGroup,
    );
    const optionCardClassName = customDetailOptionCardClassName;
    const renderOptionCard = (option: CustomDetailOption) => {
      const optionId = `${groupId}-${option.id}`;
      const isPersonalizedRequirement =
        group.selectionGroup === PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP &&
        option.id === PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID;
      const checked = group.isConstruction
        ? selectedConstructionId === option.id
        : isSelected(reconciliation.state, occurrence.subject.garmentKey, group.selectionGroup, option.id);
      return (
        <div key={option.id} className="min-w-0 w-full">
          <label
            htmlFor={optionId}
            className={optionCardClassName(checked)}
          >
            <input
              id={optionId}
              type={group.allowMultiple ? "checkbox" : "radio"}
              name={group.allowMultiple ? undefined : groupId}
              checked={checked}
              onChange={() => {
                if (group.isConstruction) {
                  onConstructionSelect(occurrence.subject.parentGarmentKey, occurrence.subject.parentGarmentType, group.selectionGroup, option.id);
                } else if (group.allowMultiple) {
                  onToggleMultiSelect(occurrence.subject.garmentKey, group.selectionGroup, option.id);
                } else {
                  onSingleSelect(occurrence.subject.garmentKey, group.selectionGroup, option.id);
                }
              }}
              className="mt-0.5 size-5 shrink-0 accent-heritage-green"
            />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <span className="min-w-0 break-words text-sm font-bold leading-snug text-heritage-green">{option.label}</span>
                <span className="shrink-0 font-mono text-xs font-bold text-heritage-gold">{getOptionPriceLabel(option, group.isConstruction, checked)}</span>
              </span>
              {!isPersonalizedRequirement && option.description && <span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/65">{option.description}</span>}
              {!isPersonalizedRequirement && option.requiresEvaluation && <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-heritage-ink/50">Confirmed after tailoring review</span>}
            </span>
          </label>
        </div>
      );
    };

    const renderPersonalizedRequirementDetail = (option: CustomDetailOption) => {
      const isPersonalizedRequirement =
        group.selectionGroup === PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP &&
        option.id === PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID;
      if (!isPersonalizedRequirement) return null;

      const optionId = `${groupId}-${option.id}`;
      const checked = isSelected(
        reconciliation.state,
        occurrence.subject.garmentKey,
        group.selectionGroup,
        option.id,
      );
      if (!checked) return null;

      const identity = getIdentityKey(garmentKey, group.selectionGroup, option.id);
      const persistedText = getGarmentScopedCustomDetailText(
        personalizedInputs,
        occurrence.subject.garmentKey,
        group.selectionGroup,
        option.id,
      );
      const text = overLimitText[identity] ?? persistedText ?? "";
      const textValidation = validateGarmentScopedCustomDetailText(text);
      const textError = textValidation.status === "too_long"
        ? `Use ${GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH.toLocaleString()} characters or fewer.`
        : textValidation.status === "empty"
          ? "Describe your personalized requirement before continuing."
          : undefined;

      return (
        <div
          key={`${option.id}-detail`}
          data-custom-detail-conditional-row={option.id}
          data-custom-detail-conditional-group={group.selectionGroup}
          data-custom-detail-conditional-garment={garmentKey}
          className="min-w-0 rounded-xl border border-heritage-green/15 bg-heritage-cream/20 p-3"
        >
          {option.description && <p className="text-xs leading-relaxed text-heritage-ink/65">{option.description}</p>}
          {option.requiresEvaluation && <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-heritage-ink/50">Confirmed after tailoring review</p>}
          <label htmlFor={`${optionId}-text`} className="mt-3 block text-xs font-bold text-heritage-green">Describe your personalized requirement</label>
          <textarea
            id={`${optionId}-text`}
            value={text}
            onChange={(event) => {
              const nextText = event.target.value;
              if (validateGarmentScopedCustomDetailText(nextText).status === "too_long") {
                setOverLimitText((current) => ({ ...current, [identity]: nextText }));
                return;
              }
              setOverLimitText((current) => {
                const { [identity]: _removed, ...rest } = current;
                return rest;
              });
              onPersonalizedTextChange(occurrence.subject.garmentKey, group.selectionGroup, option.id, nextText);
            }}
            aria-invalid={Boolean(textError)}
            aria-describedby={textError ? `${optionId}-text-error` : undefined}
            className="mt-2 min-h-28 w-full rounded-xl border border-heritage-green/20 bg-white p-3 text-sm text-heritage-ink outline-none transition focus:border-heritage-gold focus:ring-2 focus:ring-heritage-gold/30"
          />
          <div className="mt-1 flex min-w-0 items-start justify-between gap-3 text-[11px]">
            <span id={`${optionId}-text-error`} className="min-w-0 break-words text-red-700">{textError}</span>
            <span className="shrink-0 text-heritage-ink/55">{text.length}/{GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH.toLocaleString()}</span>
          </div>
        </div>
      );
    };

    const renderNoneOption = () => (
      <label className={optionCardClassName(noneSelected)}>
        <input
          type="radio"
          name={`${groupId}-none`}
          checked={noneSelected}
          onChange={() => onClearSelection(occurrence.subject.garmentKey, group.selectionGroup)}
          className="mt-0.5 size-5 shrink-0 accent-heritage-green"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-heritage-green">None</span>
          <span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/65">No selection for this category</span>
        </span>
      </label>
    );

    const renderOptionGrid = (options: readonly CustomDetailOption[]) => (
      <div
        data-custom-detail-option-grid={group.selectionGroup}
        className={`grid min-w-0 w-full grid-cols-1 items-start gap-2.5${
          group.selectionGroup === PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP
            ? " sm:grid-cols-2"
            : ""
        }`}
      >
        {!group.isConstruction && renderNoneOption()}
        {options.map(renderOptionCard)}
      </div>
    );

    return (
      <div className="min-w-0 space-y-2.5">
        {group.selectionGroup === "neck_design" ? (
          <>
            {!group.isConstruction && renderNoneOption()}
            <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4">
              {NECK_DESIGN_SUBCATEGORY_ORDER.map((subcategory) => {
                const options = presentationOptions.filter(
                  (option) => NECK_DESIGN_SUBCATEGORY_BY_OPTION_ID[option.id] === subcategory,
                );
                if (options.length === 0) return null;
                return (
                  <section key={subcategory} className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-heritage-cream/20 p-3 sm:p-4">
                    <h5 className="border-b border-heritage-gold/20 pb-2 text-xs font-bold uppercase tracking-wide text-heritage-green">{subcategory}</h5>
                    <div className="mt-3 space-y-3">{options.map(renderOptionCard)}</div>
                  </section>
                );
              })}
            </div>
          </>
        ) : renderOptionGrid(presentationOptions)}
        {presentationOptions.map(renderPersonalizedRequirementDetail)}
        {presentationOptions.length === 0 && <p className="text-xs text-heritage-ink/60">No current catalogue options are available.</p>}
        {groupBlocker && <p className="text-xs text-red-700">{groupBlocker.message}</p>}
      </div>
    );
  };

  const mainCoreGroups = useMemo(
    () => partitionCatalogueGroupsByRole(catalogue.coreGroups, "main"),
    [catalogue.coreGroups],
  );
  const mainAdditionalCostGroups = useMemo(
    () => partitionCatalogueGroupsByRole(catalogue.additionalCostGroups, "main"),
    [catalogue.additionalCostGroups],
  );
  const collectMainGarmentFamilySections = (
    groups: readonly FutureCustomDetailsCatalogueGroup[],
  ) => {
    const sections = new Map<string, {
      id: string;
      title: string;
      order: number;
      groups: FutureCustomDetailsCatalogueGroup[];
    }>();
    groups.forEach((group) => {
      group.occurrences.forEach((occurrence) => {
        const family = getMainGarmentFamily(occurrence, group.selectionGroup, parentOccurrenceLabels);
        const section = sections.get(family.id) || {
          ...family,
          order: getMainGarmentFamilyPresentationOrder(family.id),
          groups: [],
        };
        const existingGroupIndex = section.groups.findIndex(
          (candidate) => candidate.selectionGroup === group.selectionGroup,
        );
        if (existingGroupIndex >= 0) {
          const existingGroup = section.groups[existingGroupIndex];
          section.groups[existingGroupIndex] = {
            ...existingGroup,
            occurrences: [...existingGroup.occurrences, occurrence],
          };
        } else {
          section.groups.push({ ...group, occurrences: [occurrence] });
        }
        sections.set(family.id, section);
      });
    });
    return [...sections.values()].sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
  };
  const mainGarmentSections = useMemo(() => {
    return collectMainGarmentFamilySections([
      ...mainCoreGroups,
      ...mainAdditionalCostGroups,
    ].map((group) => ({
      ...group,
      occurrences: group.occurrences.filter((occurrence) => occurrence.role === "main"),
    })).filter((group) => group.occurrences.length > 0));
  }, [
    mainAdditionalCostGroups,
    mainCoreGroups,
  ]);
  const mainPersonalizedGroups = useMemo(
    () => partitionCatalogueGroupsByRole([catalogue.personalizedGroup], "main"),
    [catalogue.personalizedGroup],
  );
  const getGroupStatus = (group: FutureCustomDetailsCatalogueGroup) =>
    group.occurrences.some((occurrence) => occurrence.construction?.status !== "resolved")
      ? "Price pending"
      : group.occurrences.some((occurrence) =>
          completion.blockers.some((blocker) =>
            blocker.garmentKey === occurrence.subject.garmentKey &&
            blocker.selectionGroup === group.selectionGroup,
          ),
        )
        ? "Incomplete"
        : group.isConstruction
          ? "Complete"
          : "Optional";
  const renderGroupFieldset = (
    group: FutureCustomDetailsCatalogueGroup,
    headingMode: "base" | "added",
    layout: "grid" | "stack" = "grid",
    {
      legendTitle = group.title,
      showOccurrenceHeading = true,
      occurrenceHeading,
    }: {
      legendTitle?: string;
      showOccurrenceHeading?: boolean;
      occurrenceHeading?: (
        occurrence: FutureCustomDetailsCatalogueOccurrence,
      ) => string;
    } = {},
  ) => (
    <fieldset
      key={`${group.selectionGroup}-${group.occurrences.map((occurrence) => occurrence.subject.garmentKey).join("-")}`}
      data-custom-detail-group={group.selectionGroup}
      data-active-occurrences={group.occurrences.length}
      className={`${CUSTOM_DETAIL_FIELDSET_CLASS} ${layout === "grid" && (group.selectionGroup === "neck_design" || group.selectionGroup === PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP) ? "lg:col-span-2" : ""}`}
    >
      <legend className={`${CUSTOM_DETAIL_SUBSECTION_HEADING_ROW_CLASS} text-heritage-green`}>
        <span className={CUSTOM_DETAIL_SUBSECTION_HEADING_TEXT_CLASS}>{legendTitle}</span>
        <span className={CUSTOM_DETAIL_STATUS_BADGE_CLASS}>{getGroupStatus(group)}</span>
      </legend>
      <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">{group.isConstruction ? "Select the all-inclusive construction that applies to this garment." : "Select an option or keep None for this category."}</p>
      <div className="mt-2.5 space-y-4">
        {group.occurrences.map((occurrence) => (
          <div
            key={occurrence.subject.garmentKey}
            className="min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            {showOccurrenceHeading ? (
              <h4
                data-custom-detail-occurrence={occurrence.subject.garmentKey}
                className={`mb-1.5 ${CUSTOM_DETAIL_SUBSECTION_HEADING_CLASS} outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 ${headingMode === "added" ? "text-heritage-gold" : "text-heritage-green"}`}
              >
                {occurrenceHeading
                  ? occurrenceHeading(occurrence)
                  : `${getSubjectLabel(occurrence.subject, parentOccurrenceLabels)} - ${headingMode === "added" ? "Added garment" : "Base garment"}`}
              </h4>
            ) : null}
            {renderOptions(group, occurrence)}
          </div>
        ))}
      </div>
    </fieldset>
  );
  const renderGroupFieldsets = (
    groups: readonly FutureCustomDetailsCatalogueGroup[],
    headingMode: "base" | "added",
  ) => (
    <div className="mt-4 grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2">
      {groups.map((group) => renderGroupFieldset(group, headingMode))}
    </div>
  );
  const renderMainGarmentSection = ({
    id,
    title,
    groups,
    headingMode = "base",
    showFamilyHeader = true,
  }: {
    id: string;
    title: string;
    groups: readonly FutureCustomDetailsCatalogueGroup[];
    headingMode?: "base" | "added";
    showFamilyHeader?: boolean;
  }) => {
    const useGarmentOwnedBlocks =
      id === "shirts" ||
      id === "dresses" ||
      id === "skirts" ||
      id === "trouser" ||
      id === "shorts";
    const constructionGroups = groups.filter((group) => group.isConstruction);
    const pocketsGroups = groups.filter(
      (group) => getGarmentFirstDetailLabel(group.selectionGroup) === "Pockets",
    );
    const companionGroups = groups.filter((group) =>
      isCompanionCustomerAdditionalClothesCostGroup(group.selectionGroup),
    );
    const sharedGroups = groups.filter(
      (group) =>
        !group.isConstruction &&
        getGarmentFirstDetailLabel(group.selectionGroup) !== "Pockets" &&
        !isCompanionCustomerAdditionalClothesCostGroup(group.selectionGroup),
    );
    const garmentBlockOccurrences: FutureCustomDetailsCatalogueOccurrence[] = [];
    const seenGarmentKeys = new Set<string>();
    constructionGroups.forEach((group) => {
      group.occurrences.forEach((occurrence) => {
        if (seenGarmentKeys.has(occurrence.subject.garmentKey)) return;
        seenGarmentKeys.add(occurrence.subject.garmentKey);
        garmentBlockOccurrences.push(occurrence);
      });
    });
    const groupForOccurrence = (
      candidates: readonly FutureCustomDetailsCatalogueGroup[],
      garmentKey: string,
    ) =>
      candidates.find((group) =>
        group.occurrences.some(
          (occurrence) => occurrence.subject.garmentKey === garmentKey,
        ),
      );
    const renderOccurrenceGroup = (
      group: FutureCustomDetailsCatalogueGroup,
      occurrence: FutureCustomDetailsCatalogueOccurrence,
      legendTitle: string,
      headingMode: "base" | "added" = "base",
    ) =>
      renderGroupFieldset(
        { ...group, occurrences: [occurrence] },
        headingMode,
        "grid",
        {
          legendTitle,
          showOccurrenceHeading: false,
        },
      );
    const getGarmentBlockDataProps = (garmentKey: string) => {
      switch (id) {
        case "shirts":
          return { "data-shirt-garment-block": garmentKey };
        case "dresses":
          return { "data-dress-garment-block": garmentKey };
        case "skirts":
          return { "data-skirt-garment-block": garmentKey };
        case "trouser":
          return { "data-trouser-garment-block": garmentKey };
        case "shorts":
          return { "data-shorts-garment-block": garmentKey };
        default:
          return {};
      }
    };
    const hideDuplicateOccurrenceTitle =
      garmentBlockOccurrences.length === 1 &&
      getGarmentFirstLabel(garmentBlockOccurrences[0], parentOccurrenceLabels).toUpperCase() === title;
    const ownedBlocks = garmentBlockOccurrences.map((occurrence) => {
      const constructionGroup = groupForOccurrence(
        constructionGroups,
        occurrence.subject.garmentKey,
      );
      const pocketsGroup = groupForOccurrence(
        pocketsGroups,
        occurrence.subject.garmentKey,
      );
      if (!constructionGroup) return null;
      const showOccurrenceTitle =
        headingMode === "added" || !hideDuplicateOccurrenceTitle;
      return (
        <section
          key={occurrence.subject.garmentKey}
          {...getGarmentBlockDataProps(occurrence.subject.garmentKey)}
          data-custom-detail-occurrence={
            showOccurrenceTitle ? undefined : occurrence.subject.garmentKey
          }
          className="min-w-0 w-full rounded-xl border border-heritage-gold/20 bg-heritage-cream/20 p-3 sm:p-4"
        >
          {showOccurrenceTitle ? (
            <h4
              data-custom-detail-occurrence={occurrence.subject.garmentKey}
              className={`border-b border-heritage-gold/20 pb-2 ${CUSTOM_DETAIL_SUBSECTION_HEADING_CLASS} ${headingMode === "added" ? "text-heritage-gold" : "text-heritage-green"}`}
            >
              {getGarmentFirstLabel(occurrence, parentOccurrenceLabels)}
            </h4>
          ) : null}
          <div
            className={`${showOccurrenceTitle ? "mt-3 " : ""}${CUSTOM_DETAIL_BALANCED_PAIR_GRID_CLASS}`}
          >
            {renderOccurrenceGroup(
              constructionGroup,
              occurrence,
              "Main Garment",
              headingMode,
            )}
            {pocketsGroup
              ? renderOccurrenceGroup(
                  pocketsGroup,
                  occurrence,
                  `Pocket for ${getGarmentFirstLabel(occurrence, parentOccurrenceLabels)}`,
                  headingMode,
                )
              : null}
          </div>
        </section>
      );
    });

    const ownedContent =
      useGarmentOwnedBlocks && constructionGroups.length > 0 ? (
        <div>
            {companionGroups.length > 0 ? (
              <div className="overflow-x-hidden">
                <div
                  data-dress-additional-layout="companion"
                  className={CUSTOM_DETAIL_COMPANION_PAIR_GRID_CLASS}
                >
                  <div className="min-w-0 space-y-4">{ownedBlocks}</div>
                  {renderDressCompanion(companionGroups, headingMode)}
                </div>
              </div>
            ) : (
            <div className="mt-4 space-y-4">{ownedBlocks}</div>
          )}
          {sharedGroups.length > 0 && (
            <div className="mt-4 grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2">
              {sharedGroups.map((group) =>
                renderGroupFieldset(group, headingMode, "grid", {
                  legendTitle: getGarmentFirstDetailLabel(group.selectionGroup),
                  occurrenceHeading:
                    group.selectionGroup === "neck_design"
                      ? (occurrence) => getNeckDesignOccurrenceHeading(occurrence, parentOccurrenceLabels)
                      : (occurrence) => getGarmentFirstLabel(occurrence, parentOccurrenceLabels),
                }),
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {groups.map((group) =>
            renderGroupFieldset(group, headingMode, "grid", {
            legendTitle: getGarmentFirstDetailLabel(group.selectionGroup),
            occurrenceHeading:
              group.selectionGroup === "neck_design"
                ? (occurrence) => getNeckDesignOccurrenceHeading(occurrence, parentOccurrenceLabels)
                : (occurrence) => getGarmentFirstLabel(occurrence, parentOccurrenceLabels),
            }),
          )}
        </div>
      );

    if (!showFamilyHeader) {
      return (
        <div key={id} className="min-w-0">
          {ownedContent}
        </div>
      );
    }

    return (
      <section
        key={id}
        data-custom-detail-family-section={id}
        className={`min-w-0 max-w-full rounded-2xl border border-heritage-gold/35 bg-white p-3 shadow-sm sm:p-4${companionGroups.length > 0 ? " overflow-x-hidden" : ""}`}
      >
        <header className="border-b border-heritage-gold/35 pb-2.5">
          <h3 className="break-words font-serif text-lg font-bold uppercase tracking-wide text-heritage-green">
            {title}
          </h3>
        </header>
        {ownedContent}
      </section>
    );
  };
  const renderDressCompanion = (
    groups: readonly FutureCustomDetailsCatalogueGroup[],
    headingMode: "base" | "added",
  ) => {
    const visibleGroups = groups.filter((group) => group.occurrences.length > 0);
    if (visibleGroups.length === 0) return null;
    const selectionGroups = new Set(
      visibleGroups.map((group) => group.selectionGroup),
    );
    const companionPresentation =
      selectionGroups.size === 1 && selectionGroups.has("dress_additional")
        ? {
            section: "dress-additional-clothes-costs",
            ariaLabel: "Dress additional clothes costs",
            helper:
              "Optional extras for this dress. Keep None if you do not want lining, net, or wraps.",
          }
        : selectionGroups.size === 1 &&
            selectionGroups.has("standard_shorts_additional")
          ? {
              section: "standard-shorts-additional-clothes-costs",
              ariaLabel: "Standard Nikka Shorts additional clothes costs",
              helper:
                "Optional extras for these shorts. Keep None if you do not want extra pockets.",
            }
          : {
              section: "additional-clothes-costs",
              ariaLabel: "Additional clothes costs",
              helper:
                "Optional extras for this garment. Keep None if you do not want additions.",
            };
    return (
      <aside
        data-custom-detail-section={companionPresentation.section}
        aria-label={companionPresentation.ariaLabel}
        className="min-w-0 max-w-full rounded-xl border border-heritage-gold/25 bg-heritage-cream/30 p-3 sm:p-4"
      >
        <h4 className={`min-w-0 ${CUSTOM_DETAIL_SUBSECTION_HEADING_CLASS} text-heritage-green`}>
          Additional Clothes Costs
        </h4>
        <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">
          {companionPresentation.helper}
        </p>
        <div className="mt-3 min-w-0 space-y-4">
          {visibleGroups.map((group) => renderGroupFieldset(group, headingMode, "stack"))}
        </div>
      </aside>
    );
  };
  const renderCatalogueSection = ({
    title,
    groups,
    headingMode = "base",
    companionGroups = [],
  }: {
    title: string;
    groups: readonly FutureCustomDetailsCatalogueGroup[];
    headingMode?: "base" | "added";
    companionGroups?: readonly FutureCustomDetailsCatalogueGroup[];
  }) => {
    const visibleGroups = groups.filter((group) => group.occurrences.length > 0);
    const visibleCompanions = companionGroups.filter((group) => group.occurrences.length > 0);
    if (visibleGroups.length === 0 && visibleCompanions.length === 0) return null;
    const occurrences = [...visibleGroups, ...visibleCompanions].flatMap((group) => group.occurrences);
    const hasPricingPending = occurrences.some((occurrence) => occurrence.construction?.status !== "resolved");
    const hasIncompleteOccurrence = occurrences.some((occurrence) =>
      completion.blockers.some((blocker) => blocker.garmentKey === occurrence.subject.garmentKey),
    );
    const sectionBadge = hasPricingPending
      ? "Price pending"
      : hasIncompleteOccurrence
        ? "Incomplete"
        : headingMode === "added"
          ? "Added garment"
          : "Base garment";
    const useCompanionLayout = visibleCompanions.length > 0;

    return (
      <section key={title} className={`min-w-0 max-w-full rounded-2xl border border-heritage-gold/35 bg-white p-3 shadow-sm sm:p-4${useCompanionLayout ? " overflow-x-hidden" : ""}`}>
        <header className="flex min-w-0 flex-col gap-2 border-b border-heritage-gold/35 pb-2.5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="break-words font-serif text-lg font-bold uppercase tracking-wide text-heritage-green">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">
              {headingMode === "added" ? "Added garment Custom Details stay independent of the main garments above." : "Included in your selected design"}
            </p>
          </div>
          <span className="w-fit shrink-0 rounded-full border border-heritage-green/30 bg-heritage-green/5 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-heritage-green">
            {sectionBadge}
          </span>
        </header>
        {useCompanionLayout ? (
          <div
            data-dress-additional-layout="companion"
            className={CUSTOM_DETAIL_COMPANION_PAIR_GRID_CLASS}
          >
            <div className="min-w-0 space-y-4">
              {visibleGroups.map((group) => renderGroupFieldset(group, headingMode, "stack"))}
            </div>
            {renderDressCompanion(visibleCompanions, headingMode)}
          </div>
        ) : (
          renderGroupFieldsets(visibleGroups, headingMode)
        )}
      </section>
    );
  };

  return (
    <section aria-labelledby={`future-${stage}-title`} data-stage-id={stage} data-stage-complete={canContinue} className="relative space-y-4 font-sans">
      <div ref={setTopSentinelRef} data-custom-details-top-sentinel="true" aria-hidden="true" className="h-px w-full" />
      <div className="rounded-3xl border border-heritage-gold/25 bg-white p-4 shadow-sm sm:p-5">
        <DesignStudioStepActions
          backDestination={previousStageLabel}
          onBack={onBack}
          className="mb-3"
          forward={{
            destination: nextStageLabel,
            onClick: onContinue,
            disabled: !canContinue,
            locked: !canContinue,
            ariaLabel: canContinue
              ? `Continue to ${nextStageLabel}`
              : `Continue to ${nextStageLabel} is locked until ${stageTitle} are complete`,
          }}
        />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">Step {isPersonalizedAdditionsStage ? 5 : 4} of 10</p>
        <h2
          id={`future-${stage}-title`}
          ref={titleRef}
          tabIndex={-1}
          className="mt-1 scroll-mt-24 font-serif text-2xl font-bold text-heritage-green outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:text-3xl"
        >
          {stageTitle}
        </h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">{isPersonalizedAdditionsStage ? "Add personalized requirements, embroidery, accessories, and any additional garment details. These choices stay in the same garment-scoped Custom Details record." : "Review the construction and Custom Details relevant to your selected garments and design. Base garment construction was selected in Garment Type and is already included in your price."}</p>
      </div>

      {completion.blockers.length > 0 && (
        <div role="alert" className="rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 p-4">
          <p className="text-sm font-bold text-heritage-green">{stageTitle} need attention</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-heritage-ink/70">{Array.from(new Set(completion.blockers.map((blocker) => blocker.message))).map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      )}
      {garmentFabricContexts.length > 0 && (
        <section
          aria-label="Garment and Fabric context"
          data-step4-garment-context-list={isCustomDetailsStage || undefined}
          data-step5-garment-context-list={
            isPersonalizedAdditionsStage || undefined
          }
          className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {garmentFabricContexts.map((context) => {
            const garmentLabel = getCustomDetailsGarmentLabel(context.garmentType);
            const referenceImage = isStep1GarmentReferenceType(context.garmentType)
              ? getStep1GarmentReferenceImage(context.garmentType)
              : null;
            const assigned = getAssignedFabricForGarment(context.garmentKey);
            return (
              <article
                key={context.garmentKey}
                data-step4-garment-context={
                  isCustomDetailsStage ? context.garmentKey : undefined
                }
                data-step5-garment-context={
                  isPersonalizedAdditionsStage ? context.garmentKey : undefined
                }
                className="flex min-w-0 items-center gap-3 rounded-xl border border-heritage-gold/20 bg-heritage-cream/25 p-2.5"
              >
                {referenceImage ? (
                  <img
                    src={referenceImage.src}
                    alt={getStep1GarmentReferenceAlt(garmentLabel)}
                    data-step4-garment-reference={context.garmentKey}
                    className="size-11 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div
                    role="img"
                    aria-label={`Garment preview unavailable for ${garmentLabel}`}
                    data-step4-garment-reference={context.garmentKey}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-heritage-gold/10 px-1 text-center text-[9px] font-semibold leading-tight text-heritage-ink/55"
                  >
                    Garment preview unavailable
                  </div>
                )}
                {assigned ? (
                  <AssignedFabricPreview
                    fabric={assigned.fabric}
                    garmentKey={context.garmentKey}
                    garmentLabel={garmentLabel}
                    fabricCode={assigned.fabricCode}
                    className="size-11 shrink-0 overflow-hidden rounded-lg border border-heritage-gold/25 bg-heritage-cream/40"
                  />
                ) : (
                  <div
                    role="img"
                    aria-label={`No Fabric assigned to ${garmentLabel}`}
                    data-step4-assigned-fabric={context.garmentKey}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-dashed border-heritage-gold/35 px-1 text-center text-[9px] font-semibold leading-tight text-heritage-ink/55"
                  >
                    No Fabric
                  </div>
                )}
                <div className="min-w-0 text-xs leading-snug">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <p className="text-heritage-ink/60">Garment</p>
                    {context.sourceRole === "additional" ? (
                      <span className="rounded-full border border-heritage-gold/35 bg-heritage-gold/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-heritage-gold">
                        Additional
                      </span>
                    ) : null}
                  </div>
                  <p className="break-words font-bold text-heritage-green">{garmentLabel}</p>
                  <p className="mt-1 text-heritage-ink/60">Assigned Fabric</p>
                  <p className="break-words font-semibold text-heritage-ink">
                    {assigned?.fabric?.name || assigned?.fabricCode || "Not assigned"}
                  </p>
                </div>
              </article>
            );
          })}
        </section>
      )}
      {isPersonalizedAdditionsStage && fabricAnnouncement ? (
        <div
          role="status"
          aria-live="polite"
          data-additional-garment-fabric-announcement="true"
          className="rounded-2xl border border-heritage-green/20 bg-heritage-cream/40 px-4 py-3 text-sm text-heritage-green"
        >
          <p>{fabricAnnouncement}</p>
          {focusAdditionalGarmentKey && onViewAdditionalGarment ? (
            <button
              type="button"
              data-view-added-garment="true"
              onClick={() => onViewAdditionalGarment(focusAdditionalGarmentKey)}
              className="mt-2 inline-flex min-h-11 items-center rounded-xl border border-heritage-green/30 px-3 text-xs font-bold uppercase tracking-wider text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
            >
              View garment
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] lg:gap-6">
        <div ref={contentRef} className="min-w-0 space-y-4">
          {isCustomDetailsStage && (
          <div data-custom-detail-section="main-garment-details" className="min-w-0 space-y-4">
            {mainGarmentSections.map(renderMainGarmentSection)}

          </div>
          )}

          {isPersonalizedAdditionsStage && mainPersonalizedGroups.length > 0 && renderCatalogueSection({
              title: "Miscellaneous - Personalized Additional",
              groups: mainPersonalizedGroups,
            })}

          {isPersonalizedAdditionsStage && (
          <section data-custom-detail-section="monogram-embroidery" className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="border-b border-heritage-gold/35 pb-3 font-serif text-lg font-bold uppercase tracking-wide text-heritage-green">Monogram and Embroidery Design</h3>
            <p className="mt-1 text-xs text-heritage-ink/60">Optional. Select None to remove all monogram and embroidery choices.</p>
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <label className={`flex min-h-12 min-w-0 items-center gap-3 rounded-xl border-2 p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${selectedDecorativeFeatures.size === 0 ? "border-heritage-green bg-heritage-green/5" : "border-heritage-green/65 bg-white"}`}><input type="radio" name="future-decorative-none" checked={selectedDecorativeFeatures.size === 0} onChange={onClearDecorativeFeatures} className="size-5 shrink-0 accent-heritage-green" /><span className="min-w-0"><span className="block text-sm font-bold text-heritage-green">None</span><span className="mt-1 block text-xs text-heritage-ink/65">No selection for this category</span></span></label>
              {customerSelectableDecorativeFeatures.map((feature) => <label key={feature} className={`flex min-h-12 min-w-0 cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition hover:border-heritage-gold focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${selectedDecorativeFeatures.has(feature) ? "border-heritage-green bg-heritage-green/5" : "border-heritage-green/65 bg-white"}`}><input type="checkbox" checked={selectedDecorativeFeatures.has(feature)} onChange={() => onDecorativeFeatureToggle(feature)} className="mt-0.5 size-5 shrink-0 accent-heritage-green" /><span className="min-w-0 flex-1"><span className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1"><span className="min-w-0 break-words text-sm font-bold text-heritage-green">{feature}</span><span className="shrink-0 font-mono text-xs font-bold text-heritage-gold">+{money(getDecorativeFeaturePrice(selectedStyle, feature))}</span></span><span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/65">{DECORATIVE_FEATURE_DESCRIPTIONS[feature]}</span></span></label>)}
            </div>
            {selectedDecorativeFeatures.has("Name Monogram") && availableMonogramPlacements.length > 0 && (
              <fieldset className="mt-4"><legend className="text-xs font-bold text-heritage-green">Monogram placement</legend><div className="mt-2 flex flex-wrap gap-2">{availableMonogramPlacements.map((placement) => <label key={placement.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-heritage-green/15 px-3 text-xs text-heritage-green focus-within:ring-2 focus-within:ring-heritage-gold"><input type="radio" name="future-monogram-placement" checked={designSelections.monogramPlacement === placement.value} onChange={() => onMonogramPlacementChange(placement.value)} className="size-4 accent-heritage-green" />{placement.label}</label>)}</div></fieldset>
            )}
          </section>
          )}

          {isPersonalizedAdditionsStage && (
          <section data-custom-detail-section="accessories" className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="border-b border-heritage-gold/35 pb-3 font-serif text-lg font-bold uppercase tracking-wide text-heritage-green">Select Accessories - Optional</h3>
            <p className="mt-1 text-xs text-heritage-ink/60">Optional accessories remain separate from garment construction.</p>
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <label className={`flex min-h-12 min-w-0 items-center gap-3 rounded-xl border-2 p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${selectedAccessories.size === 0 ? "border-heritage-green bg-heritage-green/5" : "border-heritage-green/65 bg-white"}`}><input type="radio" name="future-accessories-none" checked={selectedAccessories.size === 0} onChange={onClearAccessories} className="size-5 shrink-0 accent-heritage-green" /><span className="min-w-0"><span className="block text-sm font-bold text-heritage-green">None</span><span className="mt-1 block text-xs text-heritage-ink/65">No selection for this category</span></span></label>
              {TRADITIONAL_ACCESSORY_OPTIONS.map((accessory) => <label key={accessory} className={`flex min-h-12 min-w-0 cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition hover:border-heritage-gold focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${selectedAccessories.has(accessory) ? "border-heritage-green bg-heritage-green/5" : "border-heritage-green/65 bg-white"}`}><input type="checkbox" checked={selectedAccessories.has(accessory)} onChange={() => onAccessoryToggle(accessory)} className="mt-0.5 size-5 shrink-0 accent-heritage-green" /><span className="min-w-0 flex-1"><span className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1"><span className="min-w-0 break-words text-sm font-bold text-heritage-green">{accessory}</span><span className="shrink-0 font-mono text-xs font-bold text-heritage-gold">+{money(getTraditionalAccessoryPrice(selectedStyle, accessory))}</span></span><span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/65">{TRADITIONAL_ACCESSORY_DESCRIPTIONS[accessory]}</span></span></label>)}
            </div>
          </section>
          )}

          {isPersonalizedAdditionsStage && (
          <section data-custom-detail-section="add-additional-garment" data-additional-garment-management="true" className="min-w-0 rounded-2xl border border-heritage-gold/25 bg-heritage-cream/25 p-4 shadow-sm sm:p-5">
            <h3 data-additional-garment-management-heading="true" tabIndex={-1} className="border-b border-heritage-gold/35 pb-3 font-serif text-lg font-bold uppercase tracking-wide text-heritage-green">Add Additional Garment</h3>
            <p className="mt-1 text-xs leading-relaxed text-heritage-ink/65">Add a physical garment occurrence. Its default construction and fabric requirements will be resolved through the same order workflow.</p>
            {fabricPersistentError ? (
              <div
                role="alert"
                aria-live="assertive"
                data-additional-garment-fabric-error="true"
                data-additional-garment-fabric-persistent-error="true"
                className="mt-4 rounded-2xl border border-red-300/50 bg-red-50/80 px-4 py-3"
              >
                <p className="text-sm font-bold text-red-800">Fabric assignment notice</p>
                <p className="mt-1 text-sm text-red-900/90">{fabricPersistentError}</p>
              </div>
            ) : null}
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {additionalGarmentConstructionOptions.map(({ garmentType, construction }) => <button key={garmentType} type="button" onClick={(event) => { choiceTriggerRef.current = event.currentTarget; onAddAdditionalGarment(garmentType, event.currentTarget); }} className="inline-flex min-h-12 min-w-0 items-start justify-between gap-3 rounded-xl border-2 border-heritage-green/65 bg-white p-3 text-left text-xs font-bold text-heritage-green transition hover:border-heritage-gold hover:bg-heritage-gold/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"><span className="flex min-w-0 items-center gap-2"><Plus aria-hidden="true" size={15} className="shrink-0" /><span className="min-w-0 break-words">Add {getCustomDetailsGarmentLabel(garmentType)}</span></span><span className="shrink-0 font-mono text-[11px] text-heritage-gold">{construction.status === "resolved" ? money(construction.totalPrice) : "Price pending"}</span></button>)}
            </div>
            {additionalGarments.length > 0 && (
              <div className="mt-5 space-y-4 border-t border-heritage-gold/20 pt-4">
                {additionalGarments.map((garment) => {
                  const additionalCoreGroups = partitionCatalogueGroupsByRole(
                    catalogue.coreGroups,
                    "additional",
                    garment.garmentKey,
                  );
                  const additionalCostGroups = partitionCatalogueGroupsByRole(
                    catalogue.additionalCostGroups,
                    "additional",
                    garment.garmentKey,
                  );
                  const additionalPersonalizedGroups = partitionCatalogueGroupsByRole(
                    [catalogue.personalizedGroup],
                    "additional",
                    garment.garmentKey,
                  );
                  const additionalOwnedSections = collectMainGarmentFamilySections([
                    ...additionalCoreGroups,
                    ...additionalCostGroups,
                  ]);
                  return (
                    <div
                      key={garment.garmentKey}
                      ref={(element) => {
                        if (element) {
                          additionalGarmentTargetRefs.current.set(
                            garment.garmentKey,
                            element,
                          );
                        } else {
                          additionalGarmentTargetRefs.current.delete(
                            garment.garmentKey,
                          );
                        }
                      }}
                      data-parent-garment-key={garment.garmentKey}
                      data-additional-garment-details={garment.garmentKey}
                      className="min-w-0 space-y-4 rounded-xl border border-heritage-green/15 bg-white p-3 sm:p-4"
                    >
                      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <h4
                          data-added-garment-heading="true"
                          tabIndex={-1}
                          className="min-w-0 break-words text-sm font-bold uppercase tracking-wide text-heritage-gold outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                        >
                          {exactParentLabel(parentOccurrenceLabels, garment.garmentKey, garment.garmentType)} - Added garment
                        </h4>
                        {isPersonalizedAdditionsStage && removalTargets.length > 0
                          ? removalTargets
                              .filter((target) => target.garmentKey === garment.garmentKey)
                              .map((target) => (
                                <button
                                  key={target.garmentKey}
                                  type="button"
                                  disabled={!target.canRequestRemoval}
                                  aria-label={target.accessibleName}
                                  data-garment-removal-button={target.garmentKey}
                                  onClick={(event) => {
                                    onRequestGarmentRemoval?.(target, event.currentTarget);
                                  }}
                                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-red-200 px-3 text-xs font-bold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                                >
                                  Remove
                                </button>
                              ))
                          : null}
                      </div>
                      {(() => {
                        const assigned = getAssignedFabricForGarment(garment.garmentKey);
                        if (!assigned) {
                          return (
                            <div
                              data-additional-garment-fabric-summary={garment.garmentKey}
                              className="flex min-w-0 flex-col gap-3 rounded-xl border border-amber-300/60 bg-amber-50/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-heritage-green">
                                  Fabric: Needs fabric
                                </p>
                                <p className="mt-1 text-[11px] leading-relaxed text-heritage-ink/65">
                                  Assign fabric for this added garment here.
                                </p>
                              </div>
                              {isCustomDetailsStage && onChangeAdditionalGarmentFabric ? (
                                <button
                                  type="button"
                                  data-change-additional-garment-fabric={garment.garmentKey}
                                  data-additional-garment-fabric-action="add"
                                  onClick={(event) =>
                                    onChangeAdditionalGarmentFabric(
                                      garment.garmentKey,
                                      event.currentTarget,
                                    )
                                  }
                                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/25 px-3 text-xs font-bold uppercase tracking-wide text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                                >
                                  Add Fabric
                                </button>
                              ) : null}
                            </div>
                          );
                        }
                        return (
                          <div
                            data-additional-garment-fabric-summary={garment.garmentKey}
                            className="flex min-w-0 flex-col gap-3 rounded-xl border border-heritage-gold/20 bg-heritage-cream/25 p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                              <AssignedFabricPreview
                                fabric={assigned.fabric}
                                garmentKey={garment.garmentKey}
                                garmentLabel={exactParentLabel(parentOccurrenceLabels, garment.garmentKey, garment.garmentType)}
                                fabricCode={assigned.fabricCode}
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-heritage-green">
                                  {assigned.fabric?.name || assigned.fabricCode}
                                </p>
                                <p className="mt-1 font-mono text-[11px] text-heritage-ink/60">
                                  {assigned.fabricCode}
                                </p>
                                {assigned.selectionIndex !== null && (
                                  <p className="mt-1 text-[11px] font-semibold text-heritage-gold">
                                    Fabric Selection {assigned.selectionIndex}
                                  </p>
                                )}
                              </div>
                            </div>
                            {isCustomDetailsStage && onChangeAdditionalGarmentFabric && (
                              <button
                                type="button"
                                data-change-additional-garment-fabric={garment.garmentKey}
                                data-additional-garment-fabric-action="change"
                                onClick={(event) =>
                                  onChangeAdditionalGarmentFabric(
                                    garment.garmentKey,
                                    event.currentTarget,
                                  )
                                }
                                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/25 px-3 text-xs font-bold uppercase tracking-wide text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                              >
                                Change Fabric
                              </button>
                            )}
                          </div>
                        );
                      })()}
                      {additionalOwnedSections.map((section) =>
                        renderMainGarmentSection({
                          ...section,
                          headingMode: "added",
                          showFamilyHeader: false,
                        }),
                      )}
                      {additionalPersonalizedGroups.length > 0 && renderCatalogueSection({
                        title: "Miscellaneous - Personalized Additional",
                        groups: additionalPersonalizedGroups,
                        headingMode: "added",
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          )}
        </div>

        {orderSummary ? (
          <div className="mt-5 min-w-0 lg:mt-0">
            {orderSummary}
          </div>
        ) : (
        <aside className="mt-5 min-w-0 rounded-2xl border border-heritage-gold/25 bg-white p-5 shadow-sm lg:sticky lg:top-24 lg:self-start lg:mt-0">
          <h3 className="font-serif text-lg font-bold text-heritage-green">Order Summary</h3>
          <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">Only active garment occurrences and selected optional details are priced.</p>
          <div className="mt-4 space-y-2.5 text-sm">
            {constructionBreakdownRows.length > 0 && <dl data-construction-price-breakdown className="space-y-3 border-b border-heritage-gold/15 pb-3">{constructionBreakdownRows.map((row) => <div key={row.garmentKey} data-construction-price-row={row.garmentKey} className="flex min-w-0 items-start justify-between gap-3 border-b border-heritage-gold/10 pb-3 last:border-0 last:pb-0"><dt className="min-w-0 flex-1"><span className="block break-words text-[10px] font-bold uppercase tracking-wide text-heritage-green">{row.occurrenceLabel}</span><span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/65">{row.constructionLabel || "Price pending"}</span>{row.role === "additional" && <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-heritage-gold">Added garment</span>}</dt><dd className="shrink-0 font-mono text-xs font-bold text-heritage-green">{row.priceCents === null ? "Price pending" : money(row.priceCents / 100)}</dd></div>)}</dl>}
            {constructionBreakdown.status === "pending" && <p data-construction-price-breakdown-status="pending" className="rounded-lg bg-heritage-cream/50 p-2 text-xs leading-relaxed text-heritage-ink/70">Construction pricing needs review before an exact total is available.</p>}
            <div className="flex min-w-0 items-start justify-between gap-3"><span className="min-w-0 break-words text-heritage-ink/70">Garment Construction Subtotal</span><span className="shrink-0 font-mono font-bold text-heritage-green">{constructionBreakdown.status === "complete" && constructionSubtotal !== null ? money(constructionSubtotal) : "Price pending"}</span></div>
            <p className="text-xs leading-relaxed text-heritage-ink/60">Includes fabric, tax, Lagos-to-Eindhoven shipping, and sewing.</p>
            <div className="flex min-w-0 items-start justify-between gap-3"><span className="min-w-0 break-words text-heritage-ink/70">Custom Details subtotal</span><span className="shrink-0 font-mono font-bold text-heritage-green">{money(customDetailsSubtotal)}</span></div>
            {pricing.lines.length > 0 && <div className="space-y-2 border-t border-heritage-gold/15 pt-3">{pricing.lines.map((line) => <div key={line.occurrenceKey} className="flex min-w-0 items-start justify-between gap-3 text-xs"><span className="min-w-0 break-words leading-relaxed text-heritage-ink/60">{subjectLabelByGarmentKey.get(line.garmentKey) || "Garment"}: {line.label}</span><span className="shrink-0 font-mono text-heritage-green">{line.status === "evaluation_required" ? "Evaluation" : line.status === "exact" && line.lineTotalCents !== undefined ? money(line.lineTotalCents / 100) : "Review"}</span></div>)}</div>}
            {[...(designSelections.decorativeFeatures || []), ...(designSelections.accessories || [])].length > 0 && <div className="space-y-2 border-t border-heritage-gold/15 pt-3">{(designSelections.decorativeFeatures || []).map((feature) => <div key={feature} className="flex min-w-0 items-start justify-between gap-3 text-xs"><span className="min-w-0 break-words text-heritage-ink/60">{feature}</span><span className="shrink-0 font-mono text-heritage-green">{money(getDecorativeFeaturePrice(selectedStyle, feature))}</span></div>)}{(designSelections.accessories || []).map((accessory) => <div key={accessory} className="flex min-w-0 items-start justify-between gap-3 text-xs"><span className="min-w-0 break-words text-heritage-ink/60">{accessory}</span><span className="shrink-0 font-mono text-heritage-green">{money(getTraditionalAccessoryPrice(selectedStyle, accessory as TraditionalAccessory))}</span></div>)}</div>}
            {pricing.status === "pending" && <p className="rounded-lg bg-heritage-cream/50 p-2 text-xs leading-relaxed text-heritage-ink/70">A personalized requirement needs price evaluation before an exact total is available.</p>}
            {pricing.status === "invalid" && <p className="rounded-lg bg-red-50 p-2 text-xs leading-relaxed text-red-700">A saved Custom Details price needs review.</p>}
            <div className="flex min-w-0 items-start justify-between gap-3 border-t border-heritage-gold/15 pt-3 font-bold text-heritage-green"><span className="min-w-0 break-words">Estimated total so far</span><span className="shrink-0 font-mono">{estimatedTotal === null ? "Pending" : money(estimatedTotal)}</span></div>
          </div>
        </aside>
        )}
      </div>

      <DesignStudioStepActions
        backDestination={previousStageLabel}
        onBack={onBack}
        forward={{
          destination: nextStageLabel,
          onClick: onContinue,
          disabled: !canContinue,
          locked: !canContinue,
          ariaLabel: canContinue
            ? `Continue to ${nextStageLabel}`
            : `Continue to ${nextStageLabel} is locked until ${stageTitle} are complete`,
        }}
      />

      {shouldShowCustomDetailsGoToTop({
        sentinelOutOfView: showGoToTop,
        fabricModalOpen,
        choiceDialogOpen: showAdditionalGarmentChoiceDialog,
      }) ? (
        <CustomDetailsGoToTopButton onClick={handleGoToTop} />
      ) : null}

      {showAdditionalGarmentChoiceDialog && (
          <div
            data-additional-garment-custom-details-dialog="true"
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancelAdditionalGarmentChoice();
          }}
        >
          <div
            ref={choiceDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="additional-garment-choice-title"
            onKeyDown={handleChoiceDialogKeyDown}
            className="my-auto w-full max-w-lg overflow-y-auto rounded-2xl border border-heritage-gold/30 bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 id="additional-garment-choice-title" className="break-words font-serif text-xl font-bold text-heritage-green">
                  Add {getCustomDetailsGarmentLabel(additionalGarmentChoice.garmentType)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-heritage-ink/70">
                  Choose how you would like to configure this garment.
                </p>
              </div>
              <button type="button" onClick={cancelAdditionalGarmentChoice} aria-label="Close additional garment choices" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"><X aria-hidden="true" size={18} /></button>
            </div>

            {compatibleCopySources.length > 1 && (
              <fieldset className="mt-5">
                <legend className="text-xs font-bold uppercase tracking-wide text-heritage-green">Copy from which garment?</legend>
                <div className="mt-2 space-y-2">
                  {compatibleCopySources.map((source) => (
                    <label key={source.parentGarmentKey} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-heritage-green/20 px-3 py-2 text-sm text-heritage-green focus-within:ring-2 focus-within:ring-heritage-gold">
                      <input type="radio" name="additional-garment-copy-source" checked={additionalGarmentChoice.sourceParentGarmentKey === source.parentGarmentKey} onChange={() => setAdditionalGarmentChoice((current) => current ? { ...current, sourceParentGarmentKey: source.parentGarmentKey } : current)} className="size-5 shrink-0 accent-heritage-green" />
                      <span className="min-w-0 break-words">{getCustomDetailsGarmentLabel(additionalGarmentChoice.garmentType)} - {source.role}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-heritage-green/20 bg-heritage-cream/20 p-3">
                <button type="button" disabled={!selectedCopySource} onClick={() => selectedCopySource && submitAdditionalGarmentChoice({ mode: "copy", sourceParentGarmentKey: selectedCopySource })} aria-describedby="additional-garment-copy-description" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border-2 border-heritage-green px-4 text-sm font-bold text-heritage-green transition hover:bg-heritage-green/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">Use Same Custom Details</button>
                <p id="additional-garment-copy-description" className="mt-2 break-words text-xs leading-relaxed text-heritage-ink/65">Copy the construction and available garment details from an existing matching garment.</p>
              </div>
              <div className="min-w-0 rounded-xl border border-heritage-green/20 bg-heritage-green/5 p-3">
                <button type="button" onClick={() => submitAdditionalGarmentChoice({ mode: "choose" })} aria-describedby="additional-garment-choose-description" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-heritage-green px-4 text-sm font-bold text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2">Choose Custom Details</button>
                <p id="additional-garment-choose-description" className="mt-2 break-words text-xs leading-relaxed text-heritage-ink/65">Add this garment and choose its construction and details separately.</p>
              </div>
            </div>
            {compatibleCopySources.length > 1 && !selectedCopySource && <p className="mt-3 text-xs leading-relaxed text-heritage-ink/60">Select the garment whose Custom Details you want to copy.</p>}
            <button type="button" onClick={cancelAdditionalGarmentChoice} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-bold text-heritage-ink underline decoration-heritage-gold underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
};
