import { ArrowRight, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CUSTOM_DETAIL_PARENT_SECTION_PRESENTATION,
  CUSTOM_DETAIL_SELECTION_GROUP_TO_PARENT_SECTION,
  NECK_DESIGN_SUBCATEGORY_BY_OPTION_ID,
  NECK_DESIGN_SUBCATEGORY_ORDER,
  isCompanionCustomerAdditionalClothesCostGroup,
  resolveShowAdditionalClothesCosts,
} from "../config/GarmentDetailsConfig";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import { DesignStudioBackButton } from "./DesignStudioBackButton";
import type {
  CanonicalPhysicalGarmentType,
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
import type { TraditionalAccessory } from "../utils/decorativePricing";
import {
  DECORATIVE_FEATURE_DESCRIPTIONS,
  DECORATIVE_FEATURE_OPTIONS,
  TRADITIONAL_ACCESSORY_DESCRIPTIONS,
  TRADITIONAL_ACCESSORY_OPTIONS,
  getApplicableDecorativeFeatures,
  getAvailableMonogramPlacements,
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
    choice: AdditionalGarmentCustomDetailsChoice,
    triggerElement?: HTMLElement | null,
  ) => void;
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
  fabricModalOpen?: boolean;
  onViewAdditionalGarment?: (garmentKey: string) => void;
  onBack: () => void;
  onContinue: () => void;
  orderSummary?: ReactNode;
}

export type AdditionalGarmentCustomDetailsChoice =
  | { mode: "choose" }
  | { mode: "copy"; sourceParentGarmentKey: string };

const money = (amount: number): string => `${PRICING_CURRENCY_SYMBOL}${amount.toFixed(2)}`;

const getSubjectLabel = (
  subject: GarmentScopedCustomDetailsReconciliationResult["subjects"][number],
): string => {
  const garmentLabel = getFabricGarmentLabel(subject.garmentType);
  return subject.parentGarmentType === subject.garmentType
    ? garmentLabel
    : `${getFabricGarmentLabel(subject.parentGarmentType)} ${garmentLabel}`;
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

export const DormantFutureCustomDetailsStep = ({
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
  removalTargets = [],
  onRequestGarmentRemoval,
  onChangeAdditionalGarmentFabric,
  fabrics = [],
  fabricAllocationState = null,
  fabricAnnouncement = "",
  fabricPersistentError = null,
  focusAdditionalGarmentKey,
  fabricModalOpen = false,
  onViewAdditionalGarment,
  onBack,
  onContinue,
  orderSummary = null,
}: DormantFutureCustomDetailsStepProps) => {
  const includeAdditionalClothesCosts = resolveShowAdditionalClothesCosts(
    showAdditionalClothesCosts,
  );
  const [overLimitText, setOverLimitText] = useState<Record<string, string>>({});
  const [additionalGarmentChoice, setAdditionalGarmentChoice] = useState<{
    garmentType: CanonicalPhysicalGarmentType;
    sourceParentGarmentKey: string | null;
  } | null>(null);
  const choiceDialogRef = useRef<HTMLDivElement>(null);
  const choiceTriggerRef = useRef<HTMLButtonElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
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
  const constructionOccurrenceLabels = new Map<string, number>();
  const constructionBreakdownRows = constructionBreakdown.rows.map((row) => {
    const priorOccurrences = constructionOccurrenceLabels.get(row.garmentLabel) || 0;
    constructionOccurrenceLabels.set(row.garmentLabel, priorOccurrences + 1);
    const sameGarmentCount = constructionBreakdown.rows.filter(
      (candidate) => candidate.garmentLabel === row.garmentLabel,
    ).length;
    return {
      ...row,
      occurrenceLabel:
        sameGarmentCount > 1
          ? `${row.garmentLabel} ${priorOccurrences + 1}`
          : row.garmentLabel,
    };
  });
  const subjectLabelByGarmentKey = new Map(
    reconciliation.subjects.map((subject) => [subject.garmentKey, getSubjectLabel(subject)]),
  );
  const canContinue = isFutureCustomDetailsContentReady(completion);
  const selectedDecorativeFeatures = new Set(designSelections.decorativeFeatures || []);
  const applicableDecorativeFeatures = new Set(getApplicableDecorativeFeatures(selectedStyle));
  const availableMonogramPlacements = getAvailableMonogramPlacements(designSelections, selectedStyle);
  const selectedAccessories = new Set(designSelections.accessories || []);
  const compatibleCopySources = useMemo(() => {
    if (!additionalGarmentChoice) return [];
    let additionalIndex = 0;
    return resolveCompatibleGarmentScopedCopySources(
      reconciliation.subjects,
      additionalGarmentChoice.garmentType,
    ).map((source) => ({
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
    if (!additionalGarmentChoice) return;
    const dialog = choiceDialogRef.current;
    dialog?.querySelector<HTMLElement>("button:not([disabled]), input:not([disabled])")?.focus();
  }, [additionalGarmentChoice]);

  useEffect(() => {
    if (!focusAdditionalGarmentKey) return;
    const target = Array.from(
      contentRef.current?.querySelectorAll<HTMLElement>(
        "[data-parent-garment-key]",
      ) || [],
    ).find(
      (element) =>
        element.dataset.parentGarmentKey === focusAdditionalGarmentKey,
    );
    const heading =
      target?.querySelector<HTMLElement>("[data-added-garment-heading]") ||
      target;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    target?.setAttribute("data-additional-garment-highlight", "true");
    const timer = window.setTimeout(() => {
      target?.removeAttribute("data-additional-garment-highlight");
    }, 2400);
    return () => window.clearTimeout(timer);
  }, [focusAdditionalGarmentKey, catalogue.coreGroups]);

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
      closeAdditionalGarmentChoice({ restoreFocus: true });
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
    const { garmentType } = additionalGarmentChoice;
    const trigger = choiceTriggerRef.current;
    closeAdditionalGarmentChoice({ restoreFocus: false });
    onAddAdditionalGarment(garmentType, choice, trigger);
  };

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
    const noneSelected = !group.isConstruction && !hasSelection(
      reconciliation.state,
      occurrence.subject.garmentKey,
      group.selectionGroup,
    );
    const renderOptionCard = (option: CustomDetailOption) => {
      const optionId = `${groupId}-${option.id}`;
      const checked = group.isConstruction
        ? selectedConstructionId === option.id
        : isSelected(reconciliation.state, occurrence.subject.garmentKey, group.selectionGroup, option.id);
      const isPersonalizedRequirement =
        group.selectionGroup === PERSONALIZED_ADDITIONAL_REQUIREMENT_SELECTION_GROUP &&
        option.id === PERSONALIZED_ADDITIONAL_REQUIREMENT_OPTION_ID;
      const identity = getIdentityKey(garmentKey, group.selectionGroup, option.id);
      const persistedText = getGarmentScopedCustomDetailText(
        personalizedInputs,
        occurrence.subject.garmentKey,
        group.selectionGroup,
        option.id,
      );
      const text = overLimitText[identity] ?? persistedText ?? "";
      const textValidation = validateGarmentScopedCustomDetailText(text);
      const textError = isPersonalizedRequirement && checked
        ? textValidation.status === "too_long"
          ? `Use ${GARMENT_SCOPED_CUSTOM_DETAIL_TEXT_MAX_LENGTH.toLocaleString()} characters or fewer.`
          : textValidation.status === "empty"
            ? "Describe your personalized requirement before continuing."
            : undefined
        : undefined;

      return (
        <div key={option.id} className="min-w-0">
          <label
            htmlFor={optionId}
            className={`flex min-h-12 min-w-0 cursor-pointer items-start gap-3 rounded-xl border-2 p-4 text-left transition hover:border-heritage-gold focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${checked ? "border-heritage-green bg-heritage-green/5" : "border-heritage-green/65 bg-white"}`}
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
              aria-describedby={textError ? `${optionId}-text-error` : undefined}
              className="mt-0.5 size-5 shrink-0 accent-heritage-green"
            />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <span className="min-w-0 break-words text-sm font-bold leading-snug text-heritage-green">{option.label}</span>
                <span className="shrink-0 font-mono text-xs font-bold text-heritage-gold">{getOptionPriceLabel(option, group.isConstruction, checked)}</span>
              </span>
              {option.description && <span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/65">{option.description}</span>}
              {option.requiresEvaluation && <span className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-heritage-ink/50">Confirmed after tailoring review</span>}
            </span>
          </label>
          {isPersonalizedRequirement && checked && (
            <div className="mt-2">
              <label htmlFor={`${optionId}-text`} className="text-xs font-bold text-heritage-green">Describe your personalized requirement</label>
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
          )}
        </div>
      );
    };

    const renderOptionGrid = (options: readonly CustomDetailOption[]) => (
      <div className="grid min-w-0 grid-cols-1 gap-3">
        {options.map(renderOptionCard)}
      </div>
    );

    return (
      <div className="min-w-0 space-y-3">
        {!group.isConstruction && (
          <label className={`flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-xl border-2 p-4 text-left transition hover:border-heritage-gold focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${noneSelected ? "border-heritage-green bg-heritage-green/5" : "border-heritage-green/65 bg-white"}`}>
            <input
              type="radio"
              name={`${groupId}-none`}
              checked={noneSelected}
              onChange={() => onClearSelection(occurrence.subject.garmentKey, group.selectionGroup)}
              className="size-4 shrink-0 accent-heritage-green"
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-heritage-green">None</span>
              <span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/65">No selection for this category</span>
            </span>
          </label>
        )}
        {group.selectionGroup === "neck_design" ? (
          <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-4">
            {NECK_DESIGN_SUBCATEGORY_ORDER.map((subcategory) => {
              const options = group.options.filter(
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
        ) : renderOptionGrid(group.options)}
        {group.options.length === 0 && <p className="text-xs text-heritage-ink/60">No current catalogue options are available.</p>}
        {groupBlocker && <p className="text-xs text-red-700">{groupBlocker.message}</p>}
      </div>
    );
  };

  const groupCatalogueSections = (
    groups: readonly FutureCustomDetailsCatalogueGroup[],
  ) => {
    const sections = new Map<string, FutureCustomDetailsCatalogueGroup[]>();
    groups.forEach((group) => {
      if (group.occurrences.length === 0) return;
      const title = getParentSectionTitle(group.selectionGroup, group.title);
      sections.set(title, [...(sections.get(title) || []), group]);
    });
    return [...sections.entries()].map(([title, grouped]) => ({ title, groups: grouped }));
  };
  const mainCoreGroups = useMemo(
    () => partitionCatalogueGroupsByRole(catalogue.coreGroups, "main"),
    [catalogue.coreGroups],
  );
  const mainCoreSections = useMemo(
    () => groupCatalogueSections(mainCoreGroups),
    [mainCoreGroups],
  );
  const mainAdditionalCostGroups = useMemo(
    () => partitionCatalogueGroupsByRole(catalogue.additionalCostGroups, "main"),
    [catalogue.additionalCostGroups],
  );
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
  const isDressCatalogueSection = (
    groups: readonly FutureCustomDetailsCatalogueGroup[],
  ) =>
    groups.some(
      (group) =>
        group.selectionGroup === "dress_construction" ||
        group.selectionGroup === "dress_pockets",
    );
  const partitionAdditionalCostGroups = (
    groups: readonly FutureCustomDetailsCatalogueGroup[],
  ) => {
    const companionGroups: FutureCustomDetailsCatalogueGroup[] = [];
    const stackedGroups: FutureCustomDetailsCatalogueGroup[] = [];
    groups.forEach((group) => {
      if (isCompanionCustomerAdditionalClothesCostGroup(group.selectionGroup)) {
        companionGroups.push(group);
      } else {
        stackedGroups.push(group);
      }
    });
    return { companionGroups, stackedGroups };
  };
  const renderGroupFieldset = (
    group: FutureCustomDetailsCatalogueGroup,
    headingMode: "base" | "added",
    layout: "grid" | "stack" = "grid",
  ) => (
    <fieldset
      key={group.selectionGroup}
      data-custom-detail-group={group.selectionGroup}
      data-active-occurrences={group.occurrences.length}
      className={`min-w-0 ${layout === "grid" && group.selectionGroup === "neck_design" ? "lg:col-span-2" : ""}`}
    >
      <legend className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-heritage-green">
        <span className="min-w-0 break-words">{group.title}</span>
        <span className="rounded-full border border-heritage-gold/30 bg-heritage-cream/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-heritage-gold">{getGroupStatus(group)}</span>
      </legend>
      <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">{group.isConstruction ? "Select the all-inclusive construction that applies to this garment." : "Select an option or keep None for this category."}</p>
      <div className="mt-3 space-y-5">
        {group.occurrences.map((occurrence) => (
          <div
            key={occurrence.subject.garmentKey}
            className="min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            <h4
              className={`mb-2 break-words text-xs font-bold uppercase tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 ${headingMode === "added" ? "text-heritage-gold" : "text-heritage-green"}`}
            >
              {getSubjectLabel(occurrence.subject)} - {headingMode === "added" ? "Added garment" : "Base garment"}
            </h4>
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
    <div className="mt-5 grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
      {groups.map((group) => renderGroupFieldset(group, headingMode))}
    </div>
  );
  const renderDressCompanion = (
    groups: readonly FutureCustomDetailsCatalogueGroup[],
    headingMode: "base" | "added",
  ) => {
    const visibleGroups = groups.filter((group) => group.occurrences.length > 0);
    if (visibleGroups.length === 0) return null;
    return (
      <aside
        data-custom-detail-section="dress-additional-clothes-costs"
        aria-label="Dress additional clothes costs"
        className="min-w-0 max-w-full rounded-xl border border-heritage-gold/25 bg-heritage-cream/30 p-3 sm:p-4"
      >
        <h4 className="min-w-0 break-words text-sm font-bold uppercase tracking-wide text-heritage-green">
          Additional Clothes Costs
        </h4>
        <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">
          Optional extras for this dress. Keep None if you do not want lining, net, or wraps.
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
      <section key={title} className={`min-w-0 max-w-full rounded-2xl border border-heritage-gold/35 bg-white p-4 shadow-sm sm:p-5${useCompanionLayout ? " overflow-x-hidden" : ""}`}>
        <header className="flex min-w-0 flex-col gap-3 border-b border-heritage-gold/35 pb-3 sm:flex-row sm:items-start sm:justify-between">
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
            className="mt-5 grid min-w-0 max-w-full grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start"
          >
            <div className="min-w-0 space-y-5">
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
    <section aria-labelledby="future-custom-details-title" data-stage-id="custom_details" data-stage-complete={canContinue} className="relative space-y-6 font-sans">
      <div ref={setTopSentinelRef} data-custom-details-top-sentinel="true" aria-hidden="true" className="h-px w-full" />
      <div className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <DesignStudioBackButton
          destination="Design Style"
          onClick={onBack}
          className="mb-5"
        />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">Step 4 of 9</p>
        <h2
          id="future-custom-details-title"
          ref={titleRef}
          tabIndex={-1}
          className="mt-2 scroll-mt-24 font-serif text-2xl font-bold text-heritage-green outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:text-3xl"
        >
          Custom Details
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">Review the construction and Custom Details relevant to your selected garments and design. Base garment construction was selected in Garment Type and is already included in your price.</p>
      </div>

      {completion.blockers.length > 0 && (
        <div role="alert" className="rounded-2xl border border-heritage-gold/30 bg-heritage-cream/35 p-4">
          <p className="text-sm font-bold text-heritage-green">Custom Details need attention</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-heritage-ink/70">{Array.from(new Set(completion.blockers.map((blocker) => blocker.message))).map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      )}
      {fabricAnnouncement ? (
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

      {removalTargets.length > 0 && (
        <section
          aria-labelledby="future-custom-details-garments-in-order"
          className="min-w-0 rounded-2xl border border-heritage-gold/25 bg-white p-4 shadow-sm sm:p-5"
          data-garment-removal-list="custom_details"
        >
          <h3
            id="future-custom-details-garments-in-order"
            tabIndex={-1}
            data-garment-removal-list-heading="custom_details"
            className="break-words font-serif text-lg font-bold uppercase tracking-wide text-heritage-green outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            Garments in this order
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">
            Remove one exact garment without changing the saved choices for the others.
          </p>
          <ul className="mt-4 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
            {removalTargets.map((target, index) => {
              const reasonId = `custom-details-removal-reason-${index}`;
              return (
                <li
                  key={target.garmentKey}
                  className="flex min-w-0 flex-col gap-3 rounded-xl border border-heritage-green/15 bg-heritage-cream/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                  data-garment-removal-row={target.garmentKey}
                >
                  <div className="min-w-0">
                    <h4
                      tabIndex={-1}
                      data-garment-removal-row-heading={target.garmentKey}
                      className="break-words text-sm font-bold text-heritage-green outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                    >
                      {target.occurrenceLabel}
                    </h4>
                    <p className="mt-1 break-words text-[10px] font-bold uppercase tracking-wide text-heritage-gold">
                      {target.roleLabel}
                    </p>
                    {target.disabledReason && (
                      <p
                        id={reasonId}
                        className="mt-2 break-words text-xs leading-relaxed text-heritage-ink/65"
                      >
                        {target.disabledReason}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!target.canRequestRemoval}
                    aria-label={target.accessibleName}
                    aria-describedby={target.disabledReason ? reasonId : undefined}
                    data-garment-removal-button={target.garmentKey}
                    data-garment-removal-origin-stage="custom_details"
                    onClick={(event) =>
                      onRequestGarmentRemoval?.(target, event.currentTarget)
                    }
                    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 px-3 text-xs font-bold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                  >
                    <Trash2 aria-hidden="true" size={15} />
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] lg:gap-6">
        <div ref={contentRef} className="min-w-0 space-y-5">
          <div data-custom-detail-section="main-garment-details" className="min-w-0 space-y-5">
            {mainCoreSections.map((section) =>
              renderCatalogueSection({
                ...section,
                companionGroups: isDressCatalogueSection(section.groups)
                  ? partitionAdditionalCostGroups(mainAdditionalCostGroups).companionGroups
                  : [],
              }),
            )}

            {includeAdditionalClothesCosts && partitionAdditionalCostGroups(mainAdditionalCostGroups).stackedGroups.length > 0 && (
              <section data-custom-detail-section="additional-clothes-costs" className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
                <header className="border-b border-heritage-gold/35 pb-3"><h3 className="font-serif text-lg font-bold uppercase tracking-wide text-heritage-green">Additional Clothes Costs</h3>
                <p className="mt-1 text-xs leading-relaxed text-heritage-ink/60">Optional enhancements apply only to included garment occurrences.</p>
                </header>
                <div className="mt-5 space-y-6">
                  {partitionAdditionalCostGroups(mainAdditionalCostGroups).stackedGroups.map((group) => (
                    <fieldset key={group.selectionGroup} className="min-w-0 border-t border-heritage-gold/15 pt-4 first:border-0 first:pt-0">
                      <legend className="flex min-w-0 flex-wrap items-center gap-2 font-serif text-base font-bold text-heritage-green"><span className="min-w-0 break-words">{group.title}</span><span className="rounded-full border border-heritage-gold/30 bg-heritage-cream/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-heritage-gold">Optional</span></legend>
                      <p className="mt-1 text-xs text-heritage-ink/60">Available for your included garments.</p>
                      <div className="mt-3 space-y-4">
                        {group.occurrences.map((occurrence) => (
                          <div key={occurrence.subject.garmentKey} className="min-w-0">
                            <p className="mb-2 break-words text-xs font-bold text-heritage-green">{getSubjectLabel(occurrence.subject)}</p>
                            {renderOptions(group, occurrence)}
                          </div>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
              </section>
            )}

            {mainPersonalizedGroups.length > 0 && renderCatalogueSection({
              title: "Miscellaneous - Personalized Additional",
              groups: mainPersonalizedGroups,
            })}
          </div>

          <section data-custom-detail-section="monogram-embroidery" className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="border-b border-heritage-gold/35 pb-3 font-serif text-lg font-bold uppercase tracking-wide text-heritage-green">Monogram and Embroidery Design</h3>
            <p className="mt-1 text-xs text-heritage-ink/60">Optional. Select None to remove all monogram and embroidery choices.</p>
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <label className={`flex min-h-12 min-w-0 items-center gap-3 rounded-xl border-2 p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${selectedDecorativeFeatures.size === 0 ? "border-heritage-green bg-heritage-green/5" : "border-heritage-green/65 bg-white"}`}><input type="radio" name="future-decorative-none" checked={selectedDecorativeFeatures.size === 0} onChange={onClearDecorativeFeatures} className="size-5 shrink-0 accent-heritage-green" /><span className="min-w-0"><span className="block text-sm font-bold text-heritage-green">None</span><span className="mt-1 block text-xs text-heritage-ink/65">No selection for this category</span></span></label>
              {DECORATIVE_FEATURE_OPTIONS.map((feature) => {
                const available = applicableDecorativeFeatures.has(feature);
                return <label key={feature} className={`flex min-h-12 min-w-0 items-start gap-3 rounded-xl border-2 p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${selectedDecorativeFeatures.has(feature) ? "border-heritage-green bg-heritage-green/5" : "border-heritage-green/65 bg-white"} ${available ? "cursor-pointer hover:border-heritage-gold" : "cursor-not-allowed opacity-60"}`}><input type="checkbox" checked={selectedDecorativeFeatures.has(feature)} disabled={!available} onChange={() => onDecorativeFeatureToggle(feature)} className="mt-0.5 size-5 shrink-0 accent-heritage-green" /><span className="min-w-0 flex-1"><span className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1"><span className="min-w-0 break-words text-sm font-bold text-heritage-green">{feature}</span><span className="shrink-0 font-mono text-xs font-bold text-heritage-gold">+{money(getDecorativeFeaturePrice(selectedStyle, feature))}</span></span><span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/65">{available ? DECORATIVE_FEATURE_DESCRIPTIONS[feature] : "Not available for the current design."}</span></span></label>;
              })}
            </div>
            {selectedDecorativeFeatures.has("Name Monogram") && availableMonogramPlacements.length > 0 && (
              <fieldset className="mt-4"><legend className="text-xs font-bold text-heritage-green">Monogram placement</legend><div className="mt-2 flex flex-wrap gap-2">{availableMonogramPlacements.map((placement) => <label key={placement.value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-heritage-green/15 px-3 text-xs text-heritage-green focus-within:ring-2 focus-within:ring-heritage-gold"><input type="radio" name="future-monogram-placement" checked={designSelections.monogramPlacement === placement.value} onChange={() => onMonogramPlacementChange(placement.value)} className="size-4 accent-heritage-green" />{placement.label}</label>)}</div></fieldset>
            )}
          </section>

          <section data-custom-detail-section="accessories" className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
            <h3 className="border-b border-heritage-gold/35 pb-3 font-serif text-lg font-bold uppercase tracking-wide text-heritage-green">Select Accessories - Optional</h3>
            <p className="mt-1 text-xs text-heritage-ink/60">Optional accessories remain separate from garment construction.</p>
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              <label className={`flex min-h-12 min-w-0 items-center gap-3 rounded-xl border-2 p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${selectedAccessories.size === 0 ? "border-heritage-green bg-heritage-green/5" : "border-heritage-green/65 bg-white"}`}><input type="radio" name="future-accessories-none" checked={selectedAccessories.size === 0} onChange={onClearAccessories} className="size-5 shrink-0 accent-heritage-green" /><span className="min-w-0"><span className="block text-sm font-bold text-heritage-green">None</span><span className="mt-1 block text-xs text-heritage-ink/65">No selection for this category</span></span></label>
              {TRADITIONAL_ACCESSORY_OPTIONS.map((accessory) => <label key={accessory} className={`flex min-h-12 min-w-0 cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition hover:border-heritage-gold focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${selectedAccessories.has(accessory) ? "border-heritage-green bg-heritage-green/5" : "border-heritage-green/65 bg-white"}`}><input type="checkbox" checked={selectedAccessories.has(accessory)} onChange={() => onAccessoryToggle(accessory)} className="mt-0.5 size-5 shrink-0 accent-heritage-green" /><span className="min-w-0 flex-1"><span className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1"><span className="min-w-0 break-words text-sm font-bold text-heritage-green">{accessory}</span><span className="shrink-0 font-mono text-xs font-bold text-heritage-gold">+{money(getTraditionalAccessoryPrice(selectedStyle, accessory))}</span></span><span className="mt-1 block break-words text-xs leading-relaxed text-heritage-ink/65">{TRADITIONAL_ACCESSORY_DESCRIPTIONS[accessory]}</span></span></label>)}
            </div>
          </section>

          <section data-custom-detail-section="add-additional-garment" className="min-w-0 rounded-2xl border border-heritage-gold/25 bg-heritage-cream/25 p-4 shadow-sm sm:p-5">
            <h3 className="border-b border-heritage-gold/35 pb-3 font-serif text-lg font-bold uppercase tracking-wide text-heritage-green">Add Additional Garment</h3>
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
              {additionalGarmentConstructionOptions.map(({ garmentType, construction }) => <button key={garmentType} type="button" onClick={(event) => { choiceTriggerRef.current = event.currentTarget; setAdditionalGarmentChoice({ garmentType, sourceParentGarmentKey: null }); }} className="inline-flex min-h-12 min-w-0 items-start justify-between gap-3 rounded-xl border-2 border-heritage-green/65 bg-white p-3 text-left text-xs font-bold text-heritage-green transition hover:border-heritage-gold hover:bg-heritage-gold/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"><span className="flex min-w-0 items-center gap-2"><Plus aria-hidden="true" size={15} className="shrink-0" /><span className="min-w-0 break-words">Add {getFabricGarmentLabel(garmentType)}</span></span><span className="shrink-0 font-mono text-[11px] text-heritage-gold">{construction.status === "resolved" ? money(construction.totalPrice) : "Price pending"}</span></button>)}
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
                  const additionalSections = groupCatalogueSections(additionalCoreGroups);
                  const additionalCostPresentation = partitionAdditionalCostGroups(additionalCostGroups);
                  return (
                    <div
                      key={garment.garmentKey}
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
                          {getFabricGarmentLabel(garment.garmentType)} - Added garment
                        </h4>
                      </div>
                      {(() => {
                        const assigned = getAssignedFabricForGarment(garment.garmentKey);
                        if (!assigned) return null;
                        return (
                          <div
                            data-additional-garment-fabric-summary={garment.garmentKey}
                            className="flex min-w-0 flex-col gap-3 rounded-xl border border-heritage-gold/20 bg-heritage-cream/25 p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
                              <AssignedFabricPreview
                                fabric={assigned.fabric}
                                garmentKey={garment.garmentKey}
                                garmentLabel={getFabricGarmentLabel(garment.garmentType)}
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
                            {onChangeAdditionalGarmentFabric && (
                              <button
                                type="button"
                                data-change-additional-garment-fabric={garment.garmentKey}
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
                      {additionalSections.map((section) => renderCatalogueSection({
                        ...section,
                        headingMode: "added",
                        companionGroups: isDressCatalogueSection(section.groups)
                          ? additionalCostPresentation.companionGroups
                          : [],
                      }))}
                      {includeAdditionalClothesCosts && additionalCostPresentation.stackedGroups.length > 0 && (
                        <div className="space-y-4">
                          {additionalCostPresentation.stackedGroups.map((group) => (
                            <fieldset key={group.selectionGroup} className="min-w-0">
                              <legend className="flex min-w-0 flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide text-heritage-green">
                                <span className="min-w-0 break-words">{group.title}</span>
                                <span className="rounded-full border border-heritage-gold/30 bg-heritage-cream/55 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-heritage-gold">Optional</span>
                              </legend>
                              <div className="mt-3 space-y-4">
                                {group.occurrences.map((occurrence) => (
                                  <div key={occurrence.subject.garmentKey} className="min-w-0">
                                    {renderOptions(group, occurrence)}
                                  </div>
                                ))}
                              </div>
                            </fieldset>
                          ))}
                        </div>
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <DesignStudioBackButton destination="Design Style" onClick={onBack} />
        <button type="button" onClick={onContinue} disabled={!canContinue} aria-label={canContinue ? "Continue to AI Try-on" : "Continue to AI Try-on is locked until Custom Details are complete"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">Continue to AI Try-on <ArrowRight aria-hidden="true" size={14} /></button>
      </div>

      {shouldShowCustomDetailsGoToTop({
        sentinelOutOfView: showGoToTop,
        fabricModalOpen,
        choiceDialogOpen: Boolean(additionalGarmentChoice),
      }) ? (
        <CustomDetailsGoToTopButton onClick={handleGoToTop} />
      ) : null}

      {additionalGarmentChoice && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAdditionalGarmentChoice();
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
                  Add {getFabricGarmentLabel(additionalGarmentChoice.garmentType)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-heritage-ink/70">
                  Choose how you would like to configure this garment.
                </p>
              </div>
              <button type="button" onClick={() => closeAdditionalGarmentChoice()} aria-label="Close additional garment choices" className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-heritage-green/20 text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"><X aria-hidden="true" size={18} /></button>
            </div>

            {compatibleCopySources.length > 1 && (
              <fieldset className="mt-5">
                <legend className="text-xs font-bold uppercase tracking-wide text-heritage-green">Copy from which garment?</legend>
                <div className="mt-2 space-y-2">
                  {compatibleCopySources.map((source) => (
                    <label key={source.parentGarmentKey} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-heritage-green/20 px-3 py-2 text-sm text-heritage-green focus-within:ring-2 focus-within:ring-heritage-gold">
                      <input type="radio" name="additional-garment-copy-source" checked={additionalGarmentChoice.sourceParentGarmentKey === source.parentGarmentKey} onChange={() => setAdditionalGarmentChoice((current) => current ? { ...current, sourceParentGarmentKey: source.parentGarmentKey } : current)} className="size-5 shrink-0 accent-heritage-green" />
                      <span className="min-w-0 break-words">{getFabricGarmentLabel(additionalGarmentChoice.garmentType)} - {source.role}</span>
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
            {!selectedCopySource && compatibleCopySources.length === 0 && <p className="mt-3 text-xs leading-relaxed text-heritage-ink/60">Use Same Custom Details is unavailable because no active garment of this type exists.</p>}
            {compatibleCopySources.length > 1 && !selectedCopySource && <p className="mt-3 text-xs leading-relaxed text-heritage-ink/60">Select the garment whose Custom Details you want to copy.</p>}
            <button type="button" onClick={() => closeAdditionalGarmentChoice()} className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-bold text-heritage-ink underline decoration-heritage-gold underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
};
