import type { Firestore } from "firebase-admin/firestore";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import { AI_TRY_ON_SESSION_COLLECTION, hashAiTryOnUid } from "./aiTryOnSession.js";
import { AI_TRY_ON_GLOBAL_USAGE_DOC, AI_TRY_ON_USAGE_COLLECTION, aiTryOnAccountUsageDocId, aiTryOnEffectiveGlobalCap, hashAiTryOnOrderKey, readPurchasedTries } from "./aiTryOnUsageLimits.js";
import { AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW, AI_TRY_ON_ACCOUNT_WINDOW_MS, AI_TRY_ON_TRIES_PER_ORDER } from "../utils/aiTryOnGatewayContract.js";
import { isVerifiedFirebaseAccountEmailIn } from "./aiTryOnBilling.js";

/**
 * Reset tries is a separate allowlist from the billing-unavailable account.
 * Exact addresses only: no Gmail dot-folding, and never written to a log.
 */
export const AI_TRY_ON_RESET_RETRY_EMAILS = [
  "techpalavabox@gmail.com",
  "f.o.startups@gmail.com",
] as const;

export interface AiTryOnResetIdentity {
  uid: string;
  admin?: unknown;
  email?: unknown;
  email_verified?: unknown;
  firebase?: { sign_in_provider?: unknown };
}

export const canResetOwnAiTryOn = (identity: AiTryOnResetIdentity): boolean =>
  identity.admin === true && isVerifiedFirebaseAccountEmailIn(identity, AI_TRY_ON_RESET_RETRY_EMAILS);

/** Reset only counters whose server session records prove this UID owns them. */
export const resetOwnAiTryOnCounters = async (db: Firestore, uid: string, now = Date.now) => {
  const usage = db.collection(AI_TRY_ON_USAGE_COLLECTION);
  const accountRef = usage.doc(aiTryOnAccountUsageDocId(uid));
  const ownedSessions = db.collection(AI_TRY_ON_SESSION_COLLECTION).where("ownerUidHash", "==", hashAiTryOnUid(uid));
  return db.runTransaction(async (tx) => {
    const [account, sessions] = await Promise.all([tx.get(accountRef), tx.get(ownedSessions)]);
    // Bound transaction writes; fail without partial changes rather than resetting a subset.
    if (sessions.size > 450) throw new Error("reset_session_limit");
    const refs = sessions.docs.map((session) => usage.doc(`order-${hashAiTryOnOrderKey(session.id)}`));
    const orders = await Promise.all(refs.map((ref) => tx.get(ref)));
    const at = new Date(now());
    const generation = account.data()?.resetGeneration;
    tx.set(accountRef, {
      kind: "account", uses: [], updatedAt: at, expiresAt: new Date(at.getTime() + AI_TRY_ON_ACCOUNT_WINDOW_MS),
      resetGeneration: (typeof generation === "number" ? generation : 0) + 1,
    });
    orders.forEach((order, index) => {
      if (order.exists) {
        const previousGeneration = order.data()?.resetGeneration;
        tx.set(refs[index]!, { count: 0, updatedAt: at, resetGeneration: (typeof previousGeneration === "number" ? previousGeneration : 0) + 1 }, { merge: true });
      }
    });
    return orders.filter((order) => order.exists).length;
  });
};

export const handleAiTryOnAdminReset = async (
  req: HttpRequest,
  res: HttpResponse,
  dependencies: {
    verifyIdToken: (token: string, checkRevoked?: boolean) => Promise<AiTryOnResetIdentity>;
    getDb: () => Promise<Firestore>;
    now?: () => number;
  },
) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ code: "METHOD_NOT_ALLOWED" });
  }
  const header = req.headers.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  const bearer = authorization?.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!bearer) return res.status(401).json({ code: "AUTH_REQUIRED" });
  let identity: AiTryOnResetIdentity;
  try {
    identity = await dependencies.verifyIdToken(bearer, true);
  } catch {
    return res.status(401).json({ code: "AUTH_REQUIRED" });
  }
  const eligible = canResetOwnAiTryOn(identity);
  if (req.method === "GET") {
    if (!eligible) return res.status(200).json({ eligible });
    // Read-only: the lifetime preview count against the unchanged cap, for
    // the System Settings warning at 80% and 95%. Omitted if unreadable.
    let globalUsage: { count: number; cap: number } | undefined;
    try {
      const data = (await (await dependencies.getDb()).collection(AI_TRY_ON_USAGE_COLLECTION).doc(AI_TRY_ON_GLOBAL_USAGE_DOC).get()).data();
      const count = data?.count;
      globalUsage = { count: typeof count === "number" ? count : 0, cap: aiTryOnEffectiveGlobalCap(readPurchasedTries(data)) };
    } catch {
      globalUsage = undefined;
    }
    return res.status(200).json(globalUsage ? { eligible, globalUsage } : { eligible });
  }
  if (!eligible) return res.status(403).json({ code: "ADMIN_RESET_FORBIDDEN" });
  try {
    const ordersReset = await resetOwnAiTryOnCounters(await dependencies.getDb(), identity.uid, dependencies.now);
    return res.status(200).json({ status: "reset", ordersReset, orderTriesRemaining: AI_TRY_ON_TRIES_PER_ORDER, accountTriesRemaining: AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW });
  } catch {
    return res.status(503).json({ code: "RESET_UNAVAILABLE" });
  }
};
