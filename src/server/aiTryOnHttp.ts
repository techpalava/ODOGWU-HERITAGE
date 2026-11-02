import {
  deleteAiTryOnOrderImages,
  isAiTryOnOrderId,
  parseAiTryOnOrderSelectionInput,
  readAiTryOnOrderImageRecord,
  saveAiTryOnOrderSelection,
} from "./aiTryOnOrderImages.js";
import {
  cropAiTryOnFabricSwatch,
  readAiTryOnPhotoAspectRatio,
  type AiTryOnGeminiAspectRatio,
  type CropAiTryOnFabricSwatch,
  type ReadAiTryOnPhotoAspectRatio,
} from "./aiTryOnImagePrep.js";
import type { Firestore } from "firebase-admin/firestore";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  AI_TRY_ON_BUSY_JOB_ID_PATTERN,
  AI_TRY_ON_BUSY_MIN_GAP_MS,
  AI_TRY_ON_BUSY_RETRY_IP_LIMIT,
  createAiTryOnBusyJobs,
  type AiTryOnBusyClaim,
  type AiTryOnBusyJobs,
} from "./aiTryOnBusyJobs.js";
import { getAdminServices } from "./firebaseAdmin.js";
import { aiTryOnStorageBucket, isAiTryOnStorageReady } from "./aiTryOnStorageBucket.js";
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
import {
  buildAiTryOnImageLabels,
  buildAiTryOnModelImageLabels,
  buildAiTryOnModelPrompt,
  buildAiTryOnPrompt,
} from "./aiTryOnPrompt.js";
import {
  loadAiTryOnDefaultModelImage,
  type LoadAiTryOnDefaultModelImage,
} from "./aiTryOnDefaultModelImages.js";
import {
  createAiTryOnModelResultCache,
  createAiTryOnModelResultKey,
  type AiTryOnModelResultBucket,
  type AiTryOnModelResultCache,
} from "./aiTryOnModelResultCache.js";
import {
  findAiTryOnDefaultModel,
  type AiTryOnDefaultModel,
} from "../utils/aiTryOnDefaultModels.js";
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
  AI_TRY_ON_MODEL_PROMPT_VERSION,
  AI_TRY_ON_MAX_TOTAL_IMAGE_BYTES,
  AI_TRY_ON_PROMPT_VERSION,
  AI_TRY_ON_ROUTE,
  AI_TRY_ON_TRIES_PER_ORDER,
  AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW,
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
 * in the server environment, and, in production (`VERCEL_ENV=production`),
 * the dedicated private bucket `AI_TRY_ON_STORAGE_BUCKET` (see
 * aiTryOnStorageBucket). Otherwise GET reports `unavailable` and POST
 * returns 503 without touching Firestore or Gemini, so the Design Studio
 * keeps its existing "AI Try-on is currently unavailable" state.
 *
 * Order of checks on POST: validate → per-IP window → reserve one order try,
 * one global generation and (signed-in only) one of the account's 15 tries
 * per rolling 30 days (single transaction) → Gemini → release the
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
 *
 * Model mode (`defaultModelId` instead of `personImage`): one of our
 * fictional studio models wears the garment. The server reads the model
 * picture from the deployed files and computes a shared cache key
 * (aiTryOnModelResultCache) from what Gemini would receive. A hit is served
 * with no IP-limit charge, no try reserved and no Gemini call; a miss runs
 * the normal checks (per-IP window, order/account/global reservation) and
 * saves the result to the shared cache. Either way the customer also gets
 * a per-wearer copy in aiTryOnPreviews, so reload, "Delete my preview" and
 * payment cleanup behave exactly as for photos.
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
  readGeminiApiKey(environment) !== null &&
  // Production also needs the dedicated private bucket (AI_TRY_ON_STORAGE_BUCKET).
  isAiTryOnStorageReady(environment);

export interface AiTryOnHttpDependencies {
  environment?: Record<string, string | undefined>;
  getDb?: () => Firestore;
  createUsageLimits?: (db: Firestore) => AiTryOnUsageLimits;
  consumeIpRateLimit?: (db: Firestore, ip: string) => Promise<void>;
  createGenerateContent?: (apiKey: string) => AiTryOnGenerateContent;
  /** Wait before the one capacity retry (tests skip the real 2-4 s). */
  geminiRetrySleep?: (ms: number) => Promise<void>;
  createAssetId?: () => string;
  /** Private preview storage (Step 6). */
  createPreviewStore?: (db: Firestore) => AiTryOnPreviewStore;
  /** Central crop of the fabric swatch before Gemini (prompt v6 / model v4). */
  cropFabricSwatch?: CropAiTryOnFabricSwatch;
  /** Photo flow: nearest Gemini aspect ratio of the customer photo (prompt v6). */
  readPhotoAspectRatio?: ReadAiTryOnPhotoAspectRatio;
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
  ) => Promise<{ uid: string; admin?: unknown; firebase?: { sign_in_provider?: unknown } }>;
  /** The try-on bucket, for the images saved with paid orders (PR 3). */
  getOrderImageBucket?: () => AiTryOnPreviewBucket;
  /** Consumes one new-guest-session slot for this IP (Step 7). */
  consumeGuestSessionLimit?: (db: Firestore, ip: string) => Promise<void>;
  /** Re-encodes the preview before it is stored and returned (Step 7). */
  compactPreviewImage?: CompactAiTryOnPreviewImage;
  /** Default model pictures (model mode). */
  loadDefaultModelImage?: LoadAiTryOnDefaultModelImage;
  /** Shared model-mode result cache. */
  createModelResultCache?: (db: Firestore) => AiTryOnModelResultCache;
  /** Busy retries: held jobs (`aiTryOnJobs`). */
  createBusyJobs?: (db: Firestore, limits: AiTryOnUsageLimits) => AiTryOnBusyJobs;
  /** Light per-IP window for busy retries only. */
  consumeBusyRetryIpLimit?: (db: Firestore, ip: string) => Promise<void>;
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
  accountTriesRemaining?: number | null,
) => {
  setNoStore(res);
  if (retryAfterSeconds) res.setHeader("Retry-After", String(retryAfterSeconds));
  const body: AiTryOnErrorResponse = {
    error,
    code,
    retryable,
    ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
    ...(orderTriesRemaining !== undefined ? { orderTriesRemaining } : {}),
    ...(typeof accountTriesRemaining === "number" ? { accountTriesRemaining } : {}),
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
  "defaultModelId",
  "garmentImage",
  "garmentImageUrl",
  "fabricSwatchImage",
  "fabricSwatchImageUrl",
  "wearerKey",
  "fitHints",
  "orderDetails",
  "busyJobId",
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
      /** Exactly one of personImage (photo flow) and defaultModel (model mode). */
      personImage: AiTryOnInlineImage | null;
      defaultModel: AiTryOnDefaultModel | null;
      garment: AiTryOnReferenceSource;
      fabric: AiTryOnReferenceSource | null;
      fitHints: AiTryOnFitHint[];
      orderDetails: AiTryOnOrderDetails | null;
      /** A busy retry of a held try. */
      busyJobId: string | null;
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
  let personImage: AiTryOnInlineImage | null = null;
  let defaultModel: AiTryOnDefaultModel | null = null;
  if (parsedBody.defaultModelId !== undefined) {
    // Model mode: no customer photo, catalogue pictures only (so the shared
    // cache never holds customer content) and no fit hints (they describe
    // the customer, not the model, and would break reuse).
    if (parsedBody.personImage !== undefined) return invalid("Send a photo or a model, not both.");
    defaultModel = findAiTryOnDefaultModel(parsedBody.defaultModelId);
    if (!defaultModel) return invalid("Unknown try-on model.");
    if (parsedBody.garmentImage !== undefined || parsedBody.fabricSwatchImage !== undefined) {
      return invalid("Model try-on takes catalogue picture URLs only.");
    }
    if (
      parsedBody.fitHints !== undefined &&
      !(Array.isArray(parsedBody.fitHints) && parsedBody.fitHints.length === 0)
    ) {
      return invalid("Model try-on does not take fit hints.");
    }
  } else {
    const person = parseImage(parsedBody.personImage);
    if (person.ok === false) return person.tooLarge ? tooLarge : invalid("Images must be JPEG, PNG, or WebP.");
    totalBytes += person.bytes;
    personImage = person.image;
  }
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
  const busyJobId = parsedBody.busyJobId === undefined ? null : parsedBody.busyJobId;
  if (busyJobId !== null && (typeof busyJobId !== "string" || !AI_TRY_ON_BUSY_JOB_ID_PATTERN.test(busyJobId))) {
    return invalid("A valid busy job id is required.");
  }
  return {
    ok: true,
    mode,
    inputFingerprint,
    wearerKey,
    personImage,
    defaultModel,
    garment,
    fabric,
    fitHints,
    orderDetails,
    busyJobId: busyJobId as string | null,
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
  createAiTryOnPreviewStore(db, aiTryOnStorageBucket() as unknown as AiTryOnPreviewBucket);

const defaultModelResultCache = (db: Firestore): AiTryOnModelResultCache =>
  createAiTryOnModelResultCache(
    db,
    aiTryOnStorageBucket() as unknown as AiTryOnModelResultBucket,
  );

/** Firestore Timestamp (stored) or Date (tests) to milliseconds. */
const readOrderImageExpiry = (value: unknown): number => {
  const toMillis = (value as { toMillis?: () => number } | null)?.toMillis;
  if (typeof toMillis === "function") return toMillis.call(value);
  return value instanceof Date ? value.getTime() : NaN;
};

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

  const createJobs = (db: Firestore, limits: AiTryOnUsageLimits): AiTryOnBusyJobs =>
    (dependencies.createBusyJobs ?? ((database, usage) => createAiTryOnBusyJobs(database, usage, { now })))(db, limits);
  /** Refunds a session's busy jobs; never blocks the caller. */
  const sweepJobs = async (db: Firestore, sessionId: string, all: boolean) => {
    try {
      const refunded = await createJobs(db, createLimits(db)).sweep(sessionId, { all });
      if (refunded) log(JSON.stringify({ event: "ai_try_on", outcome: "busy_refunded", reason: all ? "session_closed" : "expired", jobs: refunded }));
    } catch {
      // A job left behind expires; the TTL policy removes it.
    }
  };

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

  // The AI preview saved with a paid order (PR 3): the order's owner or an
  // admin (team / tailors), signed in. Available even when generation is
  // switched off. The image itself is never a public URL.
  const orderAction = readQueryParam(req, "action");
  if (
    (orderAction === "order-images" && (req.method === "GET" || req.method === "DELETE")) ||
    (orderAction === "order-image" && req.method === "GET")
  ) {
    const orderId = readQueryParam(req, "orderId");
    if (!isAiTryOnOrderId(orderId)) {
      return sendError(res, 400, "INVALID_REQUEST", "A valid order is required.", false);
    }
    const authorization = readHeader(req, "authorization");
    const bearer = authorization?.match(/^Bearer ([^\s]+)$/)?.[1] ?? null;
    if (!bearer) return authFailed();
    let viewer: { uid: string; admin: boolean };
    try {
      const verified = await (dependencies.verifyIdToken ?? defaultVerifyIdToken)(bearer);
      const provider = verified.firebase?.sign_in_provider;
      if (typeof provider !== "string" || !provider || provider === "anonymous" || !verified.uid) {
        return authFailed();
      }
      viewer = { uid: verified.uid, admin: verified.admin === true };
    } catch {
      return authFailed();
    }
    const notFound = () =>
      sendError(res, 404, "PREVIEW_NOT_FOUND", "This preview is no longer available.", false);
    try {
      const db = await resolveDb();
      const record = await readAiTryOnOrderImageRecord(db, orderId);
      let allowed = viewer.admin || record?.ownerUid === viewer.uid;
      if (!record && !allowed) {
        const order = await db.collection("orders").doc(orderId).get();
        allowed = order.exists && (order.data() as { ownerUid?: unknown } | undefined)?.ownerUid === viewer.uid;
      }
      if (!allowed) return notFound();
      const bucket = (dependencies.getOrderImageBucket ?? (() => aiTryOnStorageBucket() as unknown as AiTryOnPreviewBucket))();
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (req.method === "DELETE") {
        const deleted = await deleteAiTryOnOrderImages({
          db,
          bucket,
          orderId,
          reason: record?.ownerUid === viewer.uid ? "customer" : "admin",
          now,
        });
        log(JSON.stringify({ event: "ai_try_on_order_images", status: "deleted_on_request", images: deleted }));
        setNoStore(res);
        return res.status(200).json({ status: "deleted", deleted });
      }
      const expiresAt = record ? readOrderImageExpiry(record.expiresAt) : NaN;
      const status = !record
        ? "none"
        : record.status === "deleted"
          ? "deleted"
          : !(expiresAt > now())
            ? "expired"
            : "saved";
      if (orderAction === "order-images") {
        setNoStore(res);
        return res.status(200).json({
          status,
          ...(status === "saved"
            ? {
                expiresAt: new Date(expiresAt).toISOString(),
                images: record!.images.map((image) => ({
                  wearerKey: image.wearerKey,
                  label: image.label,
                  onModel: image.onModel,
                })),
              }
            : {}),
        });
      }
      const wearerKey = readQueryParam(req, "wearerKey");
      const image = status === "saved" ? record!.images.find((entry) => entry.wearerKey === wearerKey) : undefined;
      if (!image) return notFound();
      const [bytes] = await bucket.file(image.path).download();
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({ image: { mimeType: image.mimeType, data: bytes.toString("base64") } });
    } catch {
      return sendError(res, 503, "PROVIDER_FAILED", "AI Try-on previews are temporarily unavailable.", true);
    }
  }

  // Busy retry given up by the browser (time ran out, or a reload found no
  // preview): refund the held try once. Unknown or running jobs: nothing.
  if (req.method === "DELETE" && readQueryParam(req, "busyJobId") !== null) {
    const jobId = readQueryParam(req, "busyJobId")!;
    const wearerKey = readQueryParam(req, "wearerKey") ?? AI_TRY_ON_DEFAULT_WEARER_KEY;
    if (!AI_TRY_ON_BUSY_JOB_ID_PATTERN.test(jobId) || !WEARER_KEY_PATTERN.test(wearerKey)) {
      return sendError(res, 400, "INVALID_REQUEST", "A valid busy job id is required.", false);
    }
    const identity = await readIdentity();
    if (identity === "auth_failed") return authFailed();
    try {
      const db = await resolveDb();
      const sessionId = await createSessions(db).authorize(identity);
      const released = sessionId
        ? await createJobs(db, createLimits(db)).giveUp({ sessionId, wearerKey, jobId })
        : false;
      if (released) log(JSON.stringify({ event: "ai_try_on", outcome: "busy_refunded", reason: "gave_up" }));
      setNoStore(res);
      return res.status(200).json({ status: "released", released });
    } catch {
      return sendError(res, 503, "PROVIDER_FAILED", "AI Try-on is temporarily unavailable.", true);
    }
  }

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
        if (closeSession) {
          await createSessions(db).close(sessionId);
          // Fresh order: a try still held for a busy retry goes back.
          await sweepJobs(db, sessionId, true);
        }
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

  // Before payment: which of this session's previews go with the order
  // (copied to the order when its payment is recorded). Signed-in owners
  // only; never needed for payment, so the browser ignores failures.
  if (req.method === "POST" && readQueryParam(req, "action") === "order-selection") {
    const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>;
    const selections = parseAiTryOnOrderSelectionInput(body.selections);
    if (!isAiTryOnOrderId(body.orderId) || !selections) {
      return sendError(res, 400, "INVALID_REQUEST", "A valid order and preview list are required.", false);
    }
    const identity = await readIdentity();
    if (identity === "auth_failed") return authFailed();
    if (!identity.uid) {
      return sendError(res, 401, "AUTH_REQUIRED", "Sign in again to use AI Try-on.", false);
    }
    try {
      const db = await resolveDb();
      const sessionId = await createSessions(db).authorize(identity);
      if (!sessionId) return sessionRequired();
      const result = await saveAiTryOnOrderSelection({
        db,
        store: createStore(db),
        sessionId,
        uid: identity.uid,
        orderId: body.orderId,
        selections,
        now,
      });
      log(JSON.stringify({ event: "ai_try_on", outcome: `order_selection_${result}`, previews: selections.length }));
      setNoStore(res);
      if (result === "order_not_found") {
        return sendError(res, 404, "INVALID_REQUEST", "This order was not found.", false);
      }
      if (result === "preview_not_found") {
        return sendError(res, 404, "PREVIEW_NOT_FOUND", "This preview is no longer available.", false);
      }
      return res.status(200).json({ status: result });
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
      // A busy try whose browser never came back is refunded before counting.
      await sweepJobs(db, session.sessionId, false);
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
        ...(identity.uid !== null
          ? { accountTriesRemaining: await limits.readAccountTriesRemaining(identity.uid) }
          : {}),
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
  if (!sessionId) {
    // A busy retry after the order was placed or cleared: stop retrying.
    return parsed.busyJobId
      ? sendError(res, 409, "SESSION_CLOSED", "This AI Try-on session has ended.", false)
      : sessionRequired();
  }
  const limits = createLimits(db);
  const jobs = createJobs(db, limits);

  // Busy retry: reuse the held try (no new try, IP window or global count).
  let claim: Extract<AiTryOnBusyClaim, { kind: "claimed" }> | null = null;
  if (parsed.busyJobId) {
    try {
      await (dependencies.consumeBusyRetryIpLimit ??
        ((database: Firestore, ip: string) =>
          consumeAuthRateLimit(database, AI_TRY_ON_BUSY_RETRY_IP_LIMIT, ip, now)))(db, getClientIp(req));
    } catch (error) {
      if (error instanceof AuthRateLimitError) {
        return sendError(res, 429, "RATE_LIMITED", "Too many AI Try-on requests. Please wait and try again.", true, error.retryAfterSeconds);
      }
      return sendError(res, 503, "PROVIDER_FAILED", "AI Try-on is temporarily unavailable.", true);
    }
    let claimed: AiTryOnBusyClaim;
    try {
      claimed = await jobs.claim({
        sessionId,
        wearerKey: parsed.wearerKey,
        jobId: parsed.busyJobId,
        inputFingerprint: parsed.inputFingerprint,
      });
    } catch {
      return sendError(res, 503, "PROVIDER_FAILED", "AI Try-on is temporarily unavailable.", true);
    }
    if (claimed.kind === "gone") {
      return sendError(res, 410, "BUSY_JOB_GONE", "This AI Try-on request has ended.", false);
    }
    if (claimed.kind === "too_soon") {
      return sendError(res, 429, "RATE_LIMITED", "Please wait a moment before trying again.", true, Math.ceil(claimed.retryAfterMs / 1000));
    }
    if (claimed.kind === "exhausted") {
      log(JSON.stringify({ event: "ai_try_on", outcome: "busy_refunded", reason: "exhausted" }));
      return sendBusyFinal();
    }
    claim = claimed;
  } else {
    let free: boolean;
    try {
      free = await jobs.beforeNewRequest({ sessionId, wearerKey: parsed.wearerKey });
    } catch {
      free = true;
    }
    if (!free) {
      return sendError(res, 409, "BUSY_JOB_ACTIVE", "A preview is already being made for this person.", false);
    }
  }

  /** Tries left now (after a refund or a held try); informative only. */
  async function readTriesLeft(): Promise<{ order: number; account: number | null }> {
    try {
      return {
        order: await limits.readOrderTriesRemaining(sessionId!),
        account: identity !== "auth_failed" && identity.uid !== null ? await limits.readAccountTriesRemaining(identity.uid) : null,
      };
    } catch {
      return { order: AI_TRY_ON_TRIES_PER_ORDER, account: null };
    }
  }
  /** The busy try ended without a preview and was refunded. */
  async function sendBusyFinal() {
    const left = await readTriesLeft();
    return sendError(
      res,
      503,
      "PROVIDER_BUSY",
      "AI Try-on is very busy right now. Please try again later.",
      false,
      undefined,
      left.order,
      left.account,
    );
  }
  /** Settles a claimed job that ends here for another reason (refund once). */
  const refundClaim = async () => {
    if (!claim) return;
    try {
      if (await jobs.refund(claim)) log(JSON.stringify({ event: "ai_try_on", outcome: "busy_refunded", reason: "other_failure" }));
    } catch {
      // The job expires and the next session call refunds it.
    }
  };

  /** Charges the per-IP window; returns the sent error, or null when allowed. */
  const chargeIpRateLimit = async (): Promise<unknown> => {
    try {
      await (dependencies.consumeIpRateLimit ??
        ((database: Firestore, ip: string) =>
          consumeAuthRateLimit(database, AI_TRY_ON_IP_RATE_LIMIT, ip, now)))(db, getClientIp(req));
      return null;
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
  };
  const defaultModel = parsed.defaultModel;
  // Photo flow: charged first, as before. Model mode: charged only on a
  // cache miss, so a reused result costs nothing.
  if (!defaultModel && !claim) {
    const limited = await chargeIpRateLimit();
    if (limited !== null) return limited;
  }

  // Garment/fabric pictures sent as URLs are loaded here, before a try is
  // reserved, so an unreadable picture never uses one.
  const loadReference = dependencies.loadReferenceImage ?? defaultLoadReferenceImage;
  const resolveReference = async (source: AiTryOnReferenceSource) =>
    source.kind === "inline" ? source.image : loadReference(source.url);
  let images: AiTryOnInlineImage[];
  try {
    images = [
      defaultModel
        ? await (dependencies.loadDefaultModelImage ?? loadAiTryOnDefaultModelImage)(defaultModel)
        : parsed.personImage!,
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
    await refundClaim();
    return sendError(
      res,
      422,
      "REFERENCE_IMAGE_UNAVAILABLE",
      "The garment or fabric picture could not be loaded.",
      false,
    );
  }

  // v6: drop the swatch's edges (printed codes, selvedge text) and match
  // the output shape to the customer photo. Neither step may block a try:
  // an undecodable picture falls back to what was sent before v6.
  if (images[2]) {
    try {
      images[2] = await (dependencies.cropFabricSwatch ?? cropAiTryOnFabricSwatch)(images[2]);
    } catch {
      log(JSON.stringify({ event: "ai_try_on", outcome: "swatch_crop_skipped", mode: parsed.mode }));
    }
  }
  let photoAspectRatio: AiTryOnGeminiAspectRatio | null = null;
  if (!defaultModel) {
    try {
      photoAspectRatio = await (dependencies.readPhotoAspectRatio ?? readAiTryOnPhotoAspectRatio)(images[0]);
    } catch {
      photoAspectRatio = null;
    }
  }

  const promptVersion = defaultModel ? AI_TRY_ON_MODEL_PROMPT_VERSION : AI_TRY_ON_PROMPT_VERSION;
  const saveWearerPreview = async (previewId: string, image: { mimeType: string; data: string }) => {
    let saved: Awaited<ReturnType<AiTryOnPreviewStore["save"]>> | null;
    try {
      saved = await createStore(db).save({
        orderKey: sessionId!,
        wearerKey: parsed.wearerKey,
        previewId,
        inputFingerprint: parsed.inputFingerprint,
        image,
        ...(defaultModel ? { modelId: defaultModel.id } : {}),
      });
    } catch {
      // The customer still gets the inline preview; it just isn't kept.
      return null;
    }
    // Background generation: the order may have been paid while Gemini
    // worked, which deletes the session's previews and closes it. A preview
    // saved after that must not outlive the order, so check again and take
    // it back out ("kept until you place your order").
    try {
      const stillOpen = await createSessions(db).authorize(identity);
      if (stillOpen === sessionId) return saved;
    } catch {
      // Unknown: remove it to be safe; the customer keeps the inline image.
    }
    try {
      await createStore(db).remove(sessionId!, previewId);
    } catch {
      // The 30-day expiry is the backstop.
    }
    log(JSON.stringify({ event: "ai_try_on", outcome: "preview_removed_session_closed" }));
    return null;
  };
  const ownerBindingId = `session-${hashAiTryOnOrderKey(sessionId).slice(0, 32)}`;

  // Model mode: a saved result for exactly these inputs is reused for free.
  let modelCache: AiTryOnModelResultCache | null = null;
  let modelCacheKey: string | null = null;
  if (defaultModel) {
    modelCacheKey = createAiTryOnModelResultKey({
      modelId: defaultModel.id,
      modelImage: images[0],
      mode: parsed.mode,
      garmentImage: images[1],
      fabricImage: images[2] ?? null,
      orderDetails: parsed.orderDetails,
    });
    try {
      modelCache = (dependencies.createModelResultCache ?? defaultModelResultCache)(db);
    } catch {
      modelCache = null;
    }
    const hit = modelCache ? await modelCache.reuse(modelCacheKey) : null;
    if (hit) {
      // A reused result never uses a try, so a held busy try goes back.
      await refundClaim();
      const previewId = (dependencies.createAssetId ?? createAiTryOnPreviewId)();
      const stored = await saveWearerPreview(previewId, hit);
      let orderTriesRemaining: number = AI_TRY_ON_TRIES_PER_ORDER;
      let accountTriesRemaining: number | null = null;
      try {
        orderTriesRemaining = await limits.readOrderTriesRemaining(sessionId);
        if (identity.uid !== null) {
          accountTriesRemaining = await limits.readAccountTriesRemaining(identity.uid);
        }
      } catch {
        // Counts are informative only; the hit is still served.
      }
      log(
        JSON.stringify({
          event: "ai_try_on",
          outcome: "model_cache_hit",
          mode: parsed.mode,
          promptVersion,
          previewStored: Boolean(stored),
        }),
      );
      const body: AiTryOnGenerationSuccess = {
        status: "completed",
        inputFingerprint: parsed.inputFingerprint,
        resultReference: { kind: "verified_private_try_on_result", assetId: previewId, ownerBindingId },
        image: hit,
        previewStored: Boolean(stored),
        ...(stored ? { previewExpiresAt: stored.expiresAt } : {}),
        orderTriesRemaining,
        ...(accountTriesRemaining !== null ? { accountTriesRemaining } : {}),
        promptVersion,
        modelId: defaultModel.id,
        cacheHit: true,
      };
      setNoStore(res);
      return res.status(200).json(body);
    }
    if (!claim) {
      const limited = await chargeIpRateLimit();
      if (limited !== null) return limited;
    }
  }

  // The try: newly reserved, or the one a busy job already holds.
  let reservation: Awaited<ReturnType<AiTryOnUsageLimits["reserve"]>> | null = null;
  if (!claim) {
    try {
      // Signed-in customers also use one of the account's 15 tries per 30 days.
      reservation = await limits.reserve(sessionId, { accountUid: identity.uid });
    } catch {
      return sendError(res, 503, "PROVIDER_FAILED", "AI Try-on is temporarily unavailable.", true);
    }
  }
  if (reservation && reservation.ok === false) {
    if (reservation.code === "ACCOUNT_TRY_LIMIT_REACHED") {
      log(JSON.stringify({ event: "ai_try_on", outcome: "account_limit_reached" }));
      return sendError(
        res,
        429,
        "ACCOUNT_TRY_LIMIT_REACHED",
        `This account has used all ${AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW} AI Try-on previews for the last 30 days.`,
        false,
        undefined,
        undefined,
        0,
      );
    }
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
    prompt: defaultModel
      ? buildAiTryOnModelPrompt({ mode: parsed.mode, orderDetails: parsed.orderDetails })
      : buildAiTryOnPrompt({
          mode: parsed.mode,
          fitHints: parsed.fitHints,
          orderDetails: parsed.orderDetails,
        }),
    images,
    imageLabels: defaultModel
      ? buildAiTryOnModelImageLabels(parsed.mode)
      : buildAiTryOnImageLabels(parsed.mode),
    aspectRatio: defaultModel ? "3:4" : photoAspectRatio,
    secret: apiKey,
    ...(dependencies.geminiRetrySleep ? { sleep: dependencies.geminiRetrySleep } : {}),
  });
  const latencyMs = now() - startedAt;

  if (outcome.ok === false) {
    const logFailure = (busy: string | null) =>
      log(
        JSON.stringify({
          event: "ai_try_on",
          outcome: outcome.kind,
          mode: parsed.mode,
          promptVersion,
          fitHints: parsed.fitHints.length,
          latencyMs,
          attempts: outcome.attempts ?? 1,
          ...(busy ? { busy, busyRequest: claim ? claim.requests : 1 } : {}),
          reason: outcome.reason,
        }),
      );
    // Still over capacity: keep the try held for the browser's next retry.
    if (outcome.capacity) {
      let next: { jobId: string } | "refunded" | "gone" | null = null;
      try {
        if (claim) {
          const settled = await jobs.release(claim);
          next = settled === "held" ? { jobId: claim.jobId } : settled;
        } else if (reservation && reservation.ok) {
          next = await jobs.hold({
            sessionId,
            wearerKey: parsed.wearerKey,
            inputFingerprint: parsed.inputFingerprint,
            orderDocId: reservation.orderDocId,
            account: reservation.account,
          });
        }
      } catch {
        next = null;
      }
      if (next && typeof next === "object") {
        logFailure("held");
        setNoStore(res);
        res.setHeader("Retry-After", String(AI_TRY_ON_BUSY_MIN_GAP_MS / 1000));
        const body: AiTryOnErrorResponse = {
          error: "AI Try-on is very busy right now. We'll keep trying.",
          code: "PROVIDER_BUSY",
          retryable: true,
          retryAfterSeconds: AI_TRY_ON_BUSY_MIN_GAP_MS / 1000,
          busyJobId: next.jobId,
          ...(reservation && reservation.ok ? { orderTriesRemaining: reservation.orderTriesRemaining } : {}),
          ...(reservation && reservation.ok && reservation.accountTriesRemaining !== null
            ? { accountTriesRemaining: reservation.accountTriesRemaining }
            : {}),
        };
        return res.status(503).json(body);
      }
      if (claim) {
        // Out of retries (refunded once here), or already refunded elsewhere.
        logFailure("gave_up");
        if (next === "gone") log(JSON.stringify({ event: "ai_try_on", outcome: "busy_job_gone" }));
        return sendBusyFinal();
      }
      // The job could not be held: fail as before (refund below).
    }
    if (claim) {
      await refundClaim();
      logFailure("ended");
      const left = await readTriesLeft();
      return outcome.kind === "rejected"
        ? sendError(res, 422, "PROVIDER_REJECTED", "AI Try-on could not create a preview from these photos.", outcome.retryable, undefined, left.order, left.account)
        : sendError(res, 502, "PROVIDER_FAILED", "AI Try-on could not be completed.", outcome.retryable, undefined, left.order, left.account);
    }
    const reserved = reservation as Extract<NonNullable<typeof reservation>, { ok: true }>;
    try {
      await limits.release(reserved.orderDocId, reserved.account);
    } catch {
      // A failed release only makes the cap stricter; never block the reply.
    }
    logFailure(null);
    // The reservation was released, so this try was not counted.
    const orderTriesRemaining = Math.min(
      AI_TRY_ON_TRIES_PER_ORDER,
      reserved.orderTriesRemaining + 1,
    );
    const accountTriesRemaining =
      reserved.accountTriesRemaining === null
        ? null
        : Math.min(AI_TRY_ON_ACCOUNT_TRIES_PER_WINDOW, reserved.accountTriesRemaining + 1);
    return outcome.kind === "rejected"
      ? sendError(
          res,
          422,
          "PROVIDER_REJECTED",
          "AI Try-on could not create a preview from these photos.",
          outcome.retryable,
          undefined,
          orderTriesRemaining,
          accountTriesRemaining,
        )
      : sendError(
          res,
          502,
          "PROVIDER_FAILED",
          "AI Try-on could not be completed.",
          outcome.retryable,
          undefined,
          orderTriesRemaining,
          accountTriesRemaining,
        );
  }

  // A preview was made: a held busy try is now used.
  if (claim) {
    try {
      await jobs.complete(claim);
    } catch {
      // Left running: its lease lapses and an expiry sweep would refund it.
    }
  }
  const triesAfter =
    reservation && reservation.ok
      ? { order: reservation.orderTriesRemaining, account: reservation.accountTriesRemaining }
      : await readTriesLeft();

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
    stored = await saveWearerPreview(previewId, preview);
    if (modelCache && modelCacheKey && defaultModel) {
      try {
        await modelCache.save(modelCacheKey, { modelId: defaultModel.id, mode: parsed.mode, image: preview });
      } catch {
        log(JSON.stringify({ event: "ai_try_on", outcome: "model_cache_save_failed" }));
      }
    }
  }
  log(
    JSON.stringify({
      event: "ai_try_on",
      outcome: "completed",
      mode: parsed.mode,
      promptVersion,
      fitHints: parsed.fitHints.length,
      latencyMs,
      attempts: outcome.attempts ?? 1,
      ...(claim ? { busy: "recovered", busyRequest: claim.requests } : {}),
      previewStored: Boolean(stored),
    }),
  );
  const body: AiTryOnGenerationSuccess = {
    status: "completed",
    inputFingerprint: parsed.inputFingerprint,
    resultReference: {
      kind: "verified_private_try_on_result",
      assetId: previewId,
      ownerBindingId,
    },
    image: preview,
    previewStored: Boolean(stored),
    ...(stored ? { previewExpiresAt: stored.expiresAt } : {}),
    orderTriesRemaining: triesAfter.order,
    ...(triesAfter.account !== null ? { accountTriesRemaining: triesAfter.account } : {}),
    promptVersion,
    ...(defaultModel ? { modelId: defaultModel.id, cacheHit: false } : {}),
  };
  setNoStore(res);
  return res.status(200).json(body);
}
