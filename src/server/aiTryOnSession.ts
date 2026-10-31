import { createHash, randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { AuthRateLimitRule } from "./authRateLimit.js";

/**
 * Server-issued AI Try-on sessions (Step 7). One session = one order's
 * 5 tries and its stored previews. It replaces the browser-chosen order key.
 *
 * - Signed-in customers (non-anonymous Firebase users): the session is tied
 *   to the account through `aiTryOnSessionOwners/<sha256(uid)>`. The browser
 *   holds no session secret; every call carries the Firebase ID token and
 *   the server finds the account's open session. Clearing browser storage
 *   or switching device returns the SAME session, so tries can't be reset.
 * - Guests: the server mints an opaque random token (`tts1_…`, 256 bits).
 *   Only its SHA-256 is stored, as the session id. A guest who clears
 *   storage loses the token and gets a new session, so new guest sessions
 *   are limited per IP (AI_TRY_ON_GUEST_SESSION_IP_LIMIT) on top of the
 *   10/hour generation limit and the 1000 global cap.
 * - Signing in adopts an open guest session (if the account has none), so
 *   the tries and previews follow the customer into their account.
 * - A session closes when its order is paid (server-side, see
 *   aiTryOnPaymentCleanup) or when the customer starts a fresh order. A
 *   closed session is never reopened, so the next order gets a new one.
 *
 * Documents (Admin SDK only; client rules deny both collections):
 *   aiTryOnSessions/<sessionId>      { ownerUidHash|null, expiresAt, closedAt|null }
 *   aiTryOnSessionOwners/<uidHash>   { sessionId, expiresAt }
 * `expiresAt` (90 days, like the try counters) is the Firestore TTL field.
 */
export const AI_TRY_ON_SESSION_COLLECTION = "aiTryOnSessions";
export const AI_TRY_ON_SESSION_OWNER_COLLECTION = "aiTryOnSessionOwners";
export const AI_TRY_ON_SESSION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
export const AI_TRY_ON_SESSION_HEADER = "x-ai-try-on-session";
export const AI_TRY_ON_SESSION_TOKEN_PATTERN = /^tts1_[A-Za-z0-9_-]{43}$/;

/** New guest sessions per IP per day (each one carries 5 tries). */
export const AI_TRY_ON_GUEST_SESSION_IP_LIMIT: AuthRateLimitRule = {
  bucket: "ai-try-on-guest-session-ip",
  limit: 5,
  windowMs: 24 * 60 * 60 * 1000,
};

export const hashAiTryOnSessionToken = (token: string): string =>
  createHash("sha256").update(`ai-try-on-session\u0000${token}`).digest("hex");

export const hashAiTryOnUid = (uid: string): string =>
  createHash("sha256").update(`ai-try-on-uid\u0000${uid}`).digest("hex");

export const createAiTryOnGuestSessionToken = (): string =>
  `tts1_${randomBytes(32).toString("base64url")}`;

export interface AiTryOnSessionIdentity {
  /** Verified non-anonymous Firebase uid, or null for a guest. */
  readonly uid: string | null;
  /** Guest token from the session header, if any. */
  readonly token: string | null;
}

export interface AiTryOnSessionResolution {
  readonly sessionId: string;
  /** Only for guests: the token the browser must keep. */
  readonly sessionToken: string | null;
  readonly created: boolean;
}

export interface AiTryOnSessions {
  /** Finds or mints the caller's open session. */
  resolve(identity: AiTryOnSessionIdentity): Promise<AiTryOnSessionResolution>;
  /** The caller's open session id, or null. Never mints. */
  authorize(identity: AiTryOnSessionIdentity): Promise<string | null>;
  /** Closes a session (idempotent). */
  close(sessionId: string): Promise<void>;
  /** The account's open session id, or null (payment cleanup). */
  findOpenForUid(uid: string): Promise<string | null>;
}

interface SessionDoc {
  ownerUidHash: string | null;
  expiresAt: Date;
  closedAt: Date | null;
}

const readMillis = (value: unknown): number | null => {
  if (value instanceof Date) return value.getTime();
  const toMillis = (value as { toMillis?: unknown } | null | undefined)?.toMillis;
  return typeof toMillis === "function" ? Number(toMillis.call(value)) : null;
};

export class AiTryOnGuestSessionLimitError extends Error {
  constructor() {
    super("guest_session_limit");
    this.name = "AiTryOnGuestSessionLimitError";
  }
}

export const createAiTryOnSessions = (
  db: Firestore,
  {
    now = Date.now,
    allowNewGuestSession = async () => undefined,
    createGuestToken = createAiTryOnGuestSessionToken,
    createSessionId = () => randomBytes(32).toString("hex"),
  }: {
    now?: () => number;
    /** Throws AiTryOnGuestSessionLimitError (or any error) to refuse a new guest session. */
    allowNewGuestSession?: () => Promise<void>;
    createGuestToken?: () => string;
    createSessionId?: () => string;
  } = {},
): AiTryOnSessions => {
  const sessions = () => db.collection(AI_TRY_ON_SESSION_COLLECTION);
  const owners = () => db.collection(AI_TRY_ON_SESSION_OWNER_COLLECTION);
  const isOpen = (doc: Partial<SessionDoc> | undefined): doc is SessionDoc => {
    if (!doc || doc.closedAt) return false;
    const expiresAt = readMillis(doc.expiresAt);
    return expiresAt !== null && expiresAt > now();
  };
  const newDoc = (ownerUidHash: string | null): SessionDoc => ({
    ownerUidHash,
    expiresAt: new Date(now() + AI_TRY_ON_SESSION_RETENTION_MS),
    closedAt: null,
  });
  const validToken = (token: string | null) =>
    token && AI_TRY_ON_SESSION_TOKEN_PATTERN.test(token) ? token : null;

  const findOpenForUid = async (uid: string) => {
    const pointer = await owners().doc(hashAiTryOnUid(uid)).get();
    const sessionId = pointer.exists ? (pointer.data() as { sessionId?: unknown }).sessionId : null;
    if (typeof sessionId !== "string") return null;
    const session = await sessions().doc(sessionId).get();
    const doc = session.exists ? (session.data() as SessionDoc) : undefined;
    return isOpen(doc) && doc.ownerUidHash === hashAiTryOnUid(uid) ? sessionId : null;
  };

  return {
    async resolve({ uid, token }) {
      if (uid) {
        const uidHash = hashAiTryOnUid(uid);
        // One transaction so two tabs can't mint two sessions for one account.
        return db.runTransaction(async (tx) => {
          const ownerRef = owners().doc(uidHash);
          const pointer = await tx.get(ownerRef);
          const pointedId = pointer.exists ? (pointer.data() as { sessionId?: unknown }).sessionId : null;
          if (typeof pointedId === "string") {
            const current = await tx.get(sessions().doc(pointedId));
            const doc = current.exists ? (current.data() as SessionDoc) : undefined;
            if (isOpen(doc) && doc.ownerUidHash === uidHash) {
              return { sessionId: pointedId, sessionToken: null, created: false };
            }
          }
          const guestToken = validToken(token);
          if (guestToken) {
            const guestId = hashAiTryOnSessionToken(guestToken);
            const guestRef = sessions().doc(guestId);
            const guest = await tx.get(guestRef);
            const doc = guest.exists ? (guest.data() as SessionDoc) : undefined;
            if (isOpen(doc) && doc.ownerUidHash === null) {
              tx.set(guestRef, { ...doc, ownerUidHash: uidHash });
              tx.set(ownerRef, { sessionId: guestId, expiresAt: doc.expiresAt });
              return { sessionId: guestId, sessionToken: null, created: false };
            }
          }
          const sessionId = createSessionId();
          const doc = newDoc(uidHash);
          tx.set(sessions().doc(sessionId), doc);
          tx.set(ownerRef, { sessionId, expiresAt: doc.expiresAt });
          return { sessionId, sessionToken: null, created: true };
        });
      }
      const guestToken = validToken(token);
      if (guestToken) {
        const guestId = hashAiTryOnSessionToken(guestToken);
        const guest = await sessions().doc(guestId).get();
        const doc = guest.exists ? (guest.data() as SessionDoc) : undefined;
        if (isOpen(doc) && doc.ownerUidHash === null) {
          return { sessionId: guestId, sessionToken: guestToken, created: false };
        }
      }
      await allowNewGuestSession();
      const sessionToken = createGuestToken();
      const sessionId = hashAiTryOnSessionToken(sessionToken);
      await sessions().doc(sessionId).set(newDoc(null));
      return { sessionId, sessionToken, created: true };
    },

    async authorize({ uid, token }) {
      if (uid) return findOpenForUid(uid);
      const guestToken = validToken(token);
      if (!guestToken) return null;
      const sessionId = hashAiTryOnSessionToken(guestToken);
      const guest = await sessions().doc(sessionId).get();
      const doc = guest.exists ? (guest.data() as SessionDoc) : undefined;
      return isOpen(doc) && doc.ownerUidHash === null ? sessionId : null;
    },

    async close(sessionId) {
      await db.runTransaction(async (tx) => {
        const ref = sessions().doc(sessionId);
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) return;
        const doc = snapshot.data() as SessionDoc;
        const ownerRef = doc.ownerUidHash ? owners().doc(doc.ownerUidHash) : null;
        const pointer = ownerRef ? await tx.get(ownerRef) : null;
        if (!doc.closedAt) tx.set(ref, { ...doc, closedAt: new Date(now()) });
        if (ownerRef && pointer?.exists && (pointer.data() as { sessionId?: unknown }).sessionId === sessionId) {
          tx.delete(ownerRef);
        }
      });
    },

    findOpenForUid,
  };
};
