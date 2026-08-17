import {
  normalizeCustomDetailCatalog,
  inspectCustomDetailCatalog,
} from "../utils/catalogHelpers";
import React, { useState, useEffect, useMemo, useRef } from "react";
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
  GarmentConstructionPricingResolution,
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
import { GarmentTypeStep } from "./GarmentTypeStep";
import { DormantFutureFabricStep } from "./DormantFutureFabricStep";
import { DormantFutureDesignStyleStep } from "./DormantFutureDesignStyleStep";
import { DesignStudioJourneyStepper } from "./DesignStudioJourneyStepper";
import {
  DormantFutureCustomDetailsStep,
  type AdditionalGarmentCustomDetailsChoice,
} from "./DormantFutureCustomDetailsStep";
import { DormantFutureAiTryOnStep } from "./DormantFutureAiTryOnStep";
import { DormantFutureMeasurementStep } from "./DormantFutureMeasurementStep";
import { DormantFutureSummaryStep } from "./DormantFutureSummaryStep";
import { DormantFutureShippingStep } from "./DormantFutureShippingStep";
import { DormantFuturePaymentReviewStep } from "./DormantFuturePaymentReviewStep";
import { getCurrentCommunityBatch } from "../utils/batchUtils";
import {
  resolveShippingGarmentPieceCount,
} from "../utils/shippingPricing";
import { calculateDesignPricing } from "../utils/designPricing";
import { GuestOrderSessionService } from "../services/guestOrderSessionService";
import { auth } from "../services/firebase";
import {
  createFirebaseAuthenticatedFutureDraftRepository,
  resolveAuthenticatedFutureDraftIdentity,
  type AuthenticatedFutureDraftIntegrationStatus,
  type AuthenticatedFutureDraftIdentity,
} from "../services/authenticatedFutureDraftService";
import { resolveDesignStudioFabricAllocationPricing } from "../utils/fabricAllocationPricing";
import {
  cloneFabricAllocations,
  getFabricAllocationSyncSignature,
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
  removeFutureFabricAssignment,
  getFutureGarmentFabricPlanning,
  getFutureFabricCapacityComposition,
  getFutureFabricGarmentSelections,
  getFutureFabricStageCompletion,
  reconcileFutureFabricAllocationState,
} from "../utils/designStudioFutureFabricStage";
import {
  getGarmentTypeSelectedDemographics,
  selectGarmentConstructionOption,
} from "../utils/garmentTypeStepState";
import { reconcileFutureDesignStyleSelection } from "../utils/designStudioFutureDesignStyle";
import {
  calculateGarmentScopedCustomDetailsPricing,
  copyGarmentScopedCustomDetailsToAdditionalOccurrence,
  reconcileGarmentScopedCustomDetails,
  reconcileGarmentScopedPersonalizedInputs,
  validateGarmentScopedCustomDetailsCompletion,
} from "../utils/garmentScopedCustomDetailsDomain";
import {
  clearGarmentScopedCustomDetailSelection,
  getGarmentScopedCustomDetailSelection,
  removeGarmentScopedCustomDetails,
  setGarmentScopedCustomDetailSelection,
} from "../utils/garmentScopedCustomDetailsState";
import {
  removeGarmentScopedCustomDetailInputs,
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
  isFutureMeasurementStageUnlocked,
  normalizeFutureMeasurementState,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
} from "../utils/measurementBlueprint";
import { projectFutureDesignStudioSummary } from "../utils/designStudioFutureSummary";
import {
  createEmptyFutureShippingState,
  isFutureShippingStageUnlocked,
  normalizeFutureShippingState,
  persistFutureShippingState,
  reconcileFutureShippingState,
  refreshFutureShippingQuote,
} from "../utils/designStudioFutureShipping";
import { buildFutureOrderCandidate } from "../utils/futureOrderCandidate";
import { isFuturePaymentReviewStageUnlocked } from "../utils/designStudioFuturePaymentReview";
import {
  createCatalogDesignSource,
  isDesignSourceConfirmed,
  isValidUploadedDesignSource,
} from "../utils/designSourceState";
import { isDesignSourcePricingActive } from "../utils/designStylePricingActivation";
import {
  createUploadedDesignSourceWhenReady,
  toggleUploadedDesignGarmentComposition,
} from "../utils/uploadedDesignStep1";
import {
  CustomerDesignUploadError,
  CustomerDesignUploadService,
} from "../services/customerDesignUploadService";
import { deleteUploadedDesignBeforeSourceChange } from "../utils/uploadedDesignDeletionOrchestration";
import {
  cloneGarmentConstructionPricingResolution,
  createEmptyAdditionalGarmentConstructionState,
  reconcileAdditionalGarmentConstructionState,
  removeAdditionalGarmentConstruction,
  selectAdditionalGarmentConstructionOption,
} from "../utils/additionalGarmentConstructionState";
import { createCatalogueAdditionalGarmentSelection } from "../utils/additionalGarmentDomain";
import {
  CANONICAL_PHYSICAL_GARMENT_TYPES,
  resolveGarmentConstructionPricing,
} from "../utils/garmentConstructionPricing";
import { projectFutureCustomDetailsCatalogue } from "../utils/futureCustomDetailsCatalogue";
import {
  sortDecorativeFeatures,
  sortTraditionalAccessories,
  type TraditionalAccessory,
} from "../utils/decorativePricing";

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
  const [futureDraftPersistenceStatus, setFutureDraftPersistenceStatus] =
    useState<AuthenticatedFutureDraftIntegrationStatus>("resolving");
  const cloudFutureDraftRevisionRef = useRef<number | null>(null);
  const cloudFutureDraftSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const futureDraftIdentityGenerationRef = useRef(0);
  const preservedInvalidHydratedDraftFabricAllocationsRef = useRef<
    unknown | null
  >(null);
  const preservedInvalidHydratedDraftSelectionSignatureRef = useRef<
    string | null
  >(null);
  const businessSettings = useAppStore((state) => state.businessSettings);
  const isLoadingData = useAppStore((state) => state.isLoadingData);
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
  const normalizedGarmentTypeCatalog =
    normalizeCustomDetailCatalog(customDetailCatalog);
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
  const [futurePriceActivatedFabricCode, setFuturePriceActivatedFabricCode] =
    useState<string | null>(null);
  const [uploadedDesignReference, setUploadedDesignReference] =
    useState<CustomerDesignUploadReference | null>(null);
  const [uploadedDesignComposition, setUploadedDesignComposition] = useState<
    FabricCapacityGarmentSpec[]
  >([]);
  const [uploadedDesignDemographic, setUploadedDesignDemographic] =
    useState<CustomDetailDemographic | null>(null);
  const [uploadedDesignPreviewUrl, setUploadedDesignPreviewUrl] = useState<
    string | null
  >(null);
  const uploadedDesignPreviewUrlRef = useRef<string | null>(null);
  const [uploadedDesignPreviewReferenceId, setUploadedDesignPreviewReferenceId] =
    useState<string | null>(null);
  const [uploadedDesignError, setUploadedDesignError] = useState("");
  const [isUploadingDesign, setIsUploadingDesign] = useState(false);
  const [isReplacingDesign, setIsReplacingDesign] = useState(false);
  const [isRemovingDesign, setIsRemovingDesign] = useState(false);
  const uploadedDesignDeletionInFlightRef = useRef(false);
  const uploadedDesignDeletionGenerationRef = useRef(0);
  const [pendingCatalogStyleId, setPendingCatalogStyleId] = useState<
    string | null
  >(null);
  const [isLoadingUploadedDesignPreview, setIsLoadingUploadedDesignPreview] =
    useState(false);

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
  const pendingAdditionalConstructionRef = useRef<{
    garmentKey: string;
    resolution: GarmentConstructionPricingResolution;
    copyFromParentGarmentKey?: string;
  } | null>(null);
  const [futureCustomDetailsFocusGarmentKey, setFutureCustomDetailsFocusGarmentKey] =
    useState<string | null>(null);
  const futureFabricComposition =
    getFutureFabricCapacityComposition(garmentTypeSelection);
  const futureFabricStageCompletion = getFutureFabricStageCompletion({
    garmentTypeSelection,
    fabricAllocationState,
    fabrics,
  });
  const futureGarmentFabricPlanning = getFutureGarmentFabricPlanning({
    garmentTypeSelection,
    fabricAllocationState,
  });
  const futureDesignStyleSelection = reconcileFutureDesignStyleSelection({
    selectedStyleId: futureSelectedStyleId,
    styles,
    garmentTypeSelection,
  });
  const activeFutureDesignSource =
    futureDesignSource || createCatalogDesignSource(futureSelectedStyleId || "");
  const activeUploadedDesignSource =
    activeFutureDesignSource?.kind === "uploaded"
      ? activeFutureDesignSource
      : null;
  const futurePrimaryFabricCode =
    fabricAllocationState.fabricAllocations[0]?.fabricCode || null;
  const isFutureUploadedDesignConfirmed = Boolean(
    activeUploadedDesignSource &&
      isDesignSourceConfirmed(
        activeUploadedDesignSource,
        futureConfirmedDesignSourceKey,
      ),
  );
  const isFutureUploadedDesignPricingActive = Boolean(
    activeUploadedDesignSource &&
      isDesignSourcePricingActive({
        designSource: activeUploadedDesignSource,
        selectedStyle: null,
        confirmedStyleId: null,
        confirmedDesignSourceKey: futureConfirmedDesignSourceKey,
        selectedFabricCode: futurePrimaryFabricCode,
        priceActivatedFabricCode: futurePriceActivatedFabricCode,
      }),
  );
  const isFutureDesignSourceReadyForCustomDetails = activeUploadedDesignSource
    ? isFutureUploadedDesignConfirmed && isFutureUploadedDesignPricingActive
    : futureDesignStyleSelection.status === "selected";

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
    const primaryFabricCode =
      fabricAllocationState.fabricAllocations[0]?.fabricCode;
    if (!primaryFabricCode) return;
    const primaryFabric = fabrics.find(
      (fabric) => fabric.code === primaryFabricCode,
    );
    setSelectedFabric((current) =>
      current?.code === primaryFabricCode ? current : primaryFabric || null,
    );
  }, [fabricAllocationState.fabricAllocations, fabrics]);

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

  const clearUploadedDesignLocalState = (clearError = true) => {
    revokeUploadedDesignPreview();
    setUploadedDesignReference(null);
    setUploadedDesignComposition([]);
    setUploadedDesignDemographic(null);
    if (clearError) setUploadedDesignError("");
  };

  useEffect(
    () => () => {
      if (uploadedDesignPreviewUrlRef.current) {
        URL.revokeObjectURL(uploadedDesignPreviewUrlRef.current);
      }
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
    setFutureDesignSource(nextSource);
    setFutureSelectedStyleId(null);
    setFutureConfirmedDesignSourceKey(null);
    setFuturePriceActivatedFabricCode(null);
    if (!nextSource) return;

    const nextGarmentTypeSelection = updateDormantGarmentTypeSelection({
      currentSelection: garmentTypeSelection,
      normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
      selectedGarmentTypes: nextSource.fabricCapacityComposition.map(
        (spec) => spec.garmentType,
      ),
      selectedDemographics: [nextSource.demographic],
    });
    setGarmentTypeSelection(nextGarmentTypeSelection);
    setFabricAllocationState((current) =>
      reconcileFutureFabricAllocationState({
        state: current,
        garmentTypeSelection: nextGarmentTypeSelection,
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

  const handleUploadedDesignFile = async (
    file: File,
    isReplacement: boolean,
  ) => {
    setUploadedDesignError("");
    try {
      await CustomerDesignUploadService.validateCustomerDesignFile(file);
      if (isReplacement) setIsReplacingDesign(true);
      else setIsUploadingDesign(true);
      const currentReference =
        activeUploadedDesignSource?.uploadReference || uploadedDesignReference;
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
      setUploadedDesignPreviewFromBlob(
        file,
        replacement.reference.designReferenceId,
      );
      applyUploadedDesignForm({
        reference: replacement.reference,
        composition: isReplacement ? [] : uploadedDesignComposition,
        demographic: isReplacement ? null : uploadedDesignDemographic,
      });
      setPendingCatalogStyleId(null);
      if (replacement.previousDraftCleanupError) {
        setUploadedDesignError(
          "Your new image was saved, but the previous private image could not be removed.",
        );
      }
    } catch (error) {
      setUploadedDesignError(getCustomerDesignUploadErrorMessage(error));
    } finally {
      setIsUploadingDesign(false);
      setIsReplacingDesign(false);
    }
  };

  const handleUploadedDesignCompositionToggle = (
    garmentType: FabricGarmentType,
  ) => {
    const composition = toggleUploadedDesignGarmentComposition(
      activeUploadedDesignSource?.fabricCapacityComposition ||
        uploadedDesignComposition,
      garmentType,
    );
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
    setFutureSelectedStyleId(styleId);
    const nextSource = createCatalogDesignSource(styleId);
    setFutureDesignSource(nextSource);
    setFutureConfirmedDesignSourceKey(nextSource?.sourceKey || null);
    setFuturePriceActivatedFabricCode(futurePrimaryFabricCode);
  };

  const deleteUploadedDesign = async ({
    reference,
    catalogStyleIdAfterDelete,
  }: {
    reference: CustomerDesignUploadReference;
    catalogStyleIdAfterDelete: string | null;
  }) => {
    if (uploadedDesignDeletionInFlightRef.current) return;
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

  const handleAssignFutureFabricToGarment = (
    fabric: Fabric,
    garmentKey: string,
  ) => {
    if (activeUploadedDesignSource) {
      setFuturePriceActivatedFabricCode(null);
    }
    setFabricAllocationState((current) => {
      return applyFutureFabricCardSelection({
        state: current,
        garmentTypeSelection,
        garmentKey,
        fabricCode: fabric.code,
      });
    });
  };

  const handleRemoveFutureFabricAssignment = (garmentKey: string) => {
    if (activeUploadedDesignSource) {
      setFuturePriceActivatedFabricCode(null);
    }
    pendingAdditionalConstructionRef.current = null;
    setFabricAllocationState((current) =>
      removeFutureFabricAssignment({ state: current, garmentKey }),
    );
  };

  // STEP 3: Design Details
  const [designSelections, setDesignSelections] = useState<DesignSelections>({
    accessories: [],
  });
  const futureAdditionalGarments = fabricAllocationState.fabricAllocations
    .flatMap((allocation) => allocation.garmentAssignments)
    .filter((assignment) => assignment.sourceRole === "additional");
  const futureAdditionalConstructionReconciliation =
    reconcileAdditionalGarmentConstructionState({
      existingState: designSelections.additionalGarmentConstructions,
      assignments: futureAdditionalGarments,
      normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
    });
  const futureAdditionalGarmentConstructionOptions =
    CANONICAL_PHYSICAL_GARMENT_TYPES.map((garmentType) => ({
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
      garmentTypeSelection,
      additionalGarments: futureAdditionalGarments,
      additionalGarmentConstructions:
        futureAdditionalConstructionReconciliation.state,
      style: futureDesignStyleSelection.selectedStyle,
      catalogInspection: futureCatalogInspection,
      existingState: designSelections.garmentScopedCustomDetails,
    });
  const futureCustomDetailsCatalogue = projectFutureCustomDetailsCatalogue({
    garmentTypeSelection,
    style: futureDesignStyleSelection.selectedStyle,
    reconciliation: futureScopedCustomDetailsReconciliation,
    activeOptions: futureCatalogInspection.activeOptions,
    additionalGarments: futureAdditionalGarments,
    additionalGarmentConstructions:
      futureAdditionalConstructionReconciliation.state,
  });
  const isAdditionalGarmentCommitPending =
    pendingAdditionalConstructionRef.current !== null;

  useEffect(() => {
    const pending = pendingAdditionalConstructionRef.current;
    if (!pending) return;
    const committed = fabricAllocationState.fabricAllocations
      .flatMap((allocation) => allocation.garmentAssignments)
      .find((assignment) => assignment.garmentKey === pending.garmentKey);
    if (!committed) return;
    pendingAdditionalConstructionRef.current = null;
    setDesignSelections((current) => ({
      ...current,
      additionalGarmentConstructions: {
        schemaVersion: 1,
        byGarmentKey: {
          ...(current.additionalGarmentConstructions?.byGarmentKey || {}),
          [pending.garmentKey]: pending.resolution,
        },
      },
      ...(pending.copyFromParentGarmentKey
        ? {
            garmentScopedCustomDetails:
              copyGarmentScopedCustomDetailsToAdditionalOccurrence({
                state: current.garmentScopedCustomDetails || {
                  schemaVersion: 1,
                  selectionsByGarmentKey: {},
                  snapshotsByGarmentKey: {},
                },
                sourceParentGarmentKey: pending.copyFromParentGarmentKey,
                targetParentGarmentKey: pending.garmentKey,
                garmentType: committed.garmentType as CanonicalPhysicalGarmentType,
                catalogInspection: futureCatalogInspection,
              }).state,
          }
        : {}),
    }));
    setFutureCustomDetailsFocusGarmentKey(pending.garmentKey);
    setFutureStageId("custom_details");
  }, [fabricAllocationState.fabricAllocations]);
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
      })
    : null;
  const futureCustomDetailsPricing = futureScopedCustomDetailsReconciliation
    ? calculateGarmentScopedCustomDetailsPricing({
        reconciliation: futureScopedCustomDetailsReconciliation,
        catalogInspection: futureCatalogInspection,
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
          garmentTypeSelection,
          fabricAllocations: fabricAllocationState.fabricAllocations,
          selectedStyleId: activeFutureDesignSource.sourceKey,
          garmentScopedCustomDetails:
            futureScopedCustomDetailsReconciliation.state,
        })
      : null;
  const futureMeasurementPhysicalGarments = useMemo(
    () =>
      getMeasurementPhysicalGarments({
        garmentTypeSelection,
        fabricGarments: fabricAllocationState.fabricAllocations.flatMap(
          (allocation) => allocation.garmentAssignments,
        ),
      }),
    [garmentTypeSelection, fabricAllocationState.fabricAllocations],
  );
  const futureMeasurementPlan = useMemo(
    () =>
      planMeasurementRequirements({
        route: futureMeasurementState.route,
        garmentTypeSelection,
        physicalGarments: futureMeasurementPhysicalGarments,
        garmentScopedCustomDetails: designSelections.garmentScopedCustomDetails,
      }),
    [
      futureMeasurementState.route,
      garmentTypeSelection,
      futureMeasurementPhysicalGarments,
      designSelections.garmentScopedCustomDetails,
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
            ...designSelections,
            additionalGarmentConstructions:
              futureAdditionalConstructionReconciliation.state,
          },
          materialPricing: futureFabricMaterialPricing,
          baseGarmentComposition: futureFabricComposition,
          additionalGarments: futureAdditionalGarments,
          catalog: customDetailCatalog,
          businessSettings,
          garmentConstructionSelectionMode: "garment_type_locked",
          garmentTypeSelection,
        })
      : null;
  const futureConstructionPrice = garmentTypeSelection.garmentTypes.reduce(
    (total, garmentType) => {
      const resolution =
        garmentTypeSelection.constructionByGarment[garmentType];
      return (
        total + (resolution?.status === "resolved" ? resolution.totalPrice : 0)
      );
    },
    0,
  ) + Object.values(
    futureAdditionalConstructionReconciliation.state.byGarmentKey,
  ).reduce(
    (total, resolution) =>
      total + (resolution.status === "resolved" ? resolution.totalPrice : 0),
    0,
  );
  const futureGarmentPieceCount = resolveShippingGarmentPieceCount({
    fabricAllocations: fabricAllocationState.fabricAllocations,
  });
  const futureSummaryInput = {
    garmentTypeSelection,
    catalogInspection: futureCatalogInspection,
    fabricAllocationState,
    fabricCompletion: futureFabricStageCompletion,
    materialPricing: futureFabricMaterialPricing,
    designStyleSelection: futureDesignStyleSelection,
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
    reconciledFutureMeasurementState.route === "low_risk" &&
    reconciledFutureMeasurementState.calculationStatus === "complete";
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
        garmentCount: futureFabricStageCompletion.requiredGarmentCount,
        selectedDesignPrice: futureSelectedDesignPrice,
      }),
    [
      futureShippingState,
      futureFabricStageCompletion.requiredGarmentCount,
      futureSelectedDesignPrice,
    ],
  );
  const futureOrderCandidateResult = buildFutureOrderCandidate({
    ...futureSummaryInput,
    source: activeFutureDesignSource,
    shippingResolution: futureShippingResolution,
  });
  const isFuturePaymentReviewUnlocked = isFuturePaymentReviewStageUnlocked(
    futureOrderCandidateResult,
  );

  useEffect(() => {
    if (
      JSON.stringify(futureShippingState) !==
      JSON.stringify(futureShippingResolution.state)
    ) {
      setFutureShippingState(futureShippingResolution.state);
    }
  }, [futureShippingState, futureShippingResolution.state]);

  useEffect(() => {
    if (futureStageId === "shipping" && !isFutureShippingUnlocked) {
      setFutureStageId("summary");
    }
  }, [futureStageId, isFutureShippingUnlocked]);

  useEffect(() => {
    if (futureStageId === "payment" && !isFuturePaymentReviewUnlocked) {
      setFutureStageId("shipping");
    }
  }, [futureStageId, isFuturePaymentReviewUnlocked]);

  useEffect(
    () =>
      onAuthStateChanged(auth, (firebaseUser) => {
        setFirebaseDraftAuth({ resolved: true, user: firebaseUser });
      }),
    [],
  );

  useEffect(() => {
    futureDraftIdentityGenerationRef.current += 1;
    cloudFutureDraftRevisionRef.current = null;
    cloudFutureDraftSaveQueueRef.current = Promise.resolve();
    setFutureDraftPersistenceStatus("resolving");
    setGuestDraftHydrated(false);

    // Remove the previous identity's dormant draft from rendered state before
    // any local or owner-scoped cloud hydration is allowed to begin.
    setGarmentTypeSelection(
      createDormantDesignStudioJourneyState({
        normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
      }).garmentTypeSelection,
    );
    setFutureStageId("garment_type");
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
    setDesignSelections({ accessories: [] });
    setFabricAllocationState(FabricAllocationStateEngine.initialize());
    setSelectedFabric(null);
  }, [futureDraftIdentityKey]);

  useEffect(() => {
    if (
      guestDraftHydrated ||
      isLoadingData ||
      styles.length === 0 ||
      fabrics.length === 0 ||
      normalizedGarmentTypeCatalog.length === 0 ||
      futureDraftIdentity.status === "resolving"
    ) {
      return;
    }
    if (futureDraftIdentity.status === "blocked") {
      setFutureDraftPersistenceStatus("blocked");
      return;
    }
    const identityGeneration = futureDraftIdentityGenerationRef.current;
    let cancelled = false;
    void (async () => {
      const localDraft = GuestOrderSessionService.getFutureDesignDraft();
      let storedDraft = localDraft;
      let hydratedPersistenceStatus: "ready" | "cleared" = "ready";
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
            identityGeneration === futureDraftIdentityGenerationRef.current
          ) {
            console.error("Future draft synchronization failed.", error);
            setFutureDraftPersistenceStatus("blocked");
          }
          return;
        }
        if (
          cancelled ||
          identityGeneration !== futureDraftIdentityGenerationRef.current
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
        identityGeneration !== futureDraftIdentityGenerationRef.current
      ) {
        return;
      }
      const futureJourney = createDormantDesignStudioJourneyState({
        persistedDraft: storedDraft,
        normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
      });
      const restoredUploadedSource = isValidUploadedDesignSource(
        storedDraft?.designSource,
      )
        ? storedDraft!.designSource
        : null;
      const restoredGarmentTypeSelection = restoredUploadedSource
        ? updateDormantGarmentTypeSelection({
            currentSelection: futureJourney.garmentTypeSelection,
            normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
            selectedGarmentTypes:
              restoredUploadedSource.fabricCapacityComposition.map(
                (spec) => spec.garmentType,
              ),
            selectedDemographics: [restoredUploadedSource.demographic],
          })
        : futureJourney.garmentTypeSelection;
      setGarmentTypeSelection(restoredGarmentTypeSelection);
      const hydratedAllocations = storedDraft
        ? resolveDraftHydrationAllocations(storedDraft)
        : null;
      const reconciledFabricState = reconcileFutureFabricAllocationState({
        state: hydratedAllocations?.hasValidModernAllocations
          ? {
              fabricAllocations:
                cloneFabricAllocations(hydratedAllocations.fabricAllocations) ||
                [],
              activeAllocationId:
                hydratedAllocations.fabricAllocations[0]?.allocationId || null,
              pendingFabricGarment: null,
              awaitingFabricForPendingGarment: false,
            }
          : FabricAllocationStateEngine.initialize(),
        garmentTypeSelection: restoredGarmentTypeSelection,
      });
      const restoredFabricCompletion = getFutureFabricStageCompletion({
        garmentTypeSelection: restoredGarmentTypeSelection,
        fabricAllocationState: reconciledFabricState,
        fabrics,
      });
      const restoredStyleId = restoredUploadedSource
        ? null
        : storedDraft?.selectedStyleId || null;
      const restoredStyleSelection = reconcileFutureDesignStyleSelection({
        selectedStyleId: restoredStyleId,
        styles,
        garmentTypeSelection: restoredGarmentTypeSelection,
      });
      const restoredPrimaryFabricCode =
        reconciledFabricState.fabricAllocations[0]?.fabricCode || null;
      const restoredDesignSource =
        restoredUploadedSource || createCatalogDesignSource(restoredStyleId || "");
      const restoredSourceReady = restoredUploadedSource
        ? isDesignSourceConfirmed(
            restoredUploadedSource,
            storedDraft?.confirmedDesignSourceKey,
          ) &&
          isDesignSourcePricingActive({
            designSource: restoredUploadedSource,
            selectedStyle: null,
            confirmedStyleId: null,
            confirmedDesignSourceKey: storedDraft?.confirmedDesignSourceKey,
            selectedFabricCode: restoredPrimaryFabricCode,
            priceActivatedFabricCode: storedDraft?.priceActivatedFabricCode,
          })
        : restoredStyleSelection.status === "selected";
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
        reconciledFabricState.fabricAllocations
          .flatMap((allocation) => allocation.garmentAssignments)
          .filter((assignment) => assignment.sourceRole === "additional");
      const restoredAdditionalConstructions =
        reconcileAdditionalGarmentConstructionState({
          existingState:
            storedDraft?.designSelections?.additionalGarmentConstructions,
          assignments: restoredAdditionalGarments,
          normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
        });
      const restoredCustomDetails = reconcileGarmentScopedCustomDetails({
        garmentTypeSelection: restoredGarmentTypeSelection,
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
        });
      const restoredMeasurementPlan = planMeasurementRequirements({
        route: restoredMeasurementState.route,
        garmentTypeSelection: restoredGarmentTypeSelection,
        physicalGarments: getMeasurementPhysicalGarments({
          garmentTypeSelection: restoredGarmentTypeSelection,
          fabricGarments: reconciledFabricState.fabricAllocations.flatMap(
            (allocation) => allocation.garmentAssignments,
          ),
        }),
        garmentScopedCustomDetails: restoredCustomDetails.state,
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
        restoredReconciledMeasurementState.route === "low_risk" &&
        restoredReconciledMeasurementState.calculationStatus === "complete";
      const restoredShippingResolution = reconcileFutureShippingState({
        state: restoredShippingState,
        garmentCount: restoredFabricCompletion.requiredGarmentCount,
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
        restoredSourceReady
          ? storedDraft?.confirmedDesignSourceKey ||
              restoredDesignSource?.sourceKey ||
              null
          : null,
      );
      setFuturePriceActivatedFabricCode(
        restoredSourceReady
          ? storedDraft?.priceActivatedFabricCode || restoredPrimaryFabricCode
          : null,
      );
      if (restoredUploadedSource) {
        setUploadedDesignReference(restoredUploadedSource.uploadReference);
        setUploadedDesignComposition(
          restoredUploadedSource.fabricCapacityComposition.map((spec) => ({
            ...spec,
          })),
        );
        setUploadedDesignDemographic(restoredUploadedSource.demographic);
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
    customDetailCatalog,
    fabrics,
    styles,
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
    if (!garmentTypeStageCompletion.isComplete) {
      setFutureStageId("garment_type");
    }
    setFabricAllocationState((current) =>
      reconcileFutureFabricAllocationState({
        state: current,
        garmentTypeSelection,
      }),
    );
  }, [
    guestDraftHydrated,
    garmentTypeSelection,
    garmentTypeStageCompletion.isComplete,
  ]);

  useEffect(() => {
    if (
      futureStageId !== "design_style" &&
      futureStageId !== "custom_details" &&
      futureStageId !== "try_on" &&
      futureStageId !== "measurement" &&
      futureStageId !== "summary"
    ) {
      return;
    }
    if (
      futureFabricStageCompletion.isComplete &&
      isFutureDesignSourceReadyForCustomDetails &&
      ((futureStageId !== "try_on" &&
        futureStageId !== "measurement" &&
        futureStageId !== "summary") ||
        isFutureCustomDetailsStageReady) &&
      ((futureStageId !== "measurement" && futureStageId !== "summary") ||
        isFutureMeasurementStageUnlocked(futureAiTryOnWorkflow)) &&
      (futureStageId !== "summary" ||
        (reconciledFutureMeasurementState.route === "low_risk" &&
          reconciledFutureMeasurementState.calculationStatus === "complete"))
    ) {
      return;
    }
    setFutureStageId(
      !garmentTypeStageCompletion.isComplete
        ? "garment_type"
        : !futureFabricStageCompletion.isComplete
          ? "fabric"
          : !isFutureDesignSourceReadyForCustomDetails
            ? "design_style"
            : !isFutureCustomDetailsStageReady
              ? "custom_details"
              : !isFutureMeasurementStageUnlocked(futureAiTryOnWorkflow)
                ? "try_on"
                : "measurement",
    );
  }, [
    futureStageId,
    futureFabricStageCompletion.isComplete,
    garmentTypeStageCompletion.isComplete,
    isFutureDesignSourceReadyForCustomDetails,
    isFutureCustomDetailsStageReady,
    futureAiTryOnWorkflow,
    reconciledFutureMeasurementState.route,
    reconciledFutureMeasurementState.calculationStatus,
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

  useEffect(() => {
    if (!guestDraftHydrated) return;
    if (
      futureDraftPersistenceStatus !== "ready" ||
      (futureDraftIdentity.status !== "guest" &&
        futureDraftIdentity.status !== "authenticated")
    ) {
      return;
    }

    const persistTimer = window.setTimeout(() => {
      const currentSelectionSignature = getFabricAllocationSyncSignature(
        selectedFabric?.code ?? null,
        garmentTypeSelection.garmentTypes.join(","),
        undefined,
        activeFutureDesignSource?.sourceKey || null,
      );
      const autosaveAllocationResolution =
        resolveDraftAutosaveFabricAllocations({
          preservedInvalidHydratedFabricAllocations:
            preservedInvalidHydratedDraftFabricAllocationsRef.current,
          preservedInvalidHydratedSelectionSignature:
            preservedInvalidHydratedDraftSelectionSignatureRef.current,
          currentSelectionSignature,
          generatedFabricAllocations: fabricAllocationState.fabricAllocations,
        });
      if (!autosaveAllocationResolution.preserveInvalidHydratedModernData) {
        preservedInvalidHydratedDraftFabricAllocationsRef.current = null;
        preservedInvalidHydratedDraftSelectionSignatureRef.current = null;
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
      if (futureDraftIdentity.status === "guest") {
        GuestOrderSessionService.saveFutureDesignDraft(guestDraft);
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
                guestDraft,
                cloudFutureDraftRevisionRef.current,
              );
              if (
                identityGeneration !== futureDraftIdentityGenerationRef.current
              ) {
                return;
              }
              if (result.status === "saved") {
                cloudFutureDraftRevisionRef.current = result.record.revision;
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
    selectedFabric,
    designSelections,
    batchType,
    customGroupCode,
    futureOrderCandidateResult.candidate?.pricing,
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
  ]);

  const handleDormantGarmentTypesChange = (
    garmentTypes: FabricGarmentType[],
  ) => {
    setGarmentTypeSelection((current) =>
      updateDormantGarmentTypeSelection({
        currentSelection: current,
        normalizedCustomDetailCatalog: normalizedGarmentTypeCatalog,
        selectedGarmentTypes: garmentTypes,
      }),
    );
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

  const handleOpenDormantFabricStage = () => {
    if (!garmentTypeStageCompletion.isComplete) return;
    setFutureStageId("fabric");
  };
  const handleOpenDormantDesignStyleStage = () => {
    if (!futureFabricStageCompletion.isComplete) return;
    if (
      activeUploadedDesignSource &&
      isDesignSourceConfirmed(
        activeUploadedDesignSource,
        futureConfirmedDesignSourceKey,
      )
    ) {
      setFuturePriceActivatedFabricCode(futurePrimaryFabricCode);
    }
    setFutureStageId("design_style");
  };
  const handleContinueWithUploadedDesign = () => {
    if (!activeUploadedDesignSource) return;
    setFutureConfirmedDesignSourceKey(activeUploadedDesignSource.sourceKey);
    setFuturePriceActivatedFabricCode(null);
    setFutureStageId("fabric");
  };
  const handleOpenDormantCustomDetailsStage = () => {
    if (
      !futureFabricStageCompletion.isComplete ||
      !isFutureDesignSourceReadyForCustomDetails
    ) {
      return;
    }
    setFutureStageId("custom_details");
  };
  const handleOpenDormantAiTryOnStage = () => {
    if (!isFutureCustomDetailsStageReady) return;
    setFutureStageId("try_on");
  };
  const handleOpenDormantMeasurementStage = () => {
    if (!isFutureMeasurementStageUnlocked(futureAiTryOnWorkflow)) return;
    setFutureStageId("measurement");
  };
  const handleOpenDormantSummaryStage = () => {
    if (!isFutureSummaryStageUnlocked) return;
    setFutureStageId("summary");
  };
  const handleOpenDormantShippingStage = () => {
    if (!isFutureShippingUnlocked) return;
    setFutureStageId("shipping");
  };
  const handleOpenDormantPaymentReviewStage = () => {
    if (!isFuturePaymentReviewUnlocked) return;
    setFutureStageId("payment");
  };
  const handleRefreshDormantShippingQuote = () => {
    setFutureShippingState(
      refreshFutureShippingQuote({
        state: futureShippingResolution.state,
        garmentCount: futureFabricStageCompletion.requiredGarmentCount,
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
    setFutureMeasurementState((current) => ({
      ...current,
      route,
      derived: { shared: {}, byGarmentKey: {} },
      calculationStatus: "incomplete",
      diagnostics: [],
    }));
  };
  const updateFutureScopedCustomDetails = (
    update: (current: DesignSelections) => DesignSelections,
  ) => {
    setDesignSelections((current) => {
      const proposed = update(current);
      const reconciliation = reconcileGarmentScopedCustomDetails({
        garmentTypeSelection,
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
  const handleAddFutureAdditionalGarment = (
    garmentType: CanonicalPhysicalGarmentType,
    choice: AdditionalGarmentCustomDetailsChoice,
  ) => {
    setFutureCustomDetailsFocusGarmentKey(null);
    if (
      fabricAllocationState.pendingFabricGarment ||
      fabricAllocationState.awaitingFabricForPendingGarment
    ) {
      setNotification({
        message: "Finish the current fabric assignment before adding another garment.",
        type: "info",
      });
      return;
    }
    const existingAssignments = fabricAllocationState.fabricAllocations.flatMap(
      (allocation) => allocation.garmentAssignments,
    );
    const addition = createCatalogueAdditionalGarmentSelection({
      garmentType,
      existingAssignments,
    });
    const sourceSubject = choice.mode === "copy"
      ? futureScopedCustomDetailsReconciliation.subjects.find(
          (subject) =>
            subject.parentGarmentKey === choice.sourceParentGarmentKey &&
            subject.parentGarmentType === garmentType,
        )
      : null;
    const sourceConstruction = sourceSubject
      ? sourceSubject.parentGarmentKey.startsWith("base:")
        ? garmentTypeSelection.constructionByGarment[garmentType]
        : futureAdditionalConstructionReconciliation.state.byGarmentKey[
            sourceSubject.parentGarmentKey
          ]
      : null;
    if (choice.mode === "copy" && !sourceSubject) {
      setNotification({
        message: "The garment selected for copying is no longer available.",
        type: "info",
      });
      return;
    }
    if (choice.mode === "copy" && sourceConstruction?.status !== "resolved") {
      setNotification({
        message: "The source garment construction needs review before it can be copied.",
        type: "info",
      });
      return;
    }
    const construction = choice.mode === "copy"
      ? sourceConstruction!
      : resolveGarmentConstructionPricing(
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
    const activeAllocation = fabricAllocationState.fabricAllocations.find(
      (allocation) =>
        allocation.allocationId === fabricAllocationState.activeAllocationId,
    ) || fabricAllocationState.fabricAllocations[0];
    if (!activeAllocation) {
      setNotification({
        message: "Select a fabric before adding another garment.",
        type: "info",
      });
      setFutureStageId("fabric");
      return;
    }
    const readyState = FabricAllocationStateEngine.activateAllocation(
      fabricAllocationState,
      activeAllocation.allocationId,
    );
    pendingAdditionalConstructionRef.current = {
      garmentKey: addition.selection.garmentSpec!.key,
      resolution: cloneGarmentConstructionPricingResolution(construction),
      ...(choice.mode === "copy"
        ? { copyFromParentGarmentKey: choice.sourceParentGarmentKey }
        : {}),
    };
    const nextState = FabricAllocationStateEngine.attemptAppendGarment(
      readyState,
      addition.selection,
    );
    const additionAccepted = nextState.fabricAllocations.some((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === addition.selection.garmentSpec!.key,
      ),
    );
    const additionPending =
      nextState.pendingFabricGarment?.garmentSpec?.key ===
      addition.selection.garmentSpec!.key;
    if (!additionAccepted && !additionPending) {
      pendingAdditionalConstructionRef.current = null;
      setNotification({
        message: "This garment could not be added. Your existing order was not changed.",
        type: "info",
      });
      return;
    }
    setFabricAllocationState(nextState);
    if (nextState.pendingFabricGarment) {
      setFutureStageId("fabric");
    }
  };
  const handleRemoveFutureAdditionalGarment = (garmentKey: string) => {
    if (futureCustomDetailsFocusGarmentKey === garmentKey) {
      setFutureCustomDetailsFocusGarmentKey(null);
    }
    if (pendingAdditionalConstructionRef.current?.garmentKey === garmentKey) {
      pendingAdditionalConstructionRef.current = null;
    }
    setFabricAllocationState((current) =>
      FabricAllocationStateEngine.removeGarmentAssignments(current, [
        garmentKey,
      ]),
    );
    setDesignSelections((current) => ({
      ...current,
      additionalGarmentConstructions: removeAdditionalGarmentConstruction(
        current.additionalGarmentConstructions ||
          createEmptyAdditionalGarmentConstructionState(),
        garmentKey,
      ),
      garmentScopedCustomDetails: removeGarmentScopedCustomDetails(
        current.garmentScopedCustomDetails || {
          schemaVersion: 1,
          selectionsByGarmentKey: {},
          snapshotsByGarmentKey: {},
        },
        garmentKey,
      ),
      garmentScopedCustomDetailInputs: removeGarmentScopedCustomDetailInputs(
        current.garmentScopedCustomDetailInputs || {
          schemaVersion: 1,
          textByGarmentKey: {},
        },
        garmentKey,
      ),
    }));
  };
  const handleUseSameFutureFabric = () => {
    if (activeUploadedDesignSource) {
      setFuturePriceActivatedFabricCode(null);
    }
    setFabricAllocationState((current) =>
      FabricAllocationStateEngine.useSameFabricForPendingGarmentAndContinue(
        current,
        getFutureFabricGarmentSelections(garmentTypeSelection),
      ),
    );
  };
  const handleUseSameFutureFabricForGarment = (garmentKey: string) => {
    if (activeUploadedDesignSource) {
      setFuturePriceActivatedFabricCode(null);
    }
    setFabricAllocationState((current) => {
      const activeAllocation = current.fabricAllocations.find(
        (allocation) => allocation.allocationId === current.activeAllocationId,
      );
      if (!activeAllocation) return current;
      return assignFutureFabricToGarment({
        state: current,
        garmentTypeSelection,
        garmentKey,
        fabricCode: activeAllocation.fabricCode,
      }).state;
    });
  };
  const handleChooseAnotherFutureFabric = () => {
    setFabricAllocationState((current) =>
      FabricAllocationStateEngine.beginChooseAnotherFabric(current),
    );
  };
  const handleCancelFuturePendingFabric = () => {
    pendingAdditionalConstructionRef.current = null;
    setFabricAllocationState((current) =>
      FabricAllocationStateEngine.cancelPendingGarment(current),
    );
  };
  const garmentTypeBlockerMessage = !garmentTypeStageCompletion.isComplete
    ? "Select at least one garment, choose who the order is for, and resolve every construction price to continue to Fabric."
    : null;

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
                        ? futureShippingResolution.formComplete
                        : isFuturePaymentReviewUnlocked
      }
      className="font-sans"
    >
      <DesignStudioJourneyStepper
        currentStageId={futureStageId}
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
      {futureStageId === "garment_type" ? (
        <div className="space-y-5">
          <GarmentTypeStep
            selectedGarmentTypes={garmentTypeSelection.garmentTypes}
            selectedDemographics={getGarmentTypeSelectedDemographics(
              garmentTypeSelection,
            )}
            requiredGarmentCount={
              futureGarmentFabricPlanning.requiredGarmentCount
            }
            requiredFabricQuantity={
              futureGarmentFabricPlanning.requiredFabricQuantity
            }
            selectedFabricQuantity={
              futureGarmentFabricPlanning.selectedFabricQuantity
            }
            normalizedCustomDetailCatalog={normalizedGarmentTypeCatalog}
            onGarmentTypesChange={handleDormantGarmentTypesChange}
            onDemographicsChange={handleDormantGarmentDemographicsChange}
            onConstructionDefaultsChange={
              handleDormantConstructionDefaultsChange
            }
            statusMessage={garmentTypeBlockerMessage}
            idPrefix="future-garment-type-step"
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
          garmentTypeSelection={garmentTypeSelection}
          fabricAllocationState={fabricAllocationState}
          completion={futureFabricStageCompletion}
          requiredFabricQuantity={
            futureGarmentFabricPlanning.requiredFabricQuantity
          }
          selectedFabricQuantity={
            futureGarmentFabricPlanning.selectedFabricQuantity
          }
          constructionPrice={futureConstructionPrice}
          onAssignFabricToGarment={handleAssignFutureFabricToGarment}
          onRemoveFabricFromGarment={handleRemoveFutureFabricAssignment}
          onUseSameFabricForGarment={handleUseSameFutureFabricForGarment}
          onBack={() => setFutureStageId("garment_type")}
          onContinue={handleOpenDormantDesignStyleStage}
          onUseSameFabric={handleUseSameFutureFabric}
          onChooseAnotherFabric={handleChooseAnotherFutureFabric}
          onCancelPendingFabric={handleCancelFuturePendingFabric}
        />
      ) : futureStageId === "design_style" ? (
        <DormantFutureDesignStyleStep
          styles={styles}
          garmentTypeSelection={garmentTypeSelection}
          selectedStyleId={futureSelectedStyleId}
          stagePrice={
            futureFabricAuthoritativePricing?.garmentConstructionSubtotal ??
            null
          }
          uploadedDesign={{
            source: activeUploadedDesignSource,
            reference:
              activeUploadedDesignSource?.uploadReference ||
              uploadedDesignReference,
            composition:
              activeUploadedDesignSource?.fabricCapacityComposition.map(
                (spec) => ({ ...spec }),
              ) || uploadedDesignComposition,
            demographic:
              activeUploadedDesignSource?.demographic ||
              uploadedDesignDemographic,
            previewUrl: uploadedDesignPreviewUrl,
            error: uploadedDesignError,
            isUploading: isUploadingDesign,
            isReplacing: isReplacingDesign,
            isDeleting: isRemovingDesign,
            isLoadingPreview: isLoadingUploadedDesignPreview,
            isConfirmed: isFutureUploadedDesignConfirmed,
            isPricingActive: isFutureUploadedDesignPricingActive,
          }}
          pendingCatalogStyleName={
            styles.find((style) => style.id === pendingCatalogStyleId)?.name ||
            null
          }
          onSelectStyle={handleSelectFutureStyle}
          onUploadDesignFile={(file, isReplacement) =>
            void handleUploadedDesignFile(file, isReplacement)
          }
          onToggleUploadedGarment={handleUploadedDesignCompositionToggle}
          onUploadedDemographicChange={
            handleUploadedDesignDemographicChange
          }
          onRemoveUploadedDesign={() => void handleRemoveUploadedDesign()}
          onRetryUploadedDesignDeletion={
            handleRetryUploadedDesignDeletion
          }
          onContinueUploadedDesign={handleContinueWithUploadedDesign}
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
          constructionSubtotal={futureConstructionPrice}
          designSelections={designSelections}
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
          onRemoveAdditionalGarment={handleRemoveFutureAdditionalGarment}
          focusAdditionalGarmentKey={futureCustomDetailsFocusGarmentKey}
          onBack={() => setFutureStageId("design_style")}
          onContinue={handleOpenDormantAiTryOnStage}
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
        />
      ) : futureStageId === "shipping" ? (
        <DormantFutureShippingStep
          state={futureShippingResolution.state}
          resolution={futureShippingResolution}
          selectedDesignPrice={futureSelectedDesignPrice}
          garmentCount={futureFabricStageCompletion.requiredGarmentCount}
          onChange={setFutureShippingState}
          onRefreshQuote={handleRefreshDormantShippingQuote}
          onBack={() => setFutureStageId("summary")}
          canContinueToReview={isFuturePaymentReviewUnlocked}
          onContinueToReview={handleOpenDormantPaymentReviewStage}
        />
      ) : futureStageId === "payment" ? (
        <DormantFuturePaymentReviewStep
          result={futureOrderCandidateResult}
          onBack={() => setFutureStageId("shipping")}
          onEditStage={(stage) => setFutureStageId(stage)}
        />
      ) : null}
    </div>
  );
}
