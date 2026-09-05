import {
  normalizeCustomDetailCatalog,
  inspectCustomDetailCatalog,
} from "../utils/catalogHelpers";
import React, {
  useCallback,
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  StyleCategory,
  Fabric,
  Measurements,
  DesignSelections,
  CartItem,
  OrderContext,
  Customer,
  CustomDetailSelectionGroup,
  GuestDesignDraft,
  FabricAllocation,
  FabricAllocationState,
  CustomDetailDemographic,
  FabricGarmentType,
  GarmentTypeStepSelection,
  AiTryOnWorkflowStateV1,
  FutureMeasurementStateV1,
  FutureShippingStateV1,
  MeasurementRiskRoute,
  DesignStudioStageId,
  CanonicalPhysicalGarmentType,
  DecorativeFeature,
  MonogramPlacement,
  CustomerDesignUploadReference,
  DesignSource,
  FabricCapacityGarmentSpec,
  UploadedDesignSource,
} from "../types";
import { useAppStore } from "../store/useAppStore";
import { BatchBusinessRules } from "../engine/BatchBusinessRules";
import { CapacityService } from "../services/CapacityService";
import { OrderRoutingEngine } from "../engine/OrderRoutingEngine";
import { FabricAllocationStateEngine } from "../engine/FabricAllocationStateEngine";
import { createStyleBaseGarmentSpec } from "../config/StyleFabricCapacityConfig";
import { GarmentTypeStep } from "./GarmentTypeStep";
import { DormantFutureFabricStep } from "./DormantFutureFabricStep";
import { DormantFutureDesignStyleStep } from "./DormantFutureDesignStyleStep";
import { DesignStudioJourneyStepper, DESIGN_STUDIO_STEPS } from "./DesignStudioJourneyStepper";
import { resolveStep1CatalogueCoverage } from "../utils/step1CatalogueCoverage";
import {
  canBeginFutureDesignDraftHydration,
  preserveUnresolvedCatalogueStyleSelection,
  resolveHydratedDesignStyleSelection,
} from "../utils/stylesCatalogueLoadState";
import {
  DormantFutureCustomDetailsStep,
  type AdditionalGarmentCustomDetailsChoice,
  type AdditionalGarmentCustomDetailsRequest,
} from "./DormantFutureCustomDetailsStep";
import { DormantFutureAiTryOnStep } from "./DormantFutureAiTryOnStep";
import { DormantFutureMeasurementStep } from "./DormantFutureMeasurementStep";
import { DormantFutureSummaryStep } from "./DormantFutureSummaryStep";
import { DormantFutureShippingStep } from "./DormantFutureShippingStep";
import { DormantFuturePaymentReviewStep } from "./DormantFuturePaymentReviewStep";
import { DesignStudioOrderSummary } from "./DesignStudioOrderSummary";
import { getCurrentCommunityBatch } from "../utils/batchUtils";
import {
} from "../utils/shippingPricing";
import { calculateDesignPricing } from "../utils/designPricing";
import { projectCustomerGarmentConstructionBreakdown } from "../utils/designPriceBreakdownPresentation";
import { GuestOrderSessionService } from "../services/guestOrderSessionService";
import { auth } from "../services/firebase";
import {
  areFutureDraftsEquivalent,
  createFirebaseAuthenticatedFutureDraftRepository,
  resolveAuthenticatedFutureDraftIdentity,
  type AuthenticatedFutureDraftIntegrationStatus,
  type AuthenticatedFutureDraftIdentity,
} from "../services/authenticatedFutureDraftService";
import {
  buildDesignStyleDraftValidationAuthority,
  buildUploadedDesignStyleAuthority,
  hydrateDesignStyleDraftEnvelope,
  hydrateDesignStyleDraftPersistence,
  createDesignStylePersistenceAcknowledgement,
  prepareDesignStyleDraftAutosave,
  shouldAcceptDesignStyleDraftSaveCompletion,
  shouldApplyDesignStyleDraftHydration,
  type DesignStyleDraftHydrationResult,
} from "../utils/designStyleDraftPersistence";
import {
  applyDesignStyleStepLedgerToHydration,
  applyDesignStyleUploadForActiveOccurrence,
  assignCatalogueStyleToOccurrencesThroughStepRuntime,
  beginDesignStyleUploadForActiveOccurrence,
  bindDesignStyleStepCatalogueLedgerRevision,
  clearCatalogueStyleThroughStepRuntime,
  detachUploadedStyleThroughStepRuntime,
  designStyleStepTargetsEqual,
  projectActiveOccurrenceDesignStyleCatalogue,
  projectDesignStyleStep,
  resolveActiveDesignStyleOccurrence,
  type DesignStyleStepCatalogMutationRequest,
  type DesignStyleStepClearMutationRequest,
  type UploadedDesignStyleDetachLifecycleOutcome,
} from "../utils/designStyleStepRuntime";
import { removeExactGarmentDesignStyleAssignment } from "../utils/garmentScopedDesignStyleAssignment";
import {
  createDesignStyleUploadOperationState,
  failDesignStyleUploadOperation,
  type DesignStyleUploadOperationState,
  type DesignStyleUploadOperationTicket,
} from "../utils/designStyleUploadOperation";
import { resolveDesignStudioFabricAllocationPricing } from "../utils/fabricAllocationPricing";
import {
  cloneFabricAllocations,
  resolveDraftAutosaveFabricAllocations,
  resolveDraftHydrationAllocations,
} from "../utils/fabricAllocationPersistence";
import {
  acceptDormantGarmentConstructionDefaults,
  createDormantDesignStudioJourneyState,
  getGarmentTypeStageCompletion,
  persistDormantGarmentTypeStage,
  updateDormantGarmentTypeSelection,
} from "../utils/designStudioJourneyMode";
import {
  assignFutureFabricToGarment,
  applyFutureFabricCardSelection,
  assignFutureGarmentToExistingFabricAllocation,
  assignSameFabricProductToGarments,
  cancelFutureFabricCatalogueAssignment,
  changeFutureFabricAllocationProduct,
  type ChangeFutureFabricAllocationExpectation,
  getFutureGarmentFabricPlanning,
  getGarmentTypeStepSelectedFabricQuantity,
  getFutureFabricCapacityComposition,
  getFutureFabricGarmentSelections,
  getFutureFabricStageCompletion,
  getHydratedOrphanFabricAssignmentRepairTargets,
  prepareHydratedFabricAllocationState,
  repairHydratedOrphanFabricAssignment,
  reconcileFutureFabricAllocationStateIfChanged,
  revalidateHydratedFabricIntegrityAfterExplicitRepair,
  type HydratedOrphanFabricAssignmentRepairTarget,
} from "../utils/designStudioFutureFabricStage";
import {
  getGarmentTypeSelectedDemographics,
  selectGarmentConstructionOption,
} from "../utils/garmentTypeStepState";
import { reconcileFutureDesignStyleSelection } from "../utils/designStudioFutureDesignStyle";
import {
  calculateGarmentScopedCustomDetailsPricing,
  projectAuthorizedAdditionalGarmentAssignments,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  validateGarmentScopedCustomDetailsCompletion,
} from "../utils/garmentScopedCustomDetailsDomain";
import { resolveShowAdditionalClothesCosts } from "../config/GarmentDetailsConfig";
import { projectActiveCustomerDesignSelections } from "../utils/customerAvailableDesignSelections";
import {
  applyAdditionalGarmentConstructionAndCopy,
  canCancelPendingForAdditionalGarmentTransaction,
  confirmAdditionalGarmentFabricAssignment,
  confirmAdditionalGarmentTransactionCommitted,
  getActiveFabricForAdditionalGarmentPicker,
  isAdditionalGarmentFabricTransactionTargetValid,
  resolveAuthoritativePrimaryFabricCode,
  resolveCurrentCatalogueFabricForAssignment,
  STALE_ADDITIONAL_GARMENT_FABRIC_MESSAGE,
  type AdditionalGarmentFabricTransaction,
} from "../utils/additionalGarmentFabricPicker";
import { resolveFutureStageCorrection } from "../utils/resolveFutureStageCorrection";
import { FutureAdditionalGarmentFabricDialog } from "./FutureAdditionalGarmentFabricDialog";
import { getFabricGarmentLabel } from "../engine/FabricCapacityEngine";
import {
  clearGarmentScopedCustomDetailSelection,
  getGarmentScopedCustomDetailSelection,
  removeGarmentScopedCustomDetails,
  setGarmentScopedCustomDetailSelection,
} from "../utils/garmentScopedCustomDetailsState";
import {
  setGarmentScopedCustomDetailText,
} from "../utils/garmentScopedCustomDetailInputsState";
import {
  createAiTryOnVisualInputFingerprint,
  createEmptyAiTryOnWorkflowState,
  isFutureCustomDetailsContentReady,
  normalizeAiTryOnWorkflowState,
  reconcileAiTryOnWorkflow,
  transitionAiTryOnWorkflow,
} from "../utils/aiTryOnWorkflow";
import {
  createEmptyFutureMeasurementState,
  getMeasurementPhysicalGarments,
  resolveHydratedMeasurementPhysicalGarments,
  isFutureMeasurementStageUnlocked,
  isFutureSummaryUnlockedByMeasurements,
  normalizeFutureMeasurementState,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  setFutureMeasurementRoute,
} from "../utils/measurementBlueprint";
import { projectFutureDesignStudioSummary } from "../utils/designStudioFutureSummary";
import {
  projectDesignStudioLiveOrderSummary,
  shouldShowPersistentLiveOrderSummary,
} from "../utils/designStudioLiveOrderSummary";
import {
  createEmptyFutureShippingState,
  isFutureShippingStageUnlocked,
  isFutureShippingStepComplete,
  normalizeFutureShippingState,
  persistFutureShippingState,
  prefillFutureShippingContact,
  reconcileFutureShippingState,
  refreshFutureShippingQuote,
} from "../utils/designStudioFutureShipping";
import {
  buildFutureOrderCandidateV2,
  type FutureOrderCandidateBlocker,
  type FutureOrderCandidateUploadedStyleAuthorityV2,
  type FutureOrderCandidateV2BuildResult,
} from "../utils/futureOrderCandidate";
import {
  createFutureOrderV2PaymentReviewHandoff,
  isFuturePaymentReviewStageUnlocked,
  type FutureOrderV2PaymentReviewHandoff,
} from "../utils/designStudioFuturePaymentReview";
import {
  prepareFutureOrderV2Submission,
  type FutureOrderV2PreparationAttempt,
} from "../utils/futureOrderV2Preparation";
import {
  authorizeFutureOrderV2Payment,
  executeFutureOrderV2Payment,
  type FutureOrderV2PaymentAttempt,
} from "../utils/futureOrderV2Payment";
import { persistFutureOrderV2 } from "../services/futureOrderV2Persistence";
import {
  buildAuthoritativePhysicalOccurrences,
  activateFutureCatalogStyleSelection,
  createCatalogDesignSource,
  isValidUploadedDesignDraftSource,
  projectAuthoritativePhysicalOccurrences,
  type AuthoritativePhysicalOrderDiagnostic,
  type PhysicalGarmentOccurrence,
} from "../utils/designSourceState";
import {
  buildEffectiveUploadedJourneyGarmentTypeSelection,
  createUploadedDesignOperationCoordinator,
  createUploadedDesignSourceWhenReady,
  getUploadedDesignAdditionalGarmentTypes,
  getUploadedDesignCompositionNeedsReview,
  getUploadedDesignCompositionSignature,
  evaluateAuthoritativeUploadedDesignReadiness,
  getUploadedDesignRequiredStep1GarmentTypes,
  mergeUploadedDesignCompositionWithStep1,
  resolveAuthorityAfterSuccessfulUploadedDesignPreview,
  resolveFabricStepGarmentTypeSelection,
  runUploadedDesignOperation,
  UPLOADED_DESIGN_COMPOSITION_NEEDS_REVIEW_MESSAGE,
  UPLOADED_DESIGN_MISSING_REQUIRED_STEP1_GARMENTS_MESSAGE,
} from "../utils/uploadedDesignStep1";
import { useDesignStudioEffectiveJourneyComposition } from "../utils/useDesignStudioEffectiveJourneyComposition";
import {
  getPhysicalGarmentOccurrenceGeneration,
  reconcileGarmentTypeSelectionOccurrenceIdentities,
} from "../utils/physicalGarmentOccurrenceIdentity";
import {
  CustomerDesignUploadError,
  CustomerDesignUploadService,
} from "../services/customerDesignUploadService";
import { ensureCustomerUploadIdentity } from "../services/customerDesignUploadIdentity";
import {
  deleteUploadedDesignBeforeSourceChange,
  deleteUploadedDesignCanonicalSource,
} from "../utils/uploadedDesignDeletionOrchestration";
import {
  coordinateUploadedSourceCleanup,
  createUploadedSourceCleanupCandidate,
  type UploadedSourceCleanupCandidate,
} from "../utils/designStyleUploadedSourceCleanup";
import { getFutureOrderV2HistorySafetyStatus } from "../services/futureOrderV2History";
import { designStylePrecanonicalUploadCleanupCoordinator } from "../utils/designStylePrecanonicalUploadCleanup";
import {
  cloneGarmentConstructionPricingResolution,
  createEmptyAdditionalGarmentConstructionState,
  reconcileAdditionalGarmentConstructionState,
  removeAdditionalGarmentConstruction,
  selectAdditionalGarmentConstructionOption,
} from "../utils/additionalGarmentConstructionState";
import { createCatalogueAdditionalGarmentSelection } from "../utils/additionalGarmentDomain";
import {
  CUSTOMER_SELECTABLE_GARMENT_TYPES,
  resolveGarmentConstructionPricing,
} from "../utils/garmentConstructionPricing";
import { projectFutureCustomDetailsCatalogue } from "../utils/futureCustomDetailsCatalogue";
import {
  sortDecorativeFeatures,
  sortTraditionalAccessories,
  type TraditionalAccessory,
} from "../utils/decorativePricing";
import {
  resolveFuturePhysicalGarmentRemovalAuthority,
  type FuturePhysicalGarmentRemovalBlockerCode,
} from "../utils/midProcessGarmentRemoval";
import {
  applyFuturePhysicalGarmentRemovalCommit,
  createRemovalStageRetentionLease,
  isCurrentAdditionalGarmentFabricOperation,
  isRemovalStageRetentionLeaseActive,
  preparePendingAdditionalGarmentCancellationCommit,
  prepareFuturePhysicalGarmentRemovalTransaction,
  projectFutureGarmentRemovalTransientPlan,
  type RemovalStageRetentionLease,
} from "../utils/midProcessGarmentRemovalIntegration";
import {
  FutureGarmentRemovalConfirmationDialog,
  projectFutureGarmentRemovalTargets,
  type FutureGarmentRemovalTarget,
} from "./FutureGarmentRemovalConfirmationDialog";

export interface DesignStudioViewProps {
  onAddToCart: (item: Omit<CartItem, "id">) => void;
  openCartDrawer: () => void;
  currentUser?: { email?: string; phone?: string; name: string } | null;
  orderContext?: OrderContext | null;
  styles?: StyleCategory[];
  fabrics?: Fabric[];
  customers?: Customer[];
  setCustomers?: React.Dispatch<React.SetStateAction<Customer[]>>;
  initialStyleId?: string | null;
  initialFabricCode?: string | null;
  clearInitialPreset?: () => void;
}

const getCustomerDesignUploadErrorMessage = (error: unknown): string => {
  if (!(error instanceof CustomerDesignUploadError)) {
    return "We could not update your design image. Please try again.";
  }

  switch (error.code) {
    case "UNSUPPORTED_FILE_TYPE":
      return "Please upload a JPEG, PNG, or WebP image.";
    case "FILE_TOO_LARGE":
      return "Your image must be 5 MB or smaller.";
    case "IMAGE_DIMENSIONS_TOO_LARGE":
      return "Your image is too large. Please use an image no larger than 4096px on either side.";
    case "IMAGE_DECODE_FAILED":
      return "We couldn't read this image. Please choose another file.";
    case "UPLOAD_IDENTITY_UNAVAILABLE":
      return "Secure uploads are unavailable right now. Please try again.";
    case "READ_NOT_AUTHORIZED":
    case "READ_FAILED":
      return "Your design preview is unavailable right now. Your saved design is still available.";
    case "DELETE_NOT_AUTHORIZED":
    case "DELETE_FAILED":
      return "Your private design image could not be removed. Please try again later.";
    default:
      return "We could not upload your design. Please try again.";
  }
};

type FutureGarmentRemovalOriginStage =
  | "custom_details"
  | "summary"
  | "payment";

type FutureGarmentRemovalDialogRequest = {
  target: FutureGarmentRemovalTarget;
  expectedAuthoritySignature: string;
  originStage: FutureGarmentRemovalOriginStage;
  confirmationGeneration: number;
  opener: HTMLButtonElement | null;
  sessionIdentityKey: string;
};

type FutureGarmentRemovalFocusRequest =
  | {
      kind: "cancel";
      confirmationGeneration: number;
      originStage: FutureGarmentRemovalOriginStage;
      opener: HTMLButtonElement | null;
      sessionIdentityKey: string;
    }
  | {
      kind: "removed";
      confirmationGeneration: number;
      originStage: FutureGarmentRemovalOriginStage;
      suggestedGarmentKey: string | null;
      authoritySignature: string;
      removalGeneration: number;
      sessionIdentityKey: string;
    }
  | {
      kind: "stale";
      confirmationGeneration: number;
      originStage: FutureGarmentRemovalOriginStage;
      sessionIdentityKey: string;
    };

type FutureGarmentRemovalAnnouncement = {
  kind: "success" | "error";
  message: string;
  generation: number;
} | null;

const LAST_GARMENT_REMOVAL_MESSAGE =
  "At least one garment must remain in your order.";

const getFutureGarmentRemovalBlockerMessage = (
  code: FuturePhysicalGarmentRemovalBlockerCode,
): string => {
  switch (code) {
    case "LAST_GARMENT_REMOVAL_FORBIDDEN":
      return LAST_GARMENT_REMOVAL_MESSAGE;
    case "DEPENDENT_ADDITIONAL_GARMENT_PRESENT":
      return "Remove the dependent added garment first, then try again.";
    case "PROTECTED_SOURCE_MUTATION_PENDING":
      return "Wait for the current design update to finish, then try again.";
    case "UPLOAD_SOURCE_NOT_CONFIRMED":
    case "UPLOAD_COMPOSITION_MIRROR_MISMATCH":
    case "UPLOAD_ADDITIONAL_TYPES_MIRROR_MISMATCH":
      return "Review the current uploaded design before removing this garment.";
    case "AUTHORITATIVE_ORDER_INVALID":
    case "TARGET_GARMENT_NOT_FOUND":
    case "TARGET_GARMENT_AMBIGUOUS":
    case "TARGET_MEMBERSHIP_INVALID":
    case "POST_REMOVAL_AUTHORITY_INVALID":
      return "We couldn’t safely remove this garment. Close this message and review your order.";
  }
};

const findElementByExactDataValue = <T extends HTMLElement>(
  attribute: string,
  value: string,
  originStage?: FutureGarmentRemovalOriginStage,
): T | null => {
  if (typeof document === "undefined") return null;
  return (
    Array.from(document.querySelectorAll<T>(`[${attribute}]`)).find(
      (element) =>
        element.getAttribute(attribute) === value &&
        (!originStage ||
          element.getAttribute("data-garment-removal-origin-stage") ===
            originStage),
    ) || null
  );
};

interface FutureDesignStyleRuntimeHydration {
  readonly identityKey: string;
  readonly identityGeneration: number;
  readonly runtimeGeneration: number;
  readonly result: DesignStyleDraftHydrationResult;
  readonly fingerprint: string;
}

interface FutureDesignStyleMutationAuthority {
  readonly identityKey: string;
  readonly identityGeneration: number;
  readonly runtimeGeneration: number;
  readonly hydration: DesignStyleDraftHydrationResult;
  readonly activeOccurrences: readonly PhysicalGarmentOccurrence[];
  readonly occurrenceTargets: readonly DesignStyleStepClearMutationRequest["target"][];
  readonly activeTarget: DesignStyleStepClearMutationRequest["target"] | null;
  readonly authority: ReturnType<typeof buildDesignStyleDraftValidationAuthority>;
  readonly stepIsActive: boolean;
}

interface FutureDesignStyleUploadUiState {
  readonly garmentKey: string;
  readonly occurrenceToken: string;
  readonly operationGeneration: number;
  readonly status: "pending" | "success" | "error";
  readonly message?: string;
  readonly previewUrl?: string;
}

const getFutureDesignStyleHydrationFingerprint = (
  result: DesignStyleDraftHydrationResult,
): string =>
  JSON.stringify({
    status: result.status,
    envelope: result.envelope,
    canAutosave: result.canAutosave,
    destructiveNormalizationProhibited:
      result.destructiveNormalizationProhibited,
    authorityPending: result.authorityPending,
    reviewRequired: result.reviewRequired,
    shouldPersistEnvelope: result.shouldPersistEnvelope,
    reconciliation: result.reconciliation,
    validation: result.validation,
    diagnostics: result.diagnostics,
    legacyScalarFingerprint: result.legacyScalarFingerprint,
  });

export default function DesignStudioView({
  currentUser,
  orderContext,
  styles = [],
  fabrics = [],
  initialStyleId,
  initialFabricCode,
  clearInitialPreset,
}: DesignStudioViewProps) {
  const [guestDraftHydrated, setGuestDraftHydrated] = useState<boolean>(false);
  const [firebaseDraftAuth, setFirebaseDraftAuth] = useState<{
    resolved: boolean;
    user: User | null;
  }>({ resolved: false, user: null });
  const [futureDraftFabricIntegrityBlockers, setFutureDraftFabricIntegrityBlockers] =
    useState<AuthoritativePhysicalOrderDiagnostic[]>([]);
  const [futureDraftPersistenceStatus, setFutureDraftPersistenceStatus] =
    useState<AuthenticatedFutureDraftIntegrationStatus>("resolving");
  const cloudFutureDraftRevisionRef = useRef<number | null>(null);
  const cloudFutureDraftSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const futureDraftIdentityGenerationRef = useRef(0);
  const futureDraftHydrationRequestGenerationRef = useRef(0);
  const futureDraftAutosaveGenerationRef = useRef(0);
  const futureDesignStyleRuntimeGenerationRef = useRef(0);
  const futureDesignStyleDraftHydrationRef =
    useRef<FutureDesignStyleRuntimeHydration | null>(null);
  const [futureDesignStyleDraftHydration, setFutureDesignStyleDraftHydration] =
    useState<FutureDesignStyleRuntimeHydration | null>(null);
  const [futureActiveDesignStyleOccurrence, setFutureActiveDesignStyleOccurrence] =
    useState<DesignStyleStepClearMutationRequest["target"] | null>(null);
  const previousFutureDesignStyleOccurrenceOrderRef = useRef<
    readonly DesignStyleStepClearMutationRequest["target"][]
  >([]);
  const [futureDesignStyleMutationError, setFutureDesignStyleMutationError] =
    useState<string | null>(null);
  const [futurePaymentReviewHandoff, setFuturePaymentReviewHandoff] =
    useState<FutureOrderV2PaymentReviewHandoff | null>(null);
  const futureOrderV2PreparationRef =
    useRef<FutureOrderV2PreparationAttempt | null>(null);
  const futureOrderV2PreparationInFlightRef = useRef(false);
  const futureOrderV2PaymentAttemptRef =
    useRef<FutureOrderV2PaymentAttempt | null>(null);
  const futureOrderV2PaymentInFlightRef = useRef(false);
  const [futurePaymentReviewTransitionBlockers, setFuturePaymentReviewTransitionBlockers] =
    useState<readonly FutureOrderCandidateBlocker[]>([]);
  const futureDesignStyleMutationAuthorityRef =
    useRef<FutureDesignStyleMutationAuthority | null>(null);
  const futureDesignStyleUploadOperationStateRef =
    useRef<DesignStyleUploadOperationState>(
      createDesignStyleUploadOperationState(),
    );
  const [futureDesignStyleUploadUiByGarmentKey, setFutureDesignStyleUploadUiByGarmentKey] =
    useState<Readonly<Record<string, FutureDesignStyleUploadUiState>>>({});
  const [futureDesignStyleUploadedSourceByGarmentKey, setFutureDesignStyleUploadedSourceByGarmentKey] =
    useState<Readonly<Record<string, UploadedDesignSource>>>({});
  const futureDesignStyleUploadPreviewUrlByGarmentKeyRef = useRef<
    Record<string, string>
  >({});
  const futureDesignStyleDetachedSourceLifecycleRef =
    useRef<UploadedDesignStyleDetachLifecycleOutcome | null>(null);
  const lastPersistedFutureDraftRef = useRef<GuestDesignDraft | null>(null);
  const lastDesignStylePersistenceAcknowledgementRef = useRef<
    ReturnType<typeof createDesignStylePersistenceAcknowledgement>
  >(null);
  const uploadedSourceCleanupCandidatesRef = useRef<
    Map<
      string,
      {
        readonly candidate: UploadedSourceCleanupCandidate;
        readonly reference: CustomerDesignUploadReference;
        readonly confirmation: {
          readonly sourceKey: string;
          readonly uploadedSourceRef: string;
          readonly ownerUid: string;
        } | null;
      }
    >
  >(new Map());
  const uploadedSourceCleanupInFlightRef = useRef(new Set<string>());
  const lastScheduledFutureDraftRef = useRef<GuestDesignDraft | null>(null);
  const preservedInvalidHydratedDraftFabricAllocationsRef = useRef<
    FabricAllocation[] | null
  >(null);
  const businessSettings = useAppStore((state) => state.businessSettings);
  const isLoadingData = useAppStore((state) => state.isLoadingData);
  const stylesLoadState = useAppStore((state) => state.stylesLoadState);
  const storeBatches = useAppStore((state) => state.batches);
  const setNotification = useAppStore((state) => state.setNotification);
  const customDetailCatalog = useAppStore(
    (state: any) => state.customDetailCatalog,
  );
  const futureDraftIdentity = useMemo<AuthenticatedFutureDraftIdentity>(
    () =>
      resolveAuthenticatedFutureDraftIdentity({
        authResolved: firebaseDraftAuth.resolved,
        firebaseUser: firebaseDraftAuth.user,
        customer: currentUser,
      }),
    [firebaseDraftAuth, currentUser],
  );
  const futureDraftIdentityKey =
    futureDraftIdentity.status === "authenticated"
      ? `authenticated:${futureDraftIdentity.ownerUid}`
      : futureDraftIdentity.status === "blocked"
        ? `blocked:${futureDraftIdentity.reason}`
        : futureDraftIdentity.status;
  const [garmentTypeSelection, setGarmentTypeSelection] =
    useState<GarmentTypeStepSelection>(
      () =>
        createDormantDesignStudioJourneyState({
          normalizedCustomDetailCatalog: normalizeCustomDetailCatalog([]),
        }).garmentTypeSelection,
    );
  const garmentTypeStageCompletion =
    getGarmentTypeStageCompletion(garmentTypeSelection);
  const [futureStageId, setFutureStageId] =
    useState<DesignStudioStageId>("garment_type");
  const futureGarmentRemovalGenerationRef = useRef(0);
  const futureGarmentRemovalStageRetentionLeaseRef =
    useRef<RemovalStageRetentionLease | null>(null);
  const futureGarmentRemovalConfirmationGenerationRef = useRef(0);
  const futureGarmentRemovalProcessedGenerationRef = useRef<number | null>(null);
  const futureGarmentRemovalConfirmingRef = useRef(false);
  const futureGarmentRemovalDialogRequestRef =
    useRef<FutureGarmentRemovalDialogRequest | null>(null);
  const [futureGarmentRemovalDialogRequest, setFutureGarmentRemovalDialogRequest] =
    useState<FutureGarmentRemovalDialogRequest | null>(null);
  const [futureGarmentRemovalDialogError, setFutureGarmentRemovalDialogError] =
    useState<string | null>(null);
  const [futureGarmentRemovalDialogConfirming, setFutureGarmentRemovalDialogConfirming] =
    useState(false);
  const [futureGarmentRemovalFocusRequest, setFutureGarmentRemovalFocusRequest] =
    useState<FutureGarmentRemovalFocusRequest | null>(null);
  const [futureGarmentRemovalAnnouncement, setFutureGarmentRemovalAnnouncement] =
    useState<FutureGarmentRemovalAnnouncement>(null);
  const previousFutureStageIdRef = useRef<DesignStudioStageId>(futureStageId);
  const previousFutureGarmentRemovalSessionIdentityRef = useRef(
    futureDraftIdentityKey,
  );
  const [highestUnlockedStageIndex, setHighestUnlockedStageIndex] =
    useState(0);
  const [futureAiTryOnWorkflow, setFutureAiTryOnWorkflow] =
    useState<AiTryOnWorkflowStateV1>(createEmptyAiTryOnWorkflowState);
  const [futureMeasurementState, setFutureMeasurementState] =
    useState<FutureMeasurementStateV1>(createEmptyFutureMeasurementState);
  const [futureShippingState, setFutureShippingState] =
    useState<FutureShippingStateV1>(createEmptyFutureShippingState);
  const [futureSelectedStyleId, setFutureSelectedStyleId] = useState<
    string | null
  >(null);
  const [futureDesignSource, setFutureDesignSource] =
    useState<DesignSource | null>(null);
  const [futureConfirmedDesignSourceKey, setFutureConfirmedDesignSourceKey] =
    useState<string | null>(null);
  const futureGarmentRemovalSessionIdentityKey = futureDraftIdentityKey;
  const [futurePriceActivatedFabricCode, setFuturePriceActivatedFabricCode] =
    useState<string | null>(null);
  const [uploadedDesignReference, setUploadedDesignReference] =
    useState<CustomerDesignUploadReference | null>(null);
  const [uploadedDesignComposition, setUploadedDesignComposition] = useState<
    FabricCapacityGarmentSpec[]
  >([]);
  const [uploadedDesignAdditionalGarmentTypes, setUploadedDesignAdditionalGarmentTypes] =
    useState<FabricGarmentType[]>([]);
  const [uploadedDesignDemographic, setUploadedDesignDemographic] =
    useState<CustomDetailDemographic | null>(null);
  const [uploadedDesignPreviewUrl, setUploadedDesignPreviewUrl] = useState<
    string | null
  >(null);
  const uploadedDesignPreviewUrlRef = useRef<string | null>(null);
  const [uploadedDesignPreviewReferenceId, setUploadedDesignPreviewReferenceId] =
    useState<string | null>(null);
  const [, setUploadedDesignError] = useState("");
  const [isUploadingDesign, setIsUploadingDesign] = useState(false);
  const [isReplacingDesign, setIsReplacingDesign] = useState(false);
  const uploadedDesignOperationCoordinatorRef = useRef(
    createUploadedDesignOperationCoordinator(),
  );
  const uploadedDesignOperationGenerationRef = useRef<number | null>(null);
  const uploadedDesignOperationPendingRef = useRef(false);
  const [isRemovingDesign, setIsRemovingDesign] = useState(false);
  const uploadedDesignDeletionInFlightRef = useRef(false);
  const uploadedDesignDeletionGenerationRef = useRef(0);
  const [pendingCatalogStyleId, setPendingCatalogStyleId] = useState<
    string | null
  >(null);
  const [, setIsLoadingUploadedDesignPreview] = useState(false);

  const publishFutureDesignStyleHydration = useCallback(
    ({
      identityKey,
      identityGeneration,
      result,
    }: {
      identityKey: string;
      identityGeneration: number;
      result: DesignStyleDraftHydrationResult;
    }): FutureDesignStyleRuntimeHydration => {
      const fingerprint = getFutureDesignStyleHydrationFingerprint(result);
      const current = futureDesignStyleDraftHydrationRef.current;
      if (
        current?.identityKey === identityKey &&
        current.identityGeneration === identityGeneration &&
        current.fingerprint === fingerprint
      ) {
        return current;
      }
      const next: FutureDesignStyleRuntimeHydration = {
        identityKey,
        identityGeneration,
        runtimeGeneration: ++futureDesignStyleRuntimeGenerationRef.current,
        result,
        fingerprint,
      };
      futureDesignStyleDraftHydrationRef.current = next;
      setFutureDesignStyleDraftHydration(next);
      return next;
    },
    [],
  );

  const clearFutureDesignStyleRuntimeHydration = useCallback(() => {
    futureDesignStyleRuntimeGenerationRef.current += 1;
    futureDesignStyleDraftHydrationRef.current = null;
    futureDesignStyleMutationAuthorityRef.current = null;
    setFutureDesignStyleDraftHydration(null);
    setFutureActiveDesignStyleOccurrence(null);
    previousFutureDesignStyleOccurrenceOrderRef.current = [];
    setFutureDesignStyleMutationError(null);
  }, []);

  const computedActiveBatch = getCurrentCommunityBatch(storeBatches || []);
  const defaultCtx: OrderContext = computedActiveBatch
    ? {
        orderType: "Community",
        batchId: computedActiveBatch.id,
        batchName: computedActiveBatch.name,
        closingDate: computedActiveBatch.endDate,
        deliveryWindow: computedActiveBatch.estimatedDelivery || "",
        pickupLocation:
          computedActiveBatch.pickupLocation ||
          businessSettings.productionSettings.defaultPickupLocation,
        currentMembers:
          CapacityService.getReservedCapacity(computedActiveBatch),
        expectedParticipants:
          CapacityService.getTargetCapacity(computedActiveBatch),
        allowOrders: computedActiveBatch.allowOrders,
        batchStatus: computedActiveBatch.status,
      }
    : {
        orderType: "Community",
        batchName: "No Active Batch",
        closingDate: "TBD",
        deliveryWindow: "TBD",
        pickupLocation:
          businessSettings.productionSettings.defaultPickupLocation,
        currentMembers: 0,
        expectedParticipants: 0,
        allowOrders: false,
        batchStatus: "CLOSED",
      };

  const ctx = orderContext || defaultCtx;

  // Automatically adapt batchType based on the custom orderContext passed down
  useEffect(() => {
    if (orderContext) {
      if (orderContext.orderType === "Individual") {
        setBatchType("alone");
      } else if (orderContext.orderType === "Group Organizer") {
        setBatchType("personalized");
        setCustomGroupCode(
          orderContext.batchId || orderContext.batchName || "",
        );
      } else if (orderContext.orderType === "Group Member") {
        setBatchType("personalized");
        setCustomGroupCode(
          orderContext.batchId || orderContext.batchName || "",
        );
      } else {
        const eligibility = BatchBusinessRules.canAcceptOrders(orderContext);
        if (!eligibility.canAcceptOrders) {
          setNotification({
            message:
              "This batch is no longer accepting orders. Your order has been switched to individual pricing.",
            type: "info",
          });
          window.setTimeout(() => setNotification(null), 4000);
          // NOTE: The batch closed, so the user is rerouted to individual pricing.
          // Keep the notification above synchronized with this pricing change.
          setBatchType("alone");
        } else {
          setBatchType("community");
        }
      }
    }
  }, [orderContext, setNotification, storeBatches]);

  // STEP 2: Fabric Selection, Filtering & Pagination States
  const [selectedFabric, setSelectedFabric] = useState<Fabric | null>(null);
  const [fabricAllocationState, setFabricAllocationState] =
    useState<FabricAllocationState>(FabricAllocationStateEngine.initialize());
  const [designSelections, setDesignSelections] = useState<DesignSelections>({
    accessories: [],
  });
  const additionalGarmentFabricTransactionIdRef = useRef(0);
  const [additionalGarmentFabricTransaction, setAdditionalGarmentFabricTransaction] =
    useState<AdditionalGarmentFabricTransaction | null>(null);
  const additionalGarmentFabricTransactionRef =
    useRef<AdditionalGarmentFabricTransaction | null>(null);
  additionalGarmentFabricTransactionRef.current =
    additionalGarmentFabricTransaction;
  const [futureCustomDetailsFocusGarmentKey, setFutureCustomDetailsFocusGarmentKey] =
    useState<string | null>(null);
  const [additionalGarmentFabricError, setAdditionalGarmentFabricError] =
    useState<string | null>(null);
  const [
    additionalGarmentFabricPersistentError,
    setAdditionalGarmentFabricPersistentError,
  ] = useState<string | null>(null);
  const additionalGarmentFabricPersistentErrorGarmentKeyRef = useRef<
    string | null
  >(null);
  const [additionalGarmentFabricAnnouncement, setAdditionalGarmentFabricAnnouncement] =
    useState("");
  const additionalGarmentFabricAnnouncementGarmentKeyRef = useRef<
    string | null
  >(null);
  const additionalGarmentFabricScrollYRef = useRef<number | null>(null);
  const additionalGarmentFabricTriggerRef = useRef<HTMLElement | null>(null);
  const additionalGarmentFabricSnapshotRef = useRef<FabricAllocationState | null>(
    null,
  );
  const futureDesignStyleSelection =
    stylesLoadState === "ready"
      ? reconcileFutureDesignStyleSelection({
          selectedStyleId: futureSelectedStyleId,
          styles,
          garmentTypeSelection,
        })
      : preserveUnresolvedCatalogueStyleSelection(futureSelectedStyleId);
  const step1CatalogueCoverage = resolveStep1CatalogueCoverage({
    garmentTypeSelection,
    styles,
    stylesLoadState,
  });
  const activeFutureDesignSource =
    futureDesignSource || createCatalogDesignSource(futureSelectedStyleId || "");
  const activeUploadedDesignSource =
    activeFutureDesignSource?.kind === "uploaded"
      ? activeFutureDesignSource
      : null;
  const normalizedGarmentTypeCatalogForAuthority = useMemo(
    () => normalizeCustomDetailCatalog(customDetailCatalog),
    [customDetailCatalog],
  );
  const additionalConstructionLedgerSignature = useMemo(
    () =>
      JSON.stringify(
        Object.keys(
          designSelections.additionalGarmentConstructions?.byGarmentKey || {},
        ).sort(),
      ),
    [designSelections.additionalGarmentConstructions],
  );
  const futureAdditionalConstructionReconciliation = useMemo(
    () =>
      reconcileAdditionalGarmentConstructionState({
        existingState: designSelections.additionalGarmentConstructions,
        assignments: [],
        normalizedCustomDetailCatalog: normalizedGarmentTypeCatalogForAuthority,
      }),
    [
      designSelections.additionalGarmentConstructions,
      additionalConstructionLedgerSignature,
      normalizedGarmentTypeCatalogForAuthority,
    ],
  );
  const authoritativeAdditionalGarmentConstructionState =
    futureAdditionalConstructionReconciliation.state;
  const futureAdditionalGarments = useMemo(
    () =>
      projectAuthorizedAdditionalGarmentAssignments({
        additionalGarmentConstructions:
          authoritativeAdditionalGarmentConstructionState,
        fabricAllocationState,
      }),
    [
      authoritativeAdditionalGarmentConstructionState,
      fabricAllocationState,
    ],
  );
  const {
    normalizedGarmentTypeCatalog,
    effectiveJourneyGarmentTypeSelection,
    authoritativePhysicalOrder,
  } = useDesignStudioEffectiveJourneyComposition({
    customDetailCatalog,
    garmentTypeSelection,
    activeUploadedDesignSource,
    confirmedDesignSourceKey: futureConfirmedDesignSourceKey,
    fabricAllocationState,
    additionalGarmentConstructionState:
      authoritativeAdditionalGarmentConstructionState,
  });
  const authoritativePhysicalOccurrencesForDomain =
    authoritativePhysicalOrder.status === "resolved"
      ? authoritativePhysicalOrder.physicalOccurrences
      : projectAuthoritativePhysicalOccurrences({
          sourceKind: activeUploadedDesignSource ? "uploaded" : "catalogue",
          step1GarmentTypeSelection: garmentTypeSelection,
          effectiveGarmentTypeSelection: effectiveJourneyGarmentTypeSelection,
          uploadedCompositionSpecs:
            activeUploadedDesignSource?.fabricCapacityComposition || null,
          additionalGarmentConstructionState:
            authoritativeAdditionalGarmentConstructionState,
        });
  const provisionalAdditionalGarmentKey =
    additionalGarmentFabricTransaction?.origin === "new_addition" &&
    additionalGarmentFabricTransaction.phase !== "committed"
      ? additionalGarmentFabricTransaction.garmentKey
      : null;
  const fabricTransactionPhysicalOccurrences = useMemo(
    () => {
      if (
        !provisionalAdditionalGarmentKey ||
        !additionalGarmentFabricTransaction?.occurrenceGeneration ||
        !additionalGarmentFabricTransaction.fabricUnits ||
        authoritativePhysicalOccurrencesForDomain.some(
          (occurrence) =>
            occurrence.garmentKey === provisionalAdditionalGarmentKey,
        )
      ) {
        return authoritativePhysicalOccurrencesForDomain;
      }
      const provisionalOccurrence: PhysicalGarmentOccurrence = {
        garmentKey: provisionalAdditionalGarmentKey,
        garmentType: additionalGarmentFabricTransaction.garmentType,
        sourceRole: "additional",
        fabricUnits: additionalGarmentFabricTransaction.fabricUnits,
        occurrenceGeneration:
          additionalGarmentFabricTransaction.occurrenceGeneration,
      };
      return [...authoritativePhysicalOccurrencesForDomain, provisionalOccurrence];
    },
    [
      authoritativePhysicalOccurrencesForDomain,
      provisionalAdditionalGarmentKey,
      additionalGarmentFabricTransaction?.garmentType,
      additionalGarmentFabricTransaction?.fabricUnits,
      additionalGarmentFabricTransaction?.occurrenceGeneration,
    ],
  );
  const authoritativeOccurrenceIdentityMembershipSignature = JSON.stringify(
    fabricTransactionPhysicalOccurrences.map(
      (occurrence) => occurrence.garmentKey,
    ),
  );
  useEffect(() => {
    const activeGarmentKeys = JSON.parse(
      authoritativeOccurrenceIdentityMembershipSignature,
    ) as string[];
    setGarmentTypeSelection((current) =>
      reconcileGarmentTypeSelectionOccurrenceIdentities({
        selection: current,
        activeGarmentKeys,
      }),
    );
  }, [authoritativeOccurrenceIdentityMembershipSignature]);
  const futurePhysicalGarmentRemovalAuthority =
    resolveFuturePhysicalGarmentRemovalAuthority({
      garmentTypeSelection,
      designSource: futureDesignSource,
      selectedStyle: futureDesignStyleSelection.selectedStyle,
      confirmedDesignSourceKey: futureConfirmedDesignSourceKey,
      normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
      fabricAllocationState,
      additionalGarmentConstructionState:
        authoritativeAdditionalGarmentConstructionState,
    });
  const futurePhysicalGarmentRemovalAuthoritySignature =
    futurePhysicalGarmentRemovalAuthority.status === "resolved"
      ? futurePhysicalGarmentRemovalAuthority.signature
      : null;
  const futureGarmentRemovalTargets =
    futurePhysicalGarmentRemovalAuthority.status === "resolved"
      ? projectFutureGarmentRemovalTargets({
          occurrences:
            futurePhysicalGarmentRemovalAuthority.physicalOccurrences,
          provisionalGarmentKey: provisionalAdditionalGarmentKey,
        })
      : [];
  const invalidateFutureGarmentRemovalRetention = () => {
    futureGarmentRemovalGenerationRef.current += 1;
    futureGarmentRemovalStageRetentionLeaseRef.current = null;
  };
  const shouldRetainCurrentStageAfterGarmentRemoval = (
    stageId: DesignStudioStageId,
  ): boolean => {
    const lease = futureGarmentRemovalStageRetentionLeaseRef.current;
    const isActive = isRemovalStageRetentionLeaseActive({
      lease,
      currentStageId: stageId,
      liveAuthoritySignature:
        futurePhysicalGarmentRemovalAuthoritySignature,
      removalGeneration: futureGarmentRemovalGenerationRef.current,
      sessionIdentityKey: futureDraftIdentityKey,
    });
    if (lease && !isActive) {
      futureGarmentRemovalStageRetentionLeaseRef.current = null;
    }
    return isActive;
  };
  const futureFabricStageCompletion = getFutureFabricStageCompletion({
    garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
    fabricAllocationState,
    fabrics,
    requiredPhysicalOccurrences: authoritativePhysicalOccurrencesForDomain,
    rawFabricIntegrityDiagnostics: futureDraftFabricIntegrityBlockers,
  });
  const authoritativePhysicalOccurrenceKeys = new Set(
    authoritativePhysicalOccurrencesForDomain.map(
      (occurrence) => occurrence.garmentKey,
    ),
  );
  const futureFabricOrphanRepairTargets =
    getHydratedOrphanFabricAssignmentRepairTargets({
      preservedRawFabricAllocations:
        preservedInvalidHydratedDraftFabricAllocationsRef.current ?? [],
      authoritativeOccurrenceKeys: authoritativePhysicalOccurrenceKeys,
    });
  const futureGarmentFabricPlanning = getFutureGarmentFabricPlanning({
    garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
    fabricAllocationState,
    requiredPhysicalOccurrences: authoritativePhysicalOccurrencesForDomain,
  });
  const fabricStepGarmentTypeSelection = resolveFabricStepGarmentTypeSelection({
    step1GarmentTypeSelection: garmentTypeSelection,
    effectiveJourneyGarmentTypeSelection,
  });
  const futureFabricComposition = getFutureFabricCapacityComposition(
    effectiveJourneyGarmentTypeSelection,
  );
  const garmentTypeStepSelectedFabricQuantity =
    getGarmentTypeStepSelectedFabricQuantity({
      garmentTypeSelection,
      fabricAllocationState,
    });
  const futurePrimaryFabricCode = resolveAuthoritativePrimaryFabricCode(
    fabricAllocationState,
  );
  const authoritativeUploadedDesignReadiness = activeUploadedDesignSource
    ? evaluateAuthoritativeUploadedDesignReadiness({
        uploadInput: {
          uploadReference: activeUploadedDesignSource.uploadReference,
          fabricCapacityComposition:
            activeUploadedDesignSource.fabricCapacityComposition,
          demographic: activeUploadedDesignSource.demographic,
        },
        step1GarmentTypes: garmentTypeSelection.garmentTypes,
        designSource: activeUploadedDesignSource,
        confirmedDesignSourceKey: futureConfirmedDesignSourceKey,
        selectedFabricCode: futurePrimaryFabricCode,
        priceActivatedFabricCode: futurePriceActivatedFabricCode,
      })
    : null;
  const isFutureUploadedDesignPricingActive = Boolean(
    authoritativeUploadedDesignReadiness?.isPricingEligible,
  );
  const currentFutureDesignStyleDraftHydration =
    futureDesignStyleDraftHydration?.identityKey === futureDraftIdentityKey &&
    futureDesignStyleDraftHydration.identityGeneration ===
      futureDraftIdentityGenerationRef.current
      ? futureDesignStyleDraftHydration
      : null;
  const futureUploadedDesignStyleAuthority = useMemo(
    () =>
      buildUploadedDesignStyleAuthority({
        source: activeUploadedDesignSource,
        confirmedDesignSourceKey: futureConfirmedDesignSourceKey,
        expectedOwnerUid: firebaseDraftAuth.user?.uid || null,
        ownershipTransferPending: Boolean(
          lastPersistedFutureDraftRef.current
            ?.uploadedDesignOwnershipTransition,
        ),
        sourceOperationStable:
          !isUploadingDesign && !isReplacingDesign && !isRemovingDesign,
        activeOccurrences: authoritativePhysicalOccurrencesForDomain,
      }),
    [
      activeUploadedDesignSource,
      futureConfirmedDesignSourceKey,
      firebaseDraftAuth.user?.uid,
      isUploadingDesign,
      isReplacingDesign,
      isRemovingDesign,
      authoritativePhysicalOccurrencesForDomain,
    ],
  );
  const futureOccurrenceUploadedDesignStyleAuthority = useMemo(
    () =>
      Object.values(futureDesignStyleUploadedSourceByGarmentKey).reduce<
        ReturnType<typeof buildUploadedDesignStyleAuthority>
      >(
        (combined, source) => ({
          ...combined,
          ...buildUploadedDesignStyleAuthority({
            source,
            confirmedDesignSourceKey: source.sourceKey,
            expectedOwnerUid:
              firebaseDraftAuth.user?.uid || auth.currentUser?.uid || null,
            ownershipTransferPending: false,
            sourceOperationStable: true,
            activeOccurrences: authoritativePhysicalOccurrencesForDomain,
          }),
        }),
        {},
      ),
    [
      futureDesignStyleUploadedSourceByGarmentKey,
      firebaseDraftAuth.user?.uid,
      authoritativePhysicalOccurrencesForDomain,
    ],
  );
  const futureDesignStyleDraftAuthority = useMemo(
    () =>
      buildDesignStyleDraftValidationAuthority({
        catalogueState: stylesLoadState,
        styles,
        garmentTypeSelection,
        activeOccurrences: authoritativePhysicalOccurrencesForDomain,
        uploadedSourcesByKey: {
          ...futureUploadedDesignStyleAuthority,
          ...futureOccurrenceUploadedDesignStyleAuthority,
        },
        unresolvedLegacyScalar: Boolean(
          currentFutureDesignStyleDraftHydration?.result.migrationEvidence,
        ),
      }),
    [
      stylesLoadState,
      styles,
      garmentTypeSelection,
      authoritativePhysicalOccurrencesForDomain,
      futureUploadedDesignStyleAuthority,
      futureOccurrenceUploadedDesignStyleAuthority,
      currentFutureDesignStyleDraftHydration?.result.migrationEvidence,
    ],
  );
  const futurePaymentReviewUploadedAuthorityBySourceRef = useMemo(() => {
    const sources = [
      ...(activeUploadedDesignSource ? [activeUploadedDesignSource] : []),
      ...Object.values(futureDesignStyleUploadedSourceByGarmentKey),
    ];
    return sources.reduce<Record<string, FutureOrderCandidateUploadedStyleAuthorityV2>>(
      (authorityBySourceRef, source) => {
        const uploadedSourceRef = source.uploadReference.designReferenceId;
        const validation = futureDesignStyleDraftAuthority.uploadedSourcesByKey[
          source.sourceKey
        ];
        authorityBySourceRef[uploadedSourceRef] = {
          uploadedSourceRef,
          confirmed: validation?.status === "confirmed",
          displayLabel: source.uploadReference.originalFileName,
          previewReference: uploadedSourceRef,
        };
        return authorityBySourceRef;
      },
      {},
    );
  }, [
    activeUploadedDesignSource,
    futureDesignStyleUploadedSourceByGarmentKey,
    futureDesignStyleDraftAuthority,
  ]);
  const futureDesignStyleStepProjection = useMemo(
    () =>
      projectDesignStyleStep({
        activeOccurrences: authoritativePhysicalOccurrencesForDomain,
        hydration: currentFutureDesignStyleDraftHydration?.result || null,
        authority: futureDesignStyleDraftAuthority,
        styles,
      }),
    [
      authoritativePhysicalOccurrencesForDomain,
      currentFutureDesignStyleDraftHydration,
      futureDesignStyleDraftAuthority,
      styles,
    ],
  );
  const resolvedFutureActiveDesignStyleOccurrence =
    resolveActiveDesignStyleOccurrence({
      occurrences: futureDesignStyleStepProjection.occurrences,
      current: futureActiveDesignStyleOccurrence,
      previousOrder: previousFutureDesignStyleOccurrenceOrderRef.current,
    });
  const futureDesignStyleCatalogueEntries = useMemo(
    () =>
      bindDesignStyleStepCatalogueLedgerRevision({
        entries: projectActiveOccurrenceDesignStyleCatalogue({
          projection: futureDesignStyleStepProjection,
          activeTarget: resolvedFutureActiveDesignStyleOccurrence,
          styles,
          authority: futureDesignStyleDraftAuthority,
          runtimeGeneration:
            currentFutureDesignStyleDraftHydration?.runtimeGeneration ?? -1,
        }),
        ledgerRevision:
          currentFutureDesignStyleDraftHydration?.result.ledger?.revision ?? -1,
      }),
    [
      futureDesignStyleStepProjection,
      resolvedFutureActiveDesignStyleOccurrence,
      styles,
      futureDesignStyleDraftAuthority,
      currentFutureDesignStyleDraftHydration,
    ],
  );
  const futureDesignStyleClearRequest: DesignStyleStepClearMutationRequest | null =
    resolvedFutureActiveDesignStyleOccurrence &&
    currentFutureDesignStyleDraftHydration?.result.ledger
      ? {
          runtimeGeneration:
            currentFutureDesignStyleDraftHydration.runtimeGeneration,
          expectedLedgerRevision:
            currentFutureDesignStyleDraftHydration.result.ledger.revision,
          target: resolvedFutureActiveDesignStyleOccurrence,
        }
      : null;
  const activeFutureDesignStyleUploadUi =
    resolvedFutureActiveDesignStyleOccurrence
      ? futureDesignStyleUploadUiByGarmentKey[
          resolvedFutureActiveDesignStyleOccurrence.garmentKey
        ]
      : null;
  const activeFutureDesignStyleOccurrencePresentation =
    futureDesignStyleStepProjection.occurrences.find((occurrence) =>
      designStyleStepTargetsEqual(
        occurrence.target,
        resolvedFutureActiveDesignStyleOccurrence,
      ),
    ) || null;
  const retainedUploadedDesignPreviewUrl =
    activeFutureDesignStyleOccurrencePresentation?.assignment?.sourceKind ===
      "uploaded" &&
    activeUploadedDesignSource?.uploadReference.designReferenceId ===
      activeFutureDesignStyleOccurrencePresentation.assignment.uploadedSourceRef &&
    uploadedDesignPreviewReferenceId ===
      activeFutureDesignStyleOccurrencePresentation.assignment.uploadedSourceRef
      ? uploadedDesignPreviewUrl
      : null;
  const futureDesignStyleUploadStateForActiveOccurrence =
    activeFutureDesignStyleUploadUi &&
    resolvedFutureActiveDesignStyleOccurrence &&
    activeFutureDesignStyleUploadUi.occurrenceToken ===
      resolvedFutureActiveDesignStyleOccurrence.occurrenceToken
      ? {
          status: activeFutureDesignStyleUploadUi.status,
          ...(activeFutureDesignStyleUploadUi.message
            ? { message: activeFutureDesignStyleUploadUi.message }
            : {}),
          ...(activeFutureDesignStyleUploadUi.previewUrl
            ? { previewUrl: activeFutureDesignStyleUploadUi.previewUrl }
            : retainedUploadedDesignPreviewUrl
              ? { previewUrl: retainedUploadedDesignPreviewUrl }
            : {}),
        }
      : {
          status: "idle" as const,
          ...(retainedUploadedDesignPreviewUrl
            ? { previewUrl: retainedUploadedDesignPreviewUrl }
            : {}),
        };
  const isFutureDesignSourceReadyForCustomDetails =
    futureDesignStyleStepProjection.isComplete;
  futureDesignStyleMutationAuthorityRef.current =
    currentFutureDesignStyleDraftHydration?.result.ledger
      ? {
          identityKey: currentFutureDesignStyleDraftHydration.identityKey,
          identityGeneration:
            currentFutureDesignStyleDraftHydration.identityGeneration,
          runtimeGeneration:
            currentFutureDesignStyleDraftHydration.runtimeGeneration,
          hydration: currentFutureDesignStyleDraftHydration.result,
          activeOccurrences: authoritativePhysicalOccurrencesForDomain,
          occurrenceTargets: futureDesignStyleStepProjection.occurrences.map(
            (occurrence) => occurrence.target,
          ),
          activeTarget: resolvedFutureActiveDesignStyleOccurrence,
          authority: futureDesignStyleDraftAuthority,
          stepIsActive: futureStageId === "design_style",
        }
      : null;

  useEffect(() => {
    setFutureActiveDesignStyleOccurrence((current) =>
      designStyleStepTargetsEqual(
        current,
        resolvedFutureActiveDesignStyleOccurrence,
      )
        ? current
        : resolvedFutureActiveDesignStyleOccurrence,
    );
    previousFutureDesignStyleOccurrenceOrderRef.current =
      futureDesignStyleStepProjection.occurrences.map(
        (occurrence) => occurrence.target,
      );
  }, [
    futureDesignStyleStepProjection.occurrences,
    resolvedFutureActiveDesignStyleOccurrence,
  ]);

  useEffect(() => {
    const current = futureDesignStyleDraftHydrationRef.current;
    if (
      !guestDraftHydrated ||
      !current ||
      current.identityKey !== futureDraftIdentityKey ||
      current.identityGeneration !== futureDraftIdentityGenerationRef.current ||
      !current.result.envelope ||
      current.result.destructiveNormalizationProhibited
    ) {
      return;
    }
    const refreshed = hydrateDesignStyleDraftEnvelope({
      envelope: current.result.envelope,
      activeOccurrences: authoritativePhysicalOccurrencesForDomain,
      authority: futureDesignStyleDraftAuthority,
      legacyScalarFingerprint: current.result.legacyScalarFingerprint,
    });
    if (
      getFutureDesignStyleHydrationFingerprint(refreshed) ===
      current.fingerprint
    ) {
      return;
    }
    publishFutureDesignStyleHydration({
      identityKey: futureDraftIdentityKey,
      identityGeneration: current.identityGeneration,
      result: refreshed,
    });
  }, [
    guestDraftHydrated,
    futureDraftIdentityKey,
    authoritativePhysicalOccurrencesForDomain,
    futureDesignStyleDraftAuthority,
    publishFutureDesignStyleHydration,
  ]);

  const [fabricSearchInput] = useState<string>("");
  const [fabricSearch, setFabricSearch] = useState<string>("");
  const [fabricCategoryFilter] = useState<string>("all");
  const [, setFabricPage] = useState<number>(1);

  // Sync selectedFabric if fabrics prop changes and current selectedFabric is not in fabrics
  useEffect(() => {
    if (
      selectedFabric &&
      fabrics.length > 0 &&
      !fabrics.some((f) => f?.code === selectedFabric?.code)
    ) {
      setSelectedFabric(null);
    }
  }, [fabrics, selectedFabric]);

  useEffect(() => {
    const primaryFabricCode = resolveAuthoritativePrimaryFabricCode(
      fabricAllocationState,
    );
    if (!primaryFabricCode) return;
    const primaryFabric = fabrics.find(
      (fabric) => fabric.code === primaryFabricCode,
    );
    setSelectedFabric((current) =>
      current?.code === primaryFabricCode ? current : primaryFabric || null,
    );
  }, [fabricAllocationState, fabrics]);

  // Debounce Fabric Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setFabricSearch(fabricSearchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [fabricSearchInput]);

  // Reset page to 1 when fabric filters change
  useEffect(() => {
    setFabricPage(1);
  }, [fabricSearch, fabricCategoryFilter]);

  // Load preset style & fabric from Gallery selection
  useEffect(() => {
    if (initialStyleId) {
      const match = styles.find((s) => s.id === initialStyleId);
      if (match) {
        invalidateFutureGarmentRemovalRetention();
        setFutureSelectedStyleId(match.id);
        setFutureDesignSource(createCatalogDesignSource(match.id));
      }
    }
    if (initialFabricCode) {
      const match = fabrics.find((f) => f?.code === initialFabricCode);
      if (match) {
        setSelectedFabric(match);
      }
    }
    if (initialStyleId || initialFabricCode) {
      // Clear preset after loading so it doesn't continuously override user changes
      clearInitialPreset?.();
    }
  }, [initialStyleId, initialFabricCode, styles, fabrics, clearInitialPreset]);

  const revokeUploadedDesignPreview = () => {
    if (uploadedDesignPreviewUrlRef.current) {
      URL.revokeObjectURL(uploadedDesignPreviewUrlRef.current);
      uploadedDesignPreviewUrlRef.current = null;
    }
    setUploadedDesignPreviewUrl(null);
    setUploadedDesignPreviewReferenceId(null);
  };

  const setUploadedDesignPreviewFromBlob = (
    blob: Blob,
    designReferenceId: string,
  ) => {
    if (uploadedDesignPreviewUrlRef.current) {
      URL.revokeObjectURL(uploadedDesignPreviewUrlRef.current);
    }
    const objectUrl = URL.createObjectURL(blob);
    uploadedDesignPreviewUrlRef.current = objectUrl;
    setUploadedDesignPreviewUrl(objectUrl);
    setUploadedDesignPreviewReferenceId(designReferenceId);
  };

  const invalidateUploadedDesignOperation = () => {
    uploadedDesignOperationCoordinatorRef.current.invalidate();
    uploadedDesignOperationGenerationRef.current = null;
    uploadedDesignOperationPendingRef.current = false;
    setIsUploadingDesign(false);
    setIsReplacingDesign(false);
  };

  const clearUploadedDesignLocalState = (clearError = true) => {
    invalidateUploadedDesignOperation();
    revokeUploadedDesignPreview();
    setUploadedDesignReference(null);
    setUploadedDesignComposition([]);
    setUploadedDesignAdditionalGarmentTypes([]);
    setUploadedDesignDemographic(null);
    if (clearError) setUploadedDesignError("");
  };

  useEffect(
    () => () => {
      futureGarmentRemovalGenerationRef.current += 1;
      futureGarmentRemovalStageRetentionLeaseRef.current = null;
      if (uploadedDesignPreviewUrlRef.current) {
        URL.revokeObjectURL(uploadedDesignPreviewUrlRef.current);
      }
      Object.values(
        futureDesignStyleUploadPreviewUrlByGarmentKeyRef.current,
      ).forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    },
    [],
  );

  useEffect(() => {
    const reference =
      activeUploadedDesignSource?.uploadReference || uploadedDesignReference;
    if (
      !reference ||
      uploadedDesignPreviewReferenceId === reference.designReferenceId
    ) {
      return;
    }
    let cancelled = false;
    setIsLoadingUploadedDesignPreview(true);
    setUploadedDesignError("");
    void CustomerDesignUploadService.readCustomerDesignDraft(reference)
      .then((blob) => {
        if (!cancelled) {
          setUploadedDesignPreviewFromBlob(blob, reference.designReferenceId);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setUploadedDesignError(getCustomerDesignUploadErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingUploadedDesignPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeUploadedDesignSource,
    uploadedDesignReference,
    uploadedDesignPreviewReferenceId,
  ]);

  const applyUploadedDesignSource = (
    nextSource: UploadedDesignSource | null,
  ) => {
    invalidateFutureGarmentRemovalRetention();
    setFutureDesignSource(nextSource);
    setFutureSelectedStyleId(null);
    setFutureConfirmedDesignSourceKey(null);
    setFuturePriceActivatedFabricCode(null);
    if (!nextSource) {
      setFabricAllocationState((current) =>
        reconcileFutureFabricAllocationStateIfChanged({
          state: current,
          garmentTypeSelection,
          requiredPhysicalOccurrences: authoritativePhysicalOccurrencesForDomain,
        }),
      );
      return;
    }

    // Keep Step 1 customer selection intact. Fabric plans against the upload
    // composition via effectiveJourneyGarmentTypeSelection when the source is active.
    const fabricPlanningSelection =
      buildEffectiveUploadedJourneyGarmentTypeSelection({
        step1Selection: garmentTypeSelection,
        uploadedComposition: nextSource.fabricCapacityComposition,
        normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
      });
    setFabricAllocationState((current) =>
      reconcileFutureFabricAllocationStateIfChanged({
        state: current,
        garmentTypeSelection: fabricPlanningSelection,
        requiredPhysicalOccurrences: authoritativePhysicalOccurrencesForDomain,
      }),
    );
  };

  const applyUploadedDesignForm = ({
    reference,
    composition,
    demographic,
  }: {
    reference: CustomerDesignUploadReference | null;
    composition: FabricCapacityGarmentSpec[];
    demographic: CustomDetailDemographic | null;
  }) => {
    setUploadedDesignReference(reference);
    setUploadedDesignComposition(composition);
    setUploadedDesignDemographic(demographic);
    const nextSource = createUploadedDesignSourceWhenReady({
      uploadReference: reference,
      fabricCapacityComposition: composition,
      demographic,
    });
    if (nextSource) {
      applyUploadedDesignSource(nextSource);
    } else if (activeUploadedDesignSource) {
      applyUploadedDesignSource(null);
    }
  };

  /**
   * Successful upload/replacement preview takes over Step 3 design authority.
   * Catalogue selection is fully cleared even when the uploaded form is still
   * incomplete (demographic pending, etc.). Local draft + preview remain.
   */
  const applySuccessfulUploadedDesignPreview = ({
    reference,
    composition,
    demographic,
  }: {
    reference: CustomerDesignUploadReference;
    composition: FabricCapacityGarmentSpec[];
    demographic: CustomDetailDemographic | null;
  }) => {
    const authority = resolveAuthorityAfterSuccessfulUploadedDesignPreview({
      uploadReference: reference,
      fabricCapacityComposition: composition,
      demographic,
    });
    setUploadedDesignReference(reference);
    setUploadedDesignComposition(composition);
    setUploadedDesignDemographic(demographic);
    setFutureSelectedStyleId(authority.selectedStyleId);
    setFutureConfirmedDesignSourceKey(authority.confirmedDesignSourceKey);
    setFuturePriceActivatedFabricCode(authority.priceActivatedFabricCode);
    if (authority.designSource) {
      applyUploadedDesignSource(authority.designSource);
      return;
    }
    // Incomplete uploaded form: drop catalogue authority without deleting the
    // private image or clearing Step 1 / Fabric unless an uploaded source was
    // already active and must be suspended until the form is complete again.
    setFutureDesignSource(null);
    if (activeUploadedDesignSource) {
      setFabricAllocationState((current) =>
        reconcileFutureFabricAllocationStateIfChanged({
          state: current,
          garmentTypeSelection,
          requiredPhysicalOccurrences: authoritativePhysicalOccurrencesForDomain,
        }),
      );
    }
  };

  const handleUploadedDesignFile = async (
    file: File,
    isReplacement: boolean,
  ) => {
    await runUploadedDesignOperation({
      coordinator: uploadedDesignOperationCoordinatorRef.current,
      kind: isReplacement ? "replacement" : "upload",
      onBegin: (operation) => {
        invalidateFutureGarmentRemovalRetention();
        uploadedDesignOperationGenerationRef.current = operation.generation;
        uploadedDesignOperationPendingRef.current = true;
        setUploadedDesignError("");
        setIsUploadingDesign(!isReplacement);
        setIsReplacingDesign(isReplacement);
      },
      validate: () =>
        CustomerDesignUploadService.validateCustomerDesignFile(file),
      execute: async () => {
        const currentReference =
          activeUploadedDesignSource?.uploadReference || uploadedDesignReference;
        const previousUploadedComposition =
          activeUploadedDesignSource?.fabricCapacityComposition.map((spec) => ({
            ...spec,
          })) || uploadedDesignComposition;
        const previousUploadedDemographic =
          activeUploadedDesignSource?.demographic || uploadedDesignDemographic;
        const replacement =
          isReplacement && currentReference
            ? await CustomerDesignUploadService.replaceCustomerDesignDraft(
                currentReference,
                file,
              )
            : {
                reference:
                  await CustomerDesignUploadService.uploadCustomerDesignDraft(
                    file,
                  ),
              };
        const composition = isReplacement
          ? previousUploadedComposition.length > 0
            ? previousUploadedComposition
            : mergeUploadedDesignCompositionWithStep1({
                step1GarmentTypes: garmentTypeSelection.garmentTypes,
                additionalGarmentTypes: [],
                preservedHiddenComposition: [],
              })
          : uploadedDesignComposition.length > 0
            ? uploadedDesignComposition
            : mergeUploadedDesignCompositionWithStep1({
                step1GarmentTypes: garmentTypeSelection.garmentTypes,
                additionalGarmentTypes: uploadedDesignAdditionalGarmentTypes,
                preservedHiddenComposition: uploadedDesignComposition,
              });
        const demographic = isReplacement
          ? previousUploadedDemographic
          : uploadedDesignDemographic;
        return {
          composition,
          demographic,
          previousUploadedComposition,
          replacement,
        };
      },
      onSuccess: ({
        composition,
        demographic,
        previousUploadedComposition,
        replacement,
      }) => {
        // Preview acceptance is the switch point: catalogue must not remain
        // selected alongside a successful uploaded preview.
        setUploadedDesignPreviewFromBlob(
          file,
          replacement.reference.designReferenceId,
        );
        applySuccessfulUploadedDesignPreview({
          reference: replacement.reference,
          composition,
          demographic,
        });
        if (isReplacement && previousUploadedComposition.length === 0) {
          setUploadedDesignAdditionalGarmentTypes([]);
        }
        setPendingCatalogStyleId(null);
        if (replacement.previousDraftCleanupError) {
          setUploadedDesignError(
            "Your new image was saved, but the previous private image could not be removed.",
          );
        }
      },
      onError: (error) => {
        setUploadedDesignError(getCustomerDesignUploadErrorMessage(error));
      },
      onFinish: (operation) => {
        if (
          uploadedDesignOperationGenerationRef.current ===
          operation.generation
        ) {
          uploadedDesignOperationPendingRef.current = false;
        }
        setIsUploadingDesign(false);
        setIsReplacingDesign(false);
      },
    });
  };

  const handleUploadedDesignCompositionToggle = (
    garmentType: FabricGarmentType,
  ) => {
    invalidateFutureGarmentRemovalRetention();
    const step1GarmentTypes = garmentTypeSelection.garmentTypes;
    const required = new Set(
      getUploadedDesignRequiredStep1GarmentTypes(step1GarmentTypes),
    );
    if (required.has(garmentType)) {
      return;
    }

    const currentComposition =
      activeUploadedDesignSource?.fabricCapacityComposition ||
      uploadedDesignComposition;
    const nextAdditional = new Set(
      getUploadedDesignAdditionalGarmentTypes({
        step1GarmentTypes,
        composition: currentComposition,
        additionalGarmentTypes: uploadedDesignAdditionalGarmentTypes,
      }),
    );
    if (nextAdditional.has(garmentType)) {
      nextAdditional.delete(garmentType);
    } else if (
      CUSTOMER_SELECTABLE_GARMENT_TYPES.includes(
        garmentType as (typeof CUSTOMER_SELECTABLE_GARMENT_TYPES)[number],
      )
    ) {
      nextAdditional.add(garmentType);
    } else {
      return;
    }

    const additionalGarmentTypes = [...nextAdditional];
    setUploadedDesignAdditionalGarmentTypes(additionalGarmentTypes);
    const composition = mergeUploadedDesignCompositionWithStep1({
      step1GarmentTypes,
      additionalGarmentTypes,
      preservedHiddenComposition:
        activeUploadedDesignSource?.fabricCapacityComposition ||
        uploadedDesignComposition,
    });
    applyUploadedDesignForm({
      reference:
        activeUploadedDesignSource?.uploadReference || uploadedDesignReference,
      composition,
      demographic:
        activeUploadedDesignSource?.demographic || uploadedDesignDemographic,
    });
  };

  const handleUploadedDesignDemographicChange = (
    demographic: CustomDetailDemographic,
  ) => {
    applyUploadedDesignForm({
      reference:
        activeUploadedDesignSource?.uploadReference || uploadedDesignReference,
      composition:
        activeUploadedDesignSource?.fabricCapacityComposition.map((spec) => ({
          ...spec,
        })) || uploadedDesignComposition,
      demographic,
    });
  };

  const activateFutureCatalogStyle = (styleId: string) => {
    invalidateFutureGarmentRemovalRetention();
    invalidateUploadedDesignOperation();
    const activated = activateFutureCatalogStyleSelection({
      styleId,
      primaryFabricCode: futurePrimaryFabricCode,
    });
    setFutureSelectedStyleId(activated.selectedStyleId);
    setFutureDesignSource(activated.designSource);
    setFutureConfirmedDesignSourceKey(activated.confirmedDesignSourceKey);
    setFuturePriceActivatedFabricCode(activated.priceActivatedFabricCode);
  };

  const deleteUploadedDesign = async ({
    reference,
    catalogStyleIdAfterDelete,
  }: {
    reference: CustomerDesignUploadReference;
    catalogStyleIdAfterDelete: string | null;
  }) => {
    if (uploadedDesignDeletionInFlightRef.current) return;
    invalidateFutureGarmentRemovalRetention();
    invalidateUploadedDesignOperation();
    const deletionGeneration =
      ++uploadedDesignDeletionGenerationRef.current;
    uploadedDesignDeletionInFlightRef.current = true;
    setIsRemovingDesign(true);
    setUploadedDesignError("");

    const result = await deleteUploadedDesignBeforeSourceChange({
      reference,
      deleteDraft: CustomerDesignUploadService.deleteCustomerDesignDraft,
      commitSourceChange: () => {
        if (
          deletionGeneration !== uploadedDesignDeletionGenerationRef.current
        ) {
          return;
        }
        clearUploadedDesignLocalState();
        setPendingCatalogStyleId(null);
        if (catalogStyleIdAfterDelete) {
          activateFutureCatalogStyle(catalogStyleIdAfterDelete);
        } else if (activeUploadedDesignSource) {
          applyUploadedDesignSource(null);
        }
      },
    });

    if (deletionGeneration !== uploadedDesignDeletionGenerationRef.current) {
      return;
    }
    if (result.status === "failed") {
      setUploadedDesignError(
        getCustomerDesignUploadErrorMessage(result.error),
      );
    }
    uploadedDesignDeletionInFlightRef.current = false;
    setIsRemovingDesign(false);
  };

  const handleRemoveUploadedDesign = () => {
    const reference =
      activeUploadedDesignSource?.uploadReference || uploadedDesignReference;
    if (!reference) return;
    void deleteUploadedDesign({
      reference,
      catalogStyleIdAfterDelete: null,
    });
  };

  const handleSelectFutureStyle = (styleId: string) => {
    if (uploadedDesignDeletionInFlightRef.current) return;
    const previousUploadedReference =
      activeUploadedDesignSource?.uploadReference || uploadedDesignReference;
    if (!previousUploadedReference) {
      activateFutureCatalogStyle(styleId);
      return;
    }

    setPendingCatalogStyleId(styleId);
    void deleteUploadedDesign({
      reference: previousUploadedReference,
      catalogStyleIdAfterDelete: styleId,
    });
  };

  const handleRetryUploadedDesignDeletion = () => {
    const reference =
      activeUploadedDesignSource?.uploadReference || uploadedDesignReference;
    if (!reference || !pendingCatalogStyleId) return;
    void deleteUploadedDesign({
      reference,
      catalogStyleIdAfterDelete: pendingCatalogStyleId,
    });
  };

  const revalidatePreservedFabricIntegrityAfterMutation = ({
    previousState,
    nextState,
    explicitlyRepairedGarmentKeys = [],
  }: {
    previousState: FabricAllocationState;
    nextState: FabricAllocationState;
    explicitlyRepairedGarmentKeys?: readonly string[];
  }) => {
    const preservedRawFabricAllocations =
      preservedInvalidHydratedDraftFabricAllocationsRef.current;
    if (!preservedRawFabricAllocations) return;
    const repairResolution =
      revalidateHydratedFabricIntegrityAfterExplicitRepair({
        preservedRawFabricAllocations,
        previousRuntimeState: previousState,
        nextRuntimeState: nextState,
        authoritativeOccurrenceKeys: new Set(
          fabricTransactionPhysicalOccurrences.map(
            (occurrence) => occurrence.garmentKey,
          ),
        ),
        explicitlyRepairedGarmentKeys,
      });
    preservedInvalidHydratedDraftFabricAllocationsRef.current =
      repairResolution.preservedRawFabricAllocations;
    setFutureDraftFabricIntegrityBlockers([
      ...repairResolution.integrity.diagnostics,
    ]);
  };

  const handleRepairInvalidFutureFabricAssignment = (
    target: HydratedOrphanFabricAssignmentRepairTarget,
  ) => {
    const result = repairHydratedOrphanFabricAssignment({
      preservedRawFabricAllocations:
        preservedInvalidHydratedDraftFabricAllocationsRef.current,
      runtimeState: fabricAllocationState,
      authoritativeOccurrenceKeys: authoritativePhysicalOccurrenceKeys,
      target,
    });
    if (result.status !== "removed") return result;

    preservedInvalidHydratedDraftFabricAllocationsRef.current =
      result.preservedRawFabricAllocations;
    setFutureDraftFabricIntegrityBlockers([...result.integrity.diagnostics]);
    return result;
  };

  const handleAssignFutureFabricToGarment = (
    fabric: Fabric,
    garmentKey: string,
  ) => {
    const nextState = applyFutureFabricCardSelection({
      state: fabricAllocationState,
      garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
      garmentKey,
      fabricCode: fabric.code,
      fabrics,
      requiredPhysicalOccurrences: authoritativePhysicalOccurrencesForDomain,
    });
    if (nextState === fabricAllocationState) {
      return nextState;
    }
    if (activeUploadedDesignSource) {
      setFuturePriceActivatedFabricCode(null);
    }
    revalidatePreservedFabricIntegrityAfterMutation({
      previousState: fabricAllocationState,
      nextState,
    });
    setFabricAllocationState(nextState);
    return nextState;
  };
  const handleChangeFutureFabricAllocationProduct = (
    allocationId: string,
    fabricCode: string,
    expectation?: ChangeFutureFabricAllocationExpectation,
  ) => {
    const result = changeFutureFabricAllocationProduct({
      state: fabricAllocationState,
      allocationId,
      nextFabricCode: fabricCode,
      fabrics,
      expectation,
    });
    if (result.status !== "assigned") {
      return {
        status: "blocked" as const,
        reason:
          result.reason === "FABRIC_STOCK_EXHAUSTED"
            ? ("FABRIC_STOCK_EXHAUSTED" as const)
            : result.reason === "ALLOCATION_NOT_FOUND"
              ? ("ALLOCATION_NOT_FOUND" as const)
              : result.reason === "ALLOCATION_CHANGED"
                ? ("ALLOCATION_CHANGED" as const)
                : ("INVALID_CAPACITY" as const),
        state: fabricAllocationState,
      };
    }
    if (result.state === fabricAllocationState) {
      return { status: "assigned" as const, state: result.state };
    }
    if (activeUploadedDesignSource) {
      setFuturePriceActivatedFabricCode(null);
    }
    revalidatePreservedFabricIntegrityAfterMutation({
      previousState: fabricAllocationState,
      nextState: result.state,
    });
    setFabricAllocationState(result.state);
    return { status: "assigned" as const, state: result.state };
  };

  const handleRemoveFutureFabricAssignment = (garmentKey: string) => {
    if (activeUploadedDesignSource) {
      setFuturePriceActivatedFabricCode(null);
    }
    const result = cancelFutureFabricCatalogueAssignment({
      state: fabricAllocationState,
      garmentKey,
    });
    if (result.status !== "cancelled") {
      return result;
    }
    if (
      additionalGarmentFabricTransaction?.garmentKey === garmentKey &&
      additionalGarmentFabricTransaction.origin === "new_addition"
    ) {
      setAdditionalGarmentFabricTransaction(null);
    }
    revalidatePreservedFabricIntegrityAfterMutation({
      previousState: fabricAllocationState,
      nextState: result.state,
      explicitlyRepairedGarmentKeys: [garmentKey],
    });
    setFabricAllocationState(result.state);
    return result;
  };

  // STEP 3: Design Details
  const showAdditionalClothesCosts = resolveShowAdditionalClothesCosts();
  const activeCustomerDesignSelections = useMemo(
    () =>
      projectActiveCustomerDesignSelections({
        designSelections,
        showAdditionalClothesCosts,
      }),
    [designSelections, showAdditionalClothesCosts],
  );
  const futureAdditionalGarmentConstructionOptions =
    CUSTOMER_SELECTABLE_GARMENT_TYPES.map((garmentType) => ({
      garmentType,
      construction: resolveGarmentConstructionPricing(
        garmentType,
        normalizedGarmentTypeCatalog,
      ),
    }));
  const futureCatalogInspection =
    inspectCustomDetailCatalog(customDetailCatalog);
  const futureScopedCustomDetailsReconciliation =
    reconcileGarmentScopedCustomDetails({
      garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
      additionalGarments: futureAdditionalGarments,
      additionalGarmentConstructions:
        futureAdditionalConstructionReconciliation.state,
      style: futureDesignStyleSelection.selectedStyle,
      designStyleOccurrences: futureDesignStyleStepProjection.occurrences,
      catalogInspection: futureCatalogInspection,
      existingState: designSelections.garmentScopedCustomDetails,
    });
  const futureCustomDetailsCatalogue = projectFutureCustomDetailsCatalogue({
    garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
    style: futureDesignStyleSelection.selectedStyle,
    reconciliation: futureScopedCustomDetailsReconciliation,
    activeOptions: futureCatalogInspection.activeOptions,
    additionalGarments: futureAdditionalGarments,
    additionalGarmentConstructions:
      futureAdditionalConstructionReconciliation.state,
    showAdditionalClothesCosts,
  });
  const futureScopedPersonalizedInputsReconciliation =
    futureScopedCustomDetailsReconciliation
      ? reconcileGarmentScopedPersonalizedInputs({
          reconciliation: futureScopedCustomDetailsReconciliation,
          catalogInspection: futureCatalogInspection,
          existingInputs: designSelections.garmentScopedCustomDetailInputs,
        })
      : null;
  const futureCustomDetailsCompletion = futureScopedCustomDetailsReconciliation
    ? validateGarmentScopedCustomDetailsCompletion({
        earlierStagesComplete:
          futureFabricStageCompletion.isComplete &&
          isFutureDesignSourceReadyForCustomDetails,
        reconciliation: futureScopedCustomDetailsReconciliation,
        personalizedInputs:
          futureScopedPersonalizedInputsReconciliation || undefined,
        showAdditionalClothesCosts,
      })
    : null;
  const futureCustomDetailsPricing = futureScopedCustomDetailsReconciliation
    ? calculateGarmentScopedCustomDetailsPricing({
        reconciliation: futureScopedCustomDetailsReconciliation,
        catalogInspection: futureCatalogInspection,
        showAdditionalClothesCosts,
      })
    : null;
  const isFutureCustomDetailsStageReady = isFutureCustomDetailsContentReady(
    futureCustomDetailsCompletion,
  );
  const futureAiTryOnInputFingerprint =
    isFutureCustomDetailsStageReady &&
    isFutureDesignSourceReadyForCustomDetails &&
    activeFutureDesignSource &&
    futureScopedCustomDetailsReconciliation
      ? createAiTryOnVisualInputFingerprint({
          garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
          fabricAllocations: fabricAllocationState.fabricAllocations,
          selectedStyleId: activeFutureDesignSource.sourceKey,
          garmentScopedCustomDetails:
            futureScopedCustomDetailsReconciliation.state,
          physicalOccurrences: authoritativePhysicalOccurrencesForDomain,
        })
      : null;
  const futureMeasurementPhysicalGarments = useMemo(
    () =>
      getMeasurementPhysicalGarments({
        garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
        physicalOccurrences:
          authoritativePhysicalOrder.status === "resolved"
            ? authoritativePhysicalOrder.physicalOccurrences
            : undefined,
      }),
    [authoritativePhysicalOrder, effectiveJourneyGarmentTypeSelection],
  );
  const futureMeasurementPlan = useMemo(
    () =>
      planMeasurementRequirements({
        route: futureMeasurementState.route,
        garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
        physicalGarments: futureMeasurementPhysicalGarments,
        garmentScopedCustomDetails: designSelections.garmentScopedCustomDetails,
        additionalGarmentConstructions:
          designSelections.additionalGarmentConstructions,
      }),
    [
      futureMeasurementState.route,
      effectiveJourneyGarmentTypeSelection,
      futureMeasurementPhysicalGarments,
      designSelections.garmentScopedCustomDetails,
      designSelections.additionalGarmentConstructions,
    ],
  );
  const reconciledFutureMeasurementState = useMemo(
    () =>
      reconcileFutureMeasurementState({
        state: futureMeasurementState,
        plan: futureMeasurementPlan,
      }),
    [futureMeasurementState, futureMeasurementPlan],
  );

  // Batch / Group Options (Site-wide adaptive ordering options)
  const [batchType, setBatchType] = useState<
    "community" | "alone" | "personalized" | "actual"
  >("community");
  const [initialRouteSet, setInitialRouteSet] = useState(false);
  const [customGroupCode, setCustomGroupCode] = useState<string>("");

  useEffect(() => {
    const dynamicCtx = { ...ctx };
    if (batchType === "alone") dynamicCtx.orderType = "Individual";
    else if (batchType === "personalized")
      dynamicCtx.orderType = "Group Organizer";
    else dynamicCtx.orderType = "Community";

    const decision = OrderRoutingEngine.evaluateOrder(
      dynamicCtx,
      storeBatches || [],
    );

    if (!initialRouteSet && storeBatches) {
      if (decision.mode === "COMMUNITY_CLOSED" && batchType === "community") {
        setBatchType("alone");
      }
      setInitialRouteSet(true);
    }
  }, [batchType, storeBatches, initialRouteSet]);

  const futureFabricMaterialPricing =
    fabricAllocationState.fabricAllocations.length > 0
      ? resolveDesignStudioFabricAllocationPricing({
          fabricAllocationState,
          fabrics,
          selectedFabric,
          preserveInvalidHydratedModernData: false,
        })
      : null;
  const futureFabricAuthoritativePricing =
    futureFabricMaterialPricing?.status === "resolved" &&
    (!activeUploadedDesignSource || isFutureUploadedDesignPricingActive)
      ? calculateDesignPricing({
          route: batchType,
          design: {
            ...activeCustomerDesignSelections,
            additionalGarmentConstructions:
              futureAdditionalConstructionReconciliation.state,
          },
          materialPricing: futureFabricMaterialPricing,
          decorativeFeatureApplicabilityStyle:
            futureDesignStyleSelection.selectedStyle,
          baseGarmentComposition: futureFabricComposition,
          additionalGarments: futureAdditionalGarments,
          catalog: customDetailCatalog,
          businessSettings,
          garmentConstructionSelectionMode: "garment_type_locked",
          garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
        })
      : null;
  const futureConstructionPrice =
    effectiveJourneyGarmentTypeSelection.garmentTypes.reduce(
      (total, garmentType) => {
        const resolution =
          effectiveJourneyGarmentTypeSelection.constructionByGarment[
            garmentType
          ];
        return (
          total +
          (resolution?.status === "resolved" ? resolution.totalPrice : 0)
        );
      },
      0,
    ) +
    Object.values(
      futureAdditionalConstructionReconciliation.state.byGarmentKey,
    ).reduce(
      (total, resolution) =>
        total + (resolution.status === "resolved" ? resolution.totalPrice : 0),
      0,
    );
  const futureGarmentPieceCount =
    authoritativePhysicalOccurrencesForDomain.length;
  const futureSummaryInput = {
    step1GarmentTypeSelection: garmentTypeSelection,
    garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
    designSourceKind: activeUploadedDesignSource ? ("uploaded" as const) : ("catalogue" as const),
    uploadedCompositionSpecs:
      activeUploadedDesignSource?.fabricCapacityComposition || null,
    additionalGarmentConstructionState:
      futureAdditionalConstructionReconciliation.state,
    catalogInspection: futureCatalogInspection,
    fabricAllocationState,
    fabricCompletion: futureFabricStageCompletion,
    materialPricing: futureFabricMaterialPricing,
    designStyleSelection: futureDesignStyleSelection,
    designStyleOccurrences: futureDesignStyleStepProjection.occurrences,
    styles,
    customDetailsReconciliation: futureScopedCustomDetailsReconciliation,
    customDetailsCompletion: futureCustomDetailsCompletion,
    customDetailsPricing: futureCustomDetailsPricing,
    personalizedInputs:
      futureScopedPersonalizedInputsReconciliation?.state || null,
    aiTryOnWorkflow: futureAiTryOnWorkflow,
    measurementPlan: futureMeasurementPlan,
    measurementState: reconciledFutureMeasurementState,
    basePricing: futureFabricAuthoritativePricing,
  };
  const futureSummary = projectFutureDesignStudioSummary(futureSummaryInput);
  const isFutureSummaryStageUnlocked =
    (futureSummary.status === "ready" ||
      futureSummary.status === "pricing_pending") &&
    isFutureSummaryUnlockedByMeasurements(reconciledFutureMeasurementState);
  const isFutureShippingUnlocked = isFutureShippingStageUnlocked(
    futureSummary.status,
  );
  const futureSelectedDesignPrice =
    futureSummary.pricingSummary.status === "exact"
      ? (futureSummary.pricingSummary.selectedDesignPrice
          ?.selectedDesignPrice ?? null)
      : null;
  const futureShippingResolution = useMemo(
    () =>
      reconcileFutureShippingState({
        state: futureShippingState,
        garmentCount: futureGarmentPieceCount,
        selectedDesignPrice: futureSelectedDesignPrice,
      }),
    [
      futureShippingState,
      futureGarmentPieceCount,
      futureSelectedDesignPrice,
    ],
  );
  const isFuturePaymentReviewUnlocked = Boolean(
    futurePaymentReviewHandoff &&
      isFuturePaymentReviewStageUnlocked(futurePaymentReviewHandoff),
  );
  const showPersistentLiveOrderSummary =
    shouldShowPersistentLiveOrderSummary(futureStageId);
  const liveOrderSummary = useMemo(
    () =>
      projectDesignStudioLiveOrderSummary({
        summary: futureSummary,
        shippingResolution: futureShippingResolution,
        candidatePricing: null,
        fabricAllocationState,
        measurementState: reconciledFutureMeasurementState,
        designSource: activeFutureDesignSource,
        additionalConstructionState:
          futureAdditionalConstructionReconciliation.state,
        catalogInspection: futureCatalogInspection,
        showAdditionalClothesCosts,
      }),
    [
      futureSummary,
      futureShippingResolution,
      fabricAllocationState,
      reconciledFutureMeasurementState,
      activeFutureDesignSource,
      futureAdditionalConstructionReconciliation.state,
      futureCatalogInspection,
      showAdditionalClothesCosts,
    ],
  );
  const liveOrderSummaryUnlockedStages = useMemo(() => {
    const unlocked = new Set<DesignStudioStageId>();
    DESIGN_STUDIO_STEPS.forEach((step, index) => {
      if (index <= highestUnlockedStageIndex) unlocked.add(step.id);
    });
    return unlocked;
  }, [highestUnlockedStageIndex]);

  useEffect(() => {
    if (
      JSON.stringify(futureShippingState) !==
      JSON.stringify(futureShippingResolution.state)
    ) {
      setFutureShippingState(futureShippingResolution.state);
    }
  }, [futureShippingState, futureShippingResolution.state]);

  useEffect(() => {
    setFutureShippingState((current) =>
      prefillFutureShippingContact({
        state: current,
        name: currentUser?.name,
        email: currentUser?.email,
        phone: currentUser?.phone,
      }),
    );
  }, [currentUser?.name, currentUser?.email, currentUser?.phone]);

  useEffect(() => {
    if (previousFutureStageIdRef.current !== futureStageId) {
      futureGarmentRemovalStageRetentionLeaseRef.current = null;
      futureGarmentRemovalConfirmationGenerationRef.current += 1;
      futureGarmentRemovalConfirmingRef.current = false;
      futureGarmentRemovalDialogRequestRef.current = null;
      setFutureGarmentRemovalDialogRequest(null);
      setFutureGarmentRemovalDialogError(null);
      setFutureGarmentRemovalDialogConfirming(false);
      setFutureGarmentRemovalFocusRequest(null);
      setFutureGarmentRemovalAnnouncement(null);
      previousFutureStageIdRef.current = futureStageId;
    }
  }, [futureStageId]);

  useEffect(() => {
    if (
      previousFutureGarmentRemovalSessionIdentityRef.current ===
      futureDraftIdentityKey
    ) {
      return;
    }
    previousFutureGarmentRemovalSessionIdentityRef.current =
      futureDraftIdentityKey;
    futureGarmentRemovalConfirmationGenerationRef.current += 1;
    futureGarmentRemovalGenerationRef.current += 1;
    futureGarmentRemovalStageRetentionLeaseRef.current = null;
    futureGarmentRemovalConfirmingRef.current = false;
    futureGarmentRemovalDialogRequestRef.current = null;
    setFutureGarmentRemovalDialogRequest(null);
    setFutureGarmentRemovalDialogError(null);
    setFutureGarmentRemovalDialogConfirming(false);
    setFutureGarmentRemovalFocusRequest(null);
    setFutureGarmentRemovalAnnouncement(null);
  }, [futureDraftIdentityKey]);

  useLayoutEffect(() => {
    const request = futureGarmentRemovalFocusRequest;
    if (!request) return;
    if (
      request.confirmationGeneration !==
        futureGarmentRemovalConfirmationGenerationRef.current ||
      request.sessionIdentityKey !== futureGarmentRemovalSessionIdentityKey ||
      request.originStage !== futureStageId
    ) {
      setFutureGarmentRemovalFocusRequest(null);
      return;
    }

    const focusOriginHeading = (): HTMLElement | null =>
      findElementByExactDataValue<HTMLElement>(
        "data-garment-removal-list-heading",
        request.originStage,
      ) ||
      (typeof document !== "undefined"
        ? document.getElementById(
            request.originStage === "custom_details"
              ? "future-custom-details-title"
              : request.originStage === "summary"
                ? "future-summary-title"
                : "future-payment-review-title",
          )
        : null);

    let focusTarget: HTMLElement | null = null;
    if (request.kind === "cancel") {
      const opener = request.opener;
      focusTarget =
        opener?.isConnected && !opener.disabled ? opener : focusOriginHeading();
    } else if (request.kind === "stale") {
      focusTarget = focusOriginHeading();
    } else {
      if (
        request.authoritySignature !==
          futurePhysicalGarmentRemovalAuthoritySignature ||
        request.removalGeneration !==
          futureGarmentRemovalGenerationRef.current
      ) {
        setFutureGarmentRemovalFocusRequest(null);
        return;
      }
      if (request.suggestedGarmentKey) {
        const suggestedButton = findElementByExactDataValue<HTMLButtonElement>(
          "data-garment-removal-button",
          request.suggestedGarmentKey,
          request.originStage,
        );
        focusTarget =
          suggestedButton && !suggestedButton.disabled
            ? suggestedButton
            : findElementByExactDataValue<HTMLElement>(
                "data-garment-removal-row-heading",
                request.suggestedGarmentKey,
              );
      }
      focusTarget ||= focusOriginHeading();
    }

    focusTarget?.focus({ preventScroll: true });
    setFutureGarmentRemovalFocusRequest(null);
  }, [
    futureGarmentRemovalFocusRequest,
    futureStageId,
    futurePhysicalGarmentRemovalAuthoritySignature,
    futureGarmentRemovalSessionIdentityKey,
    futureGarmentRemovalTargets,
  ]);

  useEffect(() => {
    const lease = futureGarmentRemovalStageRetentionLeaseRef.current;
    if (
      lease &&
      !isRemovalStageRetentionLeaseActive({
        lease,
        currentStageId: futureStageId,
        liveAuthoritySignature:
          futurePhysicalGarmentRemovalAuthoritySignature,
        removalGeneration: futureGarmentRemovalGenerationRef.current,
        sessionIdentityKey: futureDraftIdentityKey,
      })
    ) {
      futureGarmentRemovalStageRetentionLeaseRef.current = null;
    }
  }, [
    futureStageId,
    futurePhysicalGarmentRemovalAuthoritySignature,
    futureDraftIdentityKey,
  ]);

  useEffect(() => {
    if (futureStageId === "shipping" && !isFutureShippingUnlocked) {
      if (shouldRetainCurrentStageAfterGarmentRemoval("shipping")) return;
      setFutureStageId("summary");
    }
  }, [
    futureStageId,
    isFutureShippingUnlocked,
    futurePhysicalGarmentRemovalAuthoritySignature,
    futureDraftIdentityKey,
  ]);

  useEffect(() => {
    if (futureStageId === "payment" && !isFuturePaymentReviewUnlocked) {
      if (shouldRetainCurrentStageAfterGarmentRemoval("payment")) return;
      setFutureStageId("shipping");
    }
  }, [
    futureStageId,
    isFuturePaymentReviewUnlocked,
    futurePhysicalGarmentRemovalAuthoritySignature,
    futureDraftIdentityKey,
  ]);

  useEffect(
    () =>
      onAuthStateChanged(auth, (firebaseUser) => {
        setFirebaseDraftAuth({ resolved: true, user: firebaseUser });
      }),
    [],
  );

  useEffect(() => {
    invalidateFutureGarmentRemovalRetention();
    futureDraftIdentityGenerationRef.current += 1;
    futureDraftHydrationRequestGenerationRef.current += 1;
    futureDraftAutosaveGenerationRef.current += 1;
    cloudFutureDraftRevisionRef.current = null;
    cloudFutureDraftSaveQueueRef.current = Promise.resolve();
    clearFutureDesignStyleRuntimeHydration();
    lastPersistedFutureDraftRef.current = null;
    lastDesignStylePersistenceAcknowledgementRef.current = null;
    uploadedSourceCleanupCandidatesRef.current.clear();
    uploadedSourceCleanupInFlightRef.current.clear();
    lastScheduledFutureDraftRef.current = null;
    setFutureDraftPersistenceStatus("resolving");
    futureOrderV2PreparationRef.current = null;
    futureOrderV2PreparationInFlightRef.current = false;
    futureOrderV2PaymentAttemptRef.current = null;
    futureOrderV2PaymentInFlightRef.current = false;
    setFuturePaymentReviewHandoff(null);
    setGuestDraftHydrated(false);
    preservedInvalidHydratedDraftFabricAllocationsRef.current = null;
    setFutureDraftFabricIntegrityBlockers([]);

    // Remove the previous identity's dormant draft from rendered state before
    // any local or owner-scoped cloud hydration is allowed to begin.
    setGarmentTypeSelection(
      createDormantDesignStudioJourneyState({
        normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
      }).garmentTypeSelection,
    );
    setFutureStageId("garment_type");
    setHighestUnlockedStageIndex(0);
    setFutureAiTryOnWorkflow(createEmptyAiTryOnWorkflowState());
    setFutureMeasurementState(createEmptyFutureMeasurementState());
    setFutureShippingState(createEmptyFutureShippingState());
    setFutureSelectedStyleId(null);
    setFutureDesignSource(null);
    setFutureConfirmedDesignSourceKey(null);
    setFuturePriceActivatedFabricCode(null);
    uploadedDesignDeletionGenerationRef.current += 1;
    uploadedDesignDeletionInFlightRef.current = false;
    setIsRemovingDesign(false);
    setPendingCatalogStyleId(null);
    clearUploadedDesignLocalState();
    additionalGarmentFabricTransactionRef.current = null;
    setAdditionalGarmentFabricTransaction(null);
    additionalGarmentFabricSnapshotRef.current = null;
    additionalGarmentFabricTriggerRef.current = null;
    additionalGarmentFabricScrollYRef.current = null;
    setAdditionalGarmentFabricError(null);
    additionalGarmentFabricPersistentErrorGarmentKeyRef.current = null;
    setAdditionalGarmentFabricPersistentError(null);
    additionalGarmentFabricAnnouncementGarmentKeyRef.current = null;
    setAdditionalGarmentFabricAnnouncement("");
    setFutureCustomDetailsFocusGarmentKey(null);
    setDesignSelections({ accessories: [] });
    setFabricAllocationState(FabricAllocationStateEngine.initialize());
    setSelectedFabric(null);
  }, [futureDraftIdentityKey, clearFutureDesignStyleRuntimeHydration]);

  useEffect(() => {
    if (
      !canBeginFutureDesignDraftHydration({
        guestDraftHydrated,
        isLoadingData,
        stylesLoadState,
        hasFabrics: fabrics.length > 0,
        hasGarmentCatalog: normalizedGarmentTypeCatalog.length > 0,
        identityStatus: futureDraftIdentity.status,
      })
    ) {
      return;
    }
    if (futureDraftIdentity.status === "blocked") {
      setFutureDraftPersistenceStatus("blocked");
      return;
    }
    const identityGeneration = futureDraftIdentityGenerationRef.current;
    const hydrationRequestGeneration =
      ++futureDraftHydrationRequestGenerationRef.current;
    let cancelled = false;
    void (async () => {
      const localDraft = GuestOrderSessionService.getFutureDesignDraft();
      let storedDraft = localDraft;
      let hydratedPersistenceStatus: "ready" | "cleared" | "invalid" =
        "ready";
      if (futureDraftIdentity.status === "authenticated") {
        const repository = createFirebaseAuthenticatedFutureDraftRepository({
          customer: currentUser,
          authResolved: firebaseDraftAuth.resolved,
          firebaseUser: firebaseDraftAuth.user,
        });
        let synchronization;
        try {
          synchronization = await repository.synchronize(localDraft);
        } catch (error) {
          if (
            !cancelled &&
            identityGeneration === futureDraftIdentityGenerationRef.current &&
            hydrationRequestGeneration ===
              futureDraftHydrationRequestGenerationRef.current
          ) {
            console.error("Future draft synchronization failed.", error);
            setFutureDraftPersistenceStatus("blocked");
          }
          return;
        }
        if (
          cancelled ||
          identityGeneration !== futureDraftIdentityGenerationRef.current ||
          hydrationRequestGeneration !==
            futureDraftHydrationRequestGenerationRef.current
        ) {
          return;
        }
        if (synchronization.status === "conflict") {
          cloudFutureDraftRevisionRef.current = synchronization.record.revision;
          setFutureDraftPersistenceStatus("conflict");
          return;
        }
        if (
          synchronization.status === "invalid" ||
          synchronization.status === "blocked"
        ) {
          setFutureDraftPersistenceStatus(synchronization.status);
          return;
        }
        cloudFutureDraftRevisionRef.current =
          synchronization.record?.revision ?? null;
        if (synchronization.record) {
          GuestOrderSessionService.recordFutureDesignDraftCloudSynchronization(
            futureDraftIdentity.ownerUid,
            synchronization.record.revision,
          );
          if (
            synchronization.status === "guest_transferred" ||
            synchronization.status === "equivalent" ||
            synchronization.status === "cloud_cleared"
          ) {
            GuestOrderSessionService.clearFutureDesignDraftAfterCloudSynchronization();
          }
        }
        storedDraft = synchronization.draft;
        if (synchronization.status === "cloud_cleared") {
          hydratedPersistenceStatus = "cleared";
        }
      }
      if (
        cancelled ||
        identityGeneration !== futureDraftIdentityGenerationRef.current ||
        hydrationRequestGeneration !==
          futureDraftHydrationRequestGenerationRef.current
      ) {
        return;
      }
      const futureJourney = createDormantDesignStudioJourneyState({
        persistedDraft: storedDraft,
        normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
      });
      invalidateFutureGarmentRemovalRetention();
      const restoredUploadedSource = isValidUploadedDesignDraftSource(
        storedDraft?.designSource,
      )
        ? storedDraft!.designSource
        : null;
      const restoredGarmentTypeSelectionBeforeIdentity =
        futureJourney.garmentTypeSelection;
      const restoredFabricPlanningSelectionBeforeIdentity = restoredUploadedSource
        ? updateDormantGarmentTypeSelection({
            currentSelection: restoredGarmentTypeSelectionBeforeIdentity,
            normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
            selectedGarmentTypes:
              restoredUploadedSource.fabricCapacityComposition.map(
                (spec) => spec.garmentType,
              ),
          })
        : restoredGarmentTypeSelectionBeforeIdentity;
      const hydratedAllocations = storedDraft
        ? resolveDraftHydrationAllocations(storedDraft)
        : null;
      const rawFabricState = hydratedAllocations?.hasValidModernAllocations
        ? {
            fabricAllocations:
              cloneFabricAllocations(hydratedAllocations.fabricAllocations) ||
              [],
            activeAllocationId:
              hydratedAllocations.fabricAllocations[0]?.allocationId || null,
            pendingFabricGarment: null,
            awaitingFabricForPendingGarment: false,
          }
        : FabricAllocationStateEngine.initialize();
      const restoredMembershipOccurrences = buildAuthoritativePhysicalOccurrences({
        sourceKind: restoredUploadedSource ? "uploaded" : "catalogue",
        step1GarmentTypeSelection: restoredGarmentTypeSelectionBeforeIdentity,
        effectiveGarmentTypeSelection:
          restoredFabricPlanningSelectionBeforeIdentity,
        uploadedCompositionSpecs:
          restoredUploadedSource?.fabricCapacityComposition || null,
        additionalGarmentConstructionState:
          storedDraft?.designSelections?.additionalGarmentConstructions || null,
      });
      const restoredGarmentTypeSelection =
        reconcileGarmentTypeSelectionOccurrenceIdentities({
          selection: restoredGarmentTypeSelectionBeforeIdentity,
          activeGarmentKeys: restoredMembershipOccurrences.map(
            (occurrence) => occurrence.garmentKey,
          ),
        });
      const restoredFabricPlanningSelection = {
        ...restoredFabricPlanningSelectionBeforeIdentity,
        physicalOccurrenceIdentityState:
          restoredGarmentTypeSelection.physicalOccurrenceIdentityState,
      };
      const restoredUploadedDesignStyleAuthority =
        buildUploadedDesignStyleAuthority({
          source: storedDraft?.designSource,
          confirmedDesignSourceKey: storedDraft?.confirmedDesignSourceKey,
          expectedOwnerUid: firebaseDraftAuth.user?.uid || null,
          ownershipTransferPending: Boolean(
            storedDraft?.uploadedDesignOwnershipTransition,
          ),
          sourceOperationStable: true,
          activeOccurrences: restoredMembershipOccurrences,
        });
      const restoredDesignStyleDraftAuthority =
        buildDesignStyleDraftValidationAuthority({
          catalogueState: stylesLoadState,
          styles,
          garmentTypeSelection: restoredGarmentTypeSelection,
          activeOccurrences: restoredMembershipOccurrences,
          uploadedSourcesByKey: restoredUploadedDesignStyleAuthority,
        });
      const restoredDesignStyleDraftHydration =
        hydrateDesignStyleDraftPersistence({
          rawDraft: storedDraft || {},
          activeOccurrences: restoredMembershipOccurrences,
          authority: restoredDesignStyleDraftAuthority,
        });
      if (
        !shouldApplyDesignStyleDraftHydration({
          requestGeneration: hydrationRequestGeneration,
          currentGeneration: futureDraftHydrationRequestGenerationRef.current,
          current: futureDesignStyleDraftHydrationRef.current?.result || null,
          incoming: restoredDesignStyleDraftHydration,
        })
      ) {
        return;
      }
      publishFutureDesignStyleHydration({
        identityKey: futureDraftIdentityKey,
        identityGeneration,
        result: restoredDesignStyleDraftHydration,
      });
      lastPersistedFutureDraftRef.current = storedDraft;
      lastScheduledFutureDraftRef.current = storedDraft;
      if (restoredDesignStyleDraftHydration.destructiveNormalizationProhibited) {
        hydratedPersistenceStatus = "invalid";
      }
      setGarmentTypeSelection(restoredGarmentTypeSelection);
      const restoredAuthoritativeOccurrenceKeys = new Set(
        restoredMembershipOccurrences.map((occurrence) => occurrence.garmentKey),
      );
      const hydratedFabricPreparation = prepareHydratedFabricAllocationState({
        rawState: rawFabricState,
        garmentTypeSelection: restoredFabricPlanningSelection,
        authoritativeOccurrenceKeys: restoredAuthoritativeOccurrenceKeys,
        requiredPhysicalOccurrences: restoredMembershipOccurrences,
      });
      preservedInvalidHydratedDraftFabricAllocationsRef.current =
        hydratedFabricPreparation.preservedRawFabricAllocations;
      setFutureDraftFabricIntegrityBlockers([
        ...hydratedFabricPreparation.integrity.diagnostics,
      ]);
      const reconciledFabricState = hydratedFabricPreparation.reconciledState;
      const restoredFabricCompletion = getFutureFabricStageCompletion({
        garmentTypeSelection: restoredFabricPlanningSelection,
        fabricAllocationState: reconciledFabricState,
        fabrics,
        requiredPhysicalOccurrences: restoredMembershipOccurrences,
        rawFabricIntegrityDiagnostics:
          hydratedFabricPreparation.integrity.diagnostics,
      });
      const restoredStyleId = restoredUploadedSource
        ? null
        : storedDraft?.selectedStyleId || null;
      const restoredStyleSelection = resolveHydratedDesignStyleSelection({
        stylesLoadState,
        selectedStyleId: restoredStyleId,
        styles,
        garmentTypeSelection: restoredGarmentTypeSelection,
      });
      const restoredDesignSource =
        restoredUploadedSource || createCatalogDesignSource(restoredStyleId || "");
      const restoredSourceReady = Boolean(
        !restoredDesignStyleDraftHydration.destructiveNormalizationProhibited &&
          !restoredDesignStyleDraftHydration.migrationEvidence &&
          restoredDesignStyleDraftHydration.validation?.isComplete,
      );
      const restoredAiTryOnWorkflow =
        normalizeAiTryOnWorkflowState(storedDraft?.aiTryOnWorkflow) ||
        createEmptyAiTryOnWorkflowState();
      const restoredMeasurementState =
        normalizeFutureMeasurementState(storedDraft?.futureMeasurementState) ||
        createEmptyFutureMeasurementState();
      const restoredShippingState = normalizeFutureShippingState(
        storedDraft?.futureShippingState,
      ).state;
      const restoredAdditionalGarments =
        projectAuthorizedAdditionalGarmentAssignments({
          additionalGarmentConstructions:
            storedDraft?.designSelections?.additionalGarmentConstructions,
          fabricAllocationState: reconciledFabricState,
        });
      const restoredAdditionalConstructions =
        reconcileAdditionalGarmentConstructionState({
          existingState:
            storedDraft?.designSelections?.additionalGarmentConstructions,
          assignments: restoredAdditionalGarments,
          normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
        });
      const restoredCustomDetails = reconcileGarmentScopedCustomDetails({
        garmentTypeSelection: restoredFabricPlanningSelection,
        additionalGarments: restoredAdditionalGarments,
        additionalGarmentConstructions:
          restoredAdditionalConstructions.state,
        style: restoredStyleSelection.selectedStyle,
        catalogInspection: futureCatalogInspection,
        existingState:
          storedDraft?.designSelections?.garmentScopedCustomDetails,
      });
      const restoredPersonalizedInputs =
        reconcileGarmentScopedPersonalizedInputs({
          reconciliation: restoredCustomDetails,
          catalogInspection: futureCatalogInspection,
          existingInputs:
            storedDraft?.designSelections?.garmentScopedCustomDetailInputs,
        });
      const restoredCustomDetailsCompletion =
        validateGarmentScopedCustomDetailsCompletion({
          earlierStagesComplete:
            restoredFabricCompletion.isComplete && restoredSourceReady,
          reconciliation: restoredCustomDetails,
          personalizedInputs: restoredPersonalizedInputs,
          showAdditionalClothesCosts,
        });
      const restoredMeasurementPhysicalGarments =
        resolveHydratedMeasurementPhysicalGarments({
          garmentTypeSelection: restoredGarmentTypeSelection,
          designSource: restoredDesignSource,
          selectedStyle: restoredStyleSelection.selectedStyle,
          confirmedDesignSourceKey: storedDraft?.confirmedDesignSourceKey,
          normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
          fabricAllocationState: reconciledFabricState,
          additionalGarmentConstructionState:
            restoredAdditionalConstructions.state,
        });
      const restoredMeasurementPlan = planMeasurementRequirements({
        route: restoredMeasurementState.route,
        garmentTypeSelection: restoredFabricPlanningSelection,
        physicalGarments: restoredMeasurementPhysicalGarments,
        garmentScopedCustomDetails: restoredCustomDetails.state,
        additionalGarmentConstructions: restoredAdditionalConstructions.state,
      });
      const restoredReconciledMeasurementState =
        reconcileFutureMeasurementState({
          state: restoredMeasurementState,
          plan: restoredMeasurementPlan,
        });
      const canRestoreSummary =
        restoredFabricCompletion.isComplete &&
        restoredSourceReady &&
        !restoredUploadedSource &&
        isFutureCustomDetailsContentReady(restoredCustomDetailsCompletion) &&
        isFutureMeasurementStageUnlocked(restoredAiTryOnWorkflow) &&
        isFutureSummaryUnlockedByMeasurements(restoredReconciledMeasurementState);
      const restoredShippingResolution = reconcileFutureShippingState({
        state: restoredShippingState,
        garmentCount: restoredMembershipOccurrences.length,
        selectedDesignPrice:
          typeof storedDraft?.pricingBreakdown?.selectedDesignPrice === "number"
            ? storedDraft.pricingBreakdown.selectedDesignPrice
            : null,
      });
      const canRestoreShipping = canRestoreSummary;
      setFutureStageId(
        storedDraft?.currentStageId === "shipping" && canRestoreShipping
          ? "shipping"
          : storedDraft?.currentStageId === "summary" && canRestoreSummary
            ? "summary"
            : storedDraft?.currentStageId === "measurement" &&
                restoredFabricCompletion.isComplete &&
                restoredSourceReady &&
                isFutureMeasurementStageUnlocked(restoredAiTryOnWorkflow)
              ? "measurement"
              : storedDraft?.currentStageId === "try_on" &&
                  restoredFabricCompletion.isComplete &&
                  restoredSourceReady
                ? "try_on"
                : storedDraft?.currentStageId === "custom_details" &&
                    restoredFabricCompletion.isComplete &&
                    restoredSourceReady
                  ? "custom_details"
                  : storedDraft?.currentStageId === "design_style" &&
                      restoredFabricCompletion.isComplete
                    ? "design_style"
                    : futureJourney.currentStageId === "fabric"
                      ? "fabric"
                      : "garment_type",
      );
      setFutureAiTryOnWorkflow(restoredAiTryOnWorkflow);
      setFutureMeasurementState(restoredReconciledMeasurementState);
      setFutureShippingState(restoredShippingResolution.state);
      setFutureSelectedStyleId(restoredStyleId);
      setFutureDesignSource(restoredDesignSource);
      setFutureConfirmedDesignSourceKey(
        storedDraft?.confirmedDesignSourceKey || null,
      );
      setFuturePriceActivatedFabricCode(
        storedDraft?.priceActivatedFabricCode || null,
      );
      if (restoredUploadedSource) {
        setUploadedDesignReference(restoredUploadedSource.uploadReference);
        setUploadedDesignComposition(
          restoredUploadedSource.fabricCapacityComposition.map((spec) => ({
            ...spec,
          })),
        );
        setUploadedDesignAdditionalGarmentTypes(
          getUploadedDesignAdditionalGarmentTypes({
            step1GarmentTypes: restoredGarmentTypeSelection.garmentTypes,
            composition: restoredUploadedSource.fabricCapacityComposition,
          }),
        );
        setUploadedDesignDemographic(restoredUploadedSource.demographic);
        if (
          getUploadedDesignCompositionNeedsReview(
            restoredUploadedSource.fabricCapacityComposition,
          )
        ) {
          setUploadedDesignError(
            UPLOADED_DESIGN_COMPOSITION_NEEDS_REVIEW_MESSAGE,
          );
        }
      } else {
        setUploadedDesignAdditionalGarmentTypes([]);
        setUploadedDesignComposition(
          mergeUploadedDesignCompositionWithStep1({
            step1GarmentTypes: restoredGarmentTypeSelection.garmentTypes,
            additionalGarmentTypes: [],
          }),
        );
      }
      setDesignSelections({
        ...(storedDraft?.designSelections || { accessories: [] }),
        additionalGarmentConstructions:
          restoredAdditionalConstructions.state,
        garmentScopedCustomDetails: restoredCustomDetails.state,
        garmentScopedCustomDetailInputs: restoredPersonalizedInputs.state,
      });
      setFabricAllocationState(reconciledFabricState);
      setSelectedFabric(
        fabrics.find(
          (fabric) =>
            fabric.code ===
            reconciledFabricState.fabricAllocations[0]?.fabricCode,
        ) || null,
      );
      setFutureDraftPersistenceStatus(hydratedPersistenceStatus);
      setGuestDraftHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    currentUser,
    firebaseDraftAuth,
    futureDraftIdentity,
    futureDraftIdentityKey,
    guestDraftHydrated,
    isLoadingData,
    stylesLoadState,
    customDetailCatalog,
    fabrics,
    styles,
    publishFutureDesignStyleHydration,
  ]);

  useEffect(() => {
    if (!guestDraftHydrated) return;
    setGarmentTypeSelection((current) =>
      updateDormantGarmentTypeSelection({
        currentSelection: current,
        normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
      }),
    );
  }, [guestDraftHydrated, customDetailCatalog]);

  const isAdditionalGarmentCommitPending =
    additionalGarmentFabricTransaction !== null &&
    (additionalGarmentFabricTransaction.phase === "assigning" ||
      additionalGarmentFabricTransaction.phase === "awaiting_commit" ||
      additionalGarmentFabricTransaction.origin === "new_addition");

  useEffect(() => {
    if (
      !guestDraftHydrated ||
      isAdditionalGarmentCommitPending ||
      !futureScopedCustomDetailsReconciliation ||
      !futureScopedPersonalizedInputsReconciliation ||
      (!futureScopedCustomDetailsReconciliation.stateChanged &&
        !futureScopedPersonalizedInputsReconciliation.stateChanged &&
        !futureAdditionalConstructionReconciliation.stateChanged)
    ) {
      return;
    }
    setDesignSelections((current) => ({
      ...current,
      additionalGarmentConstructions:
        futureAdditionalConstructionReconciliation.state,
      garmentScopedCustomDetails: futureScopedCustomDetailsReconciliation.state,
      garmentScopedCustomDetailInputs:
        futureScopedPersonalizedInputsReconciliation.state,
    }));
  }, [
    guestDraftHydrated,
    isAdditionalGarmentCommitPending,
    futureScopedCustomDetailsReconciliation,
    futureScopedPersonalizedInputsReconciliation,
    futureAdditionalConstructionReconciliation,
  ]);

  useEffect(() => {
    if (!guestDraftHydrated) return;
    const nextAdditional = getUploadedDesignAdditionalGarmentTypes({
      step1GarmentTypes: garmentTypeSelection.garmentTypes,
      additionalGarmentTypes: uploadedDesignAdditionalGarmentTypes,
    });
    const composition = mergeUploadedDesignCompositionWithStep1({
      step1GarmentTypes: garmentTypeSelection.garmentTypes,
      additionalGarmentTypes: nextAdditional,
      preservedHiddenComposition:
        activeUploadedDesignSource?.fabricCapacityComposition ||
        uploadedDesignComposition,
    });
    const compositionKey = getUploadedDesignCompositionSignature(composition);
    const currentKey = getUploadedDesignCompositionSignature(
      uploadedDesignComposition,
    );
    if (compositionKey !== currentKey) {
      setUploadedDesignComposition(composition);
    }
    if (
      nextAdditional.length !== uploadedDesignAdditionalGarmentTypes.length ||
      nextAdditional.some(
        (garmentType, index) =>
          uploadedDesignAdditionalGarmentTypes[index] !== garmentType,
      )
    ) {
      setUploadedDesignAdditionalGarmentTypes(nextAdditional);
    }
  }, [
    guestDraftHydrated,
    garmentTypeSelection.garmentTypes,
    uploadedDesignAdditionalGarmentTypes,
    uploadedDesignComposition,
  ]);

  useEffect(() => {
    if (!guestDraftHydrated) return;
    if (!garmentTypeStageCompletion.isComplete) {
      setFutureStageId("garment_type");
    }
    setFabricAllocationState((current) =>
      reconcileFutureFabricAllocationStateIfChanged({
        state: current,
        garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
        requiredPhysicalOccurrences: fabricTransactionPhysicalOccurrences,
      }),
    );
  }, [
    guestDraftHydrated,
    garmentTypeSelection,
    effectiveJourneyGarmentTypeSelection,
    garmentTypeStageCompletion.isComplete,
    activeUploadedDesignSource?.sourceKey,
    fabricTransactionPhysicalOccurrences,
  ]);

  useEffect(() => {
    const transaction = additionalGarmentFabricTransaction;
    if (!transaction) return;

    if (
      !isAdditionalGarmentFabricTransactionTargetValid({
        transaction,
        fabricAllocationState,
      })
    ) {
      const ownsPending = canCancelPendingForAdditionalGarmentTransaction({
        transaction,
        fabricAllocationState,
        expectedTransactionId: transaction.transactionId,
      });
      if (transaction.origin === "new_addition") {
        const cancellation = preparePendingAdditionalGarmentCancellationCommit({
          garmentKey: transaction.garmentKey,
          fabricAllocationState,
          designSelections,
        });
        revalidatePreservedFabricIntegrityAfterMutation({
          previousState: fabricAllocationState,
          nextState: cancellation.fabricAllocationState,
          explicitlyRepairedGarmentKeys: [transaction.garmentKey],
        });
        setFabricAllocationState(cancellation.fabricAllocationState);
        setDesignSelections(cancellation.designSelections);
      } else if (ownsPending) {
        setFabricAllocationState((current) =>
          FabricAllocationStateEngine.cancelPendingGarment(current),
        );
      }
      additionalGarmentFabricTransactionRef.current = null;
      setAdditionalGarmentFabricTransaction(null);
      setAdditionalGarmentFabricError(null);
      additionalGarmentFabricSnapshotRef.current = null;
      additionalGarmentFabricPersistentErrorGarmentKeyRef.current =
        transaction.garmentKey;
      setAdditionalGarmentFabricPersistentError(
        STALE_ADDITIONAL_GARMENT_FABRIC_MESSAGE,
      );
      setNotification({
        message: STALE_ADDITIONAL_GARMENT_FABRIC_MESSAGE,
        type: "info",
      });
      return;
    }

    if (
      transaction.phase !== "assigning" &&
      transaction.phase !== "awaiting_commit"
    ) {
      return;
    }

    if (
      transaction.origin === "new_addition" &&
      transaction.constructionAppliedForTransactionId !==
        transaction.transactionId &&
      !designSelections.additionalGarmentConstructions?.byGarmentKey[
        transaction.garmentKey
      ]
    ) {
      const applied = applyAdditionalGarmentConstructionAndCopy({
        current: designSelections,
        transaction,
        catalogInspection: futureCatalogInspection,
      });
      if (!applied.applied) {
        setAdditionalGarmentFabricError(
          applied.reason ||
            "Could not finish garment setup. Choose another fabric or cancel.",
        );
        if (additionalGarmentFabricSnapshotRef.current) {
          setFabricAllocationState(additionalGarmentFabricSnapshotRef.current);
        }
        if (transaction.openedModal) {
          setAdditionalGarmentFabricTransaction((current) =>
            current
              ? {
                  ...current,
                  phase: "catalogue",
                  requestedFabricCode: undefined,
                }
              : current,
          );
        } else {
          setAdditionalGarmentFabricTransaction(null);
          additionalGarmentFabricSnapshotRef.current = null;
        }
        return;
      }
      setDesignSelections(applied.next);
      setAdditionalGarmentFabricTransaction((current) =>
        current && current.transactionId === transaction.transactionId
          ? {
              ...current,
              phase: "awaiting_commit",
              constructionAppliedForTransactionId: transaction.transactionId,
            }
          : current,
      );
      return;
    }

    const commitResult = confirmAdditionalGarmentTransactionCommitted({
      transaction: {
        ...transaction,
        constructionAppliedForTransactionId:
          transaction.constructionAppliedForTransactionId ??
          (transaction.origin === "change_existing"
            ? transaction.transactionId
            : transaction.constructionAppliedForTransactionId),
      },
      fabricAllocationState,
      designSelections,
      reconciliationParentGarmentKeys:
        futureScopedCustomDetailsReconciliation?.subjects.map(
          (subject) => subject.parentGarmentKey,
        ) || [],
    });

    if (commitResult.status === "pending") {
      return;
    }
    if (commitResult.status !== "committed") {
      setAdditionalGarmentFabricError(commitResult.reason);
      setAdditionalGarmentFabricTransaction((current) =>
        current?.openedModal
          ? {
              ...current,
              phase:
                current.origin === "change_existing" ? "catalogue" : "catalogue",
              requestedFabricCode: undefined,
            }
          : null,
      );
      if (
        transaction.origin === "new_addition" &&
        additionalGarmentFabricSnapshotRef.current
      ) {
        setFabricAllocationState(additionalGarmentFabricSnapshotRef.current);
        setDesignSelections((current) => ({
          ...current,
          additionalGarmentConstructions: removeAdditionalGarmentConstruction(
            current.additionalGarmentConstructions ||
              createEmptyAdditionalGarmentConstructionState(),
            transaction.garmentKey,
          ),
          garmentScopedCustomDetails: removeGarmentScopedCustomDetails(
            current.garmentScopedCustomDetails || {
              schemaVersion: 1,
              selectionsByGarmentKey: {},
              snapshotsByGarmentKey: {},
            },
            transaction.garmentKey,
          ),
        }));
      }
      return;
    }

    const fabricName =
      fabrics.find((fabric) => fabric.code === commitResult.fabricCode)?.name ||
      commitResult.fabricCode;
    const garmentLabel = getFabricGarmentLabel(transaction.garmentType);
    setAdditionalGarmentFabricError(null);
    additionalGarmentFabricPersistentErrorGarmentKeyRef.current = null;
    setAdditionalGarmentFabricPersistentError(null);
    additionalGarmentFabricSnapshotRef.current = null;
    additionalGarmentFabricAnnouncementGarmentKeyRef.current =
      transaction.garmentKey;
    setAdditionalGarmentFabricAnnouncement(
      transaction.origin === "change_existing"
        ? `${garmentLabel} now uses ${fabricName}.`
        : `${garmentLabel} added with ${fabricName}.`,
    );
    // Keep transaction in terminal "committed" until readiness is stable so
    // stage correction cannot bounce to Design Style for one render.
    const committedTransaction: AdditionalGarmentFabricTransaction = {
      ...transaction,
      phase: "committed",
      openedModal: false,
      requestedFabricCode: commitResult.fabricCode,
    };
    additionalGarmentFabricTransactionRef.current = committedTransaction;
    setAdditionalGarmentFabricTransaction(committedTransaction);
    setFutureCustomDetailsFocusGarmentKey(commitResult.garmentKey);
    setFutureStageId("custom_details");
  }, [
    additionalGarmentFabricTransaction,
    fabricAllocationState,
    designSelections,
    futureCatalogInspection,
    futureScopedCustomDetailsReconciliation,
    fabrics,
  ]);

  useEffect(() => {
    const transaction = additionalGarmentFabricTransaction;
    if (!transaction || transaction.phase !== "committed") return;
    if (
      !futureFabricStageCompletion.isComplete ||
      !isFutureDesignSourceReadyForCustomDetails
    ) {
      return;
    }
    additionalGarmentFabricTransactionRef.current = null;
    setAdditionalGarmentFabricTransaction(null);
    const scrollY = additionalGarmentFabricScrollYRef.current;
    additionalGarmentFabricScrollYRef.current = null;
    const trigger = additionalGarmentFabricTriggerRef.current;
    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        if (typeof scrollY === "number") {
          window.scrollTo({ top: scrollY, behavior: "auto" });
        }
        if (
          trigger?.isConnected &&
          !(trigger instanceof HTMLButtonElement && trigger.disabled)
        ) {
          trigger.focus({ preventScroll: true });
        }
      });
    }
  }, [
    additionalGarmentFabricTransaction,
    futureFabricStageCompletion.isComplete,
    isFutureDesignSourceReadyForCustomDetails,
  ]);

  useEffect(() => {
    const stageIndex = DESIGN_STUDIO_STEPS.findIndex(
      (step) => step.id === futureStageId,
    );
    if (stageIndex < 0) return;
    setHighestUnlockedStageIndex((current) => Math.max(current, stageIndex));
  }, [futureStageId]);

  useEffect(() => {
    const correctedStageId = resolveFutureStageCorrection({
      currentStageId: futureStageId,
      garmentTypeComplete: garmentTypeStageCompletion.isComplete,
      fabricComplete: futureFabricStageCompletion.isComplete,
      designSourceReady: isFutureDesignSourceReadyForCustomDetails,
      customDetailsReady: isFutureCustomDetailsStageReady,
      measurementUnlocked: isFutureMeasurementStageUnlocked(futureAiTryOnWorkflow),
      summaryUnlocked: isFutureSummaryUnlockedByMeasurements(
        reconciledFutureMeasurementState,
      ),
      inlineAdditionalGarmentFabricTransaction:
        additionalGarmentFabricTransaction,
    });
    if (!correctedStageId || correctedStageId === futureStageId) return;
    if (shouldRetainCurrentStageAfterGarmentRemoval(futureStageId)) return;
    setFutureStageId(correctedStageId);
  }, [
    futureStageId,
    futureFabricStageCompletion.isComplete,
    garmentTypeStageCompletion.isComplete,
    isFutureDesignSourceReadyForCustomDetails,
    isFutureCustomDetailsStageReady,
    futureAiTryOnWorkflow,
    reconciledFutureMeasurementState.route,
    reconciledFutureMeasurementState.calculationStatus,
    additionalGarmentFabricTransaction,
    futurePhysicalGarmentRemovalAuthoritySignature,
    futureDraftIdentityKey,
  ]);

  useEffect(() => {
    if (!guestDraftHydrated) return;
    setFutureAiTryOnWorkflow((current) =>
      reconcileAiTryOnWorkflow({
        state: current,
        currentInputFingerprint: futureAiTryOnInputFingerprint,
        policy: { gatewayAvailable: false, skipAllowed: true },
      }),
    );
  }, [guestDraftHydrated, futureAiTryOnInputFingerprint]);

  const coordinatePersistedUploadedSourceCleanup = (
    acknowledgement: NonNullable<
      ReturnType<typeof createDesignStylePersistenceAcknowledgement>
    >,
  ) => {
    uploadedSourceCleanupCandidatesRef.current.forEach((pending, sourceRef) => {
      if (uploadedSourceCleanupInFlightRef.current.has(sourceRef)) return;
      uploadedSourceCleanupInFlightRef.current.add(sourceRef);
      void (async () => {
        try {
          const historySafetyStatus = await getFutureOrderV2HistorySafetyStatus(
            sourceRef,
          );
          const firebaseUser = firebaseDraftAuth.user || auth.currentUser;
          const exactCanonicalSource =
            pending.confirmation?.sourceKey === `uploaded:${sourceRef}` &&
            pending.confirmation.uploadedSourceRef === sourceRef &&
            pending.confirmation.ownerUid === pending.reference.ownerUid &&
            pending.reference.designReferenceId === sourceRef;
          const exactAuthenticatedOwner =
            exactCanonicalSource &&
            firebaseDraftAuth.resolved &&
            Boolean(firebaseUser) &&
            !firebaseUser?.isAnonymous &&
            futureDraftIdentity.status === "authenticated" &&
            futureDraftIdentity.ownerUid === firebaseUser?.uid &&
            pending.reference.ownerUid === firebaseUser?.uid;
          const result = await coordinateUploadedSourceCleanup({
            candidate: pending.candidate,
            acknowledgement,
            currentSaveGeneration: futureDraftAutosaveGenerationRef.current,
            currentIdentityGeneration: futureDraftIdentityGenerationRef.current,
            activeOccurrences: authoritativePhysicalOccurrencesForDomain,
            lifecycleProof: {
              referenceAuthorityStatus: "complete",
              currentDraftReferenceStatus: "not-referenced",
              ownershipStatus: exactAuthenticatedOwner
                ? "settled"
                : "unknown",
              ownershipTransferStatus: exactAuthenticatedOwner
                ? "settled"
                : "unknown",
              confirmationStatus: exactCanonicalSource
                ? "settled"
                : "unknown",
              historySafetyStatus,
            },
            deleteCanonicalSource: async () => {
              const deletion = await deleteUploadedDesignCanonicalSource({
                reference: pending.reference,
                deleteDraft:
                  CustomerDesignUploadService.deleteCustomerDesignDraft,
              });
              if (deletion.status === "failed") throw deletion.error;
            },
          });
          if (result.status === "deleted") {
            uploadedSourceCleanupCandidatesRef.current.delete(sourceRef);
          }
        } finally {
          uploadedSourceCleanupInFlightRef.current.delete(sourceRef);
        }
      })();
    });
  };

  useEffect(() => {
    if (!guestDraftHydrated || isAdditionalGarmentCommitPending) return;
    if (
      futureDraftPersistenceStatus !== "ready" ||
      (futureDraftIdentity.status !== "guest" &&
        futureDraftIdentity.status !== "authenticated")
    ) {
      return;
    }

    const persistTimer = window.setTimeout(() => {
      const autosaveAllocationResolution =
        resolveDraftAutosaveFabricAllocations({
          preservedInvalidHydratedFabricAllocations:
            preservedInvalidHydratedDraftFabricAllocationsRef.current,
          hasUnresolvedHydratedFabricIntegrity:
            preservedInvalidHydratedDraftFabricAllocationsRef.current !== null,
          generatedFabricAllocations: fabricAllocationState.fabricAllocations,
        });
      if (!autosaveAllocationResolution.preserveInvalidHydratedModernData) {
        preservedInvalidHydratedDraftFabricAllocationsRef.current = null;
      }

      const activeCatalogStyleId =
        activeFutureDesignSource?.kind === "catalog"
          ? activeFutureDesignSource.styleId
          : null;
      const activeDesignSource = activeFutureDesignSource;
      const selectedDesignPricing =
        futureSummary.pricingSummary.selectedDesignPrice;
      const baseDraft = {
        aiTryOnWorkflow: futureAiTryOnWorkflow,
        futureMeasurementState: reconciledFutureMeasurementState,
        selectedFabricCode: selectedFabric?.code || null,
        selectedStyleId: activeCatalogStyleId,
        designSource: activeDesignSource,
        confirmedStyleId:
          activeDesignSource?.kind === "catalog" ? activeCatalogStyleId : null,
        confirmedDesignSourceKey:
          activeDesignSource?.kind === "uploaded"
            ? futureConfirmedDesignSourceKey
            : activeDesignSource?.sourceKey || null,
        priceActivatedFabricCode:
          activeDesignSource?.kind === "uploaded"
            ? futurePriceActivatedFabricCode
            : futurePrimaryFabricCode,
        selectedGarment: null,
        designSelections,
        measurements: {} as Measurements,
        sizingMode: "manual" as const,
        deliveryMethod: null,
        deliveryAddress: {
          addressLine1: "",
          addressLine2: "",
          city: "",
          postalCode: "",
          countryCode: "",
        },
        pickupTime: "",
        customerName: futureShippingState.customerInformation?.fullName || "",
        customerEmail: futureShippingState.customerInformation?.email || "",
        customerPhone: futureShippingState.customerInformation?.phone || "",
        batchType,
        batchId: ctx.batchId,
        batchName: ctx.batchName,
        customGroupCode,
        garmentPieceCount: futureGarmentPieceCount,
        specialInstructions:
          futureShippingState.customerInformation?.comment || "",
        leftoverFabricChoice: "Return leftover fabric pieces with garment",
        hasLining: false,
        pricingBreakdown: {
          pricingModel: "all_inclusive_garment_construction",
          garmentConstructionSubtotal:
            futureSummary.pricingSummary.garmentConstructionSubtotal ??
            undefined,
          clothingPrice:
            futureSummary.pricingSummary.garmentConstructionSubtotal ??
            undefined,
          includesFabricAndSewing: true,
          includedComponents: {
            fabric: "included_in_garment_construction",
            sewing: "included_in_garment_construction",
            tax: "included_in_garment_construction",
            lagosToEindhovenShipping:
              "included_in_garment_construction",
          },
          customDetailsPrice:
            futureSummary.pricingSummary.customDetailsExactSubtotal,
          selectedDesignPrice: selectedDesignPricing?.selectedDesignPrice,
          eindhovenToDestinationShipping:
            selectedDesignPricing?.eindhovenToDestinationShipping ?? null,
          total:
            selectedDesignPricing?.finalOrderSubtotal ??
            selectedDesignPricing?.selectedDesignPrice ??
            undefined,
        },
        shippingSnapshot: {},
        fabricAllocations: autosaveAllocationResolution.fabricAllocations,
        updatedAt: new Date().toISOString(),
      } as GuestDesignDraft;
      const futureDraft = persistFutureShippingState({
        draft: baseDraft,
        state: futureShippingState,
      });
      const guestDraft = persistDormantGarmentTypeStage({
        garmentTypeSelection,
        currentStageId: futureStageId,
        draft: futureDraft,
      });
      const designStyleHydration = futureDesignStyleDraftHydrationRef.current;
      if (
        !designStyleHydration ||
        designStyleHydration.identityGeneration !==
          futureDraftIdentityGenerationRef.current
      ) {
        return;
      }
      const uploadedDesignStyleAuthority = buildUploadedDesignStyleAuthority({
        source: activeDesignSource,
        confirmedDesignSourceKey: futureConfirmedDesignSourceKey,
        expectedOwnerUid: firebaseDraftAuth.user?.uid || null,
        ownershipTransferPending: Boolean(
          lastPersistedFutureDraftRef.current
            ?.uploadedDesignOwnershipTransition,
        ),
        sourceOperationStable:
          !isUploadingDesign && !isReplacingDesign && !isRemovingDesign,
        activeOccurrences: authoritativePhysicalOccurrencesForDomain,
      });
      const designStyleAuthority = buildDesignStyleDraftValidationAuthority({
        catalogueState: stylesLoadState,
        styles,
        garmentTypeSelection,
        activeOccurrences: authoritativePhysicalOccurrencesForDomain,
        uploadedSourcesByKey: uploadedDesignStyleAuthority,
      });
      const preparedDesignStyleDraft = prepareDesignStyleDraftAutosave({
        draft: guestDraft,
        hydrated: designStyleHydration.result,
        activeOccurrences: authoritativePhysicalOccurrencesForDomain,
        authority: designStyleAuthority,
        hydrationGeneration: designStyleHydration.identityGeneration,
        currentHydrationGeneration: futureDraftIdentityGenerationRef.current,
      });
      if (preparedDesignStyleDraft.status === "blocked") return;
      publishFutureDesignStyleHydration({
        identityKey: futureDraftIdentityKey,
        identityGeneration: designStyleHydration.identityGeneration,
        result: preparedDesignStyleDraft.hydration,
      });
      const canonicalGuestDraft = preparedDesignStyleDraft.draft;
      if (
        (lastScheduledFutureDraftRef.current &&
          areFutureDraftsEquivalent(
            lastScheduledFutureDraftRef.current,
            canonicalGuestDraft,
          )) ||
        (lastPersistedFutureDraftRef.current &&
          areFutureDraftsEquivalent(
            lastPersistedFutureDraftRef.current,
            canonicalGuestDraft,
          ))
      ) {
        return;
      }
      const saveGeneration = ++futureDraftAutosaveGenerationRef.current;
      lastDesignStylePersistenceAcknowledgementRef.current = null;
      lastScheduledFutureDraftRef.current = canonicalGuestDraft;
      if (futureDraftIdentity.status === "guest") {
        const saved =
          GuestOrderSessionService.saveFutureDesignDraft(canonicalGuestDraft);
        if (
          saved?.status === "saved" &&
          shouldAcceptDesignStyleDraftSaveCompletion({
            saveGeneration,
            currentSaveGeneration: futureDraftAutosaveGenerationRef.current,
            identityGeneration: designStyleHydration.identityGeneration,
            currentIdentityGeneration:
              futureDraftIdentityGenerationRef.current,
          })
        ) {
          lastPersistedFutureDraftRef.current = saved.draft;
          const acknowledgement = createDesignStylePersistenceAcknowledgement({
              persistenceKind: "guest",
              draftIdentity: futureDraftIdentityKey,
              saveGeneration,
              currentSaveGeneration: futureDraftAutosaveGenerationRef.current,
              identityGeneration: designStyleHydration.identityGeneration,
              currentIdentityGeneration:
                futureDraftIdentityGenerationRef.current,
              persistedDraft: saved.draft,
            });
          lastDesignStylePersistenceAcknowledgementRef.current = acknowledgement;
          if (acknowledgement) {
            coordinatePersistedUploadedSourceCleanup(acknowledgement);
          }
        } else if (
          saveGeneration === futureDraftAutosaveGenerationRef.current &&
          designStyleHydration.identityGeneration ===
            futureDraftIdentityGenerationRef.current
        ) {
          lastScheduledFutureDraftRef.current =
            lastPersistedFutureDraftRef.current;
        }
      } else if (futureDraftIdentity.status === "authenticated") {
        const identityGeneration = futureDraftIdentityGenerationRef.current;
        const repository = createFirebaseAuthenticatedFutureDraftRepository({
          customer: currentUser,
          authResolved: firebaseDraftAuth.resolved,
          firebaseUser: firebaseDraftAuth.user,
        });
        cloudFutureDraftSaveQueueRef.current =
          cloudFutureDraftSaveQueueRef.current
            .then(async () => {
              if (
                identityGeneration !==
                  futureDraftIdentityGenerationRef.current ||
                futureDraftPersistenceStatus !== "ready"
              ) {
                return;
              }
              const result = await repository.save(
                canonicalGuestDraft,
                cloudFutureDraftRevisionRef.current,
              );
              if (
                identityGeneration !== futureDraftIdentityGenerationRef.current
              ) {
                return;
              }
              if (result.status === "saved") {
                cloudFutureDraftRevisionRef.current = result.record.revision;
                if (
                  shouldAcceptDesignStyleDraftSaveCompletion({
                    saveGeneration,
                    currentSaveGeneration:
                      futureDraftAutosaveGenerationRef.current,
                    identityGeneration,
                    currentIdentityGeneration:
                      futureDraftIdentityGenerationRef.current,
                  })
                ) {
                  lastPersistedFutureDraftRef.current =
                    result.record.draft || canonicalGuestDraft;
                  if (result.record.draft) {
                    const acknowledgement = createDesignStylePersistenceAcknowledgement({
                        persistenceKind: "authenticated",
                        draftIdentity: futureDraftIdentityKey,
                        saveGeneration,
                        currentSaveGeneration:
                          futureDraftAutosaveGenerationRef.current,
                        identityGeneration,
                        currentIdentityGeneration:
                          futureDraftIdentityGenerationRef.current,
                        persistedDraft: result.record.draft,
                      });
                    lastDesignStylePersistenceAcknowledgementRef.current =
                      acknowledgement;
                    if (acknowledgement) {
                      coordinatePersistedUploadedSourceCleanup(acknowledgement);
                    }
                  }
                }
              } else if (result.status === "conflict") {
                futureDraftIdentityGenerationRef.current += 1;
                setFutureDraftPersistenceStatus("conflict");
              } else {
                futureDraftIdentityGenerationRef.current += 1;
                setFutureDraftPersistenceStatus(result.status);
              }
            })
            .catch((error) => {
              if (
                identityGeneration === futureDraftIdentityGenerationRef.current
              ) {
                if (saveGeneration === futureDraftAutosaveGenerationRef.current) {
                  lastScheduledFutureDraftRef.current =
                    lastPersistedFutureDraftRef.current;
                }
                console.error("Future draft autosave failed.", error);
                futureDraftIdentityGenerationRef.current += 1;
                setFutureDraftPersistenceStatus("blocked");
              }
            });
      }
    }, 250);

    return () => window.clearTimeout(persistTimer);
  }, [
    currentUser,
    firebaseDraftAuth,
    futureDraftIdentity,
    futureDraftPersistenceStatus,
    guestDraftHydrated,
    isAdditionalGarmentCommitPending,
    futureDraftFabricIntegrityBlockers,
    selectedFabric,
    designSelections,
    batchType,
    customGroupCode,
    futurePaymentReviewHandoff?.candidate?.pricing,
    futureSummary.pricingSummary.selectedDesignPrice,
    futureGarmentPieceCount,
    fabricAllocationState.fabricAllocations,
    ctx.batchId,
    ctx.batchName,
    garmentTypeSelection,
    futureStageId,
    futureSelectedStyleId,
    activeFutureDesignSource,
    futureConfirmedDesignSourceKey,
    futurePriceActivatedFabricCode,
    futurePrimaryFabricCode,
    futureAiTryOnWorkflow,
    reconciledFutureMeasurementState,
    futureShippingState,
    styles,
    stylesLoadState,
    authoritativePhysicalOccurrencesForDomain,
    isUploadingDesign,
    isReplacingDesign,
    isRemovingDesign,
    futureDraftIdentityKey,
    currentFutureDesignStyleDraftHydration?.result.ledger?.revision,
    publishFutureDesignStyleHydration,
  ]);

  const handleDormantGarmentTypesChange = (
    garmentTypes: FabricGarmentType[],
  ) => {
    invalidateFutureGarmentRemovalRetention();
    const nextBaseGarmentKeys = garmentTypes.map(
      (garmentType) => createStyleBaseGarmentSpec(garmentType).key,
    );
    const nextActiveGarmentKeys = [
      ...nextBaseGarmentKeys,
      ...authoritativePhysicalOccurrencesForDomain
        .filter((occurrence) => occurrence.sourceRole === "additional")
        .map((occurrence) => occurrence.garmentKey),
    ];
    setGarmentTypeSelection((current) => {
      const updated = updateDormantGarmentTypeSelection({
        currentSelection: current,
        normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
        selectedGarmentTypes: garmentTypes,
      });
      return reconcileGarmentTypeSelectionOccurrenceIdentities({
        selection: updated,
        activeGarmentKeys: nextActiveGarmentKeys,
      });
    });
    const nextAdditional = getUploadedDesignAdditionalGarmentTypes({
      step1GarmentTypes: garmentTypes,
      additionalGarmentTypes: uploadedDesignAdditionalGarmentTypes,
    });
    setUploadedDesignAdditionalGarmentTypes(nextAdditional);
    const composition = mergeUploadedDesignCompositionWithStep1({
      step1GarmentTypes: garmentTypes,
      additionalGarmentTypes: nextAdditional,
      preservedHiddenComposition:
        activeUploadedDesignSource?.fabricCapacityComposition ||
        uploadedDesignComposition,
    });
    setUploadedDesignComposition(composition);
    if (
      activeUploadedDesignSource ||
      uploadedDesignReference ||
      uploadedDesignDemographic
    ) {
      applyUploadedDesignForm({
        reference:
          activeUploadedDesignSource?.uploadReference || uploadedDesignReference,
        composition,
        demographic:
          activeUploadedDesignSource?.demographic || uploadedDesignDemographic,
      });
    }
  };
  const handleDormantGarmentDemographicsChange = (
    demographics: CustomDetailDemographic[],
  ) => {
    setGarmentTypeSelection((current) =>
      updateDormantGarmentTypeSelection({
        currentSelection: current,
        normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
        selectedDemographics: demographics,
      }),
    );
  };
  const handleDormantConstructionDefaultsChange = (
    resolutions: Parameters<
      typeof acceptDormantGarmentConstructionDefaults
    >[0]["resolutions"],
  ) => {
    setGarmentTypeSelection((current) =>
      acceptDormantGarmentConstructionDefaults({
        currentSelection: current,
        resolutions,
        normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
      }),
    );
  };

  const rejectFutureDesignStyleMutation = (reason?: string) => {
    setFutureDesignStyleMutationError(
      reason === "ADAPTABILITY_CONFIRMATION_REQUIRED"
        ? "Confirm this design adaptation before applying it to the garment."
        : reason === "STYLE_NOT_ELIGIBLE" ||
            reason === "STYLE_AUTHORITY_CHANGED"
          ? "This design is no longer available for the selected garment. Review the current catalogue and try again."
          : "Your Design Style choices changed before this action completed. Review the garment and try again.",
    );
  };

  const applyFutureDesignStyleMutationLedger = (
    current: FutureDesignStyleMutationAuthority,
    ledger: NonNullable<DesignStyleDraftHydrationResult["ledger"]>,
  ) => {
    const latest = futureDesignStyleMutationAuthorityRef.current;
    if (
      !latest ||
      latest.identityKey !== current.identityKey ||
      latest.identityGeneration !== current.identityGeneration ||
      latest.runtimeGeneration !== current.runtimeGeneration ||
      !designStyleStepTargetsEqual(latest.activeTarget, current.activeTarget)
    ) {
      rejectFutureDesignStyleMutation("STALE_RUNTIME_GENERATION");
      return;
    }
    const nextHydration = applyDesignStyleStepLedgerToHydration({
      hydration: current.hydration,
      ledger,
      activeOccurrences: current.activeOccurrences,
      authority: current.authority,
    });
    publishFutureDesignStyleHydration({
      identityKey: current.identityKey,
      identityGeneration: current.identityGeneration,
      result: nextHydration,
    });
    setFutureDesignStyleMutationError(null);
  };

  const handleSelectFutureDesignStyleOccurrence = (
    target: DesignStyleStepClearMutationRequest["target"],
  ) => {
    const current = futureDesignStyleMutationAuthorityRef.current;
    const targetIsCurrent = current?.occurrenceTargets.some((candidate) =>
      designStyleStepTargetsEqual(candidate, target),
    );
    if (!current?.stepIsActive || !targetIsCurrent) {
      rejectFutureDesignStyleMutation("STALE_ACTIVE_OCCURRENCE");
      return;
    }
    setFutureDesignStyleMutationError(null);
    setFutureActiveDesignStyleOccurrence(target);
  };

  const handleAssignFutureCatalogueStyle = (
    requests: readonly DesignStyleStepCatalogMutationRequest[],
  ) => {
    const current = futureDesignStyleMutationAuthorityRef.current;
    const ledger = current?.hydration.ledger || null;
    if (!current || !ledger) {
      rejectFutureDesignStyleMutation("HYDRATION_NOT_MUTABLE");
      return;
    }
    const result = assignCatalogueStyleToOccurrencesThroughStepRuntime({
      ledger,
      activeOccurrences: current.activeOccurrences,
      authority: current.authority,
      requests,
      currentRuntimeGeneration: current.runtimeGeneration,
      stepIsActive: current.stepIsActive,
      hydrationMutable:
        current.hydration.canAutosave &&
        !current.hydration.destructiveNormalizationProhibited,
    });
    if (result.status === "rejected") {
      rejectFutureDesignStyleMutation(result.reason);
      return;
    }
    applyFutureDesignStyleMutationLedger(current, result.ledger);
  };

  const queueUploadedSourceCleanupCandidate = ({
    source,
    sourceRef,
    reason,
    ledger,
    identityKey,
    identityGeneration,
  }: {
    source: UploadedDesignSource | undefined;
    sourceRef: string;
    reason: "detach" | "replacement";
    ledger: NonNullable<DesignStyleDraftHydrationResult["ledger"]>;
    identityKey: string;
    identityGeneration: number;
  }) => {
    if (!source || source.uploadReference.designReferenceId !== sourceRef) return;
    const candidate = createUploadedSourceCleanupCandidate({
      sourceRef,
      reason,
      draftIdentity: identityKey,
      // The mutation has already published its ledger; the next autosave is
      // the only save that may establish this candidate's proof.
      expectedSaveGeneration: futureDraftAutosaveGenerationRef.current + 1,
      expectedIdentityGeneration: identityGeneration,
      ledger,
    });
    if (!candidate) return;
    const authority =
      futureDesignStyleDraftAuthority.uploadedSourcesByKey[source.sourceKey];
    const confirmation =
      authority?.status === "confirmed" &&
      authority.sourceKey === source.sourceKey &&
      authority.uploadedSourceRef === sourceRef
        ? {
            sourceKey: source.sourceKey,
            uploadedSourceRef: sourceRef,
            ownerUid: source.uploadReference.ownerUid,
          }
        : null;
    uploadedSourceCleanupCandidatesRef.current.set(sourceRef, {
      candidate,
      reference: source.uploadReference,
      confirmation,
    });
  };

  const handleClearFutureDesignStyleAssignment = (
    request: DesignStyleStepClearMutationRequest,
  ) => {
    const current = futureDesignStyleMutationAuthorityRef.current;
    const ledger = current?.hydration.ledger || null;
    if (!current || !ledger) {
      rejectFutureDesignStyleMutation("HYDRATION_NOT_MUTABLE");
      return;
    }
    const assignment = ledger.assignmentsByGarmentKey[request.target.garmentKey];
    const pendingUpload =
      futureDesignStyleUploadUiByGarmentKey[request.target.garmentKey];
    if (
      assignment?.sourceKind === "uploaded" &&
      assignment.occurrenceToken === request.target.occurrenceToken
    ) {
      const result = detachUploadedStyleThroughStepRuntime({
        ledger,
        activeOccurrences: current.activeOccurrences,
        activeTarget: current.activeTarget,
        request,
        currentRuntimeGeneration: current.runtimeGeneration,
        stepIsActive: current.stepIsActive,
        hydrationMutable:
          current.hydration.canAutosave &&
          !current.hydration.destructiveNormalizationProhibited,
        uploadOperationPending: Boolean(
          pendingUpload?.status === "pending" &&
            pendingUpload.occurrenceToken === request.target.occurrenceToken,
        ),
        deletionProof: {},
      });
      if (result.status !== "detached") {
        rejectFutureDesignStyleMutation(
          result.status === "rejected" ? result.reason : undefined,
        );
        return;
      }
      futureDesignStyleDetachedSourceLifecycleRef.current = result.lifecycle;
      queueUploadedSourceCleanupCandidate({
        source: futureDesignStyleUploadedSourceByGarmentKey[
          request.target.garmentKey
        ],
        sourceRef: result.lifecycle.sourceRef,
        reason: "detach",
        ledger: result.ledger,
        identityKey: current.identityKey,
        identityGeneration: current.identityGeneration,
      });
      applyFutureDesignStyleMutationLedger(current, result.ledger);
      return;
    }

    const result = clearCatalogueStyleThroughStepRuntime({
      ledger,
      activeOccurrences: current.activeOccurrences,
      activeTarget: current.activeTarget,
      request,
      currentRuntimeGeneration: current.runtimeGeneration,
      stepIsActive: current.stepIsActive,
      hydrationMutable:
        current.hydration.canAutosave &&
        !current.hydration.destructiveNormalizationProhibited,
    });
    if (result.status === "rejected") {
      rejectFutureDesignStyleMutation(result.reason);
      return;
    }
    applyFutureDesignStyleMutationLedger(current, result.ledger);
  };

  const clearFutureDesignStyleUploadUi = (
    ticket: DesignStyleUploadOperationTicket,
  ) => {
    setFutureDesignStyleUploadUiByGarmentKey((current) => {
      const existing = current[ticket.garmentKey];
      if (
        !existing ||
        existing.occurrenceToken !== ticket.occurrenceToken ||
        existing.operationGeneration !== ticket.operationGeneration
      ) {
        return current;
      }
      const { [ticket.garmentKey]: _cleared, ...remaining } = current;
      return remaining;
    });
  };

  const setFutureDesignStyleUploadUiForTicket = (
    ticket: DesignStyleUploadOperationTicket,
    next: Omit<FutureDesignStyleUploadUiState, "garmentKey" | "occurrenceToken" | "operationGeneration">,
  ) => {
    setFutureDesignStyleUploadUiByGarmentKey((current) => {
      const existing = current[ticket.garmentKey];
      if (
        existing &&
        (existing.occurrenceToken !== ticket.occurrenceToken ||
          existing.operationGeneration > ticket.operationGeneration)
      ) {
        return current;
      }
      const preservedPreviewUrl =
        existing?.occurrenceToken === ticket.occurrenceToken
          ? existing.previewUrl
          : undefined;
      return {
        ...current,
        [ticket.garmentKey]: {
          garmentKey: ticket.garmentKey,
          occurrenceToken: ticket.occurrenceToken,
          operationGeneration: ticket.operationGeneration,
          ...(preservedPreviewUrl ? { previewUrl: preservedPreviewUrl } : {}),
          ...next,
        },
      };
    });
  };

  const finishFutureDesignStyleUploadWithoutMutation = ({
    ticket,
    ledger,
    showError,
    message,
  }: {
    ticket: DesignStyleUploadOperationTicket;
    ledger: NonNullable<DesignStyleDraftHydrationResult["ledger"]>;
    showError: boolean;
    message?: string;
  }) => {
    const before = futureDesignStyleUploadOperationStateRef.current;
    const failed = failDesignStyleUploadOperation({
      state: before,
      ticket,
      ledger,
      reason: "external-operation-failed",
    });
    futureDesignStyleUploadOperationStateRef.current = failed.state;
    if (failed.state === before) return;
    if (showError) {
      setFutureDesignStyleUploadUiForTicket(ticket, {
        status: "error",
        message:
          message ||
          "The design could not be prepared. Your previous selection is unchanged. Try again.",
      });
    } else {
      clearFutureDesignStyleUploadUi(ticket);
    }
  };

  const handleFutureDesignStyleUploadFile = async (
    target: DesignStyleStepClearMutationRequest["target"],
    file: File,
  ) => {
    const captured = futureDesignStyleMutationAuthorityRef.current;
    const ledger = captured?.hydration.ledger || null;
    if (
      !captured ||
      !ledger ||
      !captured.stepIsActive ||
      !captured.hydration.canAutosave ||
      captured.hydration.destructiveNormalizationProhibited ||
      !designStyleStepTargetsEqual(captured.activeTarget, target)
    ) {
      rejectFutureDesignStyleMutation("STALE_ACTIVE_OCCURRENCE");
      return;
    }
    const existingAssignment = ledger.assignmentsByGarmentKey[target.garmentKey];
    const operationKind = existingAssignment ? "replace" : "assign";
    const started = beginDesignStyleUploadForActiveOccurrence({
      state: futureDesignStyleUploadOperationStateRef.current,
      ledger,
      activeOccurrences: captured.activeOccurrences,
      activeTarget: target,
      operationKind,
    });
    if (started.status === "rejected") {
      rejectFutureDesignStyleMutation(started.reason);
      return;
    }
    futureDesignStyleUploadOperationStateRef.current = started.state;
    setFutureDesignStyleUploadUiForTicket(started.ticket, { status: "pending" });
    const precanonicalCleanupOperation =
      designStylePrecanonicalUploadCleanupCoordinator.registerOperation({
        operationGeneration: started.ticket.operationGeneration,
        garmentKey: started.ticket.garmentKey,
        occurrenceToken: started.ticket.occurrenceToken,
      });

    await runUploadedDesignOperation({
      coordinator: uploadedDesignOperationCoordinatorRef.current,
      kind: "upload",
      onBegin: (operation) => {
        uploadedDesignOperationGenerationRef.current = operation.generation;
        uploadedDesignOperationPendingRef.current = true;
        setIsUploadingDesign(true);
      },
      validate: () =>
        CustomerDesignUploadService.validateCustomerDesignFile(file),
      execute: async () => {
        const uploadIdentity = await ensureCustomerUploadIdentity();
        const ownerBinding =
          designStylePrecanonicalUploadCleanupCoordinator.bindOriginalOwner(
            precanonicalCleanupOperation,
            uploadIdentity.uid,
          );
        if (ownerBinding.status === "rejected") {
          throw new Error("PRECANONICAL_UPLOAD_OWNER_BINDING_FAILED");
        }
        const reference =
          await CustomerDesignUploadService.uploadCustomerDesignDraft(file);
        const referenceBinding =
          designStylePrecanonicalUploadCleanupCoordinator.attachReference(
            precanonicalCleanupOperation,
            reference,
          );
        if (referenceBinding.status === "rejected") {
          throw new Error("PRECANONICAL_UPLOAD_REFERENCE_BINDING_FAILED");
        }
        const source = createUploadedDesignSourceWhenReady({
          uploadReference: reference,
          fabricCapacityComposition: mergeUploadedDesignCompositionWithStep1({
            step1GarmentTypes: garmentTypeSelection.garmentTypes,
            additionalGarmentTypes: [],
            preservedHiddenComposition: [],
          }),
          demographic: garmentTypeSelection.demographic,
        });
        if (!source) {
          throw new Error("UPLOADED_DESIGN_SOURCE_NOT_READY");
        }
        return source;
      },
      onSuccess: (source) => {
        const latest = futureDesignStyleMutationAuthorityRef.current;
        const latestLedger = latest?.hydration.ledger || null;
        if (
          !latest ||
          !latestLedger ||
          latest.identityKey !== captured.identityKey ||
          latest.identityGeneration !== captured.identityGeneration ||
          latest.runtimeGeneration !== captured.runtimeGeneration ||
          !latest.stepIsActive ||
          !latest.activeTarget
        ) {
          finishFutureDesignStyleUploadWithoutMutation({
            ticket: started.ticket,
            ledger: latestLedger || ledger,
            showError: false,
          });
          designStylePrecanonicalUploadCleanupCoordinator.markDiscarded(
            precanonicalCleanupOperation,
          );
          return;
        }
        const result = applyDesignStyleUploadForActiveOccurrence({
          state: futureDesignStyleUploadOperationStateRef.current,
          ticket: started.ticket,
          ledger: latestLedger,
          activeOccurrences: latest.activeOccurrences,
          activeTarget: latest.activeTarget,
          operationKind,
          source: {
            sourceKey: source.sourceKey,
            uploadedSourceRef: source.uploadReference.designReferenceId,
          },
        });
        if (result.status === "rejected") {
          finishFutureDesignStyleUploadWithoutMutation({
            ticket: started.ticket,
            ledger: latestLedger,
            showError: false,
          });
          designStylePrecanonicalUploadCleanupCoordinator.markDiscarded(
            precanonicalCleanupOperation,
          );
          return;
        }
        futureDesignStyleUploadOperationStateRef.current = result.state;
        if (result.assignmentResult.status === "rejected") {
          setFutureDesignStyleUploadUiForTicket(started.ticket, {
            status: "error",
            message:
              "The uploaded design could not be assigned safely. Your previous selection is unchanged. Try again.",
          });
          designStylePrecanonicalUploadCleanupCoordinator.markDiscarded(
            precanonicalCleanupOperation,
          );
          return;
        }

        const previousPreviewUrl =
          futureDesignStyleUploadPreviewUrlByGarmentKeyRef.current[
            started.ticket.garmentKey
          ];
        const previousAssignment =
          result.assignmentResult.status === "applied"
            ? result.assignmentResult.previousAssignment
            : null;
        if (previousAssignment?.sourceKind === "uploaded") {
          queueUploadedSourceCleanupCandidate({
            source: futureDesignStyleUploadedSourceByGarmentKey[
              started.ticket.garmentKey
            ],
            sourceRef: previousAssignment.uploadedSourceRef,
            reason: "replacement",
            ledger: result.ledger,
            identityKey: latest.identityKey,
            identityGeneration: latest.identityGeneration,
          });
        }
        if (previousPreviewUrl) URL.revokeObjectURL(previousPreviewUrl);
        const previewUrl = URL.createObjectURL(file);
        futureDesignStyleUploadPreviewUrlByGarmentKeyRef.current[
          started.ticket.garmentKey
        ] = previewUrl;
        setFutureDesignStyleUploadedSourceByGarmentKey((current) => ({
          ...current,
          [started.ticket.garmentKey]: source,
        }));
        setFutureDesignStyleUploadUiForTicket(started.ticket, {
          status: "success",
          previewUrl,
        });
        applyFutureDesignStyleMutationLedger(latest, result.ledger);
        const canonicalHandoff =
          designStylePrecanonicalUploadCleanupCoordinator.acceptCanonical(
            precanonicalCleanupOperation,
            source.uploadReference,
          );
        if (canonicalHandoff.status === "rejected") {
          throw new Error("PRECANONICAL_UPLOAD_CANONICAL_HANDOFF_FAILED");
        }
      },
      onError: (error) => {
        designStylePrecanonicalUploadCleanupCoordinator.markDiscarded(
          precanonicalCleanupOperation,
        );
        const latestLedger =
          futureDesignStyleMutationAuthorityRef.current?.hydration.ledger ||
          ledger;
        finishFutureDesignStyleUploadWithoutMutation({
          ticket: started.ticket,
          ledger: latestLedger,
          showError: true,
          message: getCustomerDesignUploadErrorMessage(error),
        });
      },
      onFinish: (operation) => {
        if (
          uploadedDesignOperationGenerationRef.current === operation.generation
        ) {
          uploadedDesignOperationPendingRef.current = false;
          setIsUploadingDesign(false);
        }
      },
    });
    designStylePrecanonicalUploadCleanupCoordinator.settleUpload(
      precanonicalCleanupOperation,
    );
    const cleanupSnapshot =
      designStylePrecanonicalUploadCleanupCoordinator.getSnapshot(
        precanonicalCleanupOperation,
      );
    if (cleanupSnapshot?.disposition !== "accepted-canonical") {
      designStylePrecanonicalUploadCleanupCoordinator.markDiscarded(
        precanonicalCleanupOperation,
      );
      const cleanup =
        await designStylePrecanonicalUploadCleanupCoordinator.cleanupDiscarded(
          precanonicalCleanupOperation,
          () => auth.currentUser,
        );
      if (
        cleanup.status === "discarded-cleanup-failed" ||
        cleanup.status === "discarded-cleanup-blocked"
      ) {
        setFutureDesignStyleUploadUiForTicket(started.ticket, {
          status: "error",
          message:
            "The unused upload could not be safely removed. It was not assigned. Please try again before signing in.",
        });
      }
    }
  };

  const isStageHistoricallyUnlocked = (stageId: DesignStudioStageId): boolean => {
    const index = DESIGN_STUDIO_STEPS.findIndex((step) => step.id === stageId);
    return index >= 0 && index <= highestUnlockedStageIndex;
  };
  const handleOpenDormantFabricStage = () => {
    if (
      !garmentTypeStageCompletion.isComplete &&
      !isStageHistoricallyUnlocked("fabric")
    ) {
      return;
    }
    setFutureStageId("fabric");
  };
  const handleOpenDormantDesignStyleStage = () => {
    if (
      !futureFabricStageCompletion.isComplete &&
      !isStageHistoricallyUnlocked("design_style")
    ) {
      return;
    }
    setFutureStageId("design_style");
  };
  const handleContinueWithUploadedDesign = () => {
    if (!activeUploadedDesignSource) return;
    const uploadReadiness = evaluateAuthoritativeUploadedDesignReadiness({
      uploadInput: {
        uploadReference: activeUploadedDesignSource.uploadReference,
        fabricCapacityComposition:
          activeUploadedDesignSource.fabricCapacityComposition,
        demographic: activeUploadedDesignSource.demographic,
      },
      step1GarmentTypes: garmentTypeSelection.garmentTypes,
      designSource: activeUploadedDesignSource,
      confirmedDesignSourceKey: futureConfirmedDesignSourceKey,
    });
    if (!uploadReadiness.isReady) {
      if (uploadReadiness.needsReview) {
        setUploadedDesignError(UPLOADED_DESIGN_COMPOSITION_NEEDS_REVIEW_MESSAGE);
      } else if (uploadReadiness.missingRequiredStep1Garments) {
        setUploadedDesignError(
          UPLOADED_DESIGN_MISSING_REQUIRED_STEP1_GARMENTS_MESSAGE,
        );
      }
      return;
    }
    setFutureConfirmedDesignSourceKey(activeUploadedDesignSource.sourceKey);
    setFuturePriceActivatedFabricCode(null);
    setFutureStageId("fabric");
  };
  // Task 5E will reconnect these existing upload operations to exact occurrence
  // targets. Task 5D deliberately leaves them off the active Step 3 surface.
  void [
    handleUploadedDesignFile,
    handleUploadedDesignCompositionToggle,
    handleUploadedDesignDemographicChange,
    handleRemoveUploadedDesign,
    handleSelectFutureStyle,
    handleRetryUploadedDesignDeletion,
    handleContinueWithUploadedDesign,
  ];
  const handleOpenDormantCustomDetailsStage = () => {
    if (
      (!futureFabricStageCompletion.isComplete ||
        !isFutureDesignSourceReadyForCustomDetails) &&
      !isStageHistoricallyUnlocked("custom_details")
    ) {
      return;
    }
    setFutureStageId("custom_details");
  };
  const handleOpenDormantAiTryOnStage = () => {
    if (
      !isFutureCustomDetailsStageReady &&
      !isStageHistoricallyUnlocked("try_on")
    ) {
      return;
    }
    setFutureStageId("try_on");
  };
  const handleOpenDormantMeasurementStage = () => {
    if (
      !isFutureMeasurementStageUnlocked(futureAiTryOnWorkflow) &&
      !isStageHistoricallyUnlocked("measurement")
    ) {
      return;
    }
    setFutureStageId("measurement");
  };
  const handleOpenDormantSummaryStage = () => {
    if (
      !isFutureSummaryStageUnlocked &&
      !isStageHistoricallyUnlocked("summary")
    ) {
      return;
    }
    setFutureStageId("summary");
  };
  const handleOpenDormantShippingStage = () => {
    if (
      !isFutureShippingUnlocked &&
      !isStageHistoricallyUnlocked("shipping")
    ) {
      return;
    }
    setFutureStageId("shipping");
  };
  const buildCurrentFutureOrderCandidateV2 = (): FutureOrderCandidateV2BuildResult => {
    const ledger = currentFutureDesignStyleDraftHydration?.result.ledger;
    if (!ledger) {
      return {
        status: "blocked",
        candidate: null,
        blockers: [
          {
            code: "DESIGN_STYLE_ASSIGNMENT_INVALID",
            stage: "design_style",
            message: "Design Style assignments are not ready for review.",
          },
        ],
      };
    }
    return buildFutureOrderCandidateV2({
      coreInput: {
        ...futureSummaryInput,
        source: activeFutureDesignSource,
        shippingResolution: futureShippingResolution,
      },
      ledger,
      validationAuthority: futureDesignStyleDraftAuthority,
      styles,
      uploadedAuthorityBySourceRef:
        futurePaymentReviewUploadedAuthorityBySourceRef,
    });
  };
  const handleOpenDormantPaymentReviewStage = () => {
    futureOrderV2PreparationRef.current = null;
    futureOrderV2PreparationInFlightRef.current = false;
    futureOrderV2PaymentAttemptRef.current = null;
    futureOrderV2PaymentInFlightRef.current = false;
    const result = buildCurrentFutureOrderCandidateV2();
    if (result.status !== "valid") {
      setFuturePaymentReviewHandoff(null);
      setFuturePaymentReviewTransitionBlockers(result.blockers);
      return;
    }
    setFuturePaymentReviewTransitionBlockers([]);
    setFuturePaymentReviewHandoff(
      createFutureOrderV2PaymentReviewHandoff(result.candidate),
    );
    setFutureStageId("payment");
  };
  const handlePrepareFutureOrderV2 = async () => {
    if (futureOrderV2PreparationInFlightRef.current) return;
    const reviewed = futurePaymentReviewHandoff?.candidate;
    if (!reviewed) return;
    const firebaseUser = firebaseDraftAuth.user || auth.currentUser;
    if (
      !firebaseDraftAuth.resolved ||
      !firebaseUser ||
      firebaseUser.isAnonymous
    ) {
      setFuturePaymentReviewHandoff(
        createFutureOrderV2PaymentReviewHandoff(reviewed, {
          status: "authentication_required",
          message:
            "Sign in with a non-anonymous account before preparing this order.",
        }),
      );
      return;
    }

    futureOrderV2PreparationInFlightRef.current = true;
    setFuturePaymentReviewHandoff(
      createFutureOrderV2PaymentReviewHandoff(reviewed, {
        status: "preparing",
      }),
    );
    const outcome = await prepareFutureOrderV2Submission({
      reviewed,
      fresh: buildCurrentFutureOrderCandidateV2(),
      identity: { uid: firebaseUser.uid, isAnonymous: firebaseUser.isAnonymous },
      existingAttempt: futureOrderV2PreparationRef.current,
      persist: persistFutureOrderV2,
    });
    futureOrderV2PreparationInFlightRef.current = false;
    if (outcome.status === "invalid_current") {
      futureOrderV2PreparationRef.current = null;
      const nextStage =
        outcome.blockers.find((blocker) => blocker.stage !== "payment")?.stage ||
        "shipping";
      setFuturePaymentReviewHandoff(null);
      setFuturePaymentReviewTransitionBlockers(outcome.blockers);
      setFutureStageId(nextStage);
      return;
    }
    if (outcome.status === "review_refresh_required") {
      futureOrderV2PreparationRef.current = null;
      setFuturePaymentReviewTransitionBlockers([]);
      setFuturePaymentReviewHandoff(
        createFutureOrderV2PaymentReviewHandoff(outcome.candidate, {
          status: "review_required",
        }),
      );
      return;
    }
    if (outcome.status === "authentication_required") {
      setFuturePaymentReviewHandoff(
        createFutureOrderV2PaymentReviewHandoff(reviewed, {
          status: "authentication_required",
          message:
            "Sign in with a non-anonymous account before preparing this order.",
        }),
      );
      return;
    }
    if (outcome.status === "preparation_invalid") {
      setFuturePaymentReviewHandoff(
        createFutureOrderV2PaymentReviewHandoff(outcome.candidate, {
          status: "error",
          message: "This order could not be prepared safely. Review the highlighted details.",
        }),
      );
      return;
    }
    futureOrderV2PreparationRef.current = outcome.attempt;
    if (outcome.status === "prepared") {
      setFuturePaymentReviewHandoff(
        createFutureOrderV2PaymentReviewHandoff(outcome.attempt.candidate, {
          status: "prepared",
          cartItemId: outcome.attempt.cartItemId,
          orderId: outcome.attempt.orderId,
        }),
      );
      return;
    }
    setFuturePaymentReviewHandoff(
      createFutureOrderV2PaymentReviewHandoff(outcome.attempt.candidate, {
        status: "error",
        message:
          outcome.result?.status === "conflict"
            ? "This order ID cannot be prepared safely. Your reviewed order was not replaced."
            : "We could not confirm order preparation. Retry using the same reviewed order.",
      }),
    );
  };
  const handleExecuteFutureOrderV2Payment = async () => {
    if (futureOrderV2PaymentInFlightRef.current) return;
    const reviewed = futurePaymentReviewHandoff;
    const prepared = futureOrderV2PreparationRef.current;
    if (
      !reviewed ||
      reviewed.preparation.status !== "prepared" ||
      !prepared ||
      reviewed.preparation.orderId !== prepared.orderId ||
      reviewed.preparation.cartItemId !== prepared.cartItemId ||
      reviewed.payment.status === "authorized"
    ) {
      return;
    }

    futureOrderV2PaymentInFlightRef.current = true;
    const existingAttempt = futureOrderV2PaymentAttemptRef.current;
    const paymentReference =
      existingAttempt?.orderId === prepared.orderId
        ? existingAttempt.paymentReference
        : `future-v2-payment-${prepared.orderId}`;
    setFuturePaymentReviewHandoff(
      createFutureOrderV2PaymentReviewHandoff(
        reviewed.candidate,
        reviewed.preparation,
        { status: "processing", paymentReference },
      ),
    );
    const outcome = await executeFutureOrderV2Payment({
      prepared,
      existingAttempt,
      authorize: authorizeFutureOrderV2Payment,
    });
    futureOrderV2PaymentInFlightRef.current = false;
    if (outcome.status === "invalid") {
      setFuturePaymentReviewHandoff(
        createFutureOrderV2PaymentReviewHandoff(
          reviewed.candidate,
          reviewed.preparation,
          { status: "failed", paymentReference, message: outcome.message },
        ),
      );
      return;
    }
    futureOrderV2PaymentAttemptRef.current = outcome.attempt;
    setFuturePaymentReviewHandoff(
      createFutureOrderV2PaymentReviewHandoff(
        reviewed.candidate,
        reviewed.preparation,
        outcome.status === "authorized"
          ? {
              status: "authorized",
              paymentReference: outcome.attempt.paymentReference,
              providerTransactionReference: outcome.providerTransactionReference,
            }
          : {
              status: "failed",
              paymentReference: outcome.attempt.paymentReference,
              message: outcome.message,
            },
      ),
    );
  };
  const handleLiveOrderSummaryEdit = (stage: DesignStudioStageId) => {
    if (!isStageHistoricallyUnlocked(stage)) return;
    if (stage === "garment_type") {
      setFutureStageId("garment_type");
      return;
    }
    if (stage === "fabric") {
      handleOpenDormantFabricStage();
      return;
    }
    if (stage === "design_style") {
      handleOpenDormantDesignStyleStage();
      return;
    }
    if (stage === "custom_details") {
      handleOpenDormantCustomDetailsStage();
      return;
    }
    if (stage === "measurement") {
      handleOpenDormantMeasurementStage();
      return;
    }
    if (stage === "shipping") {
      handleOpenDormantShippingStage();
    }
  };
  const handleRefreshDormantShippingQuote = () => {
    setFutureShippingState(
      refreshFutureShippingQuote({
        state: futureShippingResolution.state,
        garmentCount: futureGarmentPieceCount,
        selectedDesignPrice: futureSelectedDesignPrice,
      }).state,
    );
  };
  const handleRetryDormantAiTryOn = () => {
    setFutureAiTryOnWorkflow((current) => {
      const transition = transitionAiTryOnWorkflow({
        state: current,
        event: { type: "retry" },
        skipAllowed: true,
      });
      return transition.ok
        ? reconcileAiTryOnWorkflow({
            state: transition.state,
            currentInputFingerprint: futureAiTryOnInputFingerprint,
            policy: { gatewayAvailable: false, skipAllowed: true },
          })
        : current;
    });
  };
  const handleSkipDormantAiTryOn = () => {
    const transition = transitionAiTryOnWorkflow({
      state: futureAiTryOnWorkflow,
      event: { type: "skip" },
      skipAllowed: true,
    });
    if (!transition.ok) return;
    setFutureAiTryOnWorkflow(transition.state);
    setFutureStageId("measurement");
  };
  const handleFutureMeasurementRouteChange = (route: MeasurementRiskRoute) => {
    setFutureMeasurementState((current) =>
      setFutureMeasurementRoute(current, route),
    );
  };
  const updateFutureScopedCustomDetails = (
    update: (current: DesignSelections) => DesignSelections,
  ) => {
    setDesignSelections((current) => {
      const proposed = update(current);
      const reconciliation = reconcileGarmentScopedCustomDetails({
        garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
        additionalGarments: futureAdditionalGarments,
        additionalGarmentConstructions:
          futureAdditionalConstructionReconciliation.state,
        style: futureDesignStyleSelection.selectedStyle,
        catalogInspection: futureCatalogInspection,
        existingState: proposed.garmentScopedCustomDetails,
      });
      const personalizedInputs = reconcileGarmentScopedPersonalizedInputs({
        reconciliation,
        catalogInspection: futureCatalogInspection,
        existingInputs: proposed.garmentScopedCustomDetailInputs,
      });
      return {
        ...proposed,
        garmentScopedCustomDetails: reconciliation.state,
        garmentScopedCustomDetailInputs: personalizedInputs.state,
      };
    });
  };
  const handleFutureSingleCustomDetailSelect = (
    garmentKey: string,
    selectionGroup: CustomDetailSelectionGroup,
    optionId: string,
  ) => {
    updateFutureScopedCustomDetails((current) => ({
      ...current,
      garmentScopedCustomDetails: setGarmentScopedCustomDetailSelection(
        current.garmentScopedCustomDetails || {
          schemaVersion: 1,
          selectionsByGarmentKey: {},
          snapshotsByGarmentKey: {},
        },
        garmentKey,
        selectionGroup,
        optionId,
      ),
    }));
  };
  const handleFutureCustomDetailClear = (
    garmentKey: string,
    selectionGroup: CustomDetailSelectionGroup,
  ) => {
    updateFutureScopedCustomDetails((current) => ({
      ...current,
      garmentScopedCustomDetails: clearGarmentScopedCustomDetailSelection(
        current.garmentScopedCustomDetails || {
          schemaVersion: 1,
          selectionsByGarmentKey: {},
          snapshotsByGarmentKey: {},
        },
        garmentKey,
        selectionGroup,
      ),
    }));
  };
  const handleFutureConstructionSelect = (
    parentGarmentKey: string,
    garmentType: CanonicalPhysicalGarmentType,
    selectionGroup: CustomDetailSelectionGroup,
    optionId: string,
  ) => {
    if (parentGarmentKey.startsWith("base:")) {
      setGarmentTypeSelection((current) => {
        const resolution = current.constructionByGarment[garmentType];
        if (!resolution) return current;
        const selected = selectGarmentConstructionOption({
          resolution,
          selectionGroup,
          optionId,
          normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
        });
        return selected.status === "selected"
          ? {
              ...current,
              constructionByGarment: {
                ...current.constructionByGarment,
                [garmentType]: selected.resolution,
              },
            }
          : current;
      });
      return;
    }
    setDesignSelections((current) => ({
      ...current,
      additionalGarmentConstructions:
        selectAdditionalGarmentConstructionOption({
          state:
            current.additionalGarmentConstructions ||
            createEmptyAdditionalGarmentConstructionState(),
          garmentKey: parentGarmentKey,
          selectionGroup,
          optionId,
          normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
        }),
    }));
  };
  const handleFutureMultiCustomDetailToggle = (
    garmentKey: string,
    selectionGroup: CustomDetailSelectionGroup,
    optionId: string,
  ) => {
    updateFutureScopedCustomDetails((current) => {
      const state = current.garmentScopedCustomDetails || {
        schemaVersion: 1 as const,
        selectionsByGarmentKey: {},
        snapshotsByGarmentKey: {},
      };
      const selection = getGarmentScopedCustomDetailSelection(
        state,
        garmentKey,
        selectionGroup,
      );
      const selectedIds = Array.isArray(selection)
        ? selection
        : selection
          ? [selection]
          : [];
      const nextSelection = selectedIds.includes(optionId)
        ? selectedIds.filter((id) => id !== optionId)
        : [...selectedIds, optionId];
      return {
        ...current,
        garmentScopedCustomDetails: setGarmentScopedCustomDetailSelection(
          state,
          garmentKey,
          selectionGroup,
          nextSelection,
        ),
      };
    });
  };
  const handleFuturePersonalizedTextChange = (
    garmentKey: string,
    selectionGroup: CustomDetailSelectionGroup,
    optionId: string,
    text: string,
  ) => {
    updateFutureScopedCustomDetails((current) => {
      const updated = setGarmentScopedCustomDetailText({
        state: current.garmentScopedCustomDetailInputs || {
          schemaVersion: 1,
          textByGarmentKey: {},
        },
        garmentKey,
        selectionGroup,
        optionId,
        text,
      });
      return {
        ...current,
        garmentScopedCustomDetailInputs: updated.state,
      };
    });
  };
  const handleFutureDecorativeFeatureToggle = (
    feature: DecorativeFeature,
  ) => {
    setDesignSelections((current) => {
      const selected = new Set(current.decorativeFeatures || []);
      if (selected.has(feature)) selected.delete(feature);
      else selected.add(feature);
      return {
        ...current,
        decorativeFeatures: sortDecorativeFeatures([...selected]),
      };
    });
  };
  const handleClearFutureDecorativeFeatures = () => {
    setDesignSelections((current) => ({
      ...current,
      decorativeFeatures: [],
      monogramPlacement: undefined,
    }));
  };
  const handleFutureMonogramPlacementChange = (
    placement: MonogramPlacement,
  ) => {
    setDesignSelections((current) => ({
      ...current,
      monogramPlacement: placement,
    }));
  };
  const handleFutureAccessoryToggle = (accessory: TraditionalAccessory) => {
    setDesignSelections((current) => {
      const selected = new Set(current.accessories || []);
      if (selected.has(accessory)) selected.delete(accessory);
      else selected.add(accessory);
      return {
        ...current,
        accessories: sortTraditionalAccessories([...selected]),
      };
    });
  };
  const handleClearFutureAccessories = () => {
    setDesignSelections((current) => ({ ...current, accessories: [] }));
  };
  const beginAdditionalGarmentFabricTransaction = (
    partial: Omit<AdditionalGarmentFabricTransaction, "transactionId">,
  ): AdditionalGarmentFabricTransaction => {
    additionalGarmentFabricTransactionIdRef.current += 1;
    return {
      ...partial,
      transactionId: additionalGarmentFabricTransactionIdRef.current,
    };
  };
  const restoreAdditionalGarmentFabricFocus = () => {
    const scrollY = additionalGarmentFabricScrollYRef.current;
    additionalGarmentFabricScrollYRef.current = null;
    window.setTimeout(() => {
      if (typeof scrollY === "number") {
        window.scrollTo({ top: scrollY, behavior: "auto" });
      }
      const trigger = additionalGarmentFabricTriggerRef.current;
      if (
        trigger?.isConnected &&
        !(trigger instanceof HTMLButtonElement && trigger.disabled)
      ) {
        trigger.focus({ preventScroll: true });
      }
    }, 0);
  };
  const getCurrentAdditionalGarmentFabricOperation = ({
    transactionId,
    garmentKey,
    occurrenceGeneration,
  }: {
    transactionId: number;
    garmentKey: string;
    occurrenceGeneration?: number;
  }): AdditionalGarmentFabricTransaction | null => {
    const currentTransaction =
      additionalGarmentFabricTransactionRef.current;
    if (
      !isCurrentAdditionalGarmentFabricOperation({
        currentTransaction,
        expectedTransactionId: transactionId,
        expectedGarmentKey: garmentKey,
      }) ||
      (occurrenceGeneration !== undefined &&
        currentTransaction?.occurrenceGeneration !== occurrenceGeneration)
    ) {
      return null;
    }
    if (currentTransaction?.origin === "new_addition") {
      const liveGeneration = getPhysicalGarmentOccurrenceGeneration(
        garmentTypeSelection.physicalOccurrenceIdentityState,
        garmentKey,
      );
      if (
        !currentTransaction.occurrenceGeneration ||
        liveGeneration !== currentTransaction.occurrenceGeneration
      ) {
        return null;
      }
    }
    return currentTransaction;
  };
  const cancelAdditionalGarmentFabricTransaction = ({
    transactionId,
    garmentKey,
    occurrenceGeneration,
  }: {
    transactionId: number;
    garmentKey: string;
    occurrenceGeneration?: number;
  }): boolean => {
    const transaction = getCurrentAdditionalGarmentFabricOperation({
      transactionId,
      garmentKey,
      occurrenceGeneration,
    });
    if (!transaction) return false;

    const fabricSnapshot = additionalGarmentFabricSnapshotRef.current;
    additionalGarmentFabricTransactionRef.current = null;
    setAdditionalGarmentFabricError(null);
    additionalGarmentFabricPersistentErrorGarmentKeyRef.current = null;
    setAdditionalGarmentFabricPersistentError(null);
    setAdditionalGarmentFabricTransaction(null);
    if (transaction.origin === "new_addition") {
      const cancellation = preparePendingAdditionalGarmentCancellationCommit({
        garmentKey: transaction.garmentKey,
        fabricAllocationState,
        designSelections,
      });
      revalidatePreservedFabricIntegrityAfterMutation({
        previousState: fabricAllocationState,
        nextState: fabricSnapshot || cancellation.fabricAllocationState,
        explicitlyRepairedGarmentKeys: [transaction.garmentKey],
      });
      setFabricAllocationState(
        fabricSnapshot || cancellation.fabricAllocationState,
      );
      setDesignSelections(cancellation.designSelections);
      setGarmentTypeSelection((current) =>
        reconcileGarmentTypeSelectionOccurrenceIdentities({
          selection: current,
          activeGarmentKeys: authoritativePhysicalOccurrencesForDomain
            .filter(
              (occurrence) =>
                occurrence.garmentKey !== transaction.garmentKey,
            )
            .map((occurrence) => occurrence.garmentKey),
        }),
      );
    }
    additionalGarmentFabricSnapshotRef.current = null;
    restoreAdditionalGarmentFabricFocus();
    return true;
  };
  const handleAddFutureAdditionalGarment = (
    garmentType: CanonicalPhysicalGarmentType,
    triggerElement?: HTMLElement | null,
  ) => {
    invalidateFutureGarmentRemovalRetention();
    setFutureCustomDetailsFocusGarmentKey(null);
    setAdditionalGarmentFabricError(null);
    additionalGarmentFabricPersistentErrorGarmentKeyRef.current = null;
    setAdditionalGarmentFabricPersistentError(null);
    additionalGarmentFabricAnnouncementGarmentKeyRef.current = null;
    setAdditionalGarmentFabricAnnouncement("");
    if (
      fabricAllocationState.pendingFabricGarment ||
      fabricAllocationState.awaitingFabricForPendingGarment ||
      additionalGarmentFabricTransactionRef.current
    ) {
      setNotification({
        message: "Finish the current fabric assignment before adding another garment.",
        type: "info",
      });
      return;
    }
    const addition = createCatalogueAdditionalGarmentSelection({
      garmentType,
      authoritativePhysicalOccurrences: authoritativePhysicalOccurrencesForDomain,
      authorizedOccurrenceKeys: Object.keys(
        futureAdditionalConstructionReconciliation.state.byGarmentKey,
      ),
    });
    const construction = resolveGarmentConstructionPricing(
      garmentType,
      normalizedGarmentTypeCatalog,
    );
    if (addition.status !== "resolved" || construction.status !== "resolved") {
      setNotification({
        message: "This garment construction price is not ready yet.",
        type: "info",
      });
      return;
    }
    const garmentKey = addition.selection.garmentSpec!.key;
    const identitySelection =
      reconcileGarmentTypeSelectionOccurrenceIdentities({
        selection: garmentTypeSelection,
        activeGarmentKeys: [
          ...authoritativePhysicalOccurrencesForDomain.map(
            (occurrence) => occurrence.garmentKey,
          ),
          garmentKey,
        ],
      });
    const occurrenceGeneration = getPhysicalGarmentOccurrenceGeneration(
      identitySelection.physicalOccurrenceIdentityState,
      garmentKey,
    );
    if (!occurrenceGeneration) {
      setNotification({
        message: "This garment could not be added. Your existing order was not changed.",
        type: "info",
      });
      return;
    }
    additionalGarmentFabricTriggerRef.current = triggerElement || null;
    additionalGarmentFabricScrollYRef.current =
      typeof window !== "undefined" ? window.scrollY : null;
    additionalGarmentFabricSnapshotRef.current = fabricAllocationState;

    const transactionBase = {
      origin: "new_addition" as const,
      garmentKey,
      garmentType,
      occurrenceGeneration,
      fabricUnits: addition.selection.garmentSpec!.fabricUnits,
      construction: cloneGarmentConstructionPricingResolution(construction),
    };
    const pendingTransaction = beginAdditionalGarmentFabricTransaction({
      ...transactionBase,
      phase: "catalogue",
      openedModal: true,
    });
    const activeAllocation = fabricAllocationState.fabricAllocations.find(
      (allocation) =>
        allocation.allocationId === fabricAllocationState.activeAllocationId,
    );

    const readyState = activeAllocation
      ? FabricAllocationStateEngine.activateAllocation(
          fabricAllocationState,
          activeAllocation.allocationId,
        )
      : fabricAllocationState;
    const pendingState =
      FabricAllocationStateEngine.beginPendingAdditionalGarmentSelection(
        readyState,
        addition.selection,
      );
    if (pendingState.pendingFabricGarment?.garmentKey !== garmentKey) {
      additionalGarmentFabricSnapshotRef.current = null;
      setNotification({
        message: "This garment could not be added. Your existing order was not changed.",
        type: "info",
      });
      return;
    }

    const activeFabricInfo = getActiveFabricForAdditionalGarmentPicker({
      fabrics,
      fabricAllocationState: pendingState,
    });
    const sameFabricAvailable = Boolean(
      activeAllocation && activeFabricInfo.resolution.status === "resolved",
    );
    const nextTransaction: AdditionalGarmentFabricTransaction = {
      ...pendingTransaction,
      phase: sameFabricAvailable ? "choice" : "catalogue",
      openedModal: true,
    };
    additionalGarmentFabricTransactionRef.current = nextTransaction;
    setGarmentTypeSelection(identitySelection);
    setFabricAllocationState(pendingState);
    setAdditionalGarmentFabricTransaction(nextTransaction);
  };
  const handleCompleteAdditionalGarmentCustomDetails = (
    request: AdditionalGarmentCustomDetailsRequest,
    choice: AdditionalGarmentCustomDetailsChoice,
  ): boolean => {
    const transaction = getCurrentAdditionalGarmentFabricOperation({
      transactionId: request.transactionId,
      garmentKey: request.garmentKey,
      occurrenceGeneration: request.occurrenceGeneration,
    });
    if (
      !transaction ||
      transaction.origin !== "new_addition" ||
      transaction.phase !== "custom_details_choice"
    ) {
      return false;
    }

    const sourceSubject =
      choice.mode === "copy"
        ? futureScopedCustomDetailsReconciliation.subjects.find(
            (subject) =>
              subject.parentGarmentKey === choice.sourceParentGarmentKey &&
              subject.parentGarmentType === transaction.garmentType,
          )
        : null;
    const sourceConstruction = sourceSubject
      ? sourceSubject.parentGarmentKey.startsWith("base:")
        ? garmentTypeSelection.constructionByGarment[transaction.garmentType]
        : futureAdditionalConstructionReconciliation.state.byGarmentKey[
            sourceSubject.parentGarmentKey
          ]
      : null;
    if (choice.mode === "copy" && !sourceSubject) {
      setNotification({
        message: "The garment selected for copying is no longer available.",
        type: "info",
      });
      return false;
    }
    if (choice.mode === "copy" && sourceConstruction?.status !== "resolved") {
      setNotification({
        message:
          "The source garment construction needs review before it can be copied.",
        type: "info",
      });
      return false;
    }
    const construction =
      choice.mode === "copy"
        ? sourceConstruction!
        : resolveGarmentConstructionPricing(
            transaction.garmentType,
            normalizedGarmentTypeCatalog,
          );
    if (construction.status !== "resolved") {
      setNotification({
        message: "This garment construction price is not ready yet.",
        type: "info",
      });
      return false;
    }

    const transactionWithCustomDetails: AdditionalGarmentFabricTransaction = {
      ...transaction,
      construction: cloneGarmentConstructionPricingResolution(construction),
      copyFromParentGarmentKey:
        choice.mode === "copy" ? choice.sourceParentGarmentKey : undefined,
    };
    const authorization = applyAdditionalGarmentConstructionAndCopy({
      current: designSelections,
      transaction: transactionWithCustomDetails,
      catalogInspection: futureCatalogInspection,
    });
    if (!authorization.applied) {
      setNotification({
        message:
          authorization.reason ||
          "This garment could not be added. Your existing order was not changed.",
        type: "info",
      });
      return false;
    }

    const finishingTransaction: AdditionalGarmentFabricTransaction = {
      ...transactionWithCustomDetails,
      phase: "awaiting_commit",
      openedModal: false,
      constructionAppliedForTransactionId: transaction.transactionId,
    };
    additionalGarmentFabricTransactionRef.current = finishingTransaction;
    setDesignSelections(authorization.next);
    setAdditionalGarmentFabricTransaction(finishingTransaction);
    return true;
  };
  const handleCancelAdditionalGarmentCustomDetails = (
    request: AdditionalGarmentCustomDetailsRequest,
  ): boolean =>
    cancelAdditionalGarmentFabricTransaction({
      transactionId: request.transactionId,
      garmentKey: request.garmentKey,
      occurrenceGeneration: request.occurrenceGeneration,
    });
  const handleRemoveFuturePhysicalGarmentOccurrence = ({
    garmentKey,
    expectedAuthoritySignature,
    originStage,
  }: {
    garmentKey: string;
    expectedAuthoritySignature: string;
    originStage: DesignStudioStageId;
  }) => {
    const currentAdditionalFabricTransaction =
      additionalGarmentFabricTransactionRef.current;
    const prepared = prepareFuturePhysicalGarmentRemovalTransaction({
      input: {
        targetGarmentKey: garmentKey,
        expectedAuthoritySignature,
        garmentTypeSelection,
        designSource: futureDesignSource,
        selectedStyle: futureDesignStyleSelection.selectedStyle,
        confirmedDesignSourceKey: futureConfirmedDesignSourceKey,
        uploadedCompositionMirror: uploadedDesignComposition,
        uploadedAdditionalGarmentTypes:
          uploadedDesignAdditionalGarmentTypes,
        additionalGarmentConstructionState:
          authoritativeAdditionalGarmentConstructionState,
        fabricAllocationState,
        garmentScopedCustomDetails:
          futureScopedCustomDetailsReconciliation?.state ||
          designSelections.garmentScopedCustomDetails || {
            schemaVersion: 1,
            selectionsByGarmentKey: {},
            snapshotsByGarmentKey: {},
          },
        garmentScopedCustomDetailInputs:
          futureScopedPersonalizedInputsReconciliation?.state ||
          designSelections.garmentScopedCustomDetailInputs || {
            schemaVersion: 1,
            textByGarmentKey: {},
          },
        measurementState: reconciledFutureMeasurementState,
        aiTryOnWorkflowState: futureAiTryOnWorkflow,
        shippingState: futureShippingResolution.state,
        normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
        aiTryOnPolicy: { gatewayAvailable: false, skipAllowed: true },
        pendingOperations: {
          protectedSourceMutationPending:
            uploadedDesignDeletionInFlightRef.current ||
            uploadedDesignOperationPendingRef.current ||
            isRemovingDesign ||
            isUploadingDesign ||
            isReplacingDesign,
          pickerGarmentKey:
            currentAdditionalFabricTransaction?.openedModal
              ? currentAdditionalFabricTransaction.garmentKey
              : null,
          additionalFabricTransactionGarmentKey:
            currentAdditionalFabricTransaction?.garmentKey || null,
          uploadOperationGeneration:
            uploadedDesignOperationGenerationRef.current,
        },
      },
      currentDesignSelections: designSelections,
      currentPriceActivatedFabricCode: futurePriceActivatedFabricCode,
    });
    if (prepared.status !== "removed") return prepared.result;

    // Task 4 owns the physical removal transaction. Reconcile its proven
    // survivor set into the Task 5A ledger here, using the exact target that
    // was current before React publishes the removal commit.
    const designStyleAuthority = futureDesignStyleMutationAuthorityRef.current;
    const designStyleLedger = designStyleAuthority?.hydration.ledger || null;
    const removalTarget = designStyleAuthority?.occurrenceTargets.find(
      (target) => target.garmentKey === prepared.result.removedOccurrence.garmentKey,
    );
    if (designStyleAuthority && designStyleLedger && removalTarget) {
      const styleRemoval = removeExactGarmentDesignStyleAssignment({
        ledger: designStyleLedger,
        expectedLedgerRevision: designStyleLedger.revision,
        target: removalTarget,
      });
      if (styleRemoval.status === "rejected") {
        setFutureDesignStyleMutationError(
          "Your Design Style choices changed before this garment could be removed. Review the garment and try again.",
        );
        return prepared.result;
      }
      const nextHydration = applyDesignStyleStepLedgerToHydration({
        hydration: designStyleAuthority.hydration,
        ledger: styleRemoval.ledger,
        activeOccurrences: prepared.result.survivorOccurrences,
        authority: designStyleAuthority.authority,
      });
      publishFutureDesignStyleHydration({
        identityKey: designStyleAuthority.identityKey,
        identityGeneration: designStyleAuthority.identityGeneration,
        result: nextHydration,
      });
    }

    const removalGeneration =
      ++futureGarmentRemovalGenerationRef.current;
    futureGarmentRemovalStageRetentionLeaseRef.current =
      createRemovalStageRetentionLease({
        result: prepared.result,
        originStage,
        removalGeneration,
        sessionIdentityKey: futureDraftIdentityKey,
      });

    const preservedRawFabricAllocations =
      preservedInvalidHydratedDraftFabricAllocationsRef.current;
    if (preservedRawFabricAllocations) {
      const repaired =
        revalidateHydratedFabricIntegrityAfterExplicitRepair({
          preservedRawFabricAllocations,
          previousRuntimeState: fabricAllocationState,
          nextRuntimeState: prepared.commit.fabricAllocationState,
          authoritativeOccurrenceKeys: new Set(
            prepared.result.survivorOccurrences.map(
              (occurrence) => occurrence.garmentKey,
            ),
          ),
          explicitlyRepairedGarmentKeys: [garmentKey],
        });
      preservedInvalidHydratedDraftFabricAllocationsRef.current =
        repaired.preservedRawFabricAllocations;
      setFutureDraftFabricIntegrityBlockers([
        ...repaired.integrity.diagnostics,
      ]);
    }

    applyFuturePhysicalGarmentRemovalCommit(prepared.commit, {
      setGarmentTypeSelection,
      setDesignSource: setFutureDesignSource,
      setConfirmedDesignSourceKey: setFutureConfirmedDesignSourceKey,
      setUploadedCompositionMirror: (composition) =>
        setUploadedDesignComposition(
          composition.map((spec) => ({ ...spec })),
        ),
      setUploadedAdditionalGarmentTypes: (garmentTypes) =>
        setUploadedDesignAdditionalGarmentTypes([...garmentTypes]),
      setFabricAllocationState,
      setDesignSelections,
      setMeasurementState: setFutureMeasurementState,
      setAiTryOnWorkflowState: setFutureAiTryOnWorkflow,
      setShippingState: setFutureShippingState,
      setSelectedFabricCode: (fabricCode) =>
        setSelectedFabric(
          fabrics.find((fabric) => fabric.code === fabricCode) || null,
        ),
      setPriceActivatedFabricCode: setFuturePriceActivatedFabricCode,
    });

    const transientPlan = projectFutureGarmentRemovalTransientPlan({
      result: prepared.result,
      currentAdditionalFabricTransaction,
      currentCustomDetailsFocusGarmentKey:
        futureCustomDetailsFocusGarmentKey,
    });
    if (transientPlan.clearAdditionalFabricTransaction) {
      additionalGarmentFabricTransactionRef.current = null;
      setAdditionalGarmentFabricTransaction(null);
      additionalGarmentFabricSnapshotRef.current = null;
      additionalGarmentFabricTriggerRef.current = null;
      additionalGarmentFabricScrollYRef.current = null;
      setAdditionalGarmentFabricError(null);
    }
    if (
      additionalGarmentFabricPersistentErrorGarmentKeyRef.current ===
      garmentKey
    ) {
      additionalGarmentFabricPersistentErrorGarmentKeyRef.current = null;
      setAdditionalGarmentFabricPersistentError(null);
    }
    if (
      additionalGarmentFabricAnnouncementGarmentKeyRef.current === garmentKey
    ) {
      additionalGarmentFabricAnnouncementGarmentKeyRef.current = null;
      setAdditionalGarmentFabricAnnouncement("");
    }
    if (
      transientPlan.nextCustomDetailsFocusGarmentKey !==
      futureCustomDetailsFocusGarmentKey
    ) {
      setFutureCustomDetailsFocusGarmentKey(
        transientPlan.nextCustomDetailsFocusGarmentKey,
      );
    }
    if (transientPlan.invalidateUploadedOperation) {
      invalidateUploadedDesignOperation();
    }
    return prepared.result;
  };
  const openFutureGarmentRemovalDialog = ({
    target,
    originStage,
    opener,
  }: {
    target: FutureGarmentRemovalTarget;
    originStage: FutureGarmentRemovalOriginStage;
    opener: HTMLButtonElement;
  }) => {
    if (
      !target.canRequestRemoval ||
      futurePhysicalGarmentRemovalAuthority.status !== "resolved" ||
      !futurePhysicalGarmentRemovalAuthority.physicalOccurrences.some(
        (occurrence) => occurrence.garmentKey === target.garmentKey,
      )
    ) {
      return;
    }
    const confirmationGeneration =
      ++futureGarmentRemovalConfirmationGenerationRef.current;
    const request: FutureGarmentRemovalDialogRequest = {
      target,
      expectedAuthoritySignature:
        futurePhysicalGarmentRemovalAuthority.signature,
      originStage,
      confirmationGeneration,
      opener,
      sessionIdentityKey: futureGarmentRemovalSessionIdentityKey,
    };
    futureGarmentRemovalConfirmingRef.current = false;
    futureGarmentRemovalProcessedGenerationRef.current = null;
    futureGarmentRemovalDialogRequestRef.current = request;
    setFutureGarmentRemovalDialogError(null);
    setFutureGarmentRemovalDialogConfirming(false);
    setFutureGarmentRemovalFocusRequest(null);
    setFutureGarmentRemovalDialogRequest(request);
  };

  const cancelFutureGarmentRemovalDialog = () => {
    const request = futureGarmentRemovalDialogRequestRef.current;
    if (!request || futureGarmentRemovalConfirmingRef.current) return;
    futureGarmentRemovalDialogRequestRef.current = null;
    setFutureGarmentRemovalDialogRequest(null);
    setFutureGarmentRemovalDialogError(null);
    setFutureGarmentRemovalDialogConfirming(false);
    setFutureGarmentRemovalFocusRequest({
      kind: "cancel",
      confirmationGeneration: request.confirmationGeneration,
      originStage: request.originStage,
      opener: request.opener,
      sessionIdentityKey: request.sessionIdentityKey,
    });
  };

  const confirmFutureGarmentRemoval = () => {
    const request = futureGarmentRemovalDialogRequestRef.current;
    if (
      !request ||
      futureGarmentRemovalConfirmingRef.current ||
      futureGarmentRemovalDialogError ||
      futureGarmentRemovalProcessedGenerationRef.current ===
        request.confirmationGeneration ||
      request.confirmationGeneration !==
        futureGarmentRemovalConfirmationGenerationRef.current
    ) {
      return;
    }
    futureGarmentRemovalProcessedGenerationRef.current =
      request.confirmationGeneration;
    futureGarmentRemovalConfirmingRef.current = true;
    setFutureGarmentRemovalDialogConfirming(true);

    try {
      const result = handleRemoveFuturePhysicalGarmentOccurrence({
        garmentKey: request.target.garmentKey,
        expectedAuthoritySignature: request.expectedAuthoritySignature,
        originStage: request.originStage,
      });
      if (
        futureGarmentRemovalDialogRequestRef.current
          ?.confirmationGeneration !== request.confirmationGeneration
      ) {
        return;
      }

      if (result.status === "removed") {
        futureGarmentRemovalDialogRequestRef.current = null;
        setFutureGarmentRemovalDialogRequest(null);
        setFutureGarmentRemovalDialogError(null);
        setFutureGarmentRemovalAnnouncement({
          kind: "success",
          message: `${request.target.occurrenceLabel} was removed from your order.`,
          generation: request.confirmationGeneration,
        });
        setFutureGarmentRemovalFocusRequest({
          kind: "removed",
          confirmationGeneration: request.confirmationGeneration,
          originStage: request.originStage,
          suggestedGarmentKey: result.suggestedSurvivingGarmentKey,
          authoritySignature: result.authoritySignature,
          removalGeneration: futureGarmentRemovalGenerationRef.current,
          sessionIdentityKey: request.sessionIdentityKey,
        });
        return;
      }

      if (result.status === "stale_authority") {
        futureGarmentRemovalDialogRequestRef.current = null;
        setFutureGarmentRemovalDialogRequest(null);
        setFutureGarmentRemovalDialogError(null);
        setFutureGarmentRemovalAnnouncement({
          kind: "error",
          message:
            "Your garment selection changed. Review the updated garments and try again.",
          generation: request.confirmationGeneration,
        });
        setFutureGarmentRemovalFocusRequest({
          kind: "stale",
          confirmationGeneration: request.confirmationGeneration,
          originStage: request.originStage,
          sessionIdentityKey: request.sessionIdentityKey,
        });
        return;
      }

      setFutureGarmentRemovalDialogError(
        getFutureGarmentRemovalBlockerMessage(result.code),
      );
    } catch {
      console.error("Unexpected garment removal UI failure.");
      setFutureGarmentRemovalDialogError(
        "We couldn’t safely remove this garment. Keep it in your order and try again.",
      );
    } finally {
      futureGarmentRemovalConfirmingRef.current = false;
      setFutureGarmentRemovalDialogConfirming(false);
    }
  };
  const handleUseSameFutureFabric = () => {
    if (activeUploadedDesignSource) {
      setFuturePriceActivatedFabricCode(null);
    }
    const previousState = fabricAllocationState;
    const nextState =
      FabricAllocationStateEngine.useSameFabricForPendingGarmentAndContinue(
        previousState,
        getFutureFabricGarmentSelections(effectiveJourneyGarmentTypeSelection),
      );
    revalidatePreservedFabricIntegrityAfterMutation({
      previousState,
      nextState,
    });
    setFabricAllocationState(nextState);
  };
  const handleAssignSameFabricProductToGarments = (
    fabricCode: string,
    garmentKeys: string[],
  ) => {
    if (activeUploadedDesignSource) {
      setFuturePriceActivatedFabricCode(null);
    }
    const result = assignSameFabricProductToGarments({
      state: fabricAllocationState,
      garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
      fabricCode,
      garmentKeys,
      fabrics,
      requiredPhysicalOccurrences: authoritativePhysicalOccurrencesForDomain,
    });
    if (result.status === "assigned") {
      if (result.state !== fabricAllocationState) {
        revalidatePreservedFabricIntegrityAfterMutation({
          previousState: fabricAllocationState,
          nextState: result.state,
        });
      }
      setFabricAllocationState(result.state);
    }
    return result;
  };
  const handleAssignGarmentToExistingAllocation = (
    garmentKey: string,
    allocationId: string,
  ) => {
    const result = assignFutureGarmentToExistingFabricAllocation({
      state: fabricAllocationState,
      garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
      garmentKey,
      allocationId,
      requiredPhysicalOccurrences: authoritativePhysicalOccurrencesForDomain,
    });
    if (result.status === "assigned") {
      if (activeUploadedDesignSource) {
        setFuturePriceActivatedFabricCode(null);
      }
      if (result.state !== fabricAllocationState) {
        revalidatePreservedFabricIntegrityAfterMutation({
          previousState: fabricAllocationState,
          nextState: result.state,
        });
      }
      setFabricAllocationState(result.state);
    }
    return result;
  };
  const handleUseSameFutureFabricForGarment = (garmentKey: string) => {
    if (activeUploadedDesignSource) {
      setFuturePriceActivatedFabricCode(null);
    }
    const previousState = fabricAllocationState;
    const activeAllocation = previousState.fabricAllocations.find(
      (allocation) => allocation.allocationId === previousState.activeAllocationId,
    );
    if (!activeAllocation) return;
    const result = assignFutureFabricToGarment({
      state: previousState,
      garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
      garmentKey,
      fabricCode: activeAllocation.fabricCode,
      fabrics,
      requiredPhysicalOccurrences: authoritativePhysicalOccurrencesForDomain,
    });
    if (result.status !== "assigned") return;
    if (result.state !== previousState) {
      revalidatePreservedFabricIntegrityAfterMutation({
        previousState,
        nextState: result.state,
      });
    }
    setFabricAllocationState(result.state);
  };
  const handleChooseAnotherFutureFabric = () => {
    setFabricAllocationState((current) =>
      FabricAllocationStateEngine.beginChooseAnotherFabric(current),
    );
  };
  const handleCancelFuturePendingFabric = () => {
    const transaction = additionalGarmentFabricTransactionRef.current;
    if (transaction) {
      cancelAdditionalGarmentFabricTransaction({
        transactionId: transaction.transactionId,
        garmentKey: transaction.garmentKey,
        occurrenceGeneration: transaction.occurrenceGeneration,
      });
      return;
    }
    setAdditionalGarmentFabricError(null);
    additionalGarmentFabricPersistentErrorGarmentKeyRef.current = null;
    setAdditionalGarmentFabricPersistentError(null);
    additionalGarmentFabricSnapshotRef.current = null;
    setFabricAllocationState((current) =>
      FabricAllocationStateEngine.cancelPendingGarment(current),
    );
    restoreAdditionalGarmentFabricFocus();
  };
  const beginAssignedFabricCommit = ({
    transaction,
    nextState,
    fabricCode,
  }: {
    transaction: AdditionalGarmentFabricTransaction;
    nextState: FabricAllocationState;
    fabricCode: string;
  }) => {
    if (
      !getCurrentAdditionalGarmentFabricOperation({
        transactionId: transaction.transactionId,
        garmentKey: transaction.garmentKey,
        occurrenceGeneration: transaction.occurrenceGeneration,
      })
    ) {
      return;
    }
    revalidatePreservedFabricIntegrityAfterMutation({
      previousState: fabricAllocationState,
      nextState,
      explicitlyRepairedGarmentKeys: [transaction.garmentKey],
    });
    setFabricAllocationState(nextState);
    setAdditionalGarmentFabricError(null);
    const nextTransaction = {
      ...transaction,
      phase:
        transaction.origin === "new_addition"
          ? "custom_details_choice"
          : "assigning",
      openedModal: transaction.origin !== "new_addition",
      requestedFabricCode: fabricCode,
    } as AdditionalGarmentFabricTransaction;
    additionalGarmentFabricTransactionRef.current = nextTransaction;
    setAdditionalGarmentFabricTransaction(nextTransaction);
  };
  const handleAdditionalGarmentUseSameFabric = ({
    transactionId,
    garmentKey,
    occurrenceGeneration,
  }: {
    transactionId: number;
    garmentKey: string;
    occurrenceGeneration?: number;
  }) => {
    const transaction = getCurrentAdditionalGarmentFabricOperation({
      transactionId,
      garmentKey,
      occurrenceGeneration,
    });
    if (!transaction) return;
    const previous = fabricAllocationState;
    const active =
      previous.fabricAllocations.find(
        (allocation) => allocation.allocationId === previous.activeAllocationId,
      ) || previous.fabricAllocations[0];
    const resolved = resolveCurrentCatalogueFabricForAssignment({
      fabrics,
      fabricCode: active?.fabricCode || "",
    });
    if (resolved.status !== "resolved") {
      setAdditionalGarmentFabricError(resolved.reason);
      setAdditionalGarmentFabricTransaction((current) =>
        isCurrentAdditionalGarmentFabricOperation({
          currentTransaction: current,
          expectedTransactionId: transactionId,
          expectedGarmentKey: garmentKey,
        })
          ? { ...current, phase: "catalogue", openedModal: true }
          : current,
      );
      return;
    }
    const nextState =
      FabricAllocationStateEngine.useSameFabricForPendingGarment(previous);
    const result = confirmAdditionalGarmentFabricAssignment({
      previousState: previous,
      nextState,
      garmentKey: transaction.garmentKey,
      fabricCode: resolved.fabric.code,
    });
    if (result.status !== "assigned") {
      setAdditionalGarmentFabricError(result.reason);
      return;
    }
    beginAssignedFabricCommit({
      transaction,
      nextState: result.state,
      fabricCode: result.fabricCode,
    });
  };
  const handleAdditionalGarmentChooseAnotherFabric = ({
    transactionId,
    garmentKey,
    occurrenceGeneration,
  }: {
    transactionId: number;
    garmentKey: string;
    occurrenceGeneration?: number;
  }) => {
    if (
      !getCurrentAdditionalGarmentFabricOperation({
        transactionId,
        garmentKey,
        occurrenceGeneration,
      })
    ) {
      return;
    }
    setAdditionalGarmentFabricError(null);
    setFabricAllocationState((current) =>
      FabricAllocationStateEngine.beginChooseAnotherFabric(current),
    );
    setAdditionalGarmentFabricTransaction((current) =>
      isCurrentAdditionalGarmentFabricOperation({
        currentTransaction: current,
        expectedTransactionId: transactionId,
        expectedGarmentKey: garmentKey,
      })
        ? { ...current, phase: "catalogue", openedModal: true }
        : current,
    );
  };
  const handleAdditionalGarmentSelectFabric = ({
    transactionId,
    garmentKey,
    fabricCode,
    occurrenceGeneration,
  }: {
    transactionId: number;
    garmentKey: string;
    fabricCode: string;
    occurrenceGeneration?: number;
  }) => {
    const transaction = getCurrentAdditionalGarmentFabricOperation({
      transactionId,
      garmentKey,
      occurrenceGeneration,
    });
    if (!transaction) return;
    const resolved = resolveCurrentCatalogueFabricForAssignment({
      fabrics,
      fabricCode,
    });
    if (resolved.status !== "resolved") {
      setAdditionalGarmentFabricError(resolved.reason);
      return;
    }
    if (
      !isAdditionalGarmentFabricTransactionTargetValid({
        transaction,
        fabricAllocationState,
      })
    ) {
      setAdditionalGarmentFabricError(
        "This garment is no longer available for fabric assignment.",
      );
      return;
    }
    const previous = fabricAllocationState;
    const nextState = applyFutureFabricCardSelection({
      state: previous,
      garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
      garmentKey: transaction.garmentKey,
      fabricCode: resolved.fabric.code,
      fabrics,
      requiredPhysicalOccurrences: fabricTransactionPhysicalOccurrences,
    });
    const result = confirmAdditionalGarmentFabricAssignment({
      previousState: previous,
      nextState,
      garmentKey: transaction.garmentKey,
      fabricCode: resolved.fabric.code,
    });
    if (result.status !== "assigned") {
      setAdditionalGarmentFabricError(result.reason);
      return;
    }
    beginAssignedFabricCommit({
      transaction,
      nextState: result.state,
      fabricCode: result.fabricCode,
    });
  };
  const handleChangeAdditionalGarmentFabric = (
    garmentKey: string,
    triggerElement?: HTMLElement | null,
  ) => {
    if (
      fabricAllocationState.pendingFabricGarment ||
      fabricAllocationState.awaitingFabricForPendingGarment ||
      additionalGarmentFabricTransaction
    ) {
      setNotification({
        message: "Finish the current fabric assignment before changing another garment.",
        type: "info",
      });
      return;
    }
    const assignment = fabricAllocationState.fabricAllocations
      .flatMap((allocation) =>
        allocation.garmentAssignments.map((candidate) => ({
          ...candidate,
          fabricCode: allocation.fabricCode,
        })),
      )
      .find((candidate) => candidate.garmentKey === garmentKey);
    if (!assignment || assignment.sourceRole !== "additional") return;
    additionalGarmentFabricTriggerRef.current = triggerElement || null;
    additionalGarmentFabricScrollYRef.current =
      typeof window !== "undefined" ? window.scrollY : null;
    additionalGarmentFabricSnapshotRef.current = fabricAllocationState;
    setAdditionalGarmentFabricError(null);
    additionalGarmentFabricPersistentErrorGarmentKeyRef.current = null;
    setAdditionalGarmentFabricPersistentError(null);
    setAdditionalGarmentFabricTransaction(
      beginAdditionalGarmentFabricTransaction({
        phase: "catalogue",
        origin: "change_existing",
        garmentKey,
        garmentType: assignment.garmentType as CanonicalPhysicalGarmentType,
        previousFabricCode: assignment.fabricCode,
        openedModal: true,
      }),
    );
  };
  const handleCancelAdditionalGarmentFabricDialog = ({
    transactionId,
    garmentKey,
    occurrenceGeneration,
  }: {
    transactionId: number;
    garmentKey: string;
    occurrenceGeneration?: number;
  }) => {
    const transaction = getCurrentAdditionalGarmentFabricOperation({
      transactionId,
      garmentKey,
      occurrenceGeneration,
    });
    if (!transaction) return;
    if (transaction.origin === "new_addition") {
      cancelAdditionalGarmentFabricTransaction({
        transactionId,
        garmentKey,
        occurrenceGeneration,
      });
      return;
    }
    additionalGarmentFabricTransactionRef.current = null;
    setAdditionalGarmentFabricTransaction(null);
    setAdditionalGarmentFabricError(null);
    additionalGarmentFabricPersistentErrorGarmentKeyRef.current = null;
    setAdditionalGarmentFabricPersistentError(null);
    additionalGarmentFabricSnapshotRef.current = null;
    restoreAdditionalGarmentFabricFocus();
  };
  const activeInlineFabricPicker = getActiveFabricForAdditionalGarmentPicker({
    fabrics,
    fabricAllocationState,
  });
  const showAdditionalGarmentFabricDialog = Boolean(
    additionalGarmentFabricTransaction?.openedModal &&
      (additionalGarmentFabricTransaction.phase === "choice" ||
        additionalGarmentFabricTransaction.phase === "catalogue" ||
        additionalGarmentFabricTransaction.phase === "assigning" ||
        additionalGarmentFabricTransaction.phase === "awaiting_commit"),
  );
  const additionalGarmentCustomDetailsRequest: AdditionalGarmentCustomDetailsRequest | null =
    additionalGarmentFabricTransaction?.origin === "new_addition" &&
    additionalGarmentFabricTransaction.phase === "custom_details_choice" &&
    additionalGarmentFabricTransaction.occurrenceGeneration
      ? {
          transactionId: additionalGarmentFabricTransaction.transactionId,
          garmentKey: additionalGarmentFabricTransaction.garmentKey,
          garmentType: additionalGarmentFabricTransaction.garmentType,
          occurrenceGeneration:
            additionalGarmentFabricTransaction.occurrenceGeneration,
        }
      : null;
  const garmentTypeBlockerMessage = !garmentTypeStageCompletion.isComplete
    ? "Select at least one garment, choose who the order is for, and resolve every construction price to continue to Fabric."
    : null;
  const liveOrderSummaryCard = (
    <DesignStudioOrderSummary
      view={liveOrderSummary}
      unlockedStages={liveOrderSummaryUnlockedStages}
      currentStageId={futureStageId}
      onEditStage={handleLiveOrderSummaryEdit}
    />
  );
  const embedPersistentLiveOrderSummary =
    showPersistentLiveOrderSummary &&
    (futureStageId === "garment_type" ||
      futureStageId === "fabric" ||
      futureStageId === "custom_details");
  const showShellLiveOrderSummary =
    showPersistentLiveOrderSummary && !embedPersistentLiveOrderSummary;

  return (
    <div
      id="design-studio-nine-stage-journey"
      data-journey-mode="nine_stage"
      data-stage-id={futureStageId}
      data-stage-complete={
        futureStageId === "garment_type"
          ? garmentTypeStageCompletion.isComplete
          : futureStageId === "fabric"
            ? futureFabricStageCompletion.isComplete
            : futureStageId === "design_style"
              ? isFutureDesignSourceReadyForCustomDetails
              : futureStageId === "custom_details"
                ? isFutureCustomDetailsStageReady
                : futureStageId === "try_on"
                  ? futureAiTryOnWorkflow.status === "completed" ||
                    futureAiTryOnWorkflow.status === "skipped"
                  : futureStageId === "measurement"
                    ? reconciledFutureMeasurementState.calculationStatus ===
                      "complete"
                    : futureStageId === "summary"
                      ? futureSummary.status === "ready"
                      : futureStageId === "shipping"
                        ? isFutureShippingStepComplete(futureShippingResolution)
                        : isFuturePaymentReviewUnlocked
      }
      className="font-sans"
    >
      {futureGarmentRemovalAnnouncement && (
        <div
          role={
            futureGarmentRemovalAnnouncement.kind === "success"
              ? "status"
              : "alert"
          }
          aria-live={
            futureGarmentRemovalAnnouncement.kind === "success"
              ? "polite"
              : "assertive"
          }
          data-future-garment-removal-announcement={
            futureGarmentRemovalAnnouncement.kind
          }
          className={`mb-4 min-w-0 rounded-2xl border px-4 py-3 text-sm font-semibold leading-relaxed ${
            futureGarmentRemovalAnnouncement.kind === "success"
              ? "border-heritage-green/25 bg-heritage-green/5 text-heritage-green"
              : "border-red-300/60 bg-red-50 text-red-900"
          }`}
        >
          {futureGarmentRemovalAnnouncement.message}
        </div>
      )}
      <DesignStudioJourneyStepper
        currentStageId={futureStageId}
        highestUnlockedStageIndex={highestUnlockedStageIndex}
        canEnterFabric={garmentTypeStageCompletion.isComplete}
        canEnterDesignStyle={futureFabricStageCompletion.isComplete}
        canEnterCustomDetails={isFutureDesignSourceReadyForCustomDetails}
        canEnterTryOn={isFutureCustomDetailsStageReady}
        canEnterMeasurement={isFutureMeasurementStageUnlocked(
          futureAiTryOnWorkflow,
        )}
        canEnterSummary={isFutureSummaryStageUnlocked}
        canEnterShipping={isFutureShippingUnlocked}
        canEnterPayment={isFuturePaymentReviewUnlocked}
        onSelectGarmentType={() => setFutureStageId("garment_type")}
        onSelectFabric={handleOpenDormantFabricStage}
        onSelectDesignStyle={handleOpenDormantDesignStyleStage}
        onSelectCustomDetails={handleOpenDormantCustomDetailsStage}
        onSelectTryOn={handleOpenDormantAiTryOnStage}
        onSelectMeasurement={handleOpenDormantMeasurementStage}
        onSelectSummary={handleOpenDormantSummaryStage}
        onSelectShipping={handleOpenDormantShippingStage}
        onSelectPayment={handleOpenDormantPaymentReviewStage}
      />
      <div
        className={
          showShellLiveOrderSummary
            ? "mt-4 grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2.2fr)_minmax(16rem,1fr)]"
            : "mt-4"
        }
      >
        <div className="min-w-0">
      {futureStageId === "garment_type" ? (
        <div className="space-y-5">
          <GarmentTypeStep
            selectedGarmentTypes={garmentTypeSelection.garmentTypes}
            selectedDemographics={getGarmentTypeSelectedDemographics(
              garmentTypeSelection,
            )}
            selectedFabricQuantity={garmentTypeStepSelectedFabricQuantity}
            normalizedCustomDetailCatalog={normalizedGarmentTypeCatalog}
            onGarmentTypesChange={handleDormantGarmentTypesChange}
            onDemographicsChange={handleDormantGarmentDemographicsChange}
            onConstructionDefaultsChange={
              handleDormantConstructionDefaultsChange
            }
            statusMessage={garmentTypeBlockerMessage}
            catalogueCoverageMessage={
              (step1CatalogueCoverage.status === "no_match" ||
                step1CatalogueCoverage.status === "empty_catalogue" ||
                step1CatalogueCoverage.status === "catalogue_unavailable") &&
              step1CatalogueCoverage.customerHeadline &&
              step1CatalogueCoverage.customerDetail
                ? {
                    headline: step1CatalogueCoverage.customerHeadline,
                    detail: step1CatalogueCoverage.customerDetail,
                  }
                : null
            }
            idPrefix="future-garment-type-step"
            orderSummary={
              embedPersistentLiveOrderSummary ? liveOrderSummaryCard : null
            }
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleOpenDormantFabricStage}
              disabled={!garmentTypeStageCompletion.isComplete}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Continue to Fabric
            </button>
          </div>
        </div>
      ) : futureStageId === "fabric" ? (
        <DormantFutureFabricStep
          fabrics={fabrics}
          garmentTypeSelection={fabricStepGarmentTypeSelection}
          fabricAllocationState={fabricAllocationState}
          completion={futureFabricStageCompletion}
          requiredPhysicalOccurrences={authoritativePhysicalOccurrencesForDomain}
          orphanRepairTargets={futureFabricOrphanRepairTargets}
          requiredFabricQuantity={
            futureGarmentFabricPlanning.requiredFabricQuantity
          }
          selectedFabricQuantity={
            futureGarmentFabricPlanning.selectedFabricQuantity
          }
          constructionPrice={futureConstructionPrice}
          onAssignFabricToGarment={handleAssignFutureFabricToGarment}
          onChangeFabricAllocationProduct={handleChangeFutureFabricAllocationProduct}
          onRemoveFabricFromGarment={handleRemoveFutureFabricAssignment}
          onRepairInvalidFabricAssignment={
            handleRepairInvalidFutureFabricAssignment
          }
          onUseSameFabricForGarment={handleUseSameFutureFabricForGarment}
          onAssignSameFabricProduct={handleAssignSameFabricProductToGarments}
          onAssignGarmentToExistingAllocation={
            handleAssignGarmentToExistingAllocation
          }
          onBack={() => setFutureStageId("garment_type")}
          onContinue={handleOpenDormantDesignStyleStage}
          onUseSameFabric={handleUseSameFutureFabric}
          onChooseAnotherFabric={handleChooseAnotherFutureFabric}
          onCancelPendingFabric={handleCancelFuturePendingFabric}
          orderSummary={
            embedPersistentLiveOrderSummary ? liveOrderSummaryCard : null
          }
        />
      ) : futureStageId === "design_style" ? (
        <DormantFutureDesignStyleStep
          occurrences={futureDesignStyleStepProjection.occurrences}
          activeOccurrenceTarget={resolvedFutureActiveDesignStyleOccurrence}
          catalogueEntries={futureDesignStyleCatalogueEntries}
          clearRequest={futureDesignStyleClearRequest}
          runtimeStatus={futureDesignStyleStepProjection.runtimeStatus}
          completedCount={futureDesignStyleStepProjection.completedCount}
          totalCount={futureDesignStyleStepProjection.totalCount}
          exactSetComplete={futureDesignStyleStepProjection.isComplete}
          reviewMessage={futureDesignStyleStepProjection.reviewMessage}
          mutationError={futureDesignStyleMutationError}
          uploadState={futureDesignStyleUploadStateForActiveOccurrence}
          stagePrice={
            futureFabricAuthoritativePricing?.garmentConstructionSubtotal ??
            null
          }
          isCatalogueLoading={stylesLoadState === "loading"}
          stylesLoadState={stylesLoadState}
          onSelectOccurrence={handleSelectFutureDesignStyleOccurrence}
          onAssignCatalogueStyle={handleAssignFutureCatalogueStyle}
          onClearAssignment={handleClearFutureDesignStyleAssignment}
          onSelectUploadFile={handleFutureDesignStyleUploadFile}
          onBack={() => setFutureStageId("fabric")}
          onReturnToGarmentType={() => setFutureStageId("garment_type")}
          onContinue={handleOpenDormantCustomDetailsStage}
        />
      ) : futureStageId === "custom_details" &&
        futureScopedCustomDetailsReconciliation &&
        futureScopedPersonalizedInputsReconciliation &&
        futureCustomDetailsCompletion &&
        futureCustomDetailsPricing ? (
        <DormantFutureCustomDetailsStep
          reconciliation={futureScopedCustomDetailsReconciliation}
          catalogue={futureCustomDetailsCatalogue}
          personalizedInputs={
            futureScopedPersonalizedInputsReconciliation.state
          }
          completion={futureCustomDetailsCompletion}
          pricing={futureCustomDetailsPricing}
          orderLevelCustomDetailsPrice={
            futureFabricAuthoritativePricing?.customDetailsPrice || 0
          }
          constructionBreakdown={projectCustomerGarmentConstructionBreakdown({
            pricing: futureFabricAuthoritativePricing,
            subjects: futureScopedCustomDetailsReconciliation.subjects,
            garmentTypeSelection: effectiveJourneyGarmentTypeSelection,
            additionalGarments: futureAdditionalGarments,
            additionalGarmentConstructions:
              futureAdditionalConstructionReconciliation.state,
            catalogInspection: futureCatalogInspection,
            constructionSubtotal:
              futureSummary.pricingSummary.garmentConstructionSubtotal,
          })}
          constructionSubtotal={
            futureSummary.pricingSummary.garmentConstructionSubtotal
          }
          designSelections={activeCustomerDesignSelections}
          showAdditionalClothesCosts={showAdditionalClothesCosts}
          selectedStyle={futureDesignStyleSelection.selectedStyle}
          additionalGarments={futureAdditionalGarments}
          additionalGarmentConstructionOptions={
            futureAdditionalGarmentConstructionOptions
          }
          onSingleSelect={handleFutureSingleCustomDetailSelect}
          onClearSelection={handleFutureCustomDetailClear}
          onConstructionSelect={handleFutureConstructionSelect}
          onToggleMultiSelect={handleFutureMultiCustomDetailToggle}
          onPersonalizedTextChange={handleFuturePersonalizedTextChange}
          onDecorativeFeatureToggle={handleFutureDecorativeFeatureToggle}
          onClearDecorativeFeatures={handleClearFutureDecorativeFeatures}
          onMonogramPlacementChange={handleFutureMonogramPlacementChange}
          onAccessoryToggle={handleFutureAccessoryToggle}
          onClearAccessories={handleClearFutureAccessories}
          onAddAdditionalGarment={handleAddFutureAdditionalGarment}
          additionalGarmentCustomDetailsRequest={
            additionalGarmentCustomDetailsRequest
          }
          onCompleteAdditionalGarmentCustomDetails={
            handleCompleteAdditionalGarmentCustomDetails
          }
          onCancelAdditionalGarmentCustomDetails={
            handleCancelAdditionalGarmentCustomDetails
          }
          removalTargets={futureGarmentRemovalTargets}
          onRequestGarmentRemoval={(target, trigger) =>
            openFutureGarmentRemovalDialog({
              target,
              originStage: "custom_details",
              opener: trigger,
            })
          }
          onChangeAdditionalGarmentFabric={handleChangeAdditionalGarmentFabric}
          fabrics={fabrics}
          fabricAllocationState={fabricAllocationState}
          fabricAnnouncement={additionalGarmentFabricAnnouncement}
          fabricPersistentError={additionalGarmentFabricPersistentError}
          focusAdditionalGarmentKey={futureCustomDetailsFocusGarmentKey}
          fabricModalOpen={showAdditionalGarmentFabricDialog}
          onViewAdditionalGarment={(garmentKey) => {
            setFutureCustomDetailsFocusGarmentKey(garmentKey);
            window.requestAnimationFrame(() => {
              const target = document.querySelector<HTMLElement>(
                `[data-parent-garment-key="${garmentKey}"]`,
              );
              target
                ?.querySelector<HTMLElement>("[data-added-garment-heading]")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }}
          onBack={() => setFutureStageId("design_style")}
          onContinue={handleOpenDormantAiTryOnStage}
          orderSummary={
            embedPersistentLiveOrderSummary ? liveOrderSummaryCard : null
          }
        />
      ) : futureStageId === "try_on" ? (
        <DormantFutureAiTryOnStep
          workflow={futureAiTryOnWorkflow}
          skipAllowed
          onBack={() => setFutureStageId("custom_details")}
          onRetry={handleRetryDormantAiTryOn}
          onSkip={handleSkipDormantAiTryOn}
          onContinue={handleOpenDormantMeasurementStage}
        />
      ) : futureStageId === "measurement" ? (
        <DormantFutureMeasurementStep
          plan={futureMeasurementPlan}
          state={reconciledFutureMeasurementState}
          onChange={setFutureMeasurementState}
          onRouteChange={handleFutureMeasurementRouteChange}
          onBack={() => setFutureStageId("try_on")}
          onContinue={handleOpenDormantSummaryStage}
        />
      ) : futureStageId === "summary" ? (
        <DormantFutureSummaryStep
          summary={futureSummary}
          onBack={() => setFutureStageId("measurement")}
          onEditGarments={() => setFutureStageId("garment_type")}
          onEditFabrics={handleOpenDormantFabricStage}
          onEditDesignStyle={handleOpenDormantDesignStyleStage}
          onEditCustomDetails={handleOpenDormantCustomDetailsStage}
          onEditAiTryOn={handleOpenDormantAiTryOnStage}
          onEditMeasurements={handleOpenDormantMeasurementStage}
          canContinueToShipping={isFutureShippingUnlocked}
          onContinueToShipping={handleOpenDormantShippingStage}
          shippingResolution={futureShippingResolution}
          removalTargets={futureGarmentRemovalTargets}
          onRequestGarmentRemoval={(target, trigger) =>
            openFutureGarmentRemovalDialog({
              target,
              originStage: "summary",
              opener: trigger,
            })
          }
        />
      ) : futureStageId === "shipping" ? (
        <>
          {futurePaymentReviewTransitionBlockers[0] && (
            <div
              role="alert"
              data-future-payment-review-blocker={
                futurePaymentReviewTransitionBlockers[0].code
              }
              className="mb-4 rounded-2xl border border-heritage-gold/35 bg-heritage-gold/8 p-4 text-sm text-heritage-ink/75"
            >
              {futurePaymentReviewTransitionBlockers[0].message}
            </div>
          )}
          <DormantFutureShippingStep
            state={futureShippingResolution.state}
            resolution={futureShippingResolution}
            selectedDesignPrice={futureSelectedDesignPrice}
            garmentCount={futureGarmentPieceCount}
            onChange={setFutureShippingState}
            onRefreshQuote={handleRefreshDormantShippingQuote}
            onBack={() => setFutureStageId("summary")}
            canContinueToReview={isFutureShippingStepComplete(
              futureShippingResolution,
            )}
            onContinueToReview={handleOpenDormantPaymentReviewStage}
          />
        </>
      ) : futureStageId === "payment" ? (
        futurePaymentReviewHandoff ? (
          <DormantFuturePaymentReviewStep
            result={futurePaymentReviewHandoff}
            survivorSummary={futureSummary}
            removalTargets={futureGarmentRemovalTargets}
            onRequestGarmentRemoval={(target, trigger) =>
              openFutureGarmentRemovalDialog({
                target,
                originStage: "payment",
                opener: trigger,
              })
            }
            onBack={() => setFutureStageId("shipping")}
            onEditStage={(stage) => setFutureStageId(stage)}
            onPrepareOrder={handlePrepareFutureOrderV2}
            onExecutePayment={handleExecuteFutureOrderV2Payment}
          />
        ) : null
      ) : null}
        </div>
        {showShellLiveOrderSummary ? (
          <div className="min-w-0">
            {liveOrderSummaryCard}
          </div>
        ) : null}
      </div>
      {showAdditionalGarmentFabricDialog &&
        additionalGarmentFabricTransaction && (
        <FutureAdditionalGarmentFabricDialog
          transaction={additionalGarmentFabricTransaction}
          fabrics={fabrics}
          garmentTypeSelection={effectiveJourneyGarmentTypeSelection}
          fabricAllocationState={fabricAllocationState}
          activeFabric={
            activeInlineFabricPicker.displayFabric ||
            activeInlineFabricPicker.fabric
          }
          activeFabricSelectionIndex={activeInlineFabricPicker.selectionIndex}
          activeFabricResolution={activeInlineFabricPicker.resolution}
          activeFabricCode={activeInlineFabricPicker.fabricCode}
          errorMessage={additionalGarmentFabricError}
          onUseSameFabric={() =>
            handleAdditionalGarmentUseSameFabric({
              transactionId:
                additionalGarmentFabricTransaction.transactionId,
              garmentKey: additionalGarmentFabricTransaction.garmentKey,
              occurrenceGeneration:
                additionalGarmentFabricTransaction.occurrenceGeneration,
            })
          }
          onChooseAnotherFabric={() =>
            handleAdditionalGarmentChooseAnotherFabric({
              transactionId:
                additionalGarmentFabricTransaction.transactionId,
              garmentKey: additionalGarmentFabricTransaction.garmentKey,
              occurrenceGeneration:
                additionalGarmentFabricTransaction.occurrenceGeneration,
            })
          }
          onBackToChoice={() => {
            const current = getCurrentAdditionalGarmentFabricOperation({
              transactionId:
                additionalGarmentFabricTransaction.transactionId,
              garmentKey: additionalGarmentFabricTransaction.garmentKey,
              occurrenceGeneration:
                additionalGarmentFabricTransaction.occurrenceGeneration,
            });
            if (!current) return;
            const next: AdditionalGarmentFabricTransaction = {
              ...current,
              phase: "choice",
            };
            additionalGarmentFabricTransactionRef.current = next;
            setAdditionalGarmentFabricTransaction(next);
          }}
          onSelectFabric={(fabricCode) =>
            handleAdditionalGarmentSelectFabric({
              transactionId:
                additionalGarmentFabricTransaction.transactionId,
              garmentKey: additionalGarmentFabricTransaction.garmentKey,
              fabricCode,
              occurrenceGeneration:
                additionalGarmentFabricTransaction.occurrenceGeneration,
            })
          }
          onCancel={() =>
            handleCancelAdditionalGarmentFabricDialog({
              transactionId:
                additionalGarmentFabricTransaction.transactionId,
              garmentKey: additionalGarmentFabricTransaction.garmentKey,
              occurrenceGeneration:
                additionalGarmentFabricTransaction.occurrenceGeneration,
            })
          }
        />
      )}
      {futureGarmentRemovalDialogRequest && (
        <FutureGarmentRemovalConfirmationDialog
          target={futureGarmentRemovalDialogRequest.target}
          confirming={futureGarmentRemovalDialogConfirming}
          terminalError={futureGarmentRemovalDialogError}
          onCancel={cancelFutureGarmentRemovalDialog}
          onConfirm={confirmFutureGarmentRemoval}
        />
      )}
    </div>
  );
}
