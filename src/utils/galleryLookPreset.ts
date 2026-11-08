import { FabricAllocationStateEngine } from "../engine/FabricAllocationStateEngine.js";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine.js";
import {
  createStyleBaseGarmentSpec,
  STYLE_BASE_GARMENT_TYPES,
} from "../config/StyleFabricCapacityConfig.js";
import type {
  CanonicalPhysicalGarmentType,
  CustomDetailDemographic,
  CustomDetailOption,
  DesignSelections,
  DesignStudioStageId,
  Fabric,
  GuestDesignDraft,
  Showpiece,
  StyleCategory,
} from "../types.js";
import { inspectCustomDetailCatalog } from "./catalogHelpers.js";
import { areAssignedMonogramNamesComplete } from "./decorativePricing.js";
import {
  buildAuthoritativePhysicalOccurrences,
  createCatalogDesignSource,
} from "./designSourceState.js";
import {
  getDesignStyleAuthorityMetadata,
  isAuthoritativeDesignStyleProjection,
} from "./designStyleAuthority.js";
import {
  buildDesignStyleDraftValidationAuthority,
  hydrateDesignStyleDraftPersistence,
} from "./designStyleDraftPersistence.js";
import {
  applyDesignStyleStepLedgerToHydration,
  assignCatalogueStyleToOccurrencesThroughStepRuntime,
  bindDesignStyleStepCatalogueLedgerRevision,
  projectActiveOccurrenceDesignStyleCatalogue,
  projectDesignStyleStep,
} from "./designStyleStepRuntime.js";
import {
  DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION,
  getDesignStudioStepCounter,
} from "./designSourceJourney.js";
import { assignFutureFabricToGarment, getFutureFabricStageCompletion } from "./designStudioFutureFabricStage.js";
import {
  createDormantDesignStudioJourneyState,
  getGarmentTypeStageCompletion,
  updateDormantGarmentTypeSelection,
} from "./designStudioJourneyMode.js";
import { isFutureCustomDetailsContentReady } from "./aiTryOnWorkflow.js";
import { getCustomDetailsStageCompletion } from "./customDetailsStageOwnership.js";
import {
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  validateGarmentScopedCustomDetailsCompletion,
} from "./garmentScopedCustomDetailsDomain.js";
import type { FabricCatalogueLoadState } from "./fabricCatalogueNotice.js";
import { isFabricAvailableForCustomerSelection, getFabricAvailabilityMessage } from "./fabricCatalogueAvailability.js";
import { reconcileGarmentTypeSelectionOccurrenceIdentities } from "./physicalGarmentOccurrenceIdentity.js";
import type { StylesLoadState } from "./stylesCatalogueLoadState.js";

const CANONICAL_GARMENT_TYPES = new Set<CanonicalPhysicalGarmentType>(
  STYLE_BASE_GARMENT_TYPES.filter(
    (garmentType): garmentType is CanonicalPhysicalGarmentType =>
      garmentType !== "other",
  ),
);

const DEMOGRAPHICS = new Set<CustomDetailDemographic>([
  "male",
  "female",
  "unisex",
]);

export type GalleryLookIdCorrection = {
  readonly field: "styleId" | "fabricCode";
  readonly from: string;
  readonly to: string;
  readonly matchedName: string;
};

export type GalleryLookBuildResult =
  | {
      readonly ok: true;
      readonly title: string;
      readonly banner: string;
      readonly toast: string;
      readonly stageId: DesignStudioStageId;
      readonly draft: GuestDesignDraft;
      readonly corrections: readonly GalleryLookIdCorrection[];
      readonly garmentTypes: readonly CanonicalPhysicalGarmentType[];
      readonly styleId: string;
      readonly fabricCode: string;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

export type GalleryShowpieceIdAudit = {
  readonly showpieceId: string;
  readonly title: string;
  readonly styleId: string;
  readonly fabricCode: string;
  readonly corrections: readonly GalleryLookIdCorrection[];
  readonly problems: readonly string[];
};

const normalizeName = (value: string | null | undefined): string =>
  (value || "").trim().toLowerCase().replace(/\s+/g, " ");

const quoted = (value: string): string => `"${value}"`;

export const galleryLookLoadedToast = (title: string): string =>
  `Gallery preset loaded: ${title}.`;

const nextStepPhrase = (stageId: DesignStudioStageId): string => {
  switch (stageId) {
    case "garment_type":
      return "finish your garment choices";
    case "fabric":
      return "confirm your fabric";
    case "design_style":
      return "confirm your design style";
    case "custom_details":
      return "choose your custom details";
    case "personalized_additions":
      return "choose your personalized additions";
    case "measurement":
      return "choose your size and measurements";
    default:
      return "continue your order";
  }
};

export const galleryLookBannerCopy = (
  title: string,
  stageId: DesignStudioStageId,
): string => `Loaded: ${title}. Next, ${nextStepPhrase(stageId)}.`;

const representedDemographics = (
  style: StyleCategory,
): CustomDetailDemographic[] => {
  const configured = style.customDetailConfig?.representedGenders;
  if (Array.isArray(configured) && configured.length > 0) {
    return configured.filter((value) => DEMOGRAPHICS.has(value));
  }
  if (style.targetDemographic && DEMOGRAPHICS.has(style.targetDemographic)) {
    return [style.targetDemographic];
  }
  if (style.gender === "male" || style.gender === "female") {
    return [style.gender];
  }
  return [];
};

const garmentTypesForStyle = (
  style: StyleCategory,
):
  | { readonly ok: true; readonly garmentTypes: CanonicalPhysicalGarmentType[] }
  | { readonly ok: false; readonly message: string } => {
  const metadata = getDesignStyleAuthorityMetadata(style);
  const reference =
    metadata?.referenceComposition.status === "known"
      ? metadata.referenceComposition.garmentTypes
      : [];
  const fromComposition = (style.fabricCapacityComposition || []).map(
    (spec) => spec.garmentType,
  );
  const source = reference.length > 0 ? reference : fromComposition;
  if (source.length === 0) {
    return {
      ok: false,
      message: `This look's design style ${style.name} has no garment composition, so it cannot be loaded.`,
    };
  }
  const garmentTypes: CanonicalPhysicalGarmentType[] = [];
  for (const garmentType of source) {
    if (!CANONICAL_GARMENT_TYPES.has(garmentType as CanonicalPhysicalGarmentType)) {
      return {
        ok: false,
        message: `This look's design style ${style.name} includes an unsupported garment, so it cannot be loaded.`,
      };
    }
    const canonical = garmentType as CanonicalPhysicalGarmentType;
    if (!garmentTypes.includes(canonical)) garmentTypes.push(canonical);
  }
  return { ok: true, garmentTypes };
};

const findAuthoritativeStyle = (
  styles: readonly StyleCategory[],
  styleId: string,
): StyleCategory | null =>
  styles.find(
    (style) =>
      style.id === styleId && isAuthoritativeDesignStyleProjection(style),
  ) || null;

const resolveStyle = ({
  styles,
  styleId,
  styleName,
}: {
  styles: readonly StyleCategory[];
  styleId: string;
  styleName?: string;
}):
  | {
      readonly ok: true;
      readonly style: StyleCategory;
      readonly correction: GalleryLookIdCorrection | null;
    }
  | { readonly ok: false; readonly message: string } => {
  const trimmedId = styleId.trim();
  const byId = trimmedId ? findAuthoritativeStyle(styles, trimmedId) : null;
  if (byId) return { ok: true, style: byId, correction: null };
  const stored = trimmedId
    ? styles.find((style) => style.id === trimmedId)
    : undefined;
  if (stored) {
    return {
      ok: false,
      message: `This look's design style ${quoted(trimmedId)} is not available in the catalogue.`,
    };
  }
  const wanted = normalizeName(styleName);
  if (wanted) {
    const matches = styles.filter(
      (style) =>
        isAuthoritativeDesignStyleProjection(style) &&
        normalizeName(style.name) === wanted,
    );
    if (matches.length === 1) {
      const style = matches[0];
      return {
        ok: true,
        style,
        correction: {
          field: "styleId",
          from: trimmedId,
          to: style.id,
          matchedName: style.name,
        },
      };
    }
  }
  return {
    ok: false,
    message: `This look's design style ${quoted(trimmedId || styleName || "unknown")} is not in the catalogue.`,
  };
};

const resolveFabric = ({
  fabrics,
  fabricCode,
  fabricName,
}: {
  fabrics: readonly Fabric[];
  fabricCode: string;
  fabricName?: string;
}):
  | {
      readonly ok: true;
      readonly fabric: Fabric;
      readonly correction: GalleryLookIdCorrection | null;
    }
  | { readonly ok: false; readonly message: string } => {
  const trimmedCode = fabricCode.trim();
  const byCode = trimmedCode
    ? fabrics.find((fabric) => fabric.code === trimmedCode)
    : undefined;
  if (byCode) return { ok: true, fabric: byCode, correction: null };
  const wanted = normalizeName(fabricName);
  if (wanted) {
    const matches = fabrics.filter(
      (fabric) => normalizeName(fabric.name) === wanted,
    );
    if (matches.length === 1) {
      const fabric = matches[0];
      return {
        ok: true,
        fabric,
        correction: {
          field: "fabricCode",
          from: trimmedCode,
          to: fabric.code,
          matchedName: fabric.name,
        },
      };
    }
  }
  return {
    ok: false,
    message: `This look's fabric ${quoted(trimmedCode || fabricName || "unknown")} is not in the catalogue.`,
  };
};

const fabricOrderMessage = (fabric: Fabric): string | null => {
  if (fabric.stockStatus === "OUT_OF_STOCK" || fabric.stock === 0) {
    return `This look's fabric ${fabric.name} (${fabric.code}) is out of stock.`;
  }
  if (fabric.stockStatus === "HIDDEN") {
    return `This look's fabric ${fabric.name} (${fabric.code}) is no longer available.`;
  }
  if (!isFabricAvailableForCustomerSelection(fabric)) {
    const detail = getFabricAvailabilityMessage(fabric);
    return detail
      ? `This look's fabric ${fabric.name} (${fabric.code}) cannot be ordered. ${detail}`
      : `This look's fabric ${fabric.name} (${fabric.code}) cannot be ordered.`;
  }
  return null;
};

const emptyDraftShell = (now: string): GuestDesignDraft =>
  ({
    currentStep: 1,
    selectedFabricCode: null,
    selectedStyleId: null,
    selectedGarment: null,
    designSelections: {},
    measurements: {},
    sizingMode: "manual",
    deliveryMethod: null,
    deliveryAddress: {
      addressLine1: "",
      addressLine2: "",
      city: "",
      postalCode: "",
      countryCode: "",
    },
    pickupTime: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    batchType: "alone",
    customGroupCode: "",
    garmentPieceCount: null,
    specialInstructions: "",
    leftoverFabricChoice: "Return leftover fabric pieces with garment",
    hasLining: false,
    pricingBreakdown: {
      pricingModel: "all_inclusive_garment_construction",
      customDetailsPrice: 0,
      eindhovenToDestinationShipping: null,
    },
    shippingSnapshot: {},
    updatedAt: now,
  }) as GuestDesignDraft;

export const auditGalleryShowpieceIds = ({
  showpieces,
  styles,
  fabrics,
  stylesLoadState,
  fabricsLoadState,
}: {
  showpieces: readonly Showpiece[];
  styles: readonly StyleCategory[];
  fabrics: readonly Fabric[];
  stylesLoadState: StylesLoadState;
  fabricsLoadState: FabricCatalogueLoadState;
}): GalleryShowpieceIdAudit[] => {
  if (stylesLoadState !== "ready" || fabricsLoadState !== "ready") return [];
  return showpieces.map((showpiece) => {
    const corrections: GalleryLookIdCorrection[] = [];
    const problems: string[] = [];
    const style = resolveStyle({
      styles,
      styleId: showpiece.styleId,
      styleName: showpiece.styleName,
    });
    if (style.ok === false) problems.push(style.message);
    else if (style.correction) corrections.push(style.correction);
    const fabric = resolveFabric({
      fabrics,
      fabricCode: showpiece.fabricCode,
      fabricName: showpiece.fabricName,
    });
    if (fabric.ok === false) problems.push(fabric.message);
    else if (fabric.correction) corrections.push(fabric.correction);
    else {
      const stock = fabricOrderMessage(fabric.fabric);
      if (stock) problems.push(stock);
    }
    return {
      showpieceId: showpiece.id,
      title: showpiece.title,
      styleId: showpiece.styleId,
      fabricCode: showpiece.fabricCode,
      corrections,
      problems,
    };
  });
};

export const buildGalleryLookDraft = ({
  styleId,
  fabricCode,
  title,
  styleName,
  fabricName,
  styles,
  fabrics,
  stylesLoadState,
  fabricsLoadState,
  customDetailCatalog,
  now = new Date().toISOString(),
}: {
  styleId: string;
  fabricCode: string;
  title?: string;
  styleName?: string;
  fabricName?: string;
  styles: readonly StyleCategory[];
  fabrics: readonly Fabric[];
  stylesLoadState: StylesLoadState;
  fabricsLoadState: FabricCatalogueLoadState;
  customDetailCatalog: readonly CustomDetailOption[];
  now?: string;
}): GalleryLookBuildResult => {
  if (stylesLoadState === "loading") {
    return {
      ok: false,
      message:
        "The design catalogue is still loading. Try this look again in a moment.",
    };
  }
  if (stylesLoadState === "error") {
    return {
      ok: false,
      message:
        "The design catalogue could not be loaded, so this look cannot be applied.",
    };
  }
  if (fabricsLoadState === "loading") {
    return {
      ok: false,
      message:
        "The fabric catalogue is still loading. Try this look again in a moment.",
    };
  }
  if (fabricsLoadState === "error") {
    return {
      ok: false,
      message:
        "The fabric catalogue could not be loaded, so this look cannot be applied.",
    };
  }
  if (customDetailCatalog.length === 0) {
    return {
      ok: false,
      message:
        "The garment catalogue is still loading. Try this look again in a moment.",
    };
  }

  const styleResult = resolveStyle({ styles, styleId, styleName });
  const fabricResult = resolveFabric({ fabrics, fabricCode, fabricName });
  if (styleResult.ok === false && fabricResult.ok === false) {
    return {
      ok: false,
      message: `${styleResult.message} ${fabricResult.message}`,
    };
  }
  if (styleResult.ok === false) {
    return { ok: false, message: styleResult.message };
  }
  if (fabricResult.ok === false) {
    return { ok: false, message: fabricResult.message };
  }

  const stockMessage = fabricOrderMessage(fabricResult.fabric);
  if (stockMessage) return { ok: false, message: stockMessage };

  const composition = garmentTypesForStyle(styleResult.style);
  if (composition.ok === false) {
    return { ok: false, message: composition.message };
  }

  const demographics = representedDemographics(styleResult.style);
  if (demographics.length !== 1) {
    const audience =
      demographics.length === 0 ? "no audience" : demographics.join(" and ");
    return {
      ok: false,
      message: `This look's design style ${styleResult.style.name} is for ${audience}, so it cannot be loaded as one look.`,
    };
  }

  const catalog = inspectCustomDetailCatalog(customDetailCatalog).activeOptions;
  const selectionWithGarments = updateDormantGarmentTypeSelection({
    currentSelection: createDormantDesignStudioJourneyState({
      normalizedCustomDetailCatalog: catalog,
    }).garmentTypeSelection,
    normalizedCustomDetailCatalog: catalog,
    selectedGarmentTypes: composition.garmentTypes,
    selectedDemographics: demographics,
  });
  const garmentTypeSelection = reconcileGarmentTypeSelectionOccurrenceIdentities({
    selection: selectionWithGarments,
    activeGarmentKeys: selectionWithGarments.garmentTypes.map(
      (garmentType) => createStyleBaseGarmentSpec(garmentType).key,
    ),
  });
  const occurrences = buildAuthoritativePhysicalOccurrences({
    sourceKind: "catalogue",
    step1GarmentTypeSelection: garmentTypeSelection,
    effectiveGarmentTypeSelection: garmentTypeSelection,
  });
  const garmentLabels = occurrences
    .map((occurrence) => getFabricGarmentLabel(occurrence.garmentType))
    .join(" + ");

  let fabricState = FabricAllocationStateEngine.initialize();
  for (const occurrence of occurrences) {
    const assigned = assignFutureFabricToGarment({
      state: fabricState,
      garmentTypeSelection,
      garmentKey: occurrence.garmentKey,
      fabricCode: fabricResult.fabric.code,
      fabrics: [...fabrics],
      requiredPhysicalOccurrences: occurrences,
    });
    if (assigned.status !== "assigned") {
      const exhausted = assigned.reason === "FABRIC_STOCK_EXHAUSTED";
      return {
        ok: false,
        message: exhausted
          ? `This look's fabric ${fabricResult.fabric.name} (${fabricResult.fabric.code}) does not have enough stock for every garment.`
          : `This look's fabric ${fabricResult.fabric.name} (${fabricResult.fabric.code}) could not be assigned to ${getFabricGarmentLabel(occurrence.garmentType)}.`,
      };
    }
    fabricState = assigned.state;
  }

  const authority = buildDesignStyleDraftValidationAuthority({
    catalogueState: "ready",
    styles,
    garmentTypeSelection,
    activeOccurrences: occurrences,
  });
  const hydration = hydrateDesignStyleDraftPersistence({
    rawDraft: emptyDraftShell(now),
    activeOccurrences: occurrences,
    authority,
  });
  const ledger = hydration.ledger;
  if (!ledger) {
    return {
      ok: false,
      message: `This look's design style ${styleResult.style.name} could not be applied to ${garmentLabels}.`,
    };
  }
  const projection = projectDesignStyleStep({
    activeOccurrences: occurrences,
    hydration,
    authority,
    styles,
  });
  const activeTarget = projection.occurrences[0]?.target || null;
  const catalogue = bindDesignStyleStepCatalogueLedgerRevision({
    entries: projectActiveOccurrenceDesignStyleCatalogue({
      projection,
      activeTarget,
      styles,
      authority,
      runtimeGeneration: 1,
    }),
    ledgerRevision: ledger.revision,
  });
  const entry = catalogue.find((item) => item.style.id === styleResult.style.id);
  const requests = entry
    ? projection.occurrences.flatMap((occurrence) => {
        const request =
          entry.requestsByOccurrenceToken[occurrence.target.occurrenceToken];
        return request ? [request] : [];
      })
    : [];
  if (!entry || requests.length !== projection.occurrences.length) {
    return {
      ok: false,
      message: `This look's design style ${styleResult.style.name} could not be applied to ${garmentLabels}.`,
    };
  }
  const assignedStyles = assignCatalogueStyleToOccurrencesThroughStepRuntime({
    ledger,
    activeOccurrences: occurrences,
    authority,
    requests,
    currentRuntimeGeneration: 1,
    stepIsActive: true,
    hydrationMutable: true,
  });
  if (assignedStyles.status === "rejected") {
    return {
      ok: false,
      message: `This look's design style ${styleResult.style.name} could not be applied to ${garmentLabels}.`,
    };
  }
  const appliedHydration = applyDesignStyleStepLedgerToHydration({
    hydration,
    ledger: assignedStyles.ledger,
    activeOccurrences: occurrences,
    authority,
  });
  const appliedProjection = projectDesignStyleStep({
    activeOccurrences: occurrences,
    hydration: appliedHydration,
    authority,
    styles,
  });
  if (!appliedProjection.isComplete || !appliedHydration.envelope) {
    return {
      ok: false,
      message: `This look's design style ${styleResult.style.name} could not be applied to ${garmentLabels}.`,
    };
  }

  const catalogInspection = inspectCustomDetailCatalog(customDetailCatalog);
  const customDetails = reconcileGarmentScopedCustomDetails({
    garmentTypeSelection,
    style: styleResult.style,
    designStyleOccurrences: appliedProjection.occurrences.map((occurrence) => ({
      target: occurrence.target,
      assignment: occurrence.assignment,
      status: occurrence.status,
    })),
    catalogInspection,
    existingState: undefined,
  });
  const personalizedInputs = reconcileGarmentScopedPersonalizedInputs({
    reconciliation: customDetails,
    catalogInspection,
    existingInputs: undefined,
  });
  const designSelections: DesignSelections = {
    accessories: [],
    garmentScopedCustomDetails: customDetails.state,
    garmentScopedCustomDetailInputs: personalizedInputs.state,
  };
  const garmentComplete = getGarmentTypeStageCompletion(garmentTypeSelection).isComplete;
  const fabricComplete = getFutureFabricStageCompletion({
    garmentTypeSelection,
    fabricAllocationState: fabricState,
    fabrics: [...fabrics],
    requiredPhysicalOccurrences: occurrences,
  }).isComplete;
  const customCompletion = validateGarmentScopedCustomDetailsCompletion({
    earlierStagesComplete:
      garmentComplete && fabricComplete && appliedProjection.isComplete,
    reconciliation: customDetails,
    personalizedInputs,
  });
  const customDetailsReady = isFutureCustomDetailsContentReady(
    getCustomDetailsStageCompletion({
      stage: "custom_details",
      completion: customCompletion,
      reconciliation: customDetails,
    }),
  );
  const personalizedReady =
    isFutureCustomDetailsContentReady(
      getCustomDetailsStageCompletion({
        stage: "personalized_additions",
        completion: customCompletion,
        reconciliation: customDetails,
      }),
    ) && areAssignedMonogramNamesComplete(designSelections);
  const stageId: DesignStudioStageId = !garmentComplete
    ? "garment_type"
    : !fabricComplete
      ? "fabric"
      : !appliedProjection.isComplete
        ? "design_style"
        : !customDetailsReady
          ? "custom_details"
          : !personalizedReady
            ? "personalized_additions"
            : "measurement";

  const designSource = createCatalogDesignSource(styleResult.style.id);
  if (!designSource) {
    return {
      ok: false,
      message: `This look's design style ${styleResult.style.name} could not be applied to ${garmentLabels}.`,
    };
  }
  const lookTitle =
    title?.trim() ||
    `${styleResult.style.name} in ${fabricResult.fabric.name}`;
  const corrections = [styleResult.correction, fabricResult.correction].filter(
    (correction): correction is GalleryLookIdCorrection => correction !== null,
  );
  const draft: GuestDesignDraft = {
    ...emptyDraftShell(now),
    journeySchemaVersion: DESIGN_STUDIO_TEN_STAGE_SCHEMA_VERSION,
    currentStageId: stageId,
    currentStep: getDesignStudioStepCounter(stageId).step,
    garmentTypeSelection,
    designStyleAssignmentDraft: appliedHydration.envelope,
    selectedFabricCode: fabricResult.fabric.code,
    selectedStyleId: styleResult.style.id,
    designSource,
    confirmedStyleId: styleResult.style.id,
    confirmedDesignSourceKey: designSource.sourceKey,
    priceActivatedFabricCode: fabricResult.fabric.code,
    designSelections,
    garmentPieceCount: occurrences.length,
    fabricAllocations: fabricState.fabricAllocations,
    updatedAt: now,
  };

  return {
    ok: true,
    title: lookTitle,
    banner: galleryLookBannerCopy(lookTitle, stageId),
    toast: galleryLookLoadedToast(lookTitle),
    stageId,
    draft,
    corrections,
    garmentTypes: garmentTypeSelection.garmentTypes,
    styleId: styleResult.style.id,
    fabricCode: fabricResult.fabric.code,
  };
};
