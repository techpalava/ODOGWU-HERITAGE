import type { DesignStudioStageId, MeasurementUnit } from "../types";
import {
  type FutureOrderCandidateBlocker,
  type FutureOrderCandidateBuildResult,
  type FutureOrderCandidateCustomDetailV1,
  type FutureOrderCandidateFabricAllocationV1,
  type FutureOrderCandidateGarmentV1,
  type FutureOrderCandidatePricingV1,
  type FutureOrderCandidateV1,
  type FutureOrderCandidateV2,
} from "./futureOrderCandidate";
import {
  fromCanonicalCentimetres,
  roundMeasurementDisplayValue,
} from "./measurementBlueprint";

export const FUTURE_PAYMENT_UNAVAILABLE_MESSAGE =
  "Online payment is not available yet.";
export const FUTURE_ORDER_NOT_SUBMITTED_MESSAGE =
  "Your order has not been submitted or charged.";
export const FUTURE_ORDER_V2_PERSISTENCE_PENDING_MESSAGE =
  "This reviewed order cannot proceed to payment until V2 order persistence is established.";

export type FuturePaymentReviewCandidate =
  | FutureOrderCandidateV1
  | FutureOrderCandidateV2;

export interface FutureOrderV2PaymentReviewHandoff {
  readonly status: "reviewable";
  readonly candidate: FutureOrderCandidateV2;
  readonly blockers: readonly [FutureOrderCandidateBlocker];
}

export type FuturePaymentReviewResult =
  | FutureOrderCandidateBuildResult
  | FutureOrderV2PaymentReviewHandoff;

export const createFutureOrderV2PaymentReviewHandoff = (
  candidate: FutureOrderCandidateV2,
): FutureOrderV2PaymentReviewHandoff => ({
  status: "reviewable",
  candidate,
  blockers: [
    {
      code: "FUTURE_ORDER_V2_PERSISTENCE_PENDING",
      stage: "payment",
      message: FUTURE_ORDER_V2_PERSISTENCE_PENDING_MESSAGE,
    },
  ],
});

export interface FuturePaymentReviewGarment {
  readonly garment: FutureOrderCandidateGarmentV1;
  readonly fabricAllocations: readonly FutureOrderCandidateFabricAllocationV1[];
  readonly customDetails: readonly FutureOrderCandidateCustomDetailV1[];
}

export interface FuturePaymentReviewMeasurementItem {
  readonly measurementId: string;
  readonly label: string;
  readonly displayValue: number;
  readonly unitLabel: "in" | "cm";
  readonly provenanceLabel: "Customer entered" | "System derived" | "Calculated from height";
}

export interface FuturePaymentReviewMeasurementGroup {
  readonly garmentKey: string | null;
  readonly title: string;
  readonly items: readonly FuturePaymentReviewMeasurementItem[];
}

export interface FuturePaymentReviewPricingRow {
  readonly id:
    | "garment_construction"
    | "included_components"
    | "custom_details"
    | "post_eindhoven";
  readonly label: string;
  readonly amountCents: number | null;
  readonly valueLabel?: string;
}

const humanizeIdentifier = (value: string): string =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

export const isFuturePaymentReviewStageUnlocked = (
  result: FuturePaymentReviewResult,
): boolean =>
  result.status === "reviewable" &&
  result.candidate?.contentStatus === "reviewable";

export const getFuturePaymentReviewContentBlockers = (
  result: FuturePaymentReviewResult,
): readonly FutureOrderCandidateBlocker[] =>
  result.blockers.filter(
    (blocker) =>
      blocker.code !== "PAYMENT_PROVIDER_UNAVAILABLE" &&
      blocker.code !== "FUTURE_ORDER_V2_PERSISTENCE_PENDING",
  );

export const getFuturePaymentReviewContentStatusLabel = (
  candidate: FuturePaymentReviewCandidate,
): "Ready to review" | "Needs attention" | "Review unavailable" =>
  candidate.contentStatus === "reviewable"
    ? "Ready to review"
    : candidate.contentStatus === "blocked"
      ? "Needs attention"
      : "Review unavailable";

export const getFuturePaymentReviewEditStage = (
  blocker: FutureOrderCandidateBlocker,
): Exclude<DesignStudioStageId, "payment"> | null =>
  blocker.stage === "payment" ? null : blocker.stage;

export const getFuturePaymentReviewEditLabel = (
  stage: Exclude<DesignStudioStageId, "payment">,
): string =>
  ({
    garment_type: "Edit Garments",
    fabric: "Edit Fabrics",
    design_style: "Edit Design Style",
    custom_details: "Edit Custom Details",
    try_on: "Edit AI Try-on",
    measurement: "Edit Measurements",
    summary: "Review Summary",
    shipping: "Edit Delivery & Pickup",
  })[stage];

export const getFuturePaymentReviewGarments = (
  candidate: FuturePaymentReviewCandidate,
): readonly FuturePaymentReviewGarment[] =>
  candidate.garments.map((garment) => ({
    garment,
    fabricAllocations: candidate.fabricAllocations.filter((allocation) =>
      allocation.garmentAssignments.some(
        (assignment) => assignment.garmentKey === garment.garmentKey,
      ),
    ),
    customDetails: candidate.customDetails.filter(
      (detail) => detail.garmentKey === garment.garmentKey,
    ),
  }));

const toMeasurementItem = ({
  measurementId,
  valueCm,
  provenance,
  unit,
}: {
  measurementId: string;
  valueCm: number;
  provenance: "customer_entered" | "system_derived" | "calculated_average_factor";
  unit: MeasurementUnit;
}): FuturePaymentReviewMeasurementItem => ({
  measurementId,
  label: humanizeIdentifier(measurementId),
  displayValue: roundMeasurementDisplayValue(
    fromCanonicalCentimetres(valueCm, unit),
  ),
  unitLabel: unit === "inch" ? "in" : "cm",
  provenanceLabel:
    provenance === "customer_entered"
      ? "Customer entered"
      : provenance === "calculated_average_factor"
        ? "Calculated from height"
        : "System derived",
});

const mergeMeasurements = ({
  entered,
  derived,
  unit,
}: {
  entered: FutureOrderCandidateV1["measurements"]["entered"]["shared"];
  derived: FutureOrderCandidateV1["measurements"]["derived"]["shared"];
  unit: MeasurementUnit;
}): readonly FuturePaymentReviewMeasurementItem[] => {
  const merged = new Map([...Object.entries(derived), ...Object.entries(entered)]);
  return [...merged.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([measurementId, value]) =>
      toMeasurementItem({ measurementId, ...value, unit }),
    );
};

export const getFuturePaymentReviewMeasurementGroups = (
  candidate: FuturePaymentReviewCandidate,
): readonly FuturePaymentReviewMeasurementGroup[] => {
  const state = candidate.measurements;
  const garmentLabels = new Map(
    candidate.garments.map((garment) => [garment.garmentKey, garment.label]),
  );
  const garmentKeys = new Set([
    ...Object.keys(state.derived.byGarmentKey),
    ...Object.keys(state.entered.byGarmentKey),
  ]);
  const groups: FuturePaymentReviewMeasurementGroup[] = [];
  const shared = mergeMeasurements({
    entered: state.entered.shared,
    derived: state.derived.shared,
    unit: state.unit,
  });
  if (shared.length > 0) {
    groups.push({ garmentKey: null, title: "Shared measurements", items: shared });
  }
  [...garmentKeys].sort((left, right) => left.localeCompare(right)).forEach(
    (garmentKey) => {
      const items = mergeMeasurements({
        entered: state.entered.byGarmentKey[garmentKey] || {},
        derived: state.derived.byGarmentKey[garmentKey] || {},
        unit: state.unit,
      });
      if (items.length > 0) {
        groups.push({
          garmentKey,
          title: garmentLabels.get(garmentKey) || "Garment measurements",
          items,
        });
      }
    },
  );
  return groups;
};

export const getFuturePaymentReviewAiStatusLabel = (
  candidate: FuturePaymentReviewCandidate,
): "Completed" | "Skipped" | "Unavailable" | "Needs attention" => {
  if (candidate.aiTryOn.status === "completed") return "Completed";
  if (candidate.aiTryOn.status === "skipped") return "Skipped";
  if (candidate.aiTryOn.status === "unavailable") return "Unavailable";
  return "Needs attention";
};

export const getFuturePaymentReviewShippingStatusLabel = (
  candidate: FuturePaymentReviewCandidate,
): string =>
  ({
    quote_ready: "Delivery ready",
    pickup_arrangement_pending: "Pickup details pending",
    quote_pending: "Custom shipping quote required",
    quote_unavailable: "Custom shipping quote required",
    quote_stale: "Delivery details need refreshing",
    incomplete: "Delivery information incomplete",
    invalid: "Delivery information needs review",
  })[candidate.shipping.status];

export const getFuturePaymentReviewPricingRows = (
  pricing: FutureOrderCandidatePricingV1,
): readonly FuturePaymentReviewPricingRow[] => {
  const rows: FuturePaymentReviewPricingRow[] = [
    {
      id: "garment_construction",
      label: "Garment Construction Subtotal",
      amountCents: pricing.garmentConstructionSubtotalCents,
    },
    {
      id: "included_components",
      label: "Fabric, tax, Lagos-to-Eindhoven shipping, and sewing",
      amountCents: null,
      valueLabel: "Included in Garment Construction",
    },
    {
      id: "custom_details",
      label: "Custom Details",
      amountCents: pricing.customDetailsCents,
    },
    {
      id: "post_eindhoven",
      label: "Additional Delivery",
      amountCents: pricing.postEindhovenAdjustmentCents,
    },
  ];
  return rows;
};
