import type { Firestore } from "firebase-admin/firestore";
import type { CanonicalOrderIdentity } from "../utils/orderContextIdentity.js";
import {
  COMMUNITY_BATCH_CLOSED_CODE,
  COMMUNITY_BATCH_CLOSED_MESSAGE,
  communityBatchFromRecord,
  isCommunityBatchClosedForOrders,
} from "../utils/communityBatchOrderClosure.js";

const SAFE_BATCH_ID = /^[A-Za-z0-9_-]{1,128}$/;

export type CommunityOrderClosureResult =
  | { readonly status: "open" }
  | {
      readonly status: "closed";
      readonly code: typeof COMMUNITY_BATCH_CLOSED_CODE;
      readonly message: typeof COMMUNITY_BATCH_CLOSED_MESSAGE;
    }
  | { readonly status: "unavailable" };

export const readCommunityBatchRecord = async (
  db: unknown,
  batchId: string,
): Promise<unknown | null> => {
  if (!SAFE_BATCH_ID.test(batchId)) return null;
  const snapshot = await (db as Firestore).collection("batches").doc(batchId).get();
  if (!snapshot.exists) return null;
  return { id: snapshot.id, ...(snapshot.data() ?? {}) };
};

/**
 * Individual and private orders are not community batches. A community order
 * is closed when the live batch record is missing, unreadable, or past the
 * registration rules — including a deadline that a leftover OPEN status ignores.
 */
export const resolveCommunityOrderClosure = async ({
  identity,
  readBatch,
  now = new Date(),
}: {
  identity: CanonicalOrderIdentity | null | undefined;
  readBatch: (batchId: string) => Promise<unknown | null>;
  now?: Date;
}): Promise<CommunityOrderClosureResult> => {
  if (!identity || identity.orderType !== "Community") return { status: "open" };
  if (!SAFE_BATCH_ID.test(identity.batchId)) {
    return {
      status: "closed",
      code: COMMUNITY_BATCH_CLOSED_CODE,
      message: COMMUNITY_BATCH_CLOSED_MESSAGE,
    };
  }
  let raw: unknown;
  try {
    raw = await readBatch(identity.batchId);
  } catch {
    return { status: "unavailable" };
  }
  const batch = communityBatchFromRecord(identity.batchId, raw);
  if (isCommunityBatchClosedForOrders(batch, now)) {
    return {
      status: "closed",
      code: COMMUNITY_BATCH_CLOSED_CODE,
      message: COMMUNITY_BATCH_CLOSED_MESSAGE,
    };
  }
  return { status: "open" };
};
