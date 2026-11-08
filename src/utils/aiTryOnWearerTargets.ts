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
import { chooseAiTryOnMode, type AiTryOnMode, type AiTryOnOutfitGarmentRequest } from "./aiTryOnGatewayContract.js";
import {
  AI_TRY_ON_FIT_HINTS_IN_FINGERPRINT,
  aiTryOnGarmentPreviewKey,
  aiTryOnOutfitPreviewKey,
  aiTryOnOutfitFingerprint,
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
 * One catalogue or uploaded garment the customer can send on a single Generate.
 * The wearer fingerprint stays on the full design; this only picks the
 * garment picture and that garment's fabric swatch.
 */
interface UploadedDesignPreview {
  readonly garmentKey: string;
  readonly garmentType: CanonicalPhysicalGarmentType;
  readonly previewUrl: string | null;
}

export interface AiTryOnPreviewableGarment {
  readonly garmentKey: string;
  readonly uploadedDesign?: UploadedDesignPreview;
  readonly garmentType?: CanonicalPhysicalGarmentType;
  readonly sourceKind?: "catalog" | "uploaded";
  readonly label: string;
  readonly garmentImageUrl: string | null;
  /** This garment's fabric picture. Null when that fabric has no picture. */
  readonly fabricSwatchImageUrl: string | null;
  /** Fabric colour chip when there is no swatch picture. */
  readonly fabricColorHex: string | null;
  /**
   * Prompt details for this garment alone. A Generate sends these, never
   * the wearer's other garments.
   */
  readonly orderDetails: AiTryOnOrderDetails | null;
  /**
   * This garment alone (its source, fabric and details, plus the wearer's
   * fit hints). A change to another garment leaves it unchanged (M1).
   */
  readonly inputFingerprint?: string | null;
}

/** One top-and-bottom pair the outfit can be made from. */
export interface AiTryOnOutfitPair {
  readonly top: string;
  readonly bottom: string;
  readonly label: string;
  readonly inputFingerprint: string;
}

export interface AiTryOnWearerTarget {
  readonly uploadedDesign?: UploadedDesignPreview;
  readonly previewKind?: "outfit";
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
   * Catalogue and uploaded garments this wearer can preview, in occurrence order.
   * One Generate uses exactly one of these. Uploaded previews reuse Step 3’s private photo.
   * Omitted only by older callers; the builder always sets it.
   */
  readonly previewableGarments?: readonly AiTryOnPreviewableGarment[];
  readonly fitHints: readonly AiTryOnFitHint[];
  /**
   * Full design for this wearer. Used for the fingerprint only. A Generate
   * sends the chosen garment's own `orderDetails`, not this whole list.
   */
  readonly orderDetails: AiTryOnOrderDetails | null;
  /**
   * Deep check L3: the wearer's own key from when it had one previewable
   * garment. A preview stored there can't be tied to a garment, so it is
   * only ever shown as out of date for the wearer.
   */
  readonly legacyWearerSlot?: true;
  /** Outfit slot only: every current pair; a preview of any one is current. */
  readonly outfitPairs?: readonly AiTryOnOutfitPair[];
}

export interface AiTryOnTargetOccurrence {
  readonly garmentKey: string;
  readonly garmentType: CanonicalPhysicalGarmentType;
  readonly assignment: AiTryOnOccurrenceDesignSource["assignment"];
  readonly assignmentImage?: string | null;
  readonly uploadedDesignPreviewUrl?: string | null;
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
    const uploaded = occurrence.assignment?.sourceKind === "uploaded";
    const imageUrl = uploaded ? occurrence.uploadedDesignPreviewUrl || null : httpUrl(occurrence.assignmentImage);
    if (!imageUrl && !uploaded) continue;
    const garmentSwatchCode = fabricCodeFor(input.fabricAllocations, occurrence.garmentKey);
    const garmentFabric = garmentSwatchCode
      ? input.fabrics.find((fabric) => fabric?.code === garmentSwatchCode)
      : undefined;
    const garmentSwatchUrl = httpUrl(garmentFabric?.image);
    previewableGarments.push({
      garmentKey: occurrence.garmentKey,
      ...(uploaded ? { uploadedDesign: { garmentKey: occurrence.garmentKey, garmentType: occurrence.garmentType, previewUrl: imageUrl } } : {}),
      garmentType: occurrence.garmentType,
      sourceKind: occurrence.assignment?.sourceKind === "catalog" ? "catalog" : occurrence.assignment?.sourceKind === "uploaded" ? "uploaded" : undefined,
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

  const fingerprintFor = (
    keys: ReadonlySet<string>,
    details: AiTryOnOrderDetails | null,
  ): string | null => {
    const scoped = occurrences.filter((occurrence) => keys.has(occurrence.garmentKey));
    if (scoped.length === 0) return null;
    return createAiTryOnFingerprintFromOccurrenceAssignments({
      customDetailsReady: input.customDetailsReady,
      designSourceReady: input.designSourceReady,
      occurrences: scoped.map((occurrence) => ({
        garmentKey: occurrence.garmentKey,
        assignment: occurrence.assignment,
      })),
      visualInput: {
        garmentTypeSelection: input.garmentTypeSelection,
        fabricAllocations: fabricAllocations
          .map((allocation) => ({
            ...allocation,
            garmentAssignments: allocation.garmentAssignments.filter((entry) => keys.has(entry.garmentKey)),
          }))
          .filter((allocation) => allocation.garmentAssignments.length > 0),
        garmentScopedCustomDetails: {
          ...garmentScopedCustomDetails,
          selectionsByGarmentKey: Object.fromEntries(
            Object.entries(garmentScopedCustomDetails.selectionsByGarmentKey || {}).filter(([garmentKey]) => keys.has(garmentKey)),
          ),
        } as GarmentScopedCustomDetailsStateV1,
        ...(input.physicalOccurrences
          ? {
              physicalOccurrences: input.physicalOccurrences.filter((occurrence) =>
                keys.has(occurrence.garmentKey),
              ),
            }
          : {}),
        ...(AI_TRY_ON_FIT_HINTS_IN_FINGERPRINT ? { measurementFitHints: fitHints } : {}),
        orderDetails: details,
      },
    });
  };
  const inputFingerprint = fingerprintFor(garmentKeys, orderDetails);
  // Deep check M1: each garment's preview depends on that garment only.
  const garmentsWithFingerprints = previewableGarments.map((garment) => ({
    ...garment,
    inputFingerprint: fingerprintFor(new Set([garment.garmentKey]), garment.orderDetails),
  }));

  return {
    wearerId,
    label,
    inputFingerprint,
    mode: previewableGarments.length ? chooseAiTryOnMode({ hasFabricSwatch: Boolean(previewableGarments[0].fabricSwatchImageUrl) }) : mode,
    garmentImageUrl: previewableGarments.length ? previewableGarments[0].garmentImageUrl : garmentImageUrl,
    ...(previewableGarments[0]?.uploadedDesign ? { uploadedDesign: previewableGarments[0].uploadedDesign } : {}),
    fabricSwatchImageUrl: previewableGarments.length ? previewableGarments[0].fabricSwatchImageUrl : (mode === "fabric" ? fabricSwatchImageUrl : null),
    previewableGarments: garmentsWithFingerprints,
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
      inputFingerprint: garment.inputFingerprint === undefined ? target.inputFingerprint : garment.inputFingerprint,
      mode: chooseAiTryOnMode({ hasFabricSwatch: Boolean(garment.fabricSwatchImageUrl) }),
      garmentImageUrl: garment.garmentImageUrl,
      uploadedDesign: garment.uploadedDesign,
      fabricSwatchImageUrl: garment.fabricSwatchImageUrl,
      orderDetails: garment.orderDetails,
      previewableGarments: [garment],
    }));
  });

export const aiTryOnOutfitPart = (garmentType: string | undefined): "top" | "bottom" | null => {
  if (garmentType === "shirt" || garmentType === "kaftan") return "top";
  if (["trouser", "skirt", "long_skirt", "standard_shorts", "bum_shorts"].includes(garmentType || "")) return "bottom";
  return null;
};
export interface AiTryOnOutfitChoice extends AiTryOnPreviewableGarment {
  readonly garmentType: CanonicalPhysicalGarmentType;
  readonly garmentImageUrl: string;
}
export const aiTryOnOutfitChoices = (target: AiTryOnWearerTarget) => {
  const garments: AiTryOnOutfitChoice[] = (target.previewableGarments ?? []).flatMap((garment) => {
    const type = garment.garmentType ?? garment.orderDetails?.garments[0]?.garmentType;
    // Older callers without per-garment fingerprints fall back to the wearer's.
    const inputFingerprint = garment.inputFingerprint === undefined ? target.inputFingerprint : garment.inputFingerprint;
    return garment.sourceKind === "catalog" && garment.garmentImageUrl && type ? [{ ...garment, inputFingerprint, garmentType: type, garmentImageUrl: garment.garmentImageUrl }] : [];
  });
  return {
    tops: garments.filter((garment) => aiTryOnOutfitPart(garment.garmentType) === "top"),
    bottoms: garments.filter((garment) => aiTryOnOutfitPart(garment.garmentType) === "bottom"),
  };
};
export const buildAiTryOnOutfitRequestGarment = (garment: AiTryOnOutfitChoice): AiTryOnOutfitGarmentRequest => ({
  garmentKey: garment.garmentKey, garmentType: garment.garmentType, garmentImageUrl: garment.garmentImageUrl,
  ...(garment.fabricSwatchImageUrl ? { fabricSwatchImageUrl: garment.fabricSwatchImageUrl } : {}),
  ...(garment.orderDetails ? { orderDetails: garment.orderDetails } : {}),
});
const outfitPairLabel = (top: AiTryOnOutfitChoice, bottom: AiTryOnOutfitChoice) => `${top.label} + ${bottom.label}`;
/**
 * The outfit slot. With a pair: that pair's own fingerprint and names. With
 * none: no single fingerprint, but every current pair, so a stored outfit
 * preview is current only when it was made from one of them.
 */
export const aiTryOnOutfitTarget = (
  target: AiTryOnWearerTarget,
  pair?: { top: AiTryOnOutfitChoice; bottom: AiTryOnOutfitChoice } | null,
): AiTryOnWearerTarget | null => {
  const { tops, bottoms } = aiTryOnOutfitChoices(target);
  if (!tops.length || !bottoms.length) return null;
  const base = { ...target, wearerId: aiTryOnOutfitPreviewKey(target.wearerId), previewKind: "outfit" as const, previewableGarments: [] };
  if (pair) {
    return { ...base, inputFingerprint: aiTryOnOutfitFingerprint(pair.top, pair.bottom), label: `${target.label} — Combined outfit (${outfitPairLabel(pair.top, pair.bottom)})` };
  }
  const outfitPairs = tops.flatMap((top) => bottoms.flatMap((bottom) => {
    const fingerprint = aiTryOnOutfitFingerprint(top, bottom);
    return fingerprint ? [{ top: top.garmentKey, bottom: bottom.garmentKey, label: outfitPairLabel(top, bottom), inputFingerprint: fingerprint }] : [];
  }));
  return { ...base, inputFingerprint: null, outfitPairs, label: `${target.label} — Combined outfit` };
};
/** The pair a stored outfit preview was made from, while still current. */
export const aiTryOnOutfitPairFor = (target: AiTryOnWearerTarget, fingerprint: string | null | undefined) =>
  fingerprint ? target.outfitPairs?.find((pair) => pair.inputFingerprint === fingerprint) ?? null : null;
/** A preview made with `fingerprint` still shows this target's current design. */
export const aiTryOnPreviewFingerprintIsCurrent = (target: AiTryOnWearerTarget, fingerprint: string | null | undefined): boolean =>
  Boolean(fingerprint) && (target.inputFingerprint === fingerprint || Boolean(aiTryOnOutfitPairFor(target, fingerprint)));
/** The target can judge a preview at all (design ready). */
export const aiTryOnTargetHasDesign = (target: AiTryOnWearerTarget): boolean =>
  Boolean(target.inputFingerprint || target.outfitPairs?.length);
/** A wearer with 2+ previewable garments: its older wearer-key slot (L3). */
export const aiTryOnLegacyWearerSlot = (target: AiTryOnWearerTarget): AiTryOnWearerTarget | null =>
  (target.previewableGarments?.length ?? 0) > 1
    ? { ...target, inputFingerprint: null, legacyWearerSlot: true, previewableGarments: [] }
    : null;
export const aiTryOnOrderPreviewTargets = (targets: readonly AiTryOnWearerTarget[]): AiTryOnWearerTarget[] => targets.flatMap((target) => {
  const outfit = aiTryOnOutfitTarget(target);
  const legacy = aiTryOnLegacyWearerSlot(target);
  return [...aiTryOnPreviewTargets([target]), ...(outfit ? [outfit] : []), ...(legacy ? [legacy] : [])];
});
