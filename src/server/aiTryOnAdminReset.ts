import type { Firestore } from "firebase-admin/firestore";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import { AI_TRY_ON_SESSION_COLLECTION, hashAiTryOnUid } from "./aiTryOnSession.js";
import { AI_TRY_ON_USAGE_COLLECTION, aiTryOnAccountUsageDocId, hashAiTryOnOrderKey } from "./aiTryOnUsageLimits.js";
import { AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW, AI_TRY_ON_ACCOUNT_WINDOW_MS, AI_TRY_ON_TRIES_PER_ORDER } from "../utils/aiTryOnGatewayContract.js";
import { getCanonicalEmail } from "../security/authIdentity.js";

// Deliberately narrower than the general admin allowlist; never sent to the browser.
const RESET_ADMIN_EMAILS = new Set(["techpalavabox@gmail.com", "f.o.startups@gmail.com"].map(getCanonicalEmail));

export interface AiTryOnResetIdentity {
  uid: string;
  admin?: unknown;
  email?: unknown;
  email_verified?: unknown;
  firebase?: { sign_in_provider?: unknown };
}

export const canResetOwnAiTryOn = (identity: AiTryOnResetIdentity): boolean =>
  Boolean(identity.uid) && identity.admin === true && identity.email_verified === true &&
  typeof identity.email === "string" && RESET_ADMIN_EMAILS.has(getCanonicalEmail(identity.email)) &&
  typeof identity.firebase?.sign_in_provider === "string" && Boolean(identity.firebase.sign_in_provider) && identity.firebase.sign_in_provider !== "anonymous";

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
  if (req.method === "GET") return res.status(200).json({ eligible });
  if (!eligible) return res.status(403).json({ code: "ADMIN_RESET_FORBIDDEN" });
  try {
    const ordersReset = await resetOwnAiTryOnCounters(await dependencies.getDb(), identity.uid, dependencies.now);
    return res.status(200).json({ status: "reset", ordersReset, orderTriesRemaining: AI_TRY_ON_TRIES_PER_ORDER, accountTriesRemaining: AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW });
  } catch {
    return res.status(503).json({ code: "RESET_UNAVAILABLE" });
  }
};
