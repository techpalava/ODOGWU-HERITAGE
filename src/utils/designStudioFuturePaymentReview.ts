import type {
  DesignStudioStageId,
  FutureMeasurementStateV1,
  MeasurementUnit,
  SelectedMeasurementMethod,
  WearerOrderStateV2,
} from "../types";
import { isFutureMeasurementStateV1 } from "./measurementBlueprint";
import { isWearerOrderStateV2, wearerPublicLabel } from "./wearerOrder";
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
  isSampleClothHalfWidthMeasurement,
  isSampleClothMeasurementMethod,
  isSelectedMeasurementMethod,
  MEASUREMENT_METHOD_LABELS,
  roundMeasurementDisplayValue,
} from "./measurementBlueprint";

export const FUTURE_PAYMENT_UNAVAILABLE_MESSAGE =
  "Online payment is not available yet.";
export const FUTURE_ORDER_NOT_SUBMITTED_MESSAGE =
  "Your order has not been submitted or charged.";
export const FUTURE_ORDER_V2_PERSISTENCE_PENDING_MESSAGE =
  "This reviewed order cannot proceed to payment until V2 order persistence is established.";
export const FUTURE_ORDER_V2_PAYMENT_ACTIVATION_PENDING_MESSAGE =
  "Your order has been prepared. Payment activation is still unavailable.";
export const FUTURE_ORDER_V2_PAYMENT_READY_MESSAGE =
  "Your prepared order is ready for payment authorization.";

export type FuturePaymentReviewCandidate =
  | FutureOrderCandidateV1
  | FutureOrderCandidateV2;

export type FutureOrderV2PreparationPresentation =
  | { readonly status: "review_required" }
  | { readonly status: "preparing" }
  | { readonly status: "authentication_required"; readonly message: string }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "prepared";
      readonly cartItemId: string;
      readonly orderId: string;
    };

export type FutureOrderV2PaymentPresentation =
  | { readonly status: "not_ready" }
  | { readonly status: "ready" }
  | { readonly status: "processing"; readonly paymentReference: string }
  | { readonly status: "failed"; readonly paymentReference: string; readonly message: string }
  | {
      readonly status: "authorized";
      readonly paymentReference: string;
      readonly providerTransactionReference: string;
    };

export interface FutureOrderV2PaymentReviewHandoff {
  readonly status: "reviewable";
  readonly candidate: FutureOrderCandidateV2;
  readonly blockers: readonly FutureOrderCandidateBlocker[];
  readonly preparation: FutureOrderV2PreparationPresentation;
  readonly payment: FutureOrderV2PaymentPresentation;
}

export type FuturePaymentReviewResult =
  | FutureOrderCandidateBuildResult
  | FutureOrderV2PaymentReviewHandoff;

export const createFutureOrderV2PaymentReviewHandoff = (
  candidate: FutureOrderCandidateV2,
  preparation: FutureOrderV2PreparationPresentation = {
    status: "review_required",
  },
  payment: FutureOrderV2PaymentPresentation =
    preparation.status === "prepared"
      ? { status: "ready" }
      : { status: "not_ready" },
): FutureOrderV2PaymentReviewHandoff => ({
  status: "reviewable",
  candidate,
  preparation,
  payment,
  blockers:
    preparation.status === "prepared"
      ? []
      : [
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
  readonly provenanceLabel:
    | "Customer entered"
    | "System derived"
    | "Calculated from height"
    | "Converted from sample cloth";
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
  readonly presentation: "amount" | "supporting_note";
}

export const FUTURE_PAYMENT_REVIEW_INCLUDED_NOTE =
  "Fabric, tax, Lagos-to-Eindhoven shipping, and sewing included.";

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
      blocker.code !== "FUTURE_ORDER_V2_PERSISTENCE_PENDING" &&
      blocker.code !== "FUTURE_ORDER_V2_PAYMENT_ACTIVATION_PENDING",
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
  convertedFromSample,
}: {
  measurementId: string;
  valueCm: number;
  provenance: "customer_entered" | "system_derived" | "calculated_average_factor";
  unit: MeasurementUnit;
  convertedFromSample: boolean;
}): FuturePaymentReviewMeasurementItem => ({
  measurementId,
  label: humanizeIdentifier(measurementId),
  displayValue: roundMeasurementDisplayValue(
    fromCanonicalCentimetres(valueCm, unit),
  ),
  unitLabel: unit === "inch" ? "in" : "cm",
  provenanceLabel:
    convertedFromSample
      ? "Converted from sample cloth"
      : provenance === "customer_entered"
        ? "Customer entered"
        : provenance === "calculated_average_factor"
          ? "Calculated from height"
          : "System derived",
});

const formatMeasurementRoute = (route: SelectedMeasurementMethod): string =>
  route ? route.replaceAll("_", " ") : "method not selected";

const formatMeasurementStatus = (
  status: FutureMeasurementStateV1["calculationStatus"],
): string => status.replaceAll("_", " ");

export type FuturePaymentReviewMeasurementHeader =
  | {
      readonly kind: "single";
      readonly wearerLabel: string | null;
      readonly routeLabel: string;
      readonly statusLabel: string;
    }
  | {
      readonly kind: "wearers";
      readonly wearers: readonly {
        readonly wearerId: string;
        readonly displayName: string;
        readonly routeLabel: string;
        readonly statusLabel: string;
      }[];
    };

export const getFuturePaymentReviewMeasurementHeader = (
  measurements: FutureMeasurementStateV1 | WearerOrderStateV2,
): FuturePaymentReviewMeasurementHeader => {
  if (isWearerOrderStateV2(measurements)) {
    const wearers = [...measurements.wearers].sort(
      (left, right) => left.presentationOrder - right.presentationOrder,
    );
    if (wearers.length === 1) {
      const wearer = wearers[0];
      const name = wearer.displayName.trim();
      const routeLabel = formatMeasurementRoute(wearer.measurement.route);
      return {
        kind: "single",
        wearerLabel: !name || name.toLowerCase() === "you" ? null : name,
        routeLabel,
        statusLabel: formatMeasurementStatus(wearer.measurement.calculationStatus),
      };
    }
    return {
      kind: "wearers",
      wearers: wearers.map((wearer) => ({
        wearerId: wearer.wearerId,
        displayName: wearerPublicLabel(wearer.displayName, wearer.presentationOrder),
        routeLabel: formatMeasurementRoute(wearer.measurement.route),
        statusLabel: formatMeasurementStatus(wearer.measurement.calculationStatus),
      })),
    };
  }
  return {
    kind: "single",
    wearerLabel: null,
    routeLabel: formatMeasurementRoute(measurements.route),
    statusLabel: formatMeasurementStatus(measurements.calculationStatus),
  };
};

const mergeMeasurements = ({
  entered,
  derived,
  unit,
  route,
}: {
  entered: FutureMeasurementStateV1["entered"]["shared"];
  derived: FutureMeasurementStateV1["derived"]["shared"];
  unit: MeasurementUnit;
  route: SelectedMeasurementMethod;
}): readonly FuturePaymentReviewMeasurementItem[] => {
  const sampleRoute = isSampleClothMeasurementMethod(route);
  const measurementIds = [
    ...new Set([...Object.keys(derived), ...Object.keys(entered)]),
  ].sort((left, right) => left.localeCompare(right));
  return measurementIds.flatMap((measurementId) => {
    const enteredValue = entered[measurementId];
    const derivedValue = derived[measurementId];
    const preferDerived =
      sampleRoute &&
      isSampleClothHalfWidthMeasurement(measurementId) &&
      Boolean(derivedValue);
    const value = preferDerived ? derivedValue : enteredValue || derivedValue;
    if (!value) return [];
    return [toMeasurementItem({
      measurementId,
      ...value,
      unit,
      convertedFromSample: preferDerived,
    })];
  });
};

const groupsFromMeasurementBag = (
  state: FutureMeasurementStateV1,
  garments: readonly { garmentKey: string; label: string }[],
): readonly FuturePaymentReviewMeasurementGroup[] => {
  const garmentLabels = new Map(
    garments.map((garment) => [garment.garmentKey, garment.label]),
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
    route: state.route,
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
        route: state.route,
      });
      if (items.length > 0) {
        groups.push({
          garmentKey,
          title: garmentLabels.get(garmentKey) || garmentKey,
          items,
        });
      }
    },
  );
  return groups;
};

export const getFuturePaymentReviewMeasurementGroups = (
  candidate: {
    readonly measurements: FutureMeasurementStateV1 | WearerOrderStateV2;
    readonly garments: readonly { readonly garmentKey: string; readonly label: string }[];
  },
): readonly FuturePaymentReviewMeasurementGroup[] => {
  const measurements = candidate.measurements;
  if (isWearerOrderStateV2(measurements)) {
    if (measurements.wearers.length === 1) {
      return groupsFromMeasurementBag(measurements.wearers[0].measurement, candidate.garments);
    }
    if (measurements.wearers.length === 0) return [];
    const wearerOrder = measurements;
    const garmentLabels = new Map(
      candidate.garments.map((garment) => [garment.garmentKey, garment.label]),
    );
    const groups: FuturePaymentReviewMeasurementGroup[] = [];
    [...wearerOrder.wearers]
      .sort((left, right) => left.presentationOrder - right.presentationOrder)
      .forEach((wearer) => {
        const ownedKeys = Object.entries(wearerOrder.assignmentByGarmentKey)
          .filter(([, wearerId]) => wearerId === wearer.wearerId)
          .map(([garmentKey]) => garmentKey)
          .sort((left, right) => left.localeCompare(right));
        const shared = mergeMeasurements({
          entered: wearer.measurement.entered.shared,
          derived: wearer.measurement.derived.shared,
          unit: wearer.measurement.unit,
          route: wearer.measurement.route,
        });
        if (shared.length > 0) {
          groups.push({
            garmentKey: null,
            title: `${wearerPublicLabel(wearer.displayName, wearer.presentationOrder)} — ${
              isSelectedMeasurementMethod(wearer.measurement.route)
                ? MEASUREMENT_METHOD_LABELS[wearer.measurement.route]
                : "method not selected"
            }`,
            items: shared,
          });
        }
        ownedKeys.forEach((garmentKey) => {
          const items = mergeMeasurements({
            entered: wearer.measurement.entered.byGarmentKey[garmentKey] || {},
            derived: wearer.measurement.derived.byGarmentKey[garmentKey] || {},
            unit: wearer.measurement.unit,
            route: wearer.measurement.route,
          });
          if (items.length === 0) return;
          groups.push({
            garmentKey,
            title: `${wearerPublicLabel(wearer.displayName, wearer.presentationOrder)} — ${garmentLabels.get(garmentKey) || garmentKey}`,
            items,
          });
        });
      });
    return groups;
  }
  if (!isFutureMeasurementStateV1(measurements)) return [];
  return groupsFromMeasurementBag(measurements, candidate.garments);
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
      presentation: "amount",
    },
    {
      id: "included_components",
      label: FUTURE_PAYMENT_REVIEW_INCLUDED_NOTE,
      amountCents: null,
      presentation: "supporting_note",
    },
    {
      id: "custom_details",
      label: "Custom Details Subtotal",
      amountCents: pricing.customDetailsCents,
      presentation: "amount",
    },
  ];
  if (pricing.postEindhovenAdjustmentCents !== 0) {
    rows.push({
      id: "post_eindhoven",
      label: "Shipping",
      amountCents: pricing.postEindhovenAdjustmentCents,
      presentation: "amount",
    });
  }
  return rows;
};
