import { resolveActiveWearerCap } from "../config/WearerPolicy.js";
import type {
  AdditionalGarmentConstructionStateV1,
  CustomDetailDemographic,
  FutureMeasurementStateV1,
  GarmentScopedCustomDetailsStateV1,
  GarmentTypeStepSelection,
  MeasurementMethodId,
  WearerFitContext,
  WearerOrderStateV2,
  WearerProfileV1,
} from "../types.js";
import {
  classifyFutureMeasurementHydration,
  countRemainingCustomerRequiredMeasurementUnits,
  createEmptyFutureMeasurementState,
  isFutureMeasurementStageComplete,
  isGarmentMeasurementEligibleForDemographic,
  planMeasurementRequirements,
  reconcileFutureMeasurementState,
  type MeasurementPhysicalGarment,
  type MeasurementRequirementPlan,
} from "./measurementBlueprint.js";

export const WEARER_ORDER_SCHEMA_VERSION = 2 as const;
const DISPLAY_NAME_MAX = 40;

/** Customer-facing name. A blank stored name stays blank in the field and reads as Person 1, Person 2, and so on. */
export const wearerPublicLabel = (
  displayName: string,
  presentationOrder: number,
): string => {
  const name = displayName.trim();
  if (name) return name;
  return `Person ${presentationOrder + 1}`;
};

/**
 * Measurement assignment UI label. The default sole wearer (order 0) is "You",
 * not "Person 1", when the stored name is blank.
 */
export const wearerAssignmentLabel = (
  displayName: string,
  presentationOrder: number,
): string => {
  const name = displayName.trim();
  if (name) return name;
  if (presentationOrder === 0) return "You";
  return `Person ${presentationOrder + 1}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isFitContext = (value: unknown): value is WearerFitContext =>
  value === "male" || value === "female" || value === "unisex";

export const createWearerId = (): string => {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `wearer-${uuid}`;
  return `wearer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createEmptyWearerOrder = (): WearerOrderStateV2 => ({
  schemaVersion: WEARER_ORDER_SCHEMA_VERSION,
  wearers: [],
  assignmentByGarmentKey: {},
});

const cloneMeasurement = (
  state: FutureMeasurementStateV1,
): FutureMeasurementStateV1 =>
  structuredClone(state);

const markMeasurementIncomplete = (
  state: FutureMeasurementStateV1,
): FutureMeasurementStateV1 =>
  state.calculationStatus === "incomplete"
    ? state
    : { ...state, calculationStatus: "incomplete" };

const stripGarmentFromMeasurement = (
  state: FutureMeasurementStateV1,
  garmentKey: string,
): FutureMeasurementStateV1 => {
  const stripBag = <T extends { byGarmentKey: Record<string, unknown> }>(bag: T): T => ({
    ...bag,
    byGarmentKey: Object.fromEntries(
      Object.entries(bag.byGarmentKey).filter(([key]) => key !== garmentKey),
    ),
  });
  const keyMatches = (invalidKey: string) =>
    invalidKey.split(":").includes(garmentKey);
  const enteredByRoute = state.enteredByRoute
    ? {
        low_risk: stripBag(state.enteredByRoute.low_risk),
        medium_risk: stripBag(state.enteredByRoute.medium_risk),
        high_risk: stripBag(state.enteredByRoute.high_risk),
        critical_risk: stripBag(state.enteredByRoute.critical_risk),
        sample_cloth: stripBag(state.enteredByRoute.sample_cloth),
      }
    : undefined;
  const invalidInputKeysByRoute = state.invalidInputKeysByRoute
    ? {
        low_risk: state.invalidInputKeysByRoute.low_risk.filter((key) => !keyMatches(key)),
        medium_risk: state.invalidInputKeysByRoute.medium_risk.filter((key) => !keyMatches(key)),
        high_risk: state.invalidInputKeysByRoute.high_risk.filter((key) => !keyMatches(key)),
        critical_risk: state.invalidInputKeysByRoute.critical_risk.filter((key) => !keyMatches(key)),
        sample_cloth: state.invalidInputKeysByRoute.sample_cloth.filter((key) => !keyMatches(key)),
      }
    : undefined;
  return {
    ...state,
    entered: stripBag(state.entered),
    ...(enteredByRoute ? { enteredByRoute } : {}),
    ...(state.unassignedEntered
      ? { unassignedEntered: stripBag(state.unassignedEntered) }
      : {}),
    derived: stripBag(state.derived),
    diagnostics: state.diagnostics.filter(
      (diagnostic) => diagnostic.garmentKey !== garmentKey,
    ),
    invalidInputKeys: state.invalidInputKeys.filter((key) => !keyMatches(key)),
    ...(invalidInputKeysByRoute ? { invalidInputKeysByRoute } : {}),
  };
};

export const createWearerProfile = ({
  displayName = "",
  fitContext = null,
  presentationOrder,
  measurement = createEmptyFutureMeasurementState(),
  wearerId = createWearerId(),
}: {
  displayName?: string;
  fitContext?: WearerFitContext | null;
  presentationOrder: number;
  measurement?: FutureMeasurementStateV1;
  wearerId?: string;
}): WearerProfileV1 => ({
  wearerId,
  displayName: displayName.trim().slice(0, DISPLAY_NAME_MAX),
  fitContext,
  presentationOrder,
  measurement: cloneMeasurement(measurement),
});

const sortWearers = (wearers: readonly WearerProfileV1[]): WearerProfileV1[] =>
  [...wearers].sort(
    (left, right) =>
      left.presentationOrder - right.presentationOrder ||
      left.wearerId.localeCompare(right.wearerId),
  );

export const resolveNewWearerFitContext = (
  demographic: CustomDetailDemographic | null | undefined,
): WearerFitContext | null =>
  demographic === "male" || demographic === "female" ? demographic : null;

export const isGarmentEligibleForWearer = ({
  garment,
  fitContext,
  garmentTypeSelection,
  additionalGarmentConstructions,
}: {
  garment: MeasurementPhysicalGarment;
  fitContext: WearerFitContext | null;
  garmentTypeSelection: GarmentTypeStepSelection;
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
}): boolean => {
  if (fitContext === null) return false;
  return isGarmentMeasurementEligibleForDemographic({
    garment,
    garmentTypeSelection,
    demographic: fitContext,
    additionalGarmentConstructions,
  });
};

const wearerOwnsGarment = (
  order: WearerOrderStateV2,
  wearerId: string,
): boolean =>
  Object.values(order.assignmentByGarmentKey).includes(wearerId);

export type WearerMutationResult =
  | { readonly status: "updated"; readonly order: WearerOrderStateV2 }
  | { readonly status: "blocked"; readonly code: string; readonly order: WearerOrderStateV2 };

const updated = (order: WearerOrderStateV2): WearerMutationResult => ({
  status: "updated",
  order,
});

const blocked = (
  order: WearerOrderStateV2,
  code: string,
): WearerMutationResult => ({ status: "blocked", code, order });

export const addWearer = ({
  order,
  physicalGarmentCount,
  displayName,
  fitContext,
}: {
  order: WearerOrderStateV2;
  physicalGarmentCount: number;
  displayName: string;
  fitContext: "male" | "female" | null;
}): WearerMutationResult => {
  const cap = resolveActiveWearerCap(physicalGarmentCount);
  if (order.wearers.length >= cap) {
    return blocked(order, "WEARER_CAP_REACHED");
  }
  const nextOrder = order.wearers.length;
  // Sole -> Split: the sole person's auto-assigned garments are cleared so the
  // customer chooses the split. Only garment-keyed data for those garments is
  // stripped (entered/derived byGarmentKey, garment diagnostics, invalid keys);
  // shared body measurements (chest, waist, height...) stay with person 1.
  // Adding a 3rd+ person keeps the existing split.
  const soleToSplit = order.wearers.length === 1;
  const formerGarmentKeys = soleToSplit ? Object.keys(order.assignmentByGarmentKey) : [];
  const existingWearers = soleToSplit
    ? order.wearers.map((wearer) =>
        formerGarmentKeys.length === 0
          ? wearer
          : {
              ...wearer,
              measurement: markMeasurementIncomplete(
                formerGarmentKeys.reduce(
                  (current, garmentKey) => stripGarmentFromMeasurement(current, garmentKey),
                  wearer.measurement,
                ),
              ),
            },
      )
    : order.wearers;
  return updated({
    ...order,
    assignmentByGarmentKey: soleToSplit ? {} : order.assignmentByGarmentKey,
    wearers: sortWearers([
      ...existingWearers,
      createWearerProfile({
        displayName,
        fitContext,
        presentationOrder: nextOrder,
      }),
    ]),
  });
};

/**
 * Canonical stored name: leading/trailing whitespace trimmed and capped.
 * Applied when a name is saved (Save / blur), when the order is persisted
 * (draft and paid V2 snapshot) and on read (normalizeWearer). Label helpers
 * (wearerPublicLabel / wearerAssignmentLabel) trim the same way, so a raw
 * in-progress name never shows a trailing space anywhere else.
 */
export const canonicalWearerDisplayName = (displayName: string): string =>
  displayName.trim().slice(0, DISPLAY_NAME_MAX).trim();

/** Same order with every wearer name canonical (unchanged reference when already canonical). */
export const canonicalizeWearerOrderNames = (
  order: WearerOrderStateV2,
): WearerOrderStateV2 =>
  order.wearers.every(
    (wearer) => wearer.displayName === canonicalWearerDisplayName(wearer.displayName),
  )
    ? order
    : {
        ...order,
        wearers: order.wearers.map((wearer) => ({
          ...wearer,
          displayName: canonicalWearerDisplayName(wearer.displayName),
        })),
      };

/**
 * Stores the name as typed (length-capped only): no trim or space collapse, so
 * typing "Ada Obi" keystroke by keystroke keeps the space. Callers that commit a
 * name (the panel's Save / blur) pass canonicalWearerDisplayName(value).
 */
export const renameWearer = (
  order: WearerOrderStateV2,
  wearerId: string,
  displayName: string,
): WearerMutationResult => {
  if (!order.wearers.some((wearer) => wearer.wearerId === wearerId)) {
    return blocked(order, "WEARER_NOT_FOUND");
  }
  const raw = displayName.slice(0, DISPLAY_NAME_MAX);
  return updated({
    ...order,
    wearers: order.wearers.map((wearer) =>
      wearer.wearerId === wearerId ? { ...wearer, displayName: raw } : wearer,
    ),
  });
};

export const reorderWearers = (
  order: WearerOrderStateV2,
  wearerIds: readonly string[],
): WearerMutationResult => {
  const currentIds = sortWearers(order.wearers).map((wearer) => wearer.wearerId);
  if (
    wearerIds.length !== currentIds.length ||
    new Set(wearerIds).size !== wearerIds.length ||
    currentIds.some((wearerId) => !wearerIds.includes(wearerId))
  ) {
    return blocked(order, "WEARER_ORDER_MISMATCH");
  }
  const rank = new Map(wearerIds.map((wearerId, index) => [wearerId, index]));
  return updated({
    ...order,
    wearers: order.wearers.map((wearer) => ({
      ...wearer,
      presentationOrder: rank.get(wearer.wearerId) ?? wearer.presentationOrder,
    })),
  });
};

/** Garment context for fit-eligibility checks (same inputs as assignGarmentToWearer). */
export interface WearerFitEligibilityContext {
  garments: readonly MeasurementPhysicalGarment[];
  garmentTypeSelection: GarmentTypeStepSelection;
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
}

/**
 * Garments currently assigned to `wearerId` that `fitContext` cannot wear.
 * A garment missing from `garments` is left alone (no evidence it is unfit).
 */
export const ineligibleAssignedGarmentKeys = ({
  order,
  wearerId,
  fitContext,
  eligibility,
}: {
  order: WearerOrderStateV2;
  wearerId: string;
  fitContext: WearerFitContext | null;
  eligibility: WearerFitEligibilityContext;
}): string[] =>
  Object.entries(order.assignmentByGarmentKey)
    .filter(([, ownerId]) => ownerId === wearerId)
    .map(([garmentKey]) => garmentKey)
    .filter((garmentKey) => {
      const garment = eligibility.garments.find(
        (candidate) => candidate.garmentKey === garmentKey,
      );
      return Boolean(
        garment &&
          fitContext !== null &&
          !isGarmentEligibleForWearer({
            garment,
            fitContext,
            garmentTypeSelection: eligibility.garmentTypeSelection,
            additionalGarmentConstructions: eligibility.additionalGarmentConstructions,
          }),
      );
    });

/**
 * Set a person's fit. With `eligibility`, every garment they own that the new
 * fit cannot wear is unassigned the same way as an untick (assignment cleared,
 * that garment's measurement fields stripped, shared body fields kept), so a
 * fit change never leaves an ineligible garment assigned. Garments the new fit
 * still allows stay assigned.
 */
export const setWearerFitContext = (
  order: WearerOrderStateV2,
  wearerId: string,
  fitContext: "male" | "female",
  eligibility?: WearerFitEligibilityContext,
): WearerMutationResult => {
  if (!order.wearers.some((wearer) => wearer.wearerId === wearerId)) {
    return blocked(order, "WEARER_NOT_FOUND");
  }
  const withFit: WearerOrderStateV2 = {
    ...order,
    wearers: order.wearers.map((wearer) =>
      wearer.wearerId === wearerId ? { ...wearer, fitContext } : wearer,
    ),
  };
  if (!eligibility) return updated(withFit);
  const released = ineligibleAssignedGarmentKeys({
    order: withFit,
    wearerId,
    fitContext,
    eligibility,
  });
  if (released.length === 0) return updated(withFit);
  const stripped = released.reduce(
    (current, garmentKey) => removeGarmentFromWearerOrder(current, garmentKey),
    withFit,
  );
  return updated({
    ...stripped,
    wearers: stripped.wearers.map((wearer) =>
      wearer.wearerId === wearerId
        ? { ...wearer, measurement: markMeasurementIncomplete(wearer.measurement) }
        : wearer,
    ),
  });
};

const possessiveFitOwner = (wearerLabel: string): string =>
  wearerLabel === "You" ? "your" : `${wearerLabel}'s`;

/**
 * Measurement fit-conflict copy: garments a person's selected fit cannot wear.
 * Sole: change the fit or add another person. Split: change the fit or assign
 * them to another person. Never "earlier steps" (that is for unmapped garments).
 */
export const wearerFitConflictCopy = ({
  wearerLabel,
  garmentLabels,
  sole,
}: {
  wearerLabel: string;
  garmentLabels: readonly string[];
  sole: boolean;
}): string =>
  `Not available for ${possessiveFitOwner(wearerLabel)} selected fit: ${garmentLabels.join(", ")}. ${
    sole
      ? "Change the fit or add another person to split garments."
      : `Change the fit or assign ${garmentLabels.length === 1 ? "it" : "them"} to another person.`
  }`;

export const deleteWearer = (
  order: WearerOrderStateV2,
  wearerId: string,
): WearerMutationResult => {
  if (!order.wearers.some((wearer) => wearer.wearerId === wearerId)) {
    return blocked(order, "WEARER_NOT_FOUND");
  }
  if (wearerOwnsGarment(order, wearerId)) {
    return blocked(order, "WEARER_OWNS_GARMENTS");
  }
  return updated({
    ...order,
    wearers: order.wearers.filter((wearer) => wearer.wearerId !== wearerId),
  });
};

export const assignGarmentToWearer = ({
  order,
  garmentKey,
  wearerId,
  garment,
  garmentTypeSelection,
  additionalGarmentConstructions,
}: {
  order: WearerOrderStateV2;
  garmentKey: string;
  wearerId: string;
  garment: MeasurementPhysicalGarment;
  garmentTypeSelection: GarmentTypeStepSelection;
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
}): WearerMutationResult => {
  const wearer = order.wearers.find((candidate) => candidate.wearerId === wearerId);
  if (!wearer) return blocked(order, "WEARER_NOT_FOUND");
  if (wearer.fitContext === null) return blocked(order, "WEARER_FIT_REQUIRED");
  if (
    !isGarmentEligibleForWearer({
      garment,
      fitContext: wearer.fitContext,
      garmentTypeSelection,
      additionalGarmentConstructions,
    })
  ) {
    return blocked(order, "GARMENT_INELIGIBLE_FOR_WEARER");
  }
  const previousWearerId = order.assignmentByGarmentKey[garmentKey];
  const assignmentChanged = previousWearerId !== wearerId;
  const wearers = order.wearers.map((candidate) => {
    if (!assignmentChanged) return candidate;
    if (candidate.wearerId === previousWearerId) {
      return {
        ...candidate,
        measurement: markMeasurementIncomplete(
          stripGarmentFromMeasurement(candidate.measurement, garmentKey),
        ),
      };
    }
    if (candidate.wearerId === wearerId) {
      return {
        ...candidate,
        measurement: markMeasurementIncomplete(candidate.measurement),
      };
    }
    return candidate;
  });
  return updated({
    ...order,
    wearers,
    assignmentByGarmentKey: {
      ...order.assignmentByGarmentKey,
      [garmentKey]: wearerId,
    },
  });
};

export const removeGarmentFromWearerOrder = (
  order: WearerOrderStateV2,
  garmentKey: string,
): WearerOrderStateV2 => {
  const ownerId = order.assignmentByGarmentKey[garmentKey];
  const assignmentByGarmentKey = { ...order.assignmentByGarmentKey };
  delete assignmentByGarmentKey[garmentKey];
  return {
    ...order,
    assignmentByGarmentKey,
    wearers: order.wearers.map((wearer) =>
      wearer.wearerId === ownerId
        ? {
            ...wearer,
            measurement: stripGarmentFromMeasurement(wearer.measurement, garmentKey),
          }
        : wearer,
    ),
  };
};

export const updateWearerMeasurement = (
  order: WearerOrderStateV2,
  wearerId: string,
  measurement: FutureMeasurementStateV1,
): WearerOrderStateV2 => ({
  ...order,
  wearers: order.wearers.map((wearer) =>
    wearer.wearerId === wearerId
      ? { ...wearer, measurement: cloneMeasurement(measurement) }
      : wearer,
  ),
});

/** Commit a measurement onto the wearer already on screen. Does not mint an id. */
export const applyWearerMeasurementUpdate = (
  stored: WearerOrderStateV2,
  displayed: WearerOrderStateV2,
  wearerId: string,
  measurement: FutureMeasurementStateV1,
): WearerOrderStateV2 => {
  const storedHasWearer = stored.wearers.some((wearer) => wearer.wearerId === wearerId);
  const base = storedHasWearer ? stored : displayed;
  if (!base.wearers.some((wearer) => wearer.wearerId === wearerId)) return stored;
  return updateWearerMeasurement(base, wearerId, measurement);
};

export const setWearerMeasurementRoute = (
  order: WearerOrderStateV2,
  wearerId: string,
  route: MeasurementMethodId,
): WearerOrderStateV2 => ({
  ...order,
  wearers: order.wearers.map((wearer) =>
    wearer.wearerId === wearerId
      ? {
          ...wearer,
          measurement: { ...wearer.measurement, route },
        }
      : wearer,
  ),
});

/**
 * Reconcile wearers with the live physical garments.
 *
 * The sole wearer's fit is never inferred from `compatibilityDemographic`:
 * Measurement starts with no fit selected until the customer picks one (or a
 * saved draft already carries an explicit fit). The field stays on the input
 * type so existing call sites keep compiling.
 */
export const reconcileWearerOrder = ({
  order,
  garmentKeys,
  garments = [],
  garmentTypeSelection,
  additionalGarmentConstructions,
}: {
  order: WearerOrderStateV2;
  garmentKeys: readonly string[];
  compatibilityDemographic: CustomDetailDemographic | null;
  garments?: readonly MeasurementPhysicalGarment[];
  garmentTypeSelection?: GarmentTypeStepSelection;
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
}): WearerOrderStateV2 => {
  const uniqueKeys = [...new Set(garmentKeys.filter((key) => key.trim().length > 0))];
  let wearers = sortWearers(order.wearers);
  if (uniqueKeys.length > 0 && wearers.length === 0) {
    wearers = [
      createWearerProfile({
        presentationOrder: 0,
        fitContext: null,
      }),
    ];
  }
  const activeIds = new Set(wearers.map((wearer) => wearer.wearerId));
  const assignmentByGarmentKey: Record<string, string> = {};
  for (const [garmentKey, wearerId] of Object.entries(order.assignmentByGarmentKey)) {
    if (uniqueKeys.includes(garmentKey) && activeIds.has(wearerId)) {
      assignmentByGarmentKey[garmentKey] = wearerId;
    }
  }
  const removedKeys = Object.keys(order.assignmentByGarmentKey).filter(
    (garmentKey) => !uniqueKeys.includes(garmentKey),
  );
  wearers = wearers.map((wearer) =>
    removedKeys.reduce(
      (current, garmentKey) =>
        order.assignmentByGarmentKey[garmentKey] === current.wearerId
          ? {
              ...current,
              measurement: stripGarmentFromMeasurement(current.measurement, garmentKey),
            }
          : current,
      wearer,
    ),
  );
  if (wearers.length === 1 && garmentTypeSelection) {
    const only = wearers[0];
    for (const garmentKey of uniqueKeys) {
      if (assignmentByGarmentKey[garmentKey]) continue;
      const garment = garments.find((candidate) => candidate.garmentKey === garmentKey) || {
        garmentKey,
        garmentType: "shirt" as const,
      };
      if (
        isGarmentEligibleForWearer({
          garment,
          fitContext: only.fitContext,
          garmentTypeSelection,
          additionalGarmentConstructions,
        })
      ) {
        assignmentByGarmentKey[garmentKey] = only.wearerId;
      }
    }
  }
  return {
    schemaVersion: WEARER_ORDER_SCHEMA_VERSION,
    wearers,
    assignmentByGarmentKey,
  };
};

const normalizeWearer = (
  value: unknown,
  index: number,
): WearerProfileV1 | null => {
  if (!isRecord(value) || typeof value.wearerId !== "string" || !value.wearerId.trim()) {
    return null;
  }
  if (typeof value.displayName !== "string") return null;
  const fitContext = isFitContext(value.fitContext) ? value.fitContext : null;
  if (value.fitContext !== null && fitContext === null) return null;
  if (!Number.isInteger(value.presentationOrder)) return null;
  const measurement = classifyFutureMeasurementHydration(value.measurement);
  if (measurement.status !== "valid") return null;
  return {
    wearerId: value.wearerId,
    displayName: canonicalWearerDisplayName(value.displayName),
    fitContext,
    presentationOrder: Number.isFinite(value.presentationOrder)
      ? Number(value.presentationOrder)
      : index,
    measurement: measurement.state,
  };
};

export const isWearerOrderStateV2 = (
  value: unknown,
): value is WearerOrderStateV2 => normalizeWearerOrderState(value) !== null;

/** Schema 2 is the only authority. A schema-1 bag must not replace it. */
export const shouldReplacePersistedMeasurement = ({
  persisted,
  incoming,
}: {
  persisted: unknown;
  incoming: unknown;
}): boolean => {
  if (!isWearerOrderStateV2(persisted)) return true;
  return isWearerOrderStateV2(incoming);
};

export const shouldAcceptMeasurementAutosave = ({
  persisted,
  incoming,
  saveGeneration,
  currentSaveGeneration,
}: {
  persisted: unknown;
  incoming: unknown;
  saveGeneration: number;
  currentSaveGeneration: number;
}): boolean =>
  saveGeneration === currentSaveGeneration &&
  shouldReplacePersistedMeasurement({ persisted, incoming });

export const normalizeWearerOrderState = (
  value: unknown,
): WearerOrderStateV2 | null => {
  if (!isRecord(value) || value.schemaVersion !== WEARER_ORDER_SCHEMA_VERSION) {
    return null;
  }
  if (!Array.isArray(value.wearers) || !isRecord(value.assignmentByGarmentKey)) {
    return null;
  }
  const wearers = value.wearers.map((wearer, index) => normalizeWearer(wearer, index));
  if (wearers.some((wearer) => wearer === null)) return null;
  const profiles = wearers as WearerProfileV1[];
  const ids = new Set(profiles.map((wearer) => wearer.wearerId));
  if (ids.size !== profiles.length) return null;
  const assignmentByGarmentKey: Record<string, string> = {};
  for (const [garmentKey, wearerId] of Object.entries(value.assignmentByGarmentKey)) {
    if (!garmentKey.trim() || typeof wearerId !== "string" || !ids.has(wearerId)) {
      return null;
    }
    assignmentByGarmentKey[garmentKey] = wearerId;
  }
  return {
    schemaVersion: WEARER_ORDER_SCHEMA_VERSION,
    wearers: profiles,
    assignmentByGarmentKey,
  };
};

export const liftLegacyMeasurementToWearerOrder = ({
  measurement,
  garmentKeys,
  compatibilityDemographic,
}: {
  measurement: FutureMeasurementStateV1;
  garmentKeys: readonly string[];
  compatibilityDemographic: CustomDetailDemographic | null;
}): WearerOrderStateV2 => {
  const wearer = createWearerProfile({
    presentationOrder: 0,
    fitContext:
      compatibilityDemographic === "male" ||
      compatibilityDemographic === "female" ||
      compatibilityDemographic === "unisex"
        ? compatibilityDemographic
        : null,
    measurement,
    wearerId: "wearer-legacy",
  });
  const assignmentByGarmentKey: Record<string, string> = {};
  for (const garmentKey of garmentKeys) {
    if (garmentKey.trim()) assignmentByGarmentKey[garmentKey] = wearer.wearerId;
  }
  return {
    schemaVersion: WEARER_ORDER_SCHEMA_VERSION,
    wearers: [wearer],
    assignmentByGarmentKey,
  };
};

export type PersistedMeasurementHydration =
  | { readonly status: "absent" }
  | { readonly status: "valid"; readonly order: WearerOrderStateV2 }
  | { readonly status: "invalid"; readonly preservedRaw: unknown };

export const classifyPersistedMeasurement = ({
  value,
  garmentKeys,
  compatibilityDemographic,
}: {
  value: unknown;
  garmentKeys: readonly string[];
  compatibilityDemographic: CustomDetailDemographic | null;
}): PersistedMeasurementHydration => {
  if (value === undefined) return { status: "absent" };
  const wearerOrder = normalizeWearerOrderState(value);
  if (wearerOrder) return { status: "valid", order: wearerOrder };
  const legacy = classifyFutureMeasurementHydration(value);
  if (legacy.status === "valid") {
    return {
      status: "valid",
      order: liftLegacyMeasurementToWearerOrder({
        measurement: legacy.state,
        garmentKeys,
        compatibilityDemographic,
      }),
    };
  }
  if (legacy.status === "absent") return { status: "absent" };
  return { status: "invalid", preservedRaw: legacy.preservedRaw };
};

export interface WearerMeasurementRuntime {
  wearerId: string;
  displayName: string;
  fitContext: WearerFitContext | null;
  garmentKeys: string[];
  plan: MeasurementRequirementPlan;
  measurement: FutureMeasurementStateV1;
}

export const planWearerOrderMeasurements = ({
  order,
  garmentTypeSelection,
  physicalGarments,
  garmentScopedCustomDetails,
  additionalGarmentConstructions,
}: {
  order: WearerOrderStateV2;
  garmentTypeSelection: GarmentTypeStepSelection;
  physicalGarments: readonly MeasurementPhysicalGarment[];
  garmentScopedCustomDetails?: GarmentScopedCustomDetailsStateV1;
  additionalGarmentConstructions?: AdditionalGarmentConstructionStateV1;
}): WearerMeasurementRuntime[] =>
  sortWearers(order.wearers).map((wearer) => {
    const garmentKeys = physicalGarments
      .filter((garment) => order.assignmentByGarmentKey[garment.garmentKey] === wearer.wearerId)
      .map((garment) => garment.garmentKey);
    const subset = physicalGarments.filter((garment) =>
      garmentKeys.includes(garment.garmentKey),
    );
    const plan = planMeasurementRequirements({
      route: wearer.measurement.route,
      garmentTypeSelection: {
        ...garmentTypeSelection,
        demographic: wearer.fitContext,
      },
      physicalGarments: subset,
      garmentScopedCustomDetails,
      additionalGarmentConstructions,
    });
    return {
      wearerId: wearer.wearerId,
      displayName: wearer.displayName,
      fitContext: wearer.fitContext,
      garmentKeys,
      plan,
      measurement: reconcileFutureMeasurementState({
        state: wearer.measurement,
        plan,
      }),
    };
  });

export const hasUnassignedPhysicalGarments = ({
  order,
  physicalGarmentKeys,
}: {
  order: WearerOrderStateV2;
  physicalGarmentKeys: readonly string[];
}): boolean => {
  if (physicalGarmentKeys.length === 0) return false;
  const assigned = new Set(Object.keys(order.assignmentByGarmentKey));
  return physicalGarmentKeys.some((garmentKey) => !assigned.has(garmentKey));
};

/**
 * People panel mode for Measurement.
 * Multi-person / assign UI opens when there are multiple wearers or the user
 * opted in (`peopleExpanded`). Unassigned garments alone no longer force it.
 * Closed first screen is always solo (never a dedicated fit wall).
 */
export const resolveWearerAssignmentPresentation = ({
  wearerCount,
  peopleExpanded = false,
}: {
  wearerCount: number;
  /** @deprecated Ignored — closed first screen no longer depends on sole fit. */
  soleWearerFitContext?: WearerFitContext | null;
  /** User clicked Add people on the solo first-screen (or equivalent). */
  peopleExpanded?: boolean;
  /** @deprecated Ignored — kept so older call sites type-check during rollout. */
  hasUnassignedGarments?: boolean;
}): "people" | "solo" | "fit" => {
  if (wearerCount > 1 || peopleExpanded) return "people";
  return "solo";
};

export const isWearerOrderMeasurementComplete = ({
  order,
  runtimes,
  physicalGarmentKeys,
}: {
  order: WearerOrderStateV2;
  runtimes: readonly WearerMeasurementRuntime[];
  physicalGarmentKeys: readonly string[];
}): boolean => {
  if (physicalGarmentKeys.length === 0) return false;
  if (runtimes.length === 0) return false;
  if (hasUnassignedPhysicalGarments({ order, physicalGarmentKeys })) return false;
  if (runtimes.some((runtime) => runtime.garmentKeys.length === 0)) return false;
  return runtimes.every((runtime) =>
    isFutureMeasurementStageComplete(runtime.measurement),
  );
};

export interface WearerOrderMeasurementCompletion {
  complete: boolean;
  remainingRequiredCount: number;
}

/** Order-wide measurement gate. The selected wearer is not an input. */
export const summarizeWearerOrderMeasurementCompletion = ({
  order,
  runtimes,
  physicalGarmentKeys,
}: {
  order: WearerOrderStateV2;
  runtimes: readonly WearerMeasurementRuntime[];
  physicalGarmentKeys: readonly string[];
}): WearerOrderMeasurementCompletion => ({
  complete: isWearerOrderMeasurementComplete({
    order,
    runtimes,
    physicalGarmentKeys,
  }),
  remainingRequiredCount: runtimes.reduce(
    (total, runtime) =>
      total +
      countRemainingCustomerRequiredMeasurementUnits({
        plan: runtime.plan,
        state: runtime.measurement,
      }),
    0,
  ),
});

export const projectActiveWearerMeasurements = (
  runtimes: readonly WearerMeasurementRuntime[],
): WearerOrderStateV2["wearers"] =>
  runtimes.map((runtime, index) => ({
    wearerId: runtime.wearerId,
    displayName: runtime.displayName,
    fitContext: runtime.fitContext,
    presentationOrder: index,
    measurement: runtime.measurement,
  }));
