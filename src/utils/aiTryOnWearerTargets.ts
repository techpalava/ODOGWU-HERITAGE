import type {
  CanonicalPhysicalGarmentType,
  Fabric,
  FabricAllocation,
  FutureMeasurementStateV1,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  WearerOrderStateV2,
} from "../types.js";
import type { PhysicalGarmentOccurrence } from "./designSourceState.js";
import {
  buildAiTryOnFitHints,
  buildAiTryOnFitHintsForWearer,
  type AiTryOnFitHint,
} from "./aiTryOnFitHints.js";
import {
  buildAiTryOnOrderDetails,
  buildAiTryOnOrderDetailsForWearer,
  type AiTryOnOrderDetails,
  type AiTryOnOrderDetailsSource,
} from "./aiTryOnOrderDetails.js";
import { chooseAiTryOnMode, type AiTryOnMode } from "./aiTryOnGatewayContract.js";
import {
  AI_TRY_ON_FIT_HINTS_IN_FINGERPRINT,
  createAiTryOnFingerprintFromOccurrenceAssignments,
  type AiTryOnOccurrenceDesignSource,
} from "./aiTryOnWorkflow.js";
import { wearerAssignmentLabel } from "./wearerOrder.js";

/**
 * One AI Try-on target per wearer (Step 5 "Who's this for?" picker).
 *
 * Each target has its own garments, fabric swatch, order details, fit hints
 * and fingerprint, so a preview belongs to exactly one wearer and turns stale
 * only when that wearer's own design changes. The 5 tries are shared by the
 * whole order (server-side, per order key).
 *
 * A single-wearer order (or one with no wearer records yet) has one target
 * covering every garment.
 */

export const AI_TRY_ON_SINGLE_TARGET_ID = "order" as const;

export interface AiTryOnWearerTarget {
  readonly wearerId: string;
  readonly label: string;
  /** null while that wearer's design is not ready. */
  readonly inputFingerprint: string | null;
  readonly mode: AiTryOnMode;
  /** Catalogue preview of the wearer's garment; null for uploaded designs. */
  readonly garmentImageUrl: string | null;
  /** Assigned fabric swatch picture; set only in fabric mode. */
  readonly fabricSwatchImageUrl: string | null;
  readonly fitHints: readonly AiTryOnFitHint[];
  readonly orderDetails: AiTryOnOrderDetails | null;
}

export interface AiTryOnTargetOccurrence {
  readonly garmentKey: string;
  readonly garmentType: CanonicalPhysicalGarmentType;
  readonly assignment: AiTryOnOccurrenceDesignSource["assignment"];
  readonly assignmentImage?: string | null;
}

export interface BuildAiTryOnWearerTargetsInput
  extends Omit<AiTryOnOrderDetailsSource, "occurrences" | "swatchFabricCode"> {
  readonly occurrences: readonly AiTryOnTargetOccurrence[];
  readonly physicalOccurrences?: readonly PhysicalGarmentOccurrence[];
  readonly wearerOrder: WearerOrderStateV2 | null | undefined;
  /** Live Measurement form; used only when there are no wearer records. */
  readonly measurement?: FutureMeasurementStateV1 | null;
  readonly customDetailsReady: boolean;
  readonly designSourceReady: boolean;
  readonly garmentTypeSelection: GarmentTypeStepSelection;
  readonly fabricAllocations: readonly FabricAllocation[];
  readonly fabrics: readonly Fabric[];
  readonly garmentScopedCustomDetails?: GarmentScopedCustomDetailsStateV1 | null;
}

const httpUrl = (value: unknown): string | null =>
  typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;

const fabricCodeFor = (
  allocations: readonly FabricAllocation[],
  garmentKey: string,
): string | null =>
  allocations.find((allocation) =>
    allocation.garmentAssignments.some((assignment) => assignment.garmentKey === garmentKey),
  )?.fabricCode || null;

const buildTarget = ({
  input,
  wearerId,
  label,
  garmentKeys,
  fitHints,
  orderDetailsFor,
}: {
  input: BuildAiTryOnWearerTargetsInput;
  wearerId: string;
  label: string;
  garmentKeys: ReadonlySet<string>;
  fitHints: readonly AiTryOnFitHint[];
  orderDetailsFor: (swatchFabricCode: string | null) => AiTryOnOrderDetails | null;
}): AiTryOnWearerTarget => {
  const occurrences = input.occurrences.filter((occurrence) =>
    garmentKeys.has(occurrence.garmentKey),
  );
  // The garment shown on the person: the wearer's first garment with a
  // catalogue picture. Its fabric is the swatch (fabric mode).
  const pictured = occurrences.find((occurrence) => httpUrl(occurrence.assignmentImage));
  const garmentImageUrl = pictured ? httpUrl(pictured.assignmentImage) : null;
  const swatchFabricCode = pictured
    ? fabricCodeFor(input.fabricAllocations, pictured.garmentKey)
    : null;
  const swatchFabric = swatchFabricCode
    ? input.fabrics.find((fabric) => fabric?.code === swatchFabricCode)
    : undefined;
  const fabricSwatchImageUrl = httpUrl(swatchFabric?.image);
  const mode = chooseAiTryOnMode({ hasFabricSwatch: Boolean(fabricSwatchImageUrl) });
  const orderDetails = orderDetailsFor(mode === "fabric" ? swatchFabricCode : null);

  const fabricAllocations = input.fabricAllocations
    .map((allocation) => ({
      ...allocation,
      garmentAssignments: allocation.garmentAssignments.filter((assignment) =>
        garmentKeys.has(assignment.garmentKey),
      ),
    }))
    .filter((allocation) => allocation.garmentAssignments.length > 0);
  const selections = input.garmentScopedCustomDetails?.selectionsByGarmentKey || {};
  const garmentScopedCustomDetails: GarmentScopedCustomDetailsStateV1 = {
    ...(input.garmentScopedCustomDetails || { schemaVersion: 1 }),
    schemaVersion: 1,
    selectionsByGarmentKey: Object.fromEntries(
      Object.entries(selections).filter(([garmentKey]) => garmentKeys.has(garmentKey)),
    ),
  } as GarmentScopedCustomDetailsStateV1;

  const inputFingerprint =
    occurrences.length === 0
      ? null
      : createAiTryOnFingerprintFromOccurrenceAssignments({
          customDetailsReady: input.customDetailsReady,
          designSourceReady: input.designSourceReady,
          occurrences: occurrences.map((occurrence) => ({
            garmentKey: occurrence.garmentKey,
            assignment: occurrence.assignment,
          })),
          visualInput: {
            garmentTypeSelection: input.garmentTypeSelection,
            fabricAllocations,
            garmentScopedCustomDetails,
            ...(input.physicalOccurrences
              ? {
                  physicalOccurrences: input.physicalOccurrences.filter((occurrence) =>
                    garmentKeys.has(occurrence.garmentKey),
                  ),
                }
              : {}),
            ...(AI_TRY_ON_FIT_HINTS_IN_FINGERPRINT ? { measurementFitHints: fitHints } : {}),
            orderDetails,
          },
        });

  return {
    wearerId,
    label,
    inputFingerprint,
    mode,
    garmentImageUrl,
    fabricSwatchImageUrl: mode === "fabric" ? fabricSwatchImageUrl : null,
    fitHints,
    orderDetails,
  };
};

export const buildAiTryOnWearerTargets = (
  input: BuildAiTryOnWearerTargetsInput,
): AiTryOnWearerTarget[] => {
  const detailsSource = (
    occurrences: readonly AiTryOnTargetOccurrence[],
    swatchFabricCode: string | null,
  ): AiTryOnOrderDetailsSource => ({
    garmentTypeSelection: input.garmentTypeSelection,
    additionalGarmentConstructions: input.additionalGarmentConstructions,
    garmentScopedCustomDetails: input.garmentScopedCustomDetails,
    decorativeFeaturesByGarmentKey: input.decorativeFeaturesByGarmentKey,
    monogramPlacementByGarmentKey: input.monogramPlacementByGarmentKey,
    fabricAllocations: input.fabricAllocations,
    fabrics: input.fabrics,
    occurrences: occurrences.map(({ garmentKey, garmentType }) => ({ garmentKey, garmentType })),
    ...(swatchFabricCode ? { swatchFabricCode } : {}),
  });
  const wearers = [...(input.wearerOrder?.wearers || [])].sort(
    (left, right) => left.presentationOrder - right.presentationOrder,
  );

  if (wearers.length <= 1) {
    const sole = wearers[0];
    return [
      buildTarget({
        input,
        wearerId: sole?.wearerId || AI_TRY_ON_SINGLE_TARGET_ID,
        label: sole ? wearerAssignmentLabel(sole.displayName, sole.presentationOrder) : "You",
        garmentKeys: new Set(input.occurrences.map((occurrence) => occurrence.garmentKey)),
        fitHints: sole
          ? buildAiTryOnFitHintsForWearer({ wearerOrder: input.wearerOrder, wearerId: sole.wearerId })
          : buildAiTryOnFitHints({
              measurement: input.measurement,
              garmentKeys: input.occurrences.map((occurrence) => occurrence.garmentKey),
            }),
        orderDetailsFor: (swatch) =>
          buildAiTryOnOrderDetails(detailsSource(input.occurrences, swatch)),
      }),
    ];
  }

  const assignment = input.wearerOrder?.assignmentByGarmentKey || {};
  return wearers.map((wearer) => {
    const garmentKeys = new Set(
      input.occurrences
        .filter((occurrence) => assignment[occurrence.garmentKey] === wearer.wearerId)
        .map((occurrence) => occurrence.garmentKey),
    );
    return buildTarget({
      input,
      wearerId: wearer.wearerId,
      label: wearerAssignmentLabel(wearer.displayName, wearer.presentationOrder),
      garmentKeys,
      fitHints: buildAiTryOnFitHintsForWearer({
        wearerOrder: input.wearerOrder,
        wearerId: wearer.wearerId,
      }),
      orderDetailsFor: (swatch) =>
        buildAiTryOnOrderDetailsForWearer({
          ...detailsSource(input.occurrences, swatch),
          wearerOrder: input.wearerOrder,
          wearerId: wearer.wearerId,
        }),
    });
  });
};
