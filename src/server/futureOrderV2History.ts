import {
  inspectFutureOrderV2UploadedSourceHistory,
  presentFutureOrderV2History,
} from "../utils/futureOrderV2History.js";

export type FutureOrderV2HistoryLookupStatus =
  | "referenced"
  | "not_referenced"
  | "unknown";

export interface FutureOrderV2HistoryIdentity {
  readonly uid: string;
  readonly isAnonymous: boolean;
}

export interface FutureOrderV2HistoryAdapter {
  listCompleteOwnerHistory(ownerUid: string): Promise<readonly unknown[]>;
}

type FirestoreHistorySnapshot = {
  readonly docs: readonly { data(): unknown }[];
};

type FirestoreHistoryQuery = {
  get(): Promise<FirestoreHistorySnapshot>;
};

type FirestoreHistoryCollection = {
  where(fieldPath: string, opStr: "==", value: string): FirestoreHistoryQuery;
};

export interface FutureOrderV2HistoryFirestore {
  collection(collectionPath: string): FirestoreHistoryCollection;
}

export const createAdminFutureOrderV2HistoryAdapter = (
  db: FutureOrderV2HistoryFirestore,
): FutureOrderV2HistoryAdapter => ({
  async listCompleteOwnerHistory(ownerUid) {
    // This owner query is intentionally unbounded: a missing result is only
    // meaningful after Firestore has returned the complete matching set.
    const snapshot = await db
      .collection("orders")
      .where("ownerUid", "==", ownerUid)
      .get();
    return snapshot.docs.map((document) => document.data());
  },
});

const isCanonicalUploadedSourceRef = (value: string): boolean =>
  value.trim() === value && value.length > 0 && value.length <= 512 && !value.includes("/");

export const lookupFutureOrderV2UploadedSourceHistory = async ({
  identity,
  uploadedSourceRef,
  adapter,
}: {
  identity: FutureOrderV2HistoryIdentity;
  uploadedSourceRef: string;
  adapter: FutureOrderV2HistoryAdapter;
}): Promise<FutureOrderV2HistoryLookupStatus> => {
  if (!identity.uid || identity.isAnonymous || !isCanonicalUploadedSourceRef(uploadedSourceRef)) {
    return "unknown";
  }

  let records: readonly unknown[];
  try {
    records = await adapter.listCompleteOwnerHistory(identity.uid);
  } catch {
    return "unknown";
  }

  // A complete owner history containing legacy or malformed evidence cannot
  // prove canonical-source absence, so do not filter it out.
  if (records.some((record) => presentFutureOrderV2History(record).status !== "valid")) {
    return "unknown";
  }
  const result = inspectFutureOrderV2UploadedSourceHistory({
    records,
    uploadedSourceRef,
  });
  return result.status === "referenced"
    ? "referenced"
    : result.status === "not_referenced"
      ? "not_referenced"
      : "unknown";
};
