import type {
  FutureOrderCandidateBlocker,
  FutureOrderCandidateV2,
} from "./futureOrderCandidate";

export interface FutureOrderCartItemV2 {
  readonly schemaVersion: 2;
  readonly cartItemId: string;
  readonly candidate: FutureOrderCandidateV2;
}

export interface FutureOrderMasterOrderV2 {
  readonly schemaVersion: 2;
  readonly orderId: string;
  readonly cartItem: FutureOrderCartItemV2;
}

export type FutureOrderV2ParseResult<T> =
  | { readonly status: "valid"; readonly value: T; readonly blockers: readonly [] }
  | {
      readonly status: "invalid";
      readonly value: null;
      readonly blockers: readonly FutureOrderCandidateBlocker[];
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hasText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.trim() === value;

const isMoneyCents = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 0;

const cloneJsonValue = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

const deepFreeze = <T>(value: T): T => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach((nested) =>
    deepFreeze(nested),
  );
  return Object.freeze(value);
};

const blocker = (code: string, message: string): FutureOrderCandidateBlocker => ({
  code,
  stage: "summary",
  message,
});

const invalid = <T>(code: string, message: string): FutureOrderV2ParseResult<T> =>
  deepFreeze({ status: "invalid", value: null, blockers: [blocker(code, message)] });

const FORBIDDEN_PERSISTED_FIELD_NAMES = new Set([
  "storagepath",
  "ownertoken",
  "ownershipclaimtoken",
  "cleanuptoken",
  "idtoken",
  "accesstoken",
  "refreshtoken",
  "uploadoperationgeneration",
  "uploadoperationticket",
  "persistenceacknowledgement",
  "objecturl",
  "file",
  "blob",
]);

const hasForbiddenOrNonJsonValue = (value: unknown): boolean => {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return false;
  }
  if (Array.isArray(value)) return value.some(hasForbiddenOrNonJsonValue);
  if (!isRecord(value)) return true;
  return Object.entries(value).some(([key, nested]) =>
    FORBIDDEN_PERSISTED_FIELD_NAMES.has(key.toLowerCase()) ||
    hasForbiddenOrNonJsonValue(nested),
  );
};

const isPricingShape = (value: unknown): boolean => {
  if (!isRecord(value) || value.schemaVersion !== 2 ||
    value.model !== "all_inclusive_garment_construction" ||
    !["exact", "pending", "invalid"].includes(String(value.status)) ||
    !isRecord(value.components)) return false;
  const amounts = [
    value.garmentConstructionSubtotalCents,
    value.customDetailsCents,
    value.selectedDesignTotalCents,
    value.postEindhovenAdjustmentCents,
    value.exactTotalCents,
  ];
  if (amounts.some((amount) => amount !== null && !isMoneyCents(amount))) {
    return false;
  }
  return [
    "fabric",
    "sewing",
    "tax",
    "lagosToEindhovenShipping",
    "customDetails",
    "postEindhovenDelivery",
  ].every((key) => {
    const component = value.components[key];
    return isRecord(component) &&
      typeof component.status === "string" &&
      (component.amountCents === null || isMoneyCents(component.amountCents));
  });
};

const isOccurrenceStyleSnapshotShape = (value: unknown): boolean => {
  if (!isRecord(value) || !isRecord(value.occurrence) ||
    !hasText(value.occurrence.garmentKey) ||
    !hasText(value.occurrence.occurrenceToken) ||
    !hasText(value.occurrence.label) || !hasText(value.occurrence.garmentType) ||
    !Number.isSafeInteger(value.assignmentRevision) ||
    Number(value.assignmentRevision) < 1 || !hasText(value.sourceKey)) return false;
  if (value.sourceKind === "catalogue") {
    const catalogue = value.catalogue;
    return isRecord(catalogue) && value.uploaded === null &&
      hasText(catalogue.styleId) && hasText(catalogue.name) &&
      (catalogue.image === null || typeof catalogue.image === "string") &&
      Number.isSafeInteger(catalogue.publicRevision) &&
      Number(catalogue.publicRevision) >= 1 &&
      Number.isSafeInteger(catalogue.eligibilityRevision) &&
      Number(catalogue.eligibilityRevision) >= 1 &&
      hasText(catalogue.eligibilityFingerprint) &&
      (catalogue.adaptabilityConfirmationFingerprint === null ||
        hasText(catalogue.adaptabilityConfirmationFingerprint));
  }
  if (value.sourceKind === "uploaded") {
    const uploaded = value.uploaded;
    return isRecord(uploaded) && value.catalogue === null &&
      hasText(uploaded.uploadedSourceRef) && hasText(uploaded.displayLabel) &&
      (uploaded.previewReference === null || hasText(uploaded.previewReference));
  }
  return false;
};

const isNonStyleEnvelopeShape = (value: Record<string, unknown>): boolean => {
  const authority = value.authorityVersions;
  const shipping = value.shipping;
  return isRecord(authority) &&
    Number.isSafeInteger(authority.customDetailsSchemaVersion) &&
    Number.isSafeInteger(authority.measurementSchemaVersion) &&
    hasText(authority.measurementBlueprintVersion) &&
    Number.isSafeInteger(authority.shippingSchemaVersion) &&
    Array.isArray(value.garments) && value.garments.length > 0 &&
    value.garments.every((garment) =>
      isRecord(garment) && hasText(garment.garmentKey) &&
      hasText(garment.garmentType) && hasText(garment.label) &&
      Array.isArray(garment.physicalComponents) &&
      Array.isArray(garment.construction) &&
      (garment.constructionTotalCents === null ||
        isMoneyCents(garment.constructionTotalCents)),
    ) &&
    Array.isArray(value.fabricAllocations) &&
    value.fabricAllocations.every((allocation) =>
      isRecord(allocation) && hasText(allocation.allocationId) &&
      hasText(allocation.fabricCode) && hasText(allocation.fabricName) &&
      Array.isArray(allocation.garmentAssignments) &&
      (allocation.materialPriceCents === null ||
        isMoneyCents(allocation.materialPriceCents)),
    ) &&
    Array.isArray(value.customDetails) &&
    value.customDetails.every((detail) =>
      isRecord(detail) && hasText(detail.occurrenceKey) &&
      hasText(detail.garmentKey) && hasText(detail.selectionGroup) &&
      hasText(detail.optionId) &&
      (detail.priceCents === null || isMoneyCents(detail.priceCents)),
    ) &&
    isRecord(value.aiTryOn) && typeof value.aiTryOn.status === "string" &&
    typeof value.aiTryOn.reviewStatus === "string" &&
    isRecord(value.measurements) && Number.isSafeInteger(value.measurements.schemaVersion) &&
    isRecord(shipping) && isRecord(shipping.state) &&
    typeof shipping.status === "string" &&
    typeof shipping.customerInformationComplete === "boolean" &&
    typeof shipping.formInputsComplete === "boolean" &&
    typeof shipping.formComplete === "boolean" &&
    typeof shipping.quoteReady === "boolean" &&
    typeof shipping.quoteRequired === "boolean" &&
    Array.isArray(value.blockers) &&
    value.blockers.every((item) =>
      isRecord(item) && hasText(item.code) && hasText(item.stage) &&
      hasText(item.message),
    );
};

const parseJsonInput = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
};

export const parseFutureOrderCandidateV2 = (
  value: unknown,
): FutureOrderV2ParseResult<FutureOrderCandidateV2> => {
  const parsed = parseJsonInput(value);
  if (!isRecord(parsed) || parsed.schemaVersion !== 2) {
    return invalid("UNSUPPORTED_CANDIDATE_V2_SCHEMA", "The Candidate does not use supported V2 storage.");
  }
  if (
    "source" in parsed || "design" in parsed ||
    !isRecord(parsed.journey) || parsed.journey.mode !== "future_nine_stage" ||
    !Number.isSafeInteger(parsed.journey.schemaVersion) ||
    !isNonStyleEnvelopeShape(parsed) || !isPricingShape(parsed.pricing) ||
    !["reviewable", "blocked", "invalid"].includes(String(parsed.contentStatus)) ||
    parsed.paymentStatus !== "payment_provider_unavailable" ||
    !Array.isArray(parsed.occurrenceStyleSnapshots)
  ) {
    return invalid("MALFORMED_CANDIDATE_V2", "The Candidate V2 envelope is malformed.");
  }
  if (hasForbiddenOrNonJsonValue(parsed)) {
    return invalid("FORBIDDEN_CANDIDATE_V2_FIELD", "The Candidate contains private or transient data.");
  }
  const identities = new Set<string>();
  for (const snapshot of parsed.occurrenceStyleSnapshots) {
    if (!isOccurrenceStyleSnapshotShape(snapshot)) {
      return invalid("MALFORMED_OCCURRENCE_STYLE_SNAPSHOT", "An occurrence Design Style snapshot is malformed.");
    }
    const occurrence = snapshot.occurrence as Record<string, unknown>;
    const identity = `${occurrence.garmentKey}\u0000${occurrence.occurrenceToken}`;
    if (identities.has(identity)) {
      return invalid("DUPLICATE_OCCURRENCE_STYLE_IDENTITY", "Occurrence Design Style identities must be unique.");
    }
    identities.add(identity);
  }
  if (parsed.occurrenceStyleSnapshots.length === 0) {
    return invalid("MISSING_OCCURRENCE_STYLE_SNAPSHOTS", "Candidate V2 requires occurrence Design Style snapshots.");
  }
  return deepFreeze({
    status: "valid",
    value: deepFreeze(cloneJsonValue(parsed as unknown as FutureOrderCandidateV2)),
    blockers: [],
  });
};

export const createFutureOrderCartItemV2 = ({
  candidate,
  metadata,
}: {
  candidate: FutureOrderCandidateV2;
  metadata: Readonly<{ cartItemId: string }>;
}): FutureOrderV2ParseResult<FutureOrderCartItemV2> => {
  if (!hasText(metadata.cartItemId)) {
    return invalid("INVALID_CART_ITEM_V2_METADATA", "A Cart V2 item ID is required.");
  }
  const parsedCandidate = parseFutureOrderCandidateV2(candidate);
  if (parsedCandidate.status !== "valid") {
    return deepFreeze({
      status: "invalid",
      value: null,
      blockers: parsedCandidate.blockers,
    });
  }
  return deepFreeze({
    status: "valid",
    value: deepFreeze({
      schemaVersion: 2,
      cartItemId: metadata.cartItemId,
      candidate: cloneJsonValue(parsedCandidate.value),
    }),
    blockers: [],
  });
};

export const parseFutureOrderCartItemV2 = (
  value: unknown,
): FutureOrderV2ParseResult<FutureOrderCartItemV2> => {
  const parsed = parseJsonInput(value);
  if (!isRecord(parsed) || parsed.schemaVersion !== 2) {
    return invalid("UNSUPPORTED_CART_ITEM_V2_SCHEMA", "The cart item does not use supported V2 storage.");
  }
  if (!hasText(parsed.cartItemId)) {
    return invalid("MALFORMED_CART_ITEM_V2", "The Cart V2 item ID is missing.");
  }
  const candidate = parseFutureOrderCandidateV2(parsed.candidate);
  if (candidate.status !== "valid") {
    return deepFreeze({ status: "invalid", value: null, blockers: candidate.blockers });
  }
  return deepFreeze({
    status: "valid",
    value: deepFreeze({
      schemaVersion: 2,
      cartItemId: parsed.cartItemId,
      candidate: cloneJsonValue(candidate.value),
    }),
    blockers: [],
  });
};

export const createFutureOrderMasterOrderV2 = ({
  cartItem,
  metadata,
}: {
  cartItem: FutureOrderCartItemV2;
  metadata: Readonly<{ orderId: string }>;
}): FutureOrderV2ParseResult<FutureOrderMasterOrderV2> => {
  if (!hasText(metadata.orderId)) {
    return invalid("INVALID_MASTER_ORDER_V2_METADATA", "A MasterOrder V2 ID is required.");
  }
  const parsedCartItem = parseFutureOrderCartItemV2(cartItem);
  if (parsedCartItem.status !== "valid") {
    return deepFreeze({
      status: "invalid",
      value: null,
      blockers: parsedCartItem.blockers,
    });
  }
  return deepFreeze({
    status: "valid",
    value: deepFreeze({
      schemaVersion: 2,
      orderId: metadata.orderId,
      cartItem: cloneJsonValue(parsedCartItem.value),
    }),
    blockers: [],
  });
};

export const parseFutureOrderMasterOrderV2 = (
  value: unknown,
): FutureOrderV2ParseResult<FutureOrderMasterOrderV2> => {
  const parsed = parseJsonInput(value);
  if (!isRecord(parsed) || parsed.schemaVersion !== 2) {
    return invalid("UNSUPPORTED_MASTER_ORDER_V2_SCHEMA", "The MasterOrder does not use supported V2 storage.");
  }
  if (!hasText(parsed.orderId)) {
    return invalid("MALFORMED_MASTER_ORDER_V2", "The MasterOrder V2 ID is missing.");
  }
  const cartItem = parseFutureOrderCartItemV2(parsed.cartItem);
  if (cartItem.status !== "valid") {
    return deepFreeze({ status: "invalid", value: null, blockers: cartItem.blockers });
  }
  return deepFreeze({
    status: "valid",
    value: deepFreeze({
      schemaVersion: 2,
      orderId: parsed.orderId,
      cartItem: cloneJsonValue(cartItem.value),
    }),
    blockers: [],
  });
};

export const serializeFutureOrderCartItemV2 = (
  value: FutureOrderCartItemV2,
): FutureOrderV2ParseResult<string> => {
  const parsed = parseFutureOrderCartItemV2(value);
  return parsed.status === "valid"
    ? { status: "valid", value: JSON.stringify(parsed.value), blockers: [] }
    : parsed;
};

export const serializeFutureOrderMasterOrderV2 = (
  value: FutureOrderMasterOrderV2,
): FutureOrderV2ParseResult<string> => {
  const parsed = parseFutureOrderMasterOrderV2(value);
  return parsed.status === "valid"
    ? { status: "valid", value: JSON.stringify(parsed.value), blockers: [] }
    : parsed;
};
