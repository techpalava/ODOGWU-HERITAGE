import type {
  DesignStudioStageId,
  FutureMeasurementStateV1,
  MeasurementUnit,
  SelectedMeasurementMethod,
  WearerOrderStateV2,
} from "../types";
import { isFutureMeasurementStateV1 } from "./measurementBlueprint";
import { isWearerOrderStateV2, wearerPublicLabel } from "./wearerOrder";
import { projectPersonGarmentLabels } from "./occurrenceDisplayLabel";
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
import type { FutureOrderV2PaymentMethod } from "./futureOrderV2Payment";
import {
  INDIVIDUAL_PAYMENT_REVIEW_CONSTRUCTION_NOTE,
  resolveIndividualInboundShippingDisplay,
} from "./individualInboundShippingDisplay";
import {
  formatDualUnitMeasurementDisplay,
  getDualUnitMeasurementParts,
  type DualUnitMeasurementParts,
  isMeasurementOutsideUsualRange,
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
export const FUTURE_ORDER_V2_PAY_HEADING = "Payment";
export const FUTURE_ORDER_V2_PAY_READY_MESSAGE =
  "Choose Apple Pay, Google Pay, card, or iDEAL and pay to place your order.";
export const FUTURE_ORDER_V2_REDIRECTING_MESSAGE =
  "Continue at your bank to authorize this iDEAL payment.";
export const FUTURE_ORDER_V2_KLARNA_REDIRECTING_MESSAGE =
  "Continue at Klarna to complete this payment.";
export const FUTURE_ORDER_V2_REDIRECTING_PAY_LABEL = "Continuing to your bank...";
export const FUTURE_ORDER_V2_KLARNA_REDIRECTING_PAY_LABEL = "Continuing to Klarna...";
/** @deprecated Use FUTURE_ORDER_V2_REDIRECTING_MESSAGE. */
export const FUTURE_ORDER_V2_PAYPAL_REDIRECTING_MESSAGE =
  FUTURE_ORDER_V2_REDIRECTING_MESSAGE;

/** Banner and pay-button label for the in-progress redirect. */
export const futureOrderV2RedirectingMessage = (
  method: FutureOrderV2PaymentMethod,
): string =>
  method === "klarna"
    ? FUTURE_ORDER_V2_KLARNA_REDIRECTING_MESSAGE
    : FUTURE_ORDER_V2_REDIRECTING_MESSAGE;

export const futureOrderV2RedirectingPayLabel = (
  method: FutureOrderV2PaymentMethod,
): string =>
  method === "klarna"
    ? FUTURE_ORDER_V2_KLARNA_REDIRECTING_PAY_LABEL
    : FUTURE_ORDER_V2_REDIRECTING_PAY_LABEL;
export const FUTURE_ORDER_V2_SIGN_IN_TO_PAY_MESSAGE =
  "Sign in to pay for this order.";

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
  | { readonly status: "redirecting"; readonly paymentReference: string }
  | { readonly status: "failed"; readonly paymentReference: string; readonly message: string }
  | {
      readonly status: "authorized";
      readonly paymentReference: string;
      readonly providerTransactionReference: string;
      readonly recording?: boolean;
      readonly recordError?: string;
    }
  | {
      readonly status: "confirmed";
      readonly paymentReference: string;
      readonly providerTransactionReference: string;
      readonly amountCents: number;
      readonly recordedAt: string;
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
  /** Preferred unit first, alternate in parentheses. Customer-facing payment review line. */
  readonly formattedDisplay: string;
  /** Preferred / alternate unit text for the split pill (same values as formattedDisplay). */
  readonly formattedParts: DualUnitMeasurementParts;
  /** Step 7 flagged this value as outside its usual range. Informational only. */
  readonly outsideUsualRange: boolean;
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
    | "lagos_eindhoven_included"
    | "custom_details"
    | "post_eindhoven";
  readonly label: string;
  readonly amountCents: number | null;
  readonly presentation: "amount" | "supporting_note" | "included";
}

export const FUTURE_PAYMENT_REVIEW_INCLUDED_NOTE =
  "Fabric, tax, Lagos-to-Eindhoven shipping, and sewing included.";

const humanizeIdentifier = (value: string): string =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

/**
 * The customer described a personalized requirement whose euro amount is
 * still waiting on tailoring review. The base total can be paid now.
 * Any extra is charged only after the customer accepts the evaluated price.
 */
export const isAwaitingPersonalizedPriceEvaluation = (
  candidate: FuturePaymentReviewCandidate,
): boolean =>
  candidate.contentStatus !== "reviewable" &&
  candidate.pricing.status === "pending" &&
  candidate.pricing.components.customDetails.status === "pricing_pending" &&
  candidate.customDetails.some(
    (detail) => detail.priceStatus === "evaluation_required",
  );

export const getFuturePaymentReviewContentBlockers = (
  result: FuturePaymentReviewResult,
): readonly FutureOrderCandidateBlocker[] =>
  result.blockers.filter(
    (blocker) =>
      blocker.code !== "PAYMENT_PROVIDER_UNAVAILABLE" &&
      blocker.code !== "FUTURE_ORDER_V2_PERSISTENCE_PENDING" &&
      blocker.code !== "FUTURE_ORDER_V2_PAYMENT_ACTIVATION_PENDING",
  );

export const isFuturePaymentReviewStageUnlocked = (
  result: FuturePaymentReviewResult,
): boolean => {
  if (result.status !== "reviewable" || !result.candidate) return false;
  if (result.candidate.contentStatus === "reviewable") return true;
  return (
    isAwaitingPersonalizedPriceEvaluation(result.candidate) &&
    getFuturePaymentReviewContentBlockers(result).length === 0
  );
};

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
  outsideUsualRange,
}: {
  measurementId: string;
  valueCm: number;
  provenance: "customer_entered" | "system_derived" | "calculated_average_factor";
  unit: MeasurementUnit;
  convertedFromSample: boolean;
  outsideUsualRange: boolean;
}): FuturePaymentReviewMeasurementItem => ({
  measurementId,
  label: humanizeIdentifier(measurementId),
  displayValue: roundMeasurementDisplayValue(
    fromCanonicalCentimetres(valueCm, unit),
  ),
  unitLabel: unit === "inch" ? "in" : "cm",
  formattedDisplay: formatDualUnitMeasurementDisplay(valueCm, unit),
  formattedParts: getDualUnitMeasurementParts(valueCm, unit),
  outsideUsualRange,
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

/** A solo wearer's public name, or null for a blank / generic "you" sole (stays unlabeled). */
const namedSoleWearerLabel = (displayName: string): string | null => {
  const name = displayName.trim();
  return !name || name.toLowerCase() === "you" ? null : name;
};

const measurementMethodTitle = (route: SelectedMeasurementMethod): string =>
  isSelectedMeasurementMethod(route)
    ? MEASUREMENT_METHOD_LABELS[route]
    : "method not selected";

export const getFuturePaymentReviewMeasurementHeader = (
  measurements: FutureMeasurementStateV1 | WearerOrderStateV2,
): FuturePaymentReviewMeasurementHeader => {
  if (isWearerOrderStateV2(measurements)) {
    const wearers = [...measurements.wearers].sort(
      (left, right) => left.presentationOrder - right.presentationOrder,
    );
    if (wearers.length === 1) {
      const wearer = wearers[0];
      const routeLabel = formatMeasurementRoute(wearer.measurement.route);
      return {
        kind: "single",
        wearerLabel: namedSoleWearerLabel(wearer.displayName),
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
  diagnostics,
  garmentKey,
}: {
  entered: FutureMeasurementStateV1["entered"]["shared"];
  derived: FutureMeasurementStateV1["derived"]["shared"];
  unit: MeasurementUnit;
  route: SelectedMeasurementMethod;
  diagnostics: FutureMeasurementStateV1["diagnostics"] | undefined;
  /** null for the shared bag. */
  garmentKey: string | null;
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
      outsideUsualRange: isMeasurementOutsideUsualRange(
        diagnostics,
        measurementId,
        garmentKey,
      ),
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
    diagnostics: state.diagnostics,
    garmentKey: null,
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
        diagnostics: state.diagnostics,
        garmentKey,
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
    readonly garments: readonly {
      readonly garmentKey: string;
      readonly label: string;
      readonly garmentType?: string;
    }[];
  },
  options: {
    /**
     * Stage 10 Payment Review only: inside a named person's group, drop the
     * order-wide " 2" suffix ("Amaka — Standard Shirt"), unless that person has
     * two garments with the same name. My orders keeps the numbered labels.
     */
    readonly plainPersonGarmentLabels?: boolean;
  } = {},
): readonly FuturePaymentReviewMeasurementGroup[] => {
  const measurements = candidate.measurements;
  if (isWearerOrderStateV2(measurements)) {
    if (measurements.wearers.length === 1) {
      const sole = measurements.wearers[0];
      const soleGroups = groupsFromMeasurementBag(sole.measurement, candidate.garments);
      const soleName = namedSoleWearerLabel(sole.displayName);
      if (!soleName) return soleGroups;
      // A named solo wearer is prefixed like multi-person groups: "{name} - {method|garment}".
      return soleGroups.map((group) => ({
        ...group,
        title: `${soleName} - ${
          group.garmentKey === null
            ? measurementMethodTitle(sole.measurement.route)
            : group.title
        }`,
      }));
    }
    if (measurements.wearers.length === 0) return [];
    const wearerOrder = measurements;
    const garmentLabels = new Map(
      candidate.garments.map((garment) => [garment.garmentKey, garment.label]),
    );
    const garmentTypes = new Map(
      candidate.garments.map((garment) => [garment.garmentKey, garment.garmentType]),
    );
    const groups: FuturePaymentReviewMeasurementGroup[] = [];
    [...wearerOrder.wearers]
      .sort((left, right) => left.presentationOrder - right.presentationOrder)
      .forEach((wearer) => {
        const ownedKeys = Object.entries(wearerOrder.assignmentByGarmentKey)
          .filter(([, wearerId]) => wearerId === wearer.wearerId)
          .map(([garmentKey]) => garmentKey)
          .sort((left, right) => left.localeCompare(right));
        const personGarmentLabels = options.plainPersonGarmentLabels
          ? projectPersonGarmentLabels(
              ownedKeys.map((garmentKey) => ({
                garmentKey,
                garmentType: garmentTypes.get(garmentKey),
                label: garmentLabels.get(garmentKey) || garmentKey,
              })),
            )
          : garmentLabels;
        const shared = mergeMeasurements({
          entered: wearer.measurement.entered.shared,
          derived: wearer.measurement.derived.shared,
          unit: wearer.measurement.unit,
          route: wearer.measurement.route,
          diagnostics: wearer.measurement.diagnostics,
          garmentKey: null,
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
            diagnostics: wearer.measurement.diagnostics,
            garmentKey,
          });
          if (items.length === 0) return;
          groups.push({
            garmentKey,
            title: `${wearerPublicLabel(wearer.displayName, wearer.presentationOrder)} — ${personGarmentLabels.get(garmentKey) || garmentKey}`,
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
  display?: {
    orderType?: string | null;
    batchType?: string | null;
    physicalGarmentCount?: number | null;
    fulfilmentMethod?: string | null;
  } | null,
): readonly FuturePaymentReviewPricingRow[] => {
  const includedInbound =
    typeof display?.physicalGarmentCount === "number"
      ? resolveIndividualInboundShippingDisplay({
          orderType: display.orderType,
          batchType: display.batchType,
          physicalGarmentCount: display.physicalGarmentCount,
          fulfilmentMethod: display.fulfilmentMethod,
        })
      : null;
  const individualOrder =
    display?.orderType === "Individual" ||
    (display?.batchType === "alone" &&
      display.orderType !== "Community" &&
      display.orderType !== "Group Organizer" &&
      display.orderType !== "Group Member");
  const rows: FuturePaymentReviewPricingRow[] = [
    {
      id: "garment_construction",
      label: "Garment Construction Subtotal",
      amountCents: pricing.garmentConstructionSubtotalCents,
      presentation: "amount",
    },
    {
      id: "included_components",
      label: includedInbound || individualOrder
        ? INDIVIDUAL_PAYMENT_REVIEW_CONSTRUCTION_NOTE
        : FUTURE_PAYMENT_REVIEW_INCLUDED_NOTE,
      amountCents: null,
      presentation: "supporting_note",
    },
  ];
  if (includedInbound) {
    rows.push({
      id: "lagos_eindhoven_included",
      label: includedInbound.label,
      amountCents: includedInbound.amountCents,
      presentation: "amount",
    });
  }
  rows.push({
    id: "custom_details",
    label: "Custom Details Subtotal",
    amountCents: pricing.customDetailsCents,
    presentation: "amount",
  });
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
