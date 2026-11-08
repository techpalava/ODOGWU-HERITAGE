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
  aiTryOnGarmentPreviewKey,
  createAiTryOnFingerprintFromOccurrenceAssignments,
  type AiTryOnOccurrenceDesignSource,
} from "./aiTryOnWorkflow.js";
import {
  projectOccurrenceDisplayLabels,
  projectPersonGarmentLabels,
} from "./occurrenceDisplayLabel.js";
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

/**
 * One catalogue garment the customer can send on a single Generate.
 * The wearer fingerprint stays on the full design; this only picks the
 * garment picture and that garment's fabric swatch.
 */
export interface AiTryOnPreviewableGarment {
  readonly garmentKey: string;
  readonly label: string;
  readonly garmentImageUrl: string;
  /** This garment's fabric picture. Null when that fabric has no picture. */
  readonly fabricSwatchImageUrl: string | null;
  /** Fabric colour chip when there is no swatch picture. */
  readonly fabricColorHex: string | null;
  /**
   * Prompt details for this garment alone. A Generate sends these, never
   * the wearer's other garments.
   */
  readonly orderDetails: AiTryOnOrderDetails | null;
}

export interface AiTryOnWearerTarget {
  readonly wearerId: string;
  readonly label: string;
  /** null while that wearer's design is not ready. */
  readonly inputFingerprint: string | null;
  readonly mode: AiTryOnMode;
  /**
   * Default catalogue picture: the wearer's first garment with a picture.
   * The picker may send a different entry from `previewableGarments`.
   */
  readonly garmentImageUrl: string | null;
  /** Swatch for that default garment; set only in fabric mode. */
  readonly fabricSwatchImageUrl: string | null;
  /**
   * Catalogue garments this wearer can preview, in occurrence order.
   * One Generate uses exactly one of these. Empty for uploaded designs.
   * Omitted only by older callers; the builder always sets it.
   */
  readonly previewableGarments?: readonly AiTryOnPreviewableGarment[];
  readonly fitHints: readonly AiTryOnFitHint[];
  /**
   * Full design for this wearer. Used for the fingerprint only. A Generate
   * sends the chosen garment's own `orderDetails`, not this whole list.
   */
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

const fabricColorHex = (value: unknown): string | null =>
  typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
    ? value.trim()
    : null;

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
  orderDetailsForOccurrence,
}: {
  input: BuildAiTryOnWearerTargetsInput;
  wearerId: string;
  label: string;
  garmentKeys: ReadonlySet<string>;
  fitHints: readonly AiTryOnFitHint[];
  orderDetailsFor: (swatchFabricCode: string | null) => AiTryOnOrderDetails | null;
  orderDetailsForOccurrence: (
    occurrence: AiTryOnTargetOccurrence,
    swatchFabricCode: string | null,
  ) => AiTryOnOrderDetails | null;
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
  // Full wearer design, including every garment. The fingerprint uses this.
  // A Generate does not: it sends one previewable garment's own details.
  const orderDetails = orderDetailsFor(mode === "fabric" ? swatchFabricCode : null);
  const familyLabels = projectOccurrenceDisplayLabels(
    occurrences.map((occurrence) => ({
      garmentKey: occurrence.garmentKey,
      garmentType: occurrence.garmentType,
    })),
  );
  const personLabels = projectPersonGarmentLabels(
    occurrences.map((occurrence) => ({
      garmentKey: occurrence.garmentKey,
      garmentType: occurrence.garmentType,
      label: familyLabels.get(occurrence.garmentKey)?.conciseLabel || occurrence.garmentType,
    })),
  );
  const previewableGarments: AiTryOnPreviewableGarment[] = [];
  for (const occurrence of occurrences) {
    const imageUrl = httpUrl(occurrence.assignmentImage);
    if (!imageUrl) continue;
    const garmentSwatchCode = fabricCodeFor(input.fabricAllocations, occurrence.garmentKey);
    const garmentFabric = garmentSwatchCode
      ? input.fabrics.find((fabric) => fabric?.code === garmentSwatchCode)
      : undefined;
    const garmentSwatchUrl = httpUrl(garmentFabric?.image);
    previewableGarments.push({
      garmentKey: occurrence.garmentKey,
      label: personLabels.get(occurrence.garmentKey) || occurrence.garmentType,
      garmentImageUrl: imageUrl,
      fabricSwatchImageUrl: garmentSwatchUrl,
      fabricColorHex: fabricColorHex(garmentFabric?.colorHex),
      orderDetails: orderDetailsForOccurrence(
        occurrence,
        garmentSwatchUrl ? garmentSwatchCode : null,
      ),
    });
  }

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
    previewableGarments,
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
  const orderDetailsForOccurrence = (
    occurrence: AiTryOnTargetOccurrence,
    swatchFabricCode: string | null,
  ) => buildAiTryOnOrderDetails(detailsSource([occurrence], swatchFabricCode));
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
        orderDetailsForOccurrence,
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
      orderDetailsForOccurrence,
    });
  });
};

/** Storage/job identity is a wearer plus a garment, not the whole wearer. */
export const aiTryOnPreviewTargets = (targets: readonly AiTryOnWearerTarget[]) =>
  targets.flatMap((target) => {
    const garments = target.previewableGarments ?? [];
    if (garments.length <= 1) return [target];
    return garments.map((garment) => ({
      ...target,
      wearerId: aiTryOnGarmentPreviewKey(target.wearerId, garment.garmentKey),
      label: `${target.label} — ${garment.label}`,
      mode: chooseAiTryOnMode({ hasFabricSwatch: Boolean(garment.fabricSwatchImageUrl) }),
      garmentImageUrl: garment.garmentImageUrl,
      fabricSwatchImageUrl: garment.fabricSwatchImageUrl,
      orderDetails: garment.orderDetails,
      previewableGarments: [garment],
    }));
  });
