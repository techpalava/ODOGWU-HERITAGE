import {
  parsePersistedFutureOrderV2,
  type PersistedFutureOrderV2,
} from "./futureOrderV2PersistenceContract.js";

export type FutureOrderV2HistoricalStylePresentation =
  | {
      readonly kind: "catalogue";
      readonly name: string;
      readonly image: string | null;
      readonly evidence: {
        readonly styleId: string;
        readonly publicRevision: number;
        readonly eligibilityRevision: number;
        readonly eligibilityFingerprint: string;
      };
    }
  | {
      readonly kind: "uploaded";
      readonly displayLabel: string;
      readonly uploadedSourceRef: string;
      readonly previewReference: string | null;
    };

export interface FutureOrderV2HistoricalOccurrencePresentation {
  readonly orderId: string;
  readonly garmentKey: string;
  readonly occurrenceToken: string;
  readonly garmentLabel: string;
  readonly garmentType: string;
  readonly style: FutureOrderV2HistoricalStylePresentation;
}

export interface FutureOrderV2HistoryPresentation {
  readonly orderId: string;
  readonly persistedAt: string;
  readonly customer: PersistedFutureOrderV2["customer"];
  readonly shippingStatus: string;
  readonly paymentStatus: string;
  readonly exactTotalCents: number | null;
  readonly occurrences: readonly FutureOrderV2HistoricalOccurrencePresentation[];
}

export type FutureOrderV2HistoryPresentationResult =
  | { readonly status: "valid"; readonly value: FutureOrderV2HistoryPresentation }
  | { readonly status: "not_v2" }
  | { readonly status: "invalid_history" };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isClaimedV2Record = (value: unknown): boolean =>
  isRecord(value) && (value.schemaVersion === 2 || value.recordType === "future_order_v2");

const unwrapDocumentProjection = (value: unknown): unknown => {
  if (!isRecord(value) || !("id" in value)) return value;
  const { id, ...persisted } = value;
  return typeof id === "string" && id === persisted.orderId ? persisted : value;
};

export const presentFutureOrderV2History = (
  value: unknown,
): FutureOrderV2HistoryPresentationResult => {
  const persisted = unwrapDocumentProjection(value);
  const parsed = parsePersistedFutureOrderV2(persisted);
  if (parsed.status !== "valid") {
    return isClaimedV2Record(persisted)
      ? { status: "invalid_history" }
      : { status: "not_v2" };
  }

  const candidate = parsed.value.masterOrder.cartItem.candidate;
  return {
    status: "valid",
    value: {
      orderId: parsed.value.orderId,
      persistedAt: parsed.value.persistedAt,
      customer: parsed.value.customer,
      shippingStatus: candidate.shipping.status,
      paymentStatus: candidate.paymentStatus,
      exactTotalCents: candidate.pricing.exactTotalCents,
      occurrences: candidate.occurrenceStyleSnapshots.map((snapshot) => ({
        orderId: parsed.value.orderId,
        garmentKey: snapshot.occurrence.garmentKey,
        occurrenceToken: snapshot.occurrence.occurrenceToken,
        garmentLabel: snapshot.occurrence.label,
        garmentType: snapshot.occurrence.garmentType,
        style:
          snapshot.sourceKind === "catalogue"
            ? {
                kind: "catalogue",
                name: snapshot.catalogue!.name,
                image: snapshot.catalogue!.image,
                evidence: {
                  styleId: snapshot.catalogue!.styleId,
                  publicRevision: snapshot.catalogue!.publicRevision,
                  eligibilityRevision: snapshot.catalogue!.eligibilityRevision,
                  eligibilityFingerprint: snapshot.catalogue!.eligibilityFingerprint,
                },
              }
            : {
                kind: "uploaded",
                displayLabel: snapshot.uploaded!.displayLabel,
                uploadedSourceRef: snapshot.uploaded!.uploadedSourceRef,
                previewReference: snapshot.uploaded!.previewReference,
              },
      })),
    },
  };
};

export type FutureOrderV2UploadedSourceHistoryResult =
  | {
      readonly status: "referenced";
      readonly uploadedSourceRef: string;
      readonly references: readonly FutureOrderV2HistoricalOccurrencePresentation[];
    }
  | { readonly status: "not_referenced"; readonly uploadedSourceRef: string }
  | { readonly status: "invalid_history"; readonly uploadedSourceRef: string };

const isCanonicalUploadedSourceRef = (value: string): boolean =>
  value.trim() === value && value.length > 0 && value.length <= 512 && !value.includes("/");

/** Read-only history authority. Unknown or malformed V2 evidence always fails closed. */
export const inspectFutureOrderV2UploadedSourceHistory = ({
  records,
  uploadedSourceRef,
}: {
  records: readonly unknown[];
  uploadedSourceRef: string;
}): FutureOrderV2UploadedSourceHistoryResult => {
  if (!isCanonicalUploadedSourceRef(uploadedSourceRef)) {
    return { status: "invalid_history", uploadedSourceRef };
  }

  const references: FutureOrderV2HistoricalOccurrencePresentation[] = [];
  for (const record of records) {
    const presentation = presentFutureOrderV2History(record);
    if (presentation.status === "invalid_history") {
      return { status: "invalid_history", uploadedSourceRef };
    }
    if (presentation.status !== "valid") continue;
    references.push(
      ...presentation.value.occurrences.filter(
        (occurrence) =>
          occurrence.style.kind === "uploaded" &&
          occurrence.style.uploadedSourceRef === uploadedSourceRef,
      ),
    );
  }
  return references.length > 0
    ? { status: "referenced", uploadedSourceRef, references }
    : { status: "not_referenced", uploadedSourceRef };
};
