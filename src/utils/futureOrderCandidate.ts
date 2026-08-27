import type {
  AiTryOnWorkflowStateV1,
  CatalogDesignSource,
  DesignSource,
  DesignStudioStageId,
  FabricGarmentAssignment,
  FutureMeasurementStateV1,
  FutureShippingStateV1,
} from "../types";
import { DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION } from "./designSourceJourney";
import type { FutureShippingStageResolution } from "./designStudioFutureShipping";
import {
  projectFutureDesignStudioSummary,
  type FutureDesignStudioSummaryBlocker,
  type FutureDesignStudioSummaryInput,
} from "./designStudioFutureSummary";
import { projectActiveFutureMeasurementState } from "./measurementBlueprint";

export const FUTURE_ORDER_CANDIDATE_SCHEMA_VERSION = 1 as const;

export type FutureOrderCandidateStatus = "reviewable" | "blocked" | "invalid";
export type FutureOrderCandidatePaymentStatus =
  "payment_provider_unavailable";

export interface FutureOrderCandidateBlocker {
  readonly code: string;
  readonly stage: DesignStudioStageId;
  readonly message: string;
  readonly garmentKey?: string;
  readonly allocationId?: string;
  readonly diagnostic?: Readonly<{
    sourceCode?: string;
    sourceStatus?: string;
  }>;
}

export interface FutureOrderCandidateConstructionComponentV1 {
  readonly componentKey: string;
  readonly selectionGroup: string;
  readonly optionId: string;
  readonly label: string;
  readonly priceCents: number;
}

export interface FutureOrderCandidateGarmentV1 {
  readonly garmentKey: string;
  readonly garmentType: string;
  readonly label: string;
  readonly role: "main" | "additional";
  readonly demographic: string | null;
  readonly fabricUnits: number;
  readonly physicalComponents: readonly Readonly<{
    garmentKey: string;
    garmentType: string;
    label: string;
  }>[];
  readonly construction: readonly FutureOrderCandidateConstructionComponentV1[];
  readonly constructionTotalCents: number | null;
}

export interface FutureOrderCandidateFabricAllocationV1 {
  readonly allocationId: string;
  readonly fabricId: string | null;
  readonly fabricCode: string;
  readonly fabricName: string;
  readonly availability: "available" | "unavailable" | "missing";
  readonly capacityUnits: number;
  readonly materialPriceCents: number | null;
  readonly pricingTreatment: "included_in_garment_construction";
  readonly garmentAssignments: readonly FabricGarmentAssignment[];
}

export interface FutureOrderCandidateCustomDetailV1 {
  readonly occurrenceKey: string;
  readonly garmentKey: string;
  readonly garmentLabel: string;
  readonly selectionGroup: string;
  readonly selectionGroupTitle: string;
  readonly optionId: string;
  readonly optionLabel: string;
  readonly priceStatus: "exact" | "evaluation_required" | "invalid";
  readonly priceCents: number | null;
  readonly personalizedText: string | null;
  readonly snapshot: Readonly<{
    label: string;
    description: string;
    garmentGroup: string;
    informational: boolean;
    requiresEvaluation: boolean;
  }> | null;
}

export type FutureOrderCandidatePricingComponentStatus =
  | "included_in_garment_construction"
  | "separately_charged"
  | "pricing_pending"
  | "not_applicable";

export interface FutureOrderCandidatePricingComponentV2 {
  readonly status: FutureOrderCandidatePricingComponentStatus;
  readonly amountCents: number | null;
}

export interface FutureOrderCandidatePricingV1 {
  readonly schemaVersion: 2;
  readonly model: "all_inclusive_garment_construction";
  readonly status: "exact" | "pending" | "invalid";
  readonly garmentConstructionSubtotalCents: number | null;
  readonly customDetailsCents: number | null;
  readonly selectedDesignTotalCents: number | null;
  readonly postEindhovenAdjustmentCents: number | null;
  readonly exactTotalCents: number | null;
  readonly components: Readonly<{
    fabric: FutureOrderCandidatePricingComponentV2;
    sewing: FutureOrderCandidatePricingComponentV2;
    tax: FutureOrderCandidatePricingComponentV2;
    lagosToEindhovenShipping: FutureOrderCandidatePricingComponentV2;
    customDetails: FutureOrderCandidatePricingComponentV2;
    postEindhovenDelivery: FutureOrderCandidatePricingComponentV2;
  }>;
}

export interface FutureOrderCandidateV1 {
  readonly schemaVersion: 1;
  readonly journey: Readonly<{
    mode: "future_nine_stage";
    schemaVersion: number;
  }>;
  readonly authorityVersions: Readonly<{
    customDetailsSchemaVersion: number;
    measurementSchemaVersion: number;
    measurementBlueprintVersion: string;
    measurementFormulaVersion: string | null;
    shippingSchemaVersion: number;
    shippingTariffVersion: string | null;
    shippingRuleFingerprint: string | null;
    shippingInputFingerprint: string | null;
  }>;
  readonly source: Readonly<{
    kind: "catalog";
    sourceKey: string;
    styleId: string;
  }>;
  readonly design: Readonly<{
    styleId: string;
    name: string;
    image: string | null;
    demographic: string;
    compositionLabel: string;
    resolutionStatus: "selected";
    compatibilityStatus: string;
    compatibilityCode: string;
    compatibilityMessage: string;
  }> | null;
  readonly garments: readonly FutureOrderCandidateGarmentV1[];
  readonly fabricAllocations: readonly FutureOrderCandidateFabricAllocationV1[];
  readonly customDetails: readonly FutureOrderCandidateCustomDetailV1[];
  readonly aiTryOn: Readonly<{
    status: AiTryOnWorkflowStateV1["status"];
    reviewStatus: string;
    verifiedPrivateResultReference: Readonly<{
      kind: "verified_private_try_on_result";
      assetId: string;
      ownerBindingId: string;
    }> | null;
  }>;
  readonly measurements: FutureMeasurementStateV1;
  readonly shipping: Readonly<{
    state: FutureShippingStateV1;
    status: FutureShippingStageResolution["status"];
    customerInformationComplete: boolean;
    formComplete: boolean;
    quoteReady: boolean;
    destinationLabel: string | null;
    parcelWeightKg: number | null;
  }>;
  readonly pricing: FutureOrderCandidatePricingV1;
  readonly contentStatus: FutureOrderCandidateStatus;
  readonly paymentStatus: FutureOrderCandidatePaymentStatus;
  readonly blockers: readonly FutureOrderCandidateBlocker[];
}

export interface FutureOrderCandidateBuildInput
  extends FutureDesignStudioSummaryInput {
  readonly source: DesignSource | null;
  readonly shippingResolution: FutureShippingStageResolution;
}

export type FutureOrderCandidateBuildResult =
  | {
      readonly status: FutureOrderCandidateStatus;
      readonly paymentStatus: FutureOrderCandidatePaymentStatus;
      readonly candidate: FutureOrderCandidateV1;
      readonly blockers: readonly FutureOrderCandidateBlocker[];
    }
  | {
      readonly status: "invalid";
      readonly paymentStatus: FutureOrderCandidatePaymentStatus;
      readonly candidate: null;
      readonly blockers: readonly FutureOrderCandidateBlocker[];
    };

export type FutureOrderCandidateNormalizationResult =
  | {
      readonly status: "valid";
      readonly candidate: FutureOrderCandidateV1;
      readonly blockers: readonly [];
    }
  | {
      readonly status: "invalid";
      readonly candidate: null;
      readonly blockers: readonly FutureOrderCandidateBlocker[];
    };

const STAGE_ORDER: readonly DesignStudioStageId[] = [
  "garment_type",
  "fabric",
  "design_style",
  "custom_details",
  "try_on",
  "measurement",
  "summary",
  "shipping",
  "payment",
];

const SUMMARY_STAGE: Record<
  FutureDesignStudioSummaryBlocker["section"],
  DesignStudioStageId
> = {
  garments: "garment_type",
  fabrics: "fabric",
  design_style: "design_style",
  custom_details: "custom_details",
  ai_try_on: "try_on",
  measurements: "measurement",
  pricing: "summary",
};

const PAYMENT_BLOCKER: FutureOrderCandidateBlocker = Object.freeze({
  code: "PAYMENT_PROVIDER_UNAVAILABLE",
  stage: "payment",
  message: "Online payment is not available yet.",
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const isStableIdentifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.trim() === value;

const isMoneyCents = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const moneyToCents = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  const cents = Math.round(value * 100);
  return Number.isSafeInteger(cents) ? cents : null;
};

const cloneJsonValue = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const deepFreeze = <T>(value: T): T => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.values(value as Record<string, unknown>).forEach((nested) =>
    deepFreeze(nested),
  );
  return Object.freeze(value);
};

const compareBlockers = (
  left: FutureOrderCandidateBlocker,
  right: FutureOrderCandidateBlocker,
): number =>
  STAGE_ORDER.indexOf(left.stage) - STAGE_ORDER.indexOf(right.stage) ||
  left.code.localeCompare(right.code) ||
  (left.garmentKey || "").localeCompare(right.garmentKey || "") ||
  (left.allocationId || "").localeCompare(right.allocationId || "");

const sortBlockers = (
  blockers: readonly FutureOrderCandidateBlocker[],
): FutureOrderCandidateBlocker[] => {
  const unique = new Map<string, FutureOrderCandidateBlocker>();
  blockers.forEach((blocker) => {
    const key = [
      blocker.stage,
      blocker.code,
      blocker.garmentKey || "",
      blocker.allocationId || "",
    ].join("\u0000");
    if (!unique.has(key)) unique.set(key, blocker);
  });
  return [...unique.values()].sort(compareBlockers);
};

const mapSummaryBlocker = (
  blocker: FutureDesignStudioSummaryBlocker,
): FutureOrderCandidateBlocker => ({
  code: blocker.code,
  stage: SUMMARY_STAGE[blocker.section],
  message: blocker.message,
  ...(blocker.garmentKey ? { garmentKey: blocker.garmentKey } : {}),
  ...(blocker.allocationId ? { allocationId: blocker.allocationId } : {}),
  diagnostic: { sourceCode: blocker.code },
});

const getShippingBlocker = (
  resolution: FutureShippingStageResolution,
): FutureOrderCandidateBlocker | null => {
  const definitions: Partial<
    Record<
      FutureShippingStageResolution["status"],
      Pick<FutureOrderCandidateBlocker, "code" | "message">
    >
  > = {
    incomplete: {
      code: "SHIPPING_INCOMPLETE",
      message: "Complete Shipping before reviewing the order.",
    },
    invalid: {
      code: "SHIPPING_INVALID",
      message: "Shipping information needs review.",
    },
    quote_pending: {
      code: "DELIVERY_QUOTE_PENDING",
      message: "The destination delivery quote is still pending.",
    },
    quote_unavailable: {
      code: "DELIVERY_QUOTE_PENDING",
      message: "The destination delivery quote is not available yet.",
    },
    quote_stale: {
      code: "STALE_SHIPPING_QUOTE",
      message: "Refresh the destination delivery quote.",
    },
    pickup_arrangement_pending: {
      code: "PICKUP_FEE_PENDING",
      message: "Eindhoven pickup arrangements are still pending.",
    },
  };
  const definition = definitions[resolution.status];
  return definition
    ? {
        ...definition,
        stage: "shipping",
        diagnostic: { sourceStatus: resolution.status },
      }
    : null;
};

const getCatalogSource = (
  source: DesignSource | null,
): CatalogDesignSource | null => source?.kind === "catalog" ? source : null;

const buildPricing = ({
  input,
  blockers,
}: {
  input: FutureOrderCandidateBuildInput;
  blockers: FutureOrderCandidateBlocker[];
}): FutureOrderCandidatePricingV1 => {
  const summary = projectFutureDesignStudioSummary(input);
  const selected = summary.pricingSummary.selectedDesignPrice;
  const constructionSubtotalCents = moneyToCents(
    summary.pricingSummary.garmentConstructionSubtotal,
  );
  const customDetailsCents =
    summary.pricingSummary.status === "exact"
      ? moneyToCents(summary.pricingSummary.customDetailsExactSubtotal)
      : null;
  const selectedTotalCents = selected
    ? moneyToCents(selected.selectedDesignPrice)
    : null;
  const postEindhovenCents = input.shippingResolution.postEindhovenAdjustmentCents;
  const exactTotalCents = input.shippingResolution.projectedTotalCents;
  const moneyValues = [
    constructionSubtotalCents,
    customDetailsCents,
    selectedTotalCents,
    postEindhovenCents,
    exactTotalCents,
  ];
  const hasMalformedSourceMoney =
    !input.basePricing ||
    moneyToCents(input.basePricing.garmentConstructionSubtotal) === null ||
    (input.materialPricing?.status === "resolved" &&
      input.materialPricing.allocationLines.some(
        (line) => moneyToCents(line.materialPrice) === null,
      )) ||
    input.garmentTypeSelection.garmentTypes.some((garmentType) => {
      const construction =
        input.garmentTypeSelection.constructionByGarment[garmentType];
      return construction?.status === "resolved" &&
        (!isMoneyCents(construction.totalPriceCents) ||
          construction.components.some(
            (component) => !isMoneyCents(component.priceCents),
          ));
    }) ||
    Boolean(
      input.customDetailsPricing?.lines.some(
        (line) =>
          (line.unitPriceCents !== undefined &&
            !isMoneyCents(line.unitPriceCents)) ||
          (line.lineTotalCents !== undefined &&
            !isMoneyCents(line.lineTotalCents)),
      ),
    );
  const hasMalformedCents = hasMalformedSourceMoney || moneyValues.some(
    (value) => value !== null && !isMoneyCents(value),
  );
  const selectedMatches =
    constructionSubtotalCents !== null &&
    customDetailsCents !== null &&
    selectedTotalCents !== null &&
    constructionSubtotalCents + customDetailsCents === selectedTotalCents;
  const finalMatches =
    selectedTotalCents !== null &&
    postEindhovenCents !== null &&
    exactTotalCents !== null &&
    selectedTotalCents + postEindhovenCents === exactTotalCents;

  if (hasMalformedCents) {
    blockers.push({
      code: "MALFORMED_MONEY",
      stage: "summary",
      message: "One price value needs review.",
    });
  }
  if (
    summary.pricingSummary.status === "exact" &&
    !selectedMatches
  ) {
    blockers.push({
      code: "NON_AUTHORITATIVE_TOTAL",
      stage: "summary",
      message: "The order total needs to be recalculated.",
    });
  }
  if (
    input.shippingResolution.status === "quote_ready" &&
    !finalMatches
  ) {
    blockers.push({
      code: "NON_AUTHORITATIVE_TOTAL",
      stage: "shipping",
      message: "The delivery total needs to be recalculated.",
    });
  }

  const status = blockers.some((blocker) =>
    ["MALFORMED_MONEY", "NON_AUTHORITATIVE_TOTAL", "PRICING_INVALID"].includes(
      blocker.code,
    ),
  )
    ? "invalid"
    : summary.pricingSummary.status === "exact" &&
        input.shippingResolution.status === "quote_ready" &&
        selectedMatches && finalMatches
      ? "exact"
      : "pending";

  return {
    schemaVersion: 2,
    model: "all_inclusive_garment_construction",
    status,
    garmentConstructionSubtotalCents: constructionSubtotalCents,
    customDetailsCents,
    selectedDesignTotalCents: selectedTotalCents,
    postEindhovenAdjustmentCents:
      isMoneyCents(postEindhovenCents) ? postEindhovenCents : null,
    exactTotalCents: status === "exact" && isMoneyCents(exactTotalCents)
      ? exactTotalCents
      : null,
    components: {
      fabric: { status: "included_in_garment_construction", amountCents: null },
      sewing: { status: "included_in_garment_construction", amountCents: null },
      tax: { status: "included_in_garment_construction", amountCents: null },
      lagosToEindhovenShipping: {
        status: "included_in_garment_construction",
        amountCents: null,
      },
      customDetails: {
        status:
          summary.pricingSummary.status === "exact"
            ? "separately_charged"
            : "pricing_pending",
        amountCents: customDetailsCents,
      },
      postEindhovenDelivery: {
        status:
          input.shippingResolution.status === "quote_ready"
            ? "separately_charged"
            : input.shippingResolution.state.fulfilmentMethod === null
              ? "not_applicable"
              : "pricing_pending",
        amountCents:
          isMoneyCents(postEindhovenCents) ? postEindhovenCents : null,
      },
    },
  };
};

const INVALID_CONTENT_CODES = new Set([
  "INVALID_JOURNEY_MODE",
  "INVALID_JOURNEY_SCHEMA",
  "UNSUPPORTED_FUTURE_SOURCE",
  "SOURCE_STYLE_MISMATCH",
  "MALFORMED_MONEY",
  "NON_AUTHORITATIVE_TOTAL",
  "GARMENT_CONSTRUCTION_INVALID",
  "GARMENT_COMPONENT_INVALID",
  "GARMENT_CONSTRUCTION_PRICE_INVALID",
  "FABRIC_PRICE_INVALID",
  "DESIGN_STYLE_INVALID",
  "CUSTOM_DETAILS_INVALID",
  "MEASUREMENT_INVALID",
  "PRICING_INVALID",
  "SHIPPING_INVALID",
]);

export const buildFutureOrderCandidate = (
  input: FutureOrderCandidateBuildInput,
): FutureOrderCandidateBuildResult => {
  const source = getCatalogSource(input.source);
  if (!source) {
    const blocker: FutureOrderCandidateBlocker = {
      code: "UNSUPPORTED_FUTURE_SOURCE",
      stage: "design_style",
      message: "This design source is not supported in the future order review yet.",
    };
    return deepFreeze({
      status: "invalid",
      paymentStatus: "payment_provider_unavailable",
      candidate: null,
      blockers: sortBlockers([blocker, PAYMENT_BLOCKER]),
    });
  }

  const summary = projectFutureDesignStudioSummary(input);
  const blockers = summary.blockers.map(mapSummaryBlocker);
  if (source.styleId !== input.designStyleSelection.selectedStyleId) {
    blockers.push({
      code: "SOURCE_STYLE_MISMATCH",
      stage: "design_style",
      message: "Select the Design Style again before reviewing the order.",
    });
  }
  const physicalGarmentCount = new Set(
    input.fabricAllocationState.fabricAllocations.flatMap((allocation) =>
      allocation.garmentAssignments.map((assignment) => assignment.garmentKey),
    ),
  ).size;
  const shippingGarmentCount =
    input.shippingResolution.state.quoteReference?.garmentCount;
  if (
    input.shippingResolution.status === "quote_ready" &&
    shippingGarmentCount !== physicalGarmentCount
  ) {
    blockers.push({
      code: "STALE_SHIPPING_QUOTE",
      stage: "shipping",
      message: "Refresh the destination delivery quote.",
      diagnostic: {
        sourceStatus: "garment_count_mismatch",
      },
    });
  }
  const shippingBlocker = getShippingBlocker(input.shippingResolution);
  if (shippingBlocker) blockers.push(shippingBlocker);
  const pricing = buildPricing({ input, blockers });
  blockers.push(PAYMENT_BLOCKER);

  const pricingByAllocation = new Map(
    input.materialPricing?.status === "resolved"
      ? input.materialPricing.allocationLines.map((line) => [line.allocationId, line])
      : [],
  );
  const allocationById = new Map(
    input.fabricAllocationState.fabricAllocations.map((allocation) => [
      allocation.allocationId,
      allocation,
    ]),
  );
  const garments: FutureOrderCandidateGarmentV1[] = summary.garmentSummary.map(
    (garment) => {
      const resolved = input.garmentTypeSelection.constructionByGarment[
        garment.garmentType
      ];
      const selectionGroupByComponent = new Map(
        resolved?.status === "resolved"
          ? resolved.components.map((component) => [
              component.componentKey,
              component.selectionGroup,
            ])
          : [],
      );
      return {
        ...garment,
        physicalComponents: garment.physicalComponents.map((component) => ({
          ...component,
        })),
        construction: garment.construction.map((component) => ({
          ...component,
          selectionGroup:
            selectionGroupByComponent.get(component.componentKey) || "unknown",
        })),
      };
    },
  );
  const fabricAllocations: FutureOrderCandidateFabricAllocationV1[] =
    summary.fabricSummary.map((fabric) => {
      const line = pricingByAllocation.get(fabric.allocationId);
      const allocation = allocationById.get(fabric.allocationId);
      return {
        allocationId: fabric.allocationId,
        fabricId: line?.fabric.id || null,
        fabricCode: fabric.fabricCode,
        fabricName: fabric.fabricName,
        availability: fabric.availability,
        capacityUnits: fabric.capacityUnits,
        materialPriceCents: moneyToCents(fabric.materialPrice),
        pricingTreatment: "included_in_garment_construction",
        garmentAssignments: cloneJsonValue(allocation?.garmentAssignments || []),
      };
    });
  const customDetails: FutureOrderCandidateCustomDetailV1[] =
    summary.customDetailsSummary.flatMap((group) =>
      group.occurrences.map((occurrence) => {
        const snapshot = input.customDetailsReconciliation?.state
          .snapshotsByGarmentKey[occurrence.garmentKey]?.[
            occurrence.selectionGroup as keyof typeof input.customDetailsReconciliation.state.snapshotsByGarmentKey[string]
          ]?.find((candidate) => candidate.optionId === occurrence.optionId);
        return {
          ...occurrence,
          snapshot: snapshot
            ? {
                label: snapshot.label,
                description: snapshot.description,
                garmentGroup: snapshot.garmentGroup,
                informational: snapshot.informational === true,
                requiresEvaluation: snapshot.requiresEvaluation === true,
              }
            : null,
        };
      }),
    );
  const compatibility = input.designStyleSelection.compatibility;
  const design = summary.designStyleSummary
    ? {
        ...summary.designStyleSummary,
        resolutionStatus: "selected" as const,
        compatibilityStatus: compatibility?.status || "indeterminate",
        compatibilityCode: compatibility?.code || "STYLE_ID_MISSING",
        compatibilityMessage:
          compatibility?.customerReason || "Design Style compatibility needs review.",
      }
    : null;
  const verifiedPrivateResultReference =
    input.aiTryOnWorkflow.status === "completed" &&
    input.aiTryOnWorkflow.resultReference?.kind ===
      "verified_private_try_on_result"
      ? cloneJsonValue(input.aiTryOnWorkflow.resultReference)
      : null;
  const sortedBlockers = sortBlockers(blockers);
  const contentBlockers = sortedBlockers.filter(
    (blocker) => blocker.code !== PAYMENT_BLOCKER.code,
  );
  const contentStatus: FutureOrderCandidateStatus = contentBlockers.some(
    (blocker) => INVALID_CONTENT_CODES.has(blocker.code),
  )
    ? "invalid"
    : contentBlockers.length === 0 && pricing.status === "exact"
      ? "reviewable"
      : "blocked";
  const quoteReference = input.shippingResolution.state.quoteReference;
  const candidate: FutureOrderCandidateV1 = {
    schemaVersion: FUTURE_ORDER_CANDIDATE_SCHEMA_VERSION,
    journey: {
      mode: "future_nine_stage",
      schemaVersion: DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION,
    },
    authorityVersions: {
      customDetailsSchemaVersion:
        input.customDetailsReconciliation?.state.schemaVersion || 1,
      measurementSchemaVersion: input.measurementState.schemaVersion,
      measurementBlueprintVersion: input.measurementState.blueprintVersion,
      measurementFormulaVersion: input.measurementState.formulaVersion,
      shippingSchemaVersion: input.shippingResolution.state.schemaVersion,
      shippingTariffVersion: quoteReference?.tariffVersion || null,
      shippingRuleFingerprint: quoteReference?.ruleFingerprint || null,
      shippingInputFingerprint: quoteReference?.inputFingerprint || null,
    },
    source: {
      kind: "catalog",
      sourceKey: source.sourceKey,
      styleId: source.styleId,
    },
    design,
    garments,
    fabricAllocations,
    customDetails,
    aiTryOn: {
      status: input.aiTryOnWorkflow.status,
      reviewStatus: summary.aiTryOnSummary.status,
      verifiedPrivateResultReference,
    },
    measurements: cloneJsonValue(
      projectActiveFutureMeasurementState({
        state: input.measurementState,
        plan: input.measurementPlan,
      }),
    ),
    shipping: {
      state: cloneJsonValue(input.shippingResolution.state),
      status: input.shippingResolution.status,
      customerInformationComplete:
        input.shippingResolution.customerInformationComplete,
      formComplete: input.shippingResolution.formComplete,
      quoteReady: input.shippingResolution.quoteReady,
      destinationLabel: input.shippingResolution.destinationLabel,
      parcelWeightKg: input.shippingResolution.parcelWeightKg,
    },
    pricing,
    contentStatus,
    paymentStatus: "payment_provider_unavailable",
    blockers: sortedBlockers,
  };
  const frozen = deepFreeze(cloneJsonValue(candidate));
  return deepFreeze({
    status: contentStatus,
    paymentStatus: frozen.paymentStatus,
    candidate: frozen,
    blockers: frozen.blockers,
  });
};

const FORBIDDEN_FIELD_NAMES = new Set([
  "cardnumber",
  "cvc",
  "cvv",
  "expiry",
  "paymenttoken",
  "providersecret",
  "rawpaymentresponse",
  "rawuploadedimage",
  "rawimage",
  "base64",
  "bodyphotourl",
  "publicbodyphotourl",
  "authenticationtoken",
  "authtoken",
  "idtoken",
  "accesstoken",
  "refreshtoken",
  "providerpayload",
  "jobreference",
  "jobid",
  "storagepath",
]);

export interface FutureOrderCandidateSecurityInspection {
  readonly safe: boolean;
  readonly forbiddenPaths: readonly string[];
}

export const inspectFutureOrderCandidateSecurity = (
  value: unknown,
): FutureOrderCandidateSecurityInspection => {
  const forbiddenPaths: string[] = [];
  const visit = (current: unknown, path: string) => {
    if (Array.isArray(current)) {
      current.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (!isRecord(current)) return;
    Object.entries(current).forEach(([key, nested]) => {
      const nestedPath = path ? `${path}.${key}` : key;
      if (FORBIDDEN_FIELD_NAMES.has(key.toLowerCase())) {
        forbiddenPaths.push(nestedPath);
      }
      visit(nested, nestedPath);
    });
  };
  visit(value, "");
  return {
    safe: forbiddenPaths.length === 0,
    forbiddenPaths: forbiddenPaths.sort((left, right) => left.localeCompare(right)),
  };
};

const invalidNormalization = (
  code: string,
  message: string,
): FutureOrderCandidateNormalizationResult =>
  deepFreeze({
    status: "invalid",
    candidate: null,
    blockers: [{ code, stage: "summary", message }],
  });

export const normalizeFutureOrderCandidate = (
  value: unknown,
): FutureOrderCandidateNormalizationResult => {
  let parsed: unknown = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return invalidNormalization(
        "MALFORMED_CANDIDATE_JSON",
        "The saved order review could not be read.",
      );
    }
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1) {
    return invalidNormalization(
      "UNSUPPORTED_CANDIDATE_SCHEMA",
      "This saved order review uses an unsupported version.",
    );
  }
  const security = inspectFutureOrderCandidateSecurity(parsed);
  if (!security.safe) {
    return invalidNormalization(
      "FORBIDDEN_SENSITIVE_FIELD",
      "The saved order review contains unsupported sensitive data.",
    );
  }
  if (
    !isRecord(parsed.journey) ||
    parsed.journey.mode !== "future_nine_stage" ||
    parsed.journey.schemaVersion !== DESIGN_STUDIO_NINE_STAGE_SCHEMA_VERSION ||
    !isRecord(parsed.source) ||
    parsed.source.kind !== "catalog" ||
    !isStableIdentifier(parsed.source.sourceKey) ||
    !isStableIdentifier(parsed.source.styleId) ||
    !Array.isArray(parsed.garments) ||
    !Array.isArray(parsed.fabricAllocations) ||
    !Array.isArray(parsed.customDetails) ||
    !isRecord(parsed.pricing) ||
    !isRecord(parsed.shipping) ||
    !isRecord(parsed.measurements) ||
    !Array.isArray(parsed.blockers) ||
    !["reviewable", "blocked", "invalid"].includes(
      String(parsed.contentStatus),
    ) ||
    parsed.paymentStatus !== "payment_provider_unavailable"
  ) {
    return invalidNormalization(
      "MALFORMED_CANDIDATE",
      "The saved order review contains invalid data.",
    );
  }
  const pricingComponents = parsed.pricing.components;
  if (
    parsed.pricing.schemaVersion !== 2 ||
    parsed.pricing.model !== "all_inclusive_garment_construction" ||
    !isRecord(pricingComponents)
  ) {
    return invalidNormalization(
      "MALFORMED_CANDIDATE",
      "The saved order review uses an unsupported pricing ledger.",
    );
  }
  const moneyFields = [
    "garmentConstructionSubtotalCents",
    "customDetailsCents",
    "selectedDesignTotalCents",
    "postEindhovenAdjustmentCents",
    "exactTotalCents",
  ];
  if (
    moneyFields.some((field) => {
      const money = parsed.pricing[field];
      return money !== null && money !== undefined && !isMoneyCents(money);
    }) ||
    parsed.garments.some(
      (garment) =>
        !isRecord(garment) ||
        (garment.constructionTotalCents !== null &&
          !isMoneyCents(garment.constructionTotalCents)) ||
        !Array.isArray(garment.construction) ||
        garment.construction.some(
          (component) =>
            !isRecord(component) || !isMoneyCents(component.priceCents),
        ),
    ) ||
    parsed.fabricAllocations.some(
      (allocation) =>
        !isRecord(allocation) ||
        allocation.pricingTreatment !== "included_in_garment_construction" ||
        (allocation.materialPriceCents !== null &&
          !isMoneyCents(allocation.materialPriceCents)),
    ) ||
    parsed.customDetails.some(
      (detail) =>
        !isRecord(detail) ||
        (detail.priceCents !== null && !isMoneyCents(detail.priceCents)),
    )
  ) {
    return invalidNormalization(
      "MALFORMED_MONEY",
      "The saved order review contains an invalid price.",
    );
  }
  const pricingStatus = parsed.pricing.status;
  const constructionCents = parsed.pricing.garmentConstructionSubtotalCents;
  const customDetailsCents = parsed.pricing.customDetailsCents;
  const selectedTotalCents = parsed.pricing.selectedDesignTotalCents;
  const finalMileCents = parsed.pricing.postEindhovenAdjustmentCents;
  const exactTotalCents = parsed.pricing.exactTotalCents;
  const includedComponentKeys = [
    "fabric",
    "sewing",
    "tax",
    "lagosToEindhovenShipping",
  ];
  const includedComponentsAreValid = includedComponentKeys.every((key) => {
    const component = pricingComponents[key];
    return isRecord(component) &&
      component.status === "included_in_garment_construction" &&
      component.amountCents === null;
  });
  const customDetailsComponent = pricingComponents.customDetails;
  const finalMileComponent = pricingComponents.postEindhovenDelivery;
  const separatelyTrackedComponentsAreValid =
    isRecord(customDetailsComponent) &&
    ["separately_charged", "pricing_pending"].includes(
      String(customDetailsComponent.status),
    ) &&
    (customDetailsComponent.amountCents === null ||
      isMoneyCents(customDetailsComponent.amountCents)) &&
    isRecord(finalMileComponent) &&
    ["separately_charged", "pricing_pending", "not_applicable"].includes(
      String(finalMileComponent.status),
    ) &&
    (finalMileComponent.amountCents === null ||
      isMoneyCents(finalMileComponent.amountCents));
  const garmentConstructionCents = parsed.garments.reduce(
    (total, garment) =>
      total +
      (isRecord(garment) && isMoneyCents(garment.constructionTotalCents)
        ? Number(garment.constructionTotalCents)
        : 0),
    0,
  );
  if (!includedComponentsAreValid || !separatelyTrackedComponentsAreValid) {
    return invalidNormalization(
      "MALFORMED_CANDIDATE",
      "The saved order review contains invalid pricing component states.",
    );
  }
  const exactPricingReconciles =
    pricingStatus === "exact" &&
    [
      constructionCents,
      customDetailsCents,
      selectedTotalCents,
      finalMileCents,
      exactTotalCents,
    ].every(isMoneyCents) &&
    includedComponentsAreValid &&
    separatelyTrackedComponentsAreValid &&
    customDetailsComponent.status === "separately_charged" &&
    Number(customDetailsComponent.amountCents) === Number(customDetailsCents) &&
    finalMileComponent.status === "separately_charged" &&
    Number(finalMileComponent.amountCents) === Number(finalMileCents) &&
    garmentConstructionCents === Number(constructionCents) &&
    Number(constructionCents) + Number(customDetailsCents) ===
      Number(selectedTotalCents) &&
    Number(selectedTotalCents) + Number(finalMileCents) ===
      Number(exactTotalCents);
  if (
    (pricingStatus === "exact" && !exactPricingReconciles) ||
    (parsed.contentStatus === "reviewable" && !exactPricingReconciles) ||
    (pricingStatus !== "exact" && exactTotalCents !== null)
  ) {
    return invalidNormalization(
      "NON_AUTHORITATIVE_TOTAL",
      "The saved order total needs to be recalculated.",
    );
  }
  const clone = cloneJsonValue(parsed) as unknown as FutureOrderCandidateV1;
  return deepFreeze({ status: "valid", candidate: deepFreeze(clone), blockers: [] });
};

export const cloneFutureOrderCandidate = (
  candidate: FutureOrderCandidateV1,
): FutureOrderCandidateNormalizationResult =>
  normalizeFutureOrderCandidate(cloneJsonValue(candidate));

export const enumerateFutureOrderCandidateGarments = (
  candidate: FutureOrderCandidateV1,
): readonly FutureOrderCandidateGarmentV1[] =>
  deepFreeze(cloneJsonValue(candidate.garments));

export const enumerateFutureOrderCandidateFabricAllocations = (
  candidate: FutureOrderCandidateV1,
): readonly FutureOrderCandidateFabricAllocationV1[] =>
  deepFreeze(cloneJsonValue(candidate.fabricAllocations));

export const enumerateFutureOrderCandidateCustomDetails = (
  candidate: FutureOrderCandidateV1,
): readonly FutureOrderCandidateCustomDetailV1[] =>
  deepFreeze(cloneJsonValue(candidate.customDetails));

export const enumerateFutureOrderCandidateBlockers = (
  candidate: FutureOrderCandidateV1,
): readonly FutureOrderCandidateBlocker[] =>
  deepFreeze(sortBlockers(cloneJsonValue(candidate.blockers)));

export type FutureOrderCandidateSerializationResult =
  | { readonly status: "serialized"; readonly json: string }
  | {
      readonly status: "invalid";
      readonly blockers: readonly FutureOrderCandidateBlocker[];
    };

export const serializeFutureOrderCandidate = (
  candidate: FutureOrderCandidateV1,
): FutureOrderCandidateSerializationResult => {
  const normalized = normalizeFutureOrderCandidate(candidate);
  return normalized.status === "valid"
    ? { status: "serialized", json: JSON.stringify(normalized.candidate) }
    : { status: "invalid", blockers: normalized.blockers };
};

/** Production CartItem/MasterOrder conversion is intentionally unavailable. */
export const FUTURE_ORDER_CANDIDATE_PRODUCTION_CONVERSION = Object.freeze({
  supported: false as const,
  reason:
    "A lossless production cart and order adapter has not been implemented.",
});
