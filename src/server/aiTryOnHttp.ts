import type { Firestore } from "firebase-admin/firestore";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import { getAdminServices } from "./firebaseAdmin.js";
import {
  AuthRateLimitError,
  consumeAuthRateLimit,
  getClientIp,
} from "./authRateLimit.js";
import {
  AI_TRY_ON_IP_RATE_LIMIT,
  createAiTryOnUsageLimits,
  hashAiTryOnOrderKey,
  type AiTryOnUsageLimits,
} from "./aiTryOnUsageLimits.js";
import {
  createGeminiGenerateContent,
  readGeminiApiKey,
  runAiTryOnGemini,
  type AiTryOnGenerateContent,
} from "./aiTryOnGemini.js";
import { buildAiTryOnPrompt } from "./aiTryOnPrompt.js";
import {
  createAiTryOnPreviewId,
  createAiTryOnPreviewStore,
  type AiTryOnPreviewBucket,
  type AiTryOnPreviewStore,
} from "./aiTryOnPreviewStore.js";
import {
  AI_TRY_ON_GUEST_SESSION_IP_LIMIT,
  AI_TRY_ON_SESSION_HEADER,
  AiTryOnGuestSessionLimitError,
  createAiTryOnSessions,
  type AiTryOnSessionIdentity,
  type AiTryOnSessions,
} from "./aiTryOnSession.js";
import {
  compactAiTryOnPreviewImage,
  type CompactAiTryOnPreviewImage,
} from "./aiTryOnPreviewImage.js";
import {
  AiTryOnReferenceImageError,
  loadAiTryOnReferenceImageOnServer,
  type AiTryOnReferenceBucket,
} from "./aiTryOnReferenceImages.js";
import { normalizeAiTryOnFitHints, type AiTryOnFitHint } from "../utils/aiTryOnFitHints.js";
import {
  normalizeAiTryOnOrderDetails,
  type AiTryOnOrderDetails,
} from "../utils/aiTryOnOrderDetails.js";
import {
  AI_TRY_ON_GLOBAL_GENERATION_CAP,
  AI_TRY_ON_MAX_IMAGE_BYTES,
  AI_TRY_ON_MAX_TOTAL_IMAGE_BYTES,
  AI_TRY_ON_PROMPT_VERSION,
  AI_TRY_ON_ROUTE,
  AI_TRY_ON_TRIES_PER_ORDER,
  type AiTryOnAvailabilityResponse,
  type AiTryOnErrorCode,
  type AiTryOnErrorResponse,
  type AiTryOnGenerationSuccess,
  type AiTryOnImageMimeType,
  type AiTryOnInlineImage,
  type AiTryOnMode,
} from "../utils/aiTryOnGatewayContract.js";

/**
 * `GET|POST /api/ai-try-on`: server-side Gemini virtual try-on.
 *
 * Live only when BOTH `AI_TRY_ON_ENABLED=true` and `GEMINI_API_KEY` are set
 * in the server environment. Otherwise GET reports `unavailable` and POST
 * returns 503 without touching Firestore or Gemini, so the Design Studio
 * keeps its existing "AI Try-on is currently unavailable" state.
 *
 * Order of checks on POST: validate → per-IP window → reserve one order try
 * and one global generation (single transaction) → Gemini → release the
 * reservation if no image came back.
 *
 * GET may carry `?orderKey=` to also report the tries left for that order
 * and its stored previews. After a refunded failure the error body carries
 * `orderTriesRemaining` so the Design Studio can say how many tries are left.
 *
 * Step 6 storage:
 * - The person photo lives only in this request: it is parsed into memory,
 *   sent to Gemini and dropped when the request ends. It is never written
 *   to Storage, Firestore, logs or temp files.
 * - Garment/fabric pictures may be sent as catalogue URLs; the server loads
 *   them (own bucket via Admin SDK, or images.unsplash.com), so browser CORS
 *   no longer matters.
 * - The generated preview is returned inline AND stored privately
 *   (aiTryOnPreviewStore) for up to 30 days.
 * - `GET ?previewId=` returns a stored preview to its owner;
 *   `DELETE ?previewId=` (or `?all=1`, plus `&close=1` to also close the
 *   session for a fresh order) deletes it. Both work even when generation is
 *   switched off, so a customer can always delete.
 *
 * Step 7 sessions (aiTryOnSession): the 5-try limit and preview ownership
 * belong to a SERVER-ISSUED session, not a browser-chosen key.
 * `POST ?action=session` finds or mints it and reports tries left and
 * stored previews. Signed-in customers send `Authorization: Bearer <Firebase
 * ID token>`; guests send `X-AI-Try-On-Session: <token>` once they have one.
 * Generated previews are re-encoded to compact WebP (≤1024 px, q80) before
 * they are stored or returned.
 */

type RequestWithRoute = HttpRequest & { query?: unknown; url?: string };
type StoredPreviewList = Awaited<ReturnType<AiTryOnPreviewStore["list"]>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isAiTryOnRequest = (req: RequestWithRoute): boolean => {
  const query = isRecord(req.query) ? req.query : null;
  const route = Array.isArray(query?.route) ? query?.route[0] : query?.route;
  if (route === AI_TRY_ON_ROUTE) return true;
  if (typeof req.url !== "string") return false;
  const path = req.url.split("?")[0] ?? "";
  return (
    path === `/api/${AI_TRY_ON_ROUTE}` ||
    /[?&]route=ai-try-on(?:&|$)/.test(req.url)
  );
};

export const isAiTryOnEnabled = (
  environment: Record<string, string | undefined> = process.env,
): boolean =>
  environment.AI_TRY_ON_ENABLED?.trim().toLowerCase() === "true" &&
  readGeminiApiKey(environment) !== null;

export interface AiTryOnHttpDependencies {
  environment?: Record<string, string | undefined>;
  getDb?: () => Firestore;
  createUsageLimits?: (db: Firestore) => AiTryOnUsageLimits;
  consumeIpRateLimit?: (db: Firestore, ip: string) => Promise<void>;
  createGenerateContent?: (apiKey: string) => AiTryOnGenerateContent;
  createAssetId?: () => string;
  /** Private preview storage (Step 6). */
  createPreviewStore?: (db: Firestore) => AiTryOnPreviewStore;
  /** Server-side garment/fabric picture loader (Step 6). */
  loadReferenceImage?: (url: string) => Promise<AiTryOnInlineImage>;
  /** Server-issued sessions (Step 7). */
  createSessions?: (
    db: Firestore,
    options: { allowNewGuestSession: () => Promise<void> },
  ) => AiTryOnSessions;
  /** Verifies a Firebase ID token (Step 7). */
  verifyIdToken?: (
    token: string,
  ) => Promise<{ uid: string; firebase?: { sign_in_provider?: unknown } }>;
  /** Consumes one new-guest-session slot for this IP (Step 7). */
  consumeGuestSessionLimit?: (db: Firestore, ip: string) => Promise<void>;
  /** Re-encodes the preview before it is stored and returned (Step 7). */
  compactPreviewImage?: CompactAiTryOnPreviewImage;
  now?: () => number;
  log?: (line: string) => void;
}

const setNoStore = (res: HttpResponse) => res.setHeader("Cache-Control", "no-store");

const sendError = (
  res: HttpResponse,
  status: number,
  code: AiTryOnErrorCode,
  error: string,
  retryable: boolean,
  retryAfterSeconds?: number,
  orderTriesRemaining?: number,
) => {
  setNoStore(res);
  if (retryAfterSeconds) res.setHeader("Retry-After", String(retryAfterSeconds));
  const body: AiTryOnErrorResponse = {
    error,
    code,
    retryable,
    ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    ...(orderTriesRemaining !== undefined ? { orderTriesRemaining } : {}),
  };
  return res.status(status).json(body);
};

const MIME_TYPES = new Set<AiTryOnImageMimeType>(["image/jpeg", "image/png", "image/webp"]);
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const FINGERPRINT_PATTERN = /^tryon-v1-[0-9a-f]{16}$/;
const ALLOWED_KEYS = new Set([
  "mode",
  "inputFingerprint",
  "personImage",
  "garmentImage",
  "garmentImageUrl",
  "fabricSwatchImage",
  "fabricSwatchImageUrl",
  "wearerKey",
  "fitHints",
  "orderDetails",
]);
const WEARER_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const PREVIEW_ID_PATTERN = /^tryon-[0-9a-f-]{36}$/;
const MAX_URL_LENGTH = 2048;
export const AI_TRY_ON_DEFAULT_WEARER_KEY = "order";

/** A garment/fabric picture: inline bytes, or a catalogue URL the server loads. */
export type AiTryOnReferenceSource =
  | { kind: "inline"; image: AiTryOnInlineImage }
  | { kind: "url"; url: string };

const matchesMagicBytes = (bytes: Buffer, mimeType: AiTryOnImageMimeType) => {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return (
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  );
};

type ParsedImage =
  | { ok: true; image: AiTryOnInlineImage; bytes: number }
  | { ok: false; tooLarge: boolean };

const parseImage = (value: unknown): ParsedImage => {
  if (!isRecord(value)) return { ok: false, tooLarge: false };
  const { mimeType, data } = value;
  if (typeof mimeType !== "string" || !MIME_TYPES.has(mimeType as AiTryOnImageMimeType)) {
    return { ok: false, tooLarge: false };
  }
  if (typeof data !== "string" || data.length < 16) return { ok: false, tooLarge: false };
  if (data.length > Math.ceil((AI_TRY_ON_MAX_IMAGE_BYTES * 4) / 3) + 4) {
    return { ok: false, tooLarge: true };
  }
  if (data.length % 4 !== 0 || !BASE64_PATTERN.test(data)) return { ok: false, tooLarge: false };
  const bytes = Buffer.from(data, "base64");
  if (bytes.length > AI_TRY_ON_MAX_IMAGE_BYTES) return { ok: false, tooLarge: true };
  if (!matchesMagicBytes(bytes, mimeType as AiTryOnImageMimeType)) {
    return { ok: false, tooLarge: false };
  }
  return {
    ok: true,
    image: { mimeType: mimeType as AiTryOnImageMimeType, data },
    bytes: bytes.length,
  };
};

type ParsedRequest =
  | {
      ok: true;
      mode: AiTryOnMode;
      inputFingerprint: string;
      wearerKey: string;
      personImage: AiTryOnInlineImage;
      garment: AiTryOnReferenceSource;
      fabric: AiTryOnReferenceSource | null;
      fitHints: AiTryOnFitHint[];
      orderDetails: AiTryOnOrderDetails | null;
    }
  | { ok: false; status: 400 | 413; code: "INVALID_REQUEST" | "PAYLOAD_TOO_LARGE"; error: string };

export const parseAiTryOnGenerationRequest = (body: unknown): ParsedRequest => {
  const invalid = (error: string): ParsedRequest => ({
    ok: false,
    status: 400,
    code: "INVALID_REQUEST",
    error,
  });
  const tooLarge: ParsedRequest = {
    ok: false,
    status: 413,
    code: "PAYLOAD_TOO_LARGE",
    error: "Images are too large. Use smaller photos.",
  };
  let parsedBody = body;
  if (typeof body === "string") {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return invalid("Request body must be JSON.");
    }
  }
  if (!isRecord(parsedBody)) return invalid("Request body must be a JSON object.");
  if (Object.keys(parsedBody).some((key) => !ALLOWED_KEYS.has(key))) {
    return invalid("Request has unknown fields.");
  }
  const { mode, inputFingerprint } = parsedBody;
  if (mode !== "garment" && mode !== "fabric") return invalid("Unknown try-on mode.");
  if (typeof inputFingerprint !== "string" || !FINGERPRINT_PATTERN.test(inputFingerprint)) {
    return invalid("A valid try-on fingerprint is required.");
  }
  const wearerKey =
    parsedBody.wearerKey === undefined ? AI_TRY_ON_DEFAULT_WEARER_KEY : parsedBody.wearerKey;
  if (typeof wearerKey !== "string" || !WEARER_KEY_PATTERN.test(wearerKey)) {
    return invalid("A valid wearer key is required.");
  }
  const hasSwatch =
    parsedBody.fabricSwatchImage !== undefined || parsedBody.fabricSwatchImageUrl !== undefined;
  if (mode === "garment" && hasSwatch) {
    return invalid("Garment mode does not take a fabric swatch.");
  }
  if (mode === "fabric" && !hasSwatch) {
    return invalid("Fabric mode needs a fabric swatch.");
  }
  let totalBytes = 0;
  const person = parseImage(parsedBody.personImage);
  if (person.ok === false) return person.tooLarge ? tooLarge : invalid("Images must be JPEG, PNG, or WebP.");
  totalBytes += person.bytes;
  const parseReference = (
    inline: unknown,
    url: unknown,
  ): AiTryOnReferenceSource | ParsedRequest => {
    if (inline !== undefined && url !== undefined) return invalid("Send a picture or its URL, not both.");
    if (url !== undefined) {
      if (typeof url !== "string" || url.length > MAX_URL_LENGTH || !/^https:\/\//.test(url)) {
        return invalid("Picture URLs must be https.");
      }
      return { kind: "url", url };
    }
    const parsed = parseImage(inline);
    if (parsed.ok === false) return parsed.tooLarge ? tooLarge : invalid("Images must be JPEG, PNG, or WebP.");
    totalBytes += parsed.bytes;
    return { kind: "inline", image: parsed.image };
  };
  const garment = parseReference(parsedBody.garmentImage, parsedBody.garmentImageUrl);
  if ("ok" in garment) return garment;
  let fabric: AiTryOnReferenceSource | null = null;
  if (mode === "fabric") {
    const parsedFabric = parseReference(parsedBody.fabricSwatchImage, parsedBody.fabricSwatchImageUrl);
    if ("ok" in parsedFabric) return parsedFabric;
    fabric = parsedFabric;
  }
  if (totalBytes > AI_TRY_ON_MAX_TOTAL_IMAGE_BYTES) return tooLarge;
  const fitHints = normalizeAiTryOnFitHints(parsedBody.fitHints);
  if (!fitHints) return invalid("Fit hints are not valid.");
  const orderDetails = normalizeAiTryOnOrderDetails(parsedBody.orderDetails);
  if (orderDetails === "invalid") return invalid("Order details are not valid.");
  return {
    ok: true,
    mode,
    inputFingerprint,
    wearerKey,
    personImage: person.image,
    garment,
    fabric,
    fitHints,
    orderDetails,
  };
};

const defaultGetDb = (): Firestore => getAdminServices().db;

/** A query parameter from Vercel/Express `req.query`, or from the raw URL. */
const readQueryParam = (req: RequestWithRoute, name: string): string | null => {
  const query = isRecord(req.query) ? req.query : null;
  let value: unknown = Array.isArray(query?.[name]) ? (query?.[name] as unknown[])[0] : query?.[name];
  if (value === undefined && typeof req.url === "string" && req.url.includes("?")) {
    try {
      value = new URL(req.url, "http://localhost").searchParams.get(name) ?? undefined;
    } catch {
      value = undefined;
    }
  }
  return typeof value === "string" ? value : null;
};
const readHeader = (req: RequestWithRoute, name: string): string | null => {
  const value = req.headers[name.toLowerCase()];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.length > 0 ? first : null;
};
const readQueryPreviewId = (req: RequestWithRoute): string | null => {
  const value = readQueryParam(req, "previewId");
  return value && PREVIEW_ID_PATTERN.test(value) ? value : null;
};

const defaultPreviewStore = (db: Firestore): AiTryOnPreviewStore =>
  createAiTryOnPreviewStore(db, getAdminServices().storage.bucket() as unknown as AiTryOnPreviewBucket);

const defaultVerifyIdToken = (token: string) => getAdminServices().auth.verifyIdToken(token);

const defaultLoadReferenceImage = (url: string) =>
  loadAiTryOnReferenceImageOnServer(url, {
    bucket: getAdminServices().storage.bucket() as unknown as AiTryOnReferenceBucket,
  });

export async function handleAiTryOn(
  req: RequestWithRoute,
  res: HttpResponse,
  dependencies: AiTryOnHttpDependencies = {},
) {
  const environment = dependencies.environment ?? process.env;
  const log = dependencies.log ?? ((line: string) => console.info(line));
  const now = dependencies.now ?? Date.now;
  const resolveDb = async () => (dependencies.getDb ? dependencies.getDb() : defaultGetDb());
  const createLimits = dependencies.createUsageLimits ?? ((db: Firestore) => createAiTryOnUsageLimits(db));
  const enabled = isAiTryOnEnabled(environment);

  const createStore = dependencies.createPreviewStore ?? defaultPreviewStore;
  const createSessions = (db: Firestore): AiTryOnSessions =>
    (dependencies.createSessions ?? ((database, options) => createAiTryOnSessions(database, { now, ...options })))(db, {
      allowNewGuestSession: async () => {
        try {
          await (dependencies.consumeGuestSessionLimit ??
            ((database: Firestore, ip: string) =>
              consumeAuthRateLimit(database, AI_TRY_ON_GUEST_SESSION_IP_LIMIT, ip, now)))(
            db,
            getClientIp(req),
          );
        } catch (error) {
          if (error instanceof AuthRateLimitError) throw new AiTryOnGuestSessionLimitError();
          throw error;
        }
      },
    });

  // Caller identity: a verified non-anonymous Firebase user, or a guest
  // (with or without a session token). A bad ID token is refused rather
  // than silently treated as a guest.
  const readIdentity = async (): Promise<AiTryOnSessionIdentity | "auth_failed"> => {
    const token = readHeader(req, AI_TRY_ON_SESSION_HEADER);
    const authorization = readHeader(req, "authorization");
    const bearer = authorization?.match(/^Bearer ([^\s]+)$/)?.[1] ?? null;
    if (!bearer) return { uid: null, token };
    try {
      const verified = await (dependencies.verifyIdToken ?? defaultVerifyIdToken)(bearer);
      const provider = verified.firebase?.sign_in_provider;
      if (typeof provider !== "string" || !provider || !verified.uid) return "auth_failed";
      return { uid: provider === "anonymous" ? null : verified.uid, token };
    } catch {
      return "auth_failed";
    }
  };
  const authFailed = () =>
    sendError(res, 401, "AUTH_REQUIRED", "Sign in again to use AI Try-on.", false);
  const sessionRequired = () =>
    sendError(res, 401, "SESSION_REQUIRED", "Your AI Try-on session has ended. Reload to start again.", false);

  // Stored preview read/delete: owner-only by server session, and available
  // even when generation is switched off, so a customer can always delete.
  if (req.method === "DELETE" || (req.method === "GET" && readQueryParam(req, "previewId") !== null)) {
    const previewId = readQueryPreviewId(req);
    const deleteAll = req.method === "DELETE" && readQueryParam(req, "all") === "1";
    const closeSession = deleteAll && readQueryParam(req, "close") === "1";
    if (!previewId && !deleteAll) {
      return sendError(res, 400, "INVALID_REQUEST", "A valid preview id is required.", false);
    }
    const identity = await readIdentity();
    if (identity === "auth_failed") return authFailed();
    let db: Firestore;
    let sessionId: string | null;
    try {
      db = await resolveDb();
      sessionId = await createSessions(db).authorize(identity);
    } catch {
      return sendError(res, 503, "NOT_CONFIGURED", "AI Try-on previews are unavailable.", true);
    }
    if (!sessionId) {
      // Nothing of this caller's is stored (or the session already closed).
      if (req.method === "DELETE") {
        setNoStore(res);
        return res.status(200).json({ status: "deleted", deleted: 0 });
      }
      return sendError(res, 404, "PREVIEW_NOT_FOUND", "This preview is no longer available.", false);
    }
    try {
      const store = createStore(db);
      if (req.method === "DELETE") {
        const deleted = await store.remove(sessionId, deleteAll ? null : previewId);
        if (closeSession) await createSessions(db).close(sessionId);
        setNoStore(res);
        return res.status(200).json({ status: "deleted", deleted });
      }
      const preview = await store.read(sessionId, previewId!);
      if (!preview) {
        return sendError(res, 404, "PREVIEW_NOT_FOUND", "This preview is no longer available.", false);
      }
      setNoStore(res);
      return res.status(200).json({
        status: "preview",
        previewId: preview.summary.previewId,
        wearerKey: preview.summary.wearerKey,
        inputFingerprint: preview.summary.inputFingerprint,
        expiresAt: preview.summary.expiresAt,
        image: { mimeType: preview.mimeType, data: preview.data },
      });
    } catch {
      return sendError(res, 503, "PROVIDER_FAILED", "AI Try-on previews are temporarily unavailable.", true);
    }
  }

  // Availability. Plain GET never touches sessions; POST ?action=session
  // also finds or mints the caller's session.
  const isSessionRequest = req.method === "POST" && readQueryParam(req, "action") === "session";
  if (req.method === "GET" || isSessionRequest) {
    setNoStore(res);
    const unavailable = (code: "NOT_CONFIGURED" | "GLOBAL_LIMIT_REACHED" | "RATE_LIMITED" | "AUTH_REQUIRED") => {
      const body: AiTryOnAvailabilityResponse = { status: "unavailable", code };
      return res.status(200).json(body);
    };
    if (!enabled) return unavailable("NOT_CONFIGURED");
    try {
      const db = await resolveDb();
      const limits = createLimits(db);
      const count = await limits.readGlobalCount();
      if (count >= AI_TRY_ON_GLOBAL_GENERATION_CAP) return unavailable("GLOBAL_LIMIT_REACHED");
      if (!isSessionRequest) {
        const body: AiTryOnAvailabilityResponse = {
          status: "available",
          triesPerOrder: AI_TRY_ON_TRIES_PER_ORDER,
        };
        return res.status(200).json(body);
      }
      const identity = await readIdentity();
      if (identity === "auth_failed") return unavailable("AUTH_REQUIRED");
      let session;
      try {
        session = await createSessions(db).resolve(identity);
      } catch (error) {
        if (error instanceof AiTryOnGuestSessionLimitError) return unavailable("RATE_LIMITED");
        throw error;
      }
      let previews: StoredPreviewList = [];
      try {
        previews = await createStore(db).list(session.sessionId);
      } catch {
        previews = [];
      }
      log(JSON.stringify({ event: "ai_try_on", outcome: "session", created: session.created, account: identity.uid !== null }));
      const body: AiTryOnAvailabilityResponse = {
        status: "available",
        triesPerOrder: AI_TRY_ON_TRIES_PER_ORDER,
        orderTriesRemaining: await limits.readOrderTriesRemaining(session.sessionId),
        previews,
        sessionToken: session.sessionToken,
      };
      return res.status(200).json(body);
    } catch {
      return unavailable("NOT_CONFIGURED");
    }
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST, DELETE");
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use GET, POST or DELETE.", false);
  }
  if (!enabled) {
    return sendError(res, 503, "NOT_CONFIGURED", "AI Try-on is currently unavailable.", false);
  }

  const parsed = parseAiTryOnGenerationRequest(req.body);
  if (parsed.ok === false) return sendError(res, parsed.status, parsed.code, parsed.error, false);

  let db: Firestore;
  try {
    db = await resolveDb();
  } catch {
    return sendError(res, 503, "NOT_CONFIGURED", "AI Try-on is currently unavailable.", true);
  }

  // Step 7: the try belongs to the caller's server-issued session.
  const identity = await readIdentity();
  if (identity === "auth_failed") return authFailed();
  let sessionId: string | null;
  try {
    sessionId = await createSessions(db).authorize(identity);
  } catch {
    return sendError(res, 503, "PROVIDER_FAILED", "AI Try-on is temporarily unavailable.", true);
  }
  if (!sessionId) return sessionRequired();

  try {
    await (dependencies.consumeIpRateLimit ??
      ((database: Firestore, ip: string) =>
        consumeAuthRateLimit(database, AI_TRY_ON_IP_RATE_LIMIT, ip, now)))(db, getClientIp(req));
  } catch (error) {
    if (error instanceof AuthRateLimitError) {
      return sendError(
        res,
        429,
        "RATE_LIMITED",
        "Too many AI Try-on requests. Please wait and try again.",
        true,
        error.retryAfterSeconds,
      );
    }
    return sendError(res, 503, "PROVIDER_FAILED", "AI Try-on is temporarily unavailable.", true);
  }

  // Garment/fabric pictures sent as URLs are loaded here, before a try is
  // reserved, so an unreadable picture never uses one.
  const loadReference = dependencies.loadReferenceImage ?? defaultLoadReferenceImage;
  const resolveReference = async (source: AiTryOnReferenceSource) =>
    source.kind === "inline" ? source.image : loadReference(source.url);
  let images: AiTryOnInlineImage[];
  try {
    images = [
      parsed.personImage,
      await resolveReference(parsed.garment),
      ...(parsed.fabric ? [await resolveReference(parsed.fabric)] : []),
    ];
  } catch (error) {
    log(
      JSON.stringify({
        event: "ai_try_on",
        outcome: "reference_unavailable",
        mode: parsed.mode,
        reason: error instanceof AiTryOnReferenceImageError ? error.message : "reference_error",
      }),
    );
    return sendError(
      res,
      422,
      "REFERENCE_IMAGE_UNAVAILABLE",
      "The garment or fabric picture could not be loaded.",
      false,
    );
  }

  const limits = createLimits(db);
  let reservation;
  try {
    reservation = await limits.reserve(sessionId);
  } catch {
    return sendError(res, 503, "PROVIDER_FAILED", "AI Try-on is temporarily unavailable.", true);
  }
  if (reservation.ok === false) {
    return reservation.code === "ORDER_TRY_LIMIT_REACHED"
      ? sendError(
          res,
          429,
          "ORDER_TRY_LIMIT_REACHED",
          `This order has used all ${AI_TRY_ON_TRIES_PER_ORDER} AI Try-on previews.`,
          false,
        )
      : sendError(res, 503, "GLOBAL_LIMIT_REACHED", "AI Try-on is currently unavailable.", false);
  }

  const apiKey = readGeminiApiKey(environment)!;
  const startedAt = now();
  const outcome = await runAiTryOnGemini({
    generateContent: (dependencies.createGenerateContent ?? createGeminiGenerateContent)(apiKey),
    prompt: buildAiTryOnPrompt({
      mode: parsed.mode,
      fitHints: parsed.fitHints,
      orderDetails: parsed.orderDetails,
    }),
    images,
    secret: apiKey,
  });
  const latencyMs = now() - startedAt;

  if (outcome.ok === false) {
    try {
      await limits.release(reservation.orderDocId);
    } catch {
      // A failed release only makes the cap stricter; never block the reply.
    }
    log(
      JSON.stringify({
        event: "ai_try_on",
        outcome: outcome.kind,
        mode: parsed.mode,
        promptVersion: AI_TRY_ON_PROMPT_VERSION,
        fitHints: parsed.fitHints.length,
        latencyMs,
        reason: outcome.reason,
      }),
    );
    // The reservation was released, so this try was not counted.
    const orderTriesRemaining = Math.min(
      AI_TRY_ON_TRIES_PER_ORDER,
      reservation.orderTriesRemaining + 1,
    );
    return outcome.kind === "rejected"
      ? sendError(
          res,
          422,
          "PROVIDER_REJECTED",
          "AI Try-on could not create a preview from these photos.",
          outcome.retryable,
          undefined,
          orderTriesRemaining,
        )
      : sendError(
          res,
          502,
          "PROVIDER_FAILED",
          "AI Try-on could not be completed.",
          outcome.retryable,
          undefined,
          orderTriesRemaining,
        );
  }

  const previewId = (dependencies.createAssetId ?? createAiTryOnPreviewId)();
  // Step 7: one compact WebP is both stored and returned. If re-encoding
  // fails, the original is returned but not stored.
  let preview: { mimeType: string; data: string } = outcome.image;
  let compacted = false;
  try {
    const compact = await (dependencies.compactPreviewImage ?? compactAiTryOnPreviewImage)(outcome.image);
    preview = { mimeType: compact.mimeType, data: compact.data };
    compacted = true;
  } catch {
    log(JSON.stringify({ event: "ai_try_on", outcome: "compact_failed" }));
  }
  let stored: { expiresAt: string } | null = null;
  if (compacted) {
    try {
      stored = await createStore(db).save({
        orderKey: sessionId,
        wearerKey: parsed.wearerKey,
        previewId,
        inputFingerprint: parsed.inputFingerprint,
        image: preview,
      });
    } catch {
      // The customer still gets the inline preview; it just isn't kept.
      stored = null;
    }
  }
  log(
    JSON.stringify({
      event: "ai_try_on",
      outcome: "completed",
      mode: parsed.mode,
      promptVersion: AI_TRY_ON_PROMPT_VERSION,
      fitHints: parsed.fitHints.length,
      latencyMs,
      previewStored: Boolean(stored),
    }),
  );
  const body: AiTryOnGenerationSuccess = {
    status: "completed",
    inputFingerprint: parsed.inputFingerprint,
    resultReference: {
      kind: "verified_private_try_on_result",
      assetId: previewId,
      ownerBindingId: `session-${hashAiTryOnOrderKey(sessionId).slice(0, 32)}`,
    },
    image: preview,
    previewStored: Boolean(stored),
    ...(stored ? { previewExpiresAt: stored.expiresAt } : {}),
    orderTriesRemaining: reservation.orderTriesRemaining,
    promptVersion: AI_TRY_ON_PROMPT_VERSION,
  };
  setNoStore(res);
  return res.status(200).json(body);
}
