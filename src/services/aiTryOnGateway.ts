import type { AiTryOnWorkflowStateV1 } from "../types";
import {
  transitionAiTryOnWorkflow,
  type AiTryOnGateway,
  type AiTryOnGatewayAvailability,
  type AiTryOnGatewayJobResult,
} from "../utils/aiTryOnWorkflow";
import {
  AI_TRY_ON_ENDPOINT,
  AI_TRY_ON_SESSION_HEADER_NAME,
  AI_TRY_ON_TRIES_PER_ORDER,
  type AiTryOnStoredPreviewSummary,
  type AiTryOnAvailabilityResponse,
  type AiTryOnErrorResponse,
  type AiTryOnGenerationRequest,
  type AiTryOnGenerationSuccess,
} from "../utils/aiTryOnGatewayContract";

/**
 * Browser side of the AI Try-on gateway. Talks only to our own
 * `/api/ai-try-on` route; the Gemini key never leaves the server.
 *
 * Generation is synchronous on the server, so `start` resolves straight to
 * `completed` or `failed`. A job cannot survive a reload, so `resume`
 * reports an interrupted, retryable failure.
 */

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

// ------------------------------------------------------------ Step 7 sessions

/**
 * Who is calling: a guest's server-issued session token (null until the
 * server issues one) and, for signed-in customers, their Firebase ID token.
 * The server finds the session from these; the browser never picks it.
 */
export interface AiTryOnCredentials {
  readonly sessionToken: string | null;
  readonly getIdToken: () => Promise<string | null>;
}

const SESSION_TOKEN_PATTERN = /^tts1_[A-Za-z0-9_-]{43}$/;

/** ID token of a signed-in (non-anonymous) customer, or null. */
export const readAiTryOnIdToken = async (): Promise<string | null> => {
  try {
    // Lazy import keeps static UI tests from initializing the Firebase client.
    const { auth } = await import("./firebase");
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
};

export const createAiTryOnCredentials = (
  sessionToken: string | null,
  getIdToken: () => Promise<string | null> = readAiTryOnIdToken,
): AiTryOnCredentials => ({ sessionToken, getIdToken });

const credentialHeaders = async (
  credentials: AiTryOnCredentials | undefined,
): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {};
  if (!credentials) return headers;
  if (credentials.sessionToken && SESSION_TOKEN_PATTERN.test(credentials.sessionToken)) {
    headers[AI_TRY_ON_SESSION_HEADER_NAME] = credentials.sessionToken;
  }
  const idToken = await credentials.getIdToken().catch(() => null);
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  return headers;
};

export const mapAiTryOnHttpResult = (
  status: number,
  body: unknown,
): AiTryOnGatewayJobResult => {
  if (status === 200 && isRecord(body) && body.status === "completed") {
    const success = body as unknown as AiTryOnGenerationSuccess;
    return {
      status: "completed",
      resultReference: success.resultReference,
      ...(isRecord(success.image) &&
      typeof success.image.data === "string" &&
      typeof success.image.mimeType === "string"
        ? { preview: { mimeType: success.image.mimeType, data: success.image.data } }
        : {}),
      ...(typeof success.orderTriesRemaining === "number"
        ? { orderTriesRemaining: success.orderTriesRemaining }
        : {}),
    };
  }
  const error = (isRecord(body) ? body : {}) as Partial<AiTryOnErrorResponse>;
  const retryable = error.retryable === true;
  switch (error.code) {
    case "NOT_CONFIGURED":
    case "GLOBAL_LIMIT_REACHED":
      return { status: "unavailable", code: "not_configured" };
    case "RATE_LIMITED":
      return { status: "failed", code: "provider_unavailable", retryable: true };
    case "ORDER_TRY_LIMIT_REACHED":
      return { status: "failed", code: "provider_rejected", retryable: false };
    case "PROVIDER_REJECTED":
      return { status: "failed", code: "provider_rejected", retryable };
    case "PROVIDER_FAILED":
      return { status: "failed", code: "provider_unavailable", retryable };
    default:
      return { status: "failed", code: "processing_failed", retryable: false };
  }
};

export const createHttpAiTryOnGateway = ({
  fetchImpl = (input, init) => fetch(input, init),
  endpoint = AI_TRY_ON_ENDPOINT,
}: { fetchImpl?: FetchLike; endpoint?: string } = {}): AiTryOnGateway => ({
  async getAvailability(): Promise<AiTryOnGatewayAvailability> {
    try {
      const response = await fetchImpl(endpoint, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = (await readJson(response)) as AiTryOnAvailabilityResponse | null;
      return response.ok && body?.status === "available"
        ? { status: "available" }
        : { status: "unavailable", code: "not_configured" };
    } catch {
      return { status: "unavailable", code: "not_configured" };
    }
  },
  async start(inputFingerprint, request) {
    if (!request || request.inputFingerprint !== inputFingerprint) {
      return { status: "failed", code: "processing_failed", retryable: false };
    }
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(request),
      });
      return mapAiTryOnHttpResult(response.status, await readJson(response));
    } catch {
      return { status: "failed", code: "interrupted", retryable: true };
    }
  },
  async resume() {
    return { status: "failed", code: "interrupted", retryable: true };
  },
});

const createJobId = () =>
  `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export interface AiTryOnGenerationRun {
  state: AiTryOnWorkflowStateV1;
  preview?: { mimeType: string; data: string };
  orderTriesRemaining?: number;
}

/**
 * Drives one generation through the existing workflow transitions:
 * ready/failed(retryable) → processing → completed | failed.
 * `onProcessing` lets the UI show the processing state while Gemini runs.
 * Returns the unchanged state when the workflow cannot start.
 */
export const runAiTryOnGeneration = async ({
  gateway,
  state,
  request,
  skipAllowed,
  onProcessing,
  createJobReferenceId = createJobId,
}: {
  gateway: AiTryOnGateway;
  state: AiTryOnWorkflowStateV1;
  request: AiTryOnGenerationRequest;
  skipAllowed: boolean;
  onProcessing?: (state: AiTryOnWorkflowStateV1) => void;
  createJobReferenceId?: () => string;
}): Promise<AiTryOnGenerationRun> => {
  if (!state.inputFingerprint || request.inputFingerprint !== state.inputFingerprint) {
    return { state };
  }
  const started = transitionAiTryOnWorkflow({
    state,
    event: {
      type: "start",
      jobReference: { kind: "resumable_job", jobId: createJobReferenceId() },
    },
    skipAllowed,
  });
  if (!started.ok) return { state };
  onProcessing?.(started.state);

  const result = await gateway.start(state.inputFingerprint, request);
  if (result.status === "completed") {
    const completed = transitionAiTryOnWorkflow({
      state: started.state,
      event: { type: "complete", resultReference: result.resultReference },
      skipAllowed,
    });
    if (completed.ok) {
      return {
        state: completed.state,
        ...(result.preview ? { preview: result.preview } : {}),
        ...(result.orderTriesRemaining !== undefined
          ? { orderTriesRemaining: result.orderTriesRemaining }
          : {}),
      };
    }
  }
  const failure =
    result.status === "failed"
      ? { code: result.code, retryable: result.retryable }
      : { code: "provider_unavailable" as const, retryable: false };
  const failed = transitionAiTryOnWorkflow({
    state: started.state,
    event: { type: "fail", ...failure },
    skipAllowed,
  });
  return { state: failed.ok ? failed.state : started.state };
};

// ------------------------------------------------------------ Step 5 UI

export type AiTryOnAvailabilityDetails =
  | {
      status: "available";
      triesPerOrder: number;
      orderTriesRemaining: number | null;
      /** Stored previews of this order that are still valid (Step 6). */
      storedPreviews: AiTryOnStoredPreviewSummary[];
      /** Guest session token to keep (Step 7); null for signed-in customers. */
      sessionToken: string | null;
    }
  | { status: "unavailable" };

const PREVIEW_ID_PATTERN = /^tryon-[0-9a-f-]{36}$/;

const parseStoredPreviews = (value: unknown): AiTryOnStoredPreviewSummary[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is AiTryOnStoredPreviewSummary =>
          isRecord(entry) &&
          typeof entry.previewId === "string" &&
          PREVIEW_ID_PATTERN.test(entry.previewId) &&
          typeof entry.wearerKey === "string" &&
          typeof entry.inputFingerprint === "string" &&
          typeof entry.expiresAt === "string",
      )
    : [];

/**
 * `POST /api/ai-try-on?action=session` for the Design Studio step: the
 * server finds or mints this order's try-on session (Step 7) and reports
 * the tries left and the stored previews. Any error reads as unavailable,
 * so the step falls back to "AI Try-on is currently unavailable".
 */
export const fetchAiTryOnAvailability = async ({
  credentials,
  fetchImpl = (input, init) => fetch(input, init),
  endpoint = AI_TRY_ON_ENDPOINT,
}: {
  credentials: AiTryOnCredentials;
  fetchImpl?: FetchLike;
  endpoint?: string;
}): Promise<AiTryOnAvailabilityDetails> => {
  try {
    const response = await fetchImpl(`${endpoint}?action=session`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(await credentialHeaders(credentials)),
      },
      body: "{}",
      cache: "no-store",
    });
    const body = (await readJson(response)) as Record<string, unknown> | null;
    if (!response.ok || !isRecord(body) || body.status !== "available") {
      return { status: "unavailable" };
    }
    const triesPerOrder =
      typeof body.triesPerOrder === "number" && body.triesPerOrder > 0
        ? Math.floor(body.triesPerOrder)
        : AI_TRY_ON_TRIES_PER_ORDER;
    const remaining =
      typeof body.orderTriesRemaining === "number" && body.orderTriesRemaining >= 0
        ? Math.min(triesPerOrder, Math.floor(body.orderTriesRemaining))
        : null;
    return {
      status: "available",
      triesPerOrder,
      orderTriesRemaining: remaining,
      storedPreviews: parseStoredPreviews(body.previews),
      sessionToken:
        typeof body.sessionToken === "string" && SESSION_TOKEN_PATTERN.test(body.sessionToken)
          ? body.sessionToken
          : null,
    };
  } catch {
    return { status: "unavailable" };
  }
};

/**
 * What the AI Try-on step shows after one generation request. Unlike the
 * workflow mapping above, this keeps the customer-facing distinctions
 * (out of previews, too many tries, photo blocked, refunded failure).
 */
export type AiTryOnPreviewOutcome =
  | {
      kind: "completed";
      resultReference: AiTryOnGenerationSuccess["resultReference"];
      preview: { mimeType: string; data: string };
      orderTriesRemaining: number | null;
      /** Set when the server stored the preview privately (Step 6). */
      storedPreviewId?: string | null;
    }
  | { kind: "order_limit_reached" }
  | { kind: "rate_limited"; retryAfterSeconds: number | null }
  | { kind: "photo_blocked"; orderTriesRemaining: number | null }
  | { kind: "failed"; orderTriesRemaining: number | null }
  | { kind: "unavailable" };

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const mapAiTryOnPreviewResponse = (
  status: number,
  body: unknown,
): AiTryOnPreviewOutcome => {
  if (status === 200 && isRecord(body) && body.status === "completed") {
    const image = isRecord(body.image) ? body.image : null;
    const resultReference = isRecord(body.resultReference) ? body.resultReference : null;
    if (
      image &&
      typeof image.data === "string" &&
      image.data.length > 0 &&
      typeof image.mimeType === "string" &&
      IMAGE_MIME_TYPES.has(image.mimeType) &&
      resultReference &&
      resultReference.kind === "verified_private_try_on_result"
    ) {
      return {
        kind: "completed",
        resultReference: resultReference as unknown as AiTryOnGenerationSuccess["resultReference"],
        preview: { mimeType: image.mimeType, data: image.data },
        orderTriesRemaining:
          typeof body.orderTriesRemaining === "number" ? body.orderTriesRemaining : null,
        storedPreviewId:
          body.previewStored === true &&
          typeof resultReference.assetId === "string" &&
          PREVIEW_ID_PATTERN.test(resultReference.assetId)
            ? resultReference.assetId
            : null,
      };
    }
    return { kind: "failed", orderTriesRemaining: null };
  }
  const error = (isRecord(body) ? body : {}) as Partial<AiTryOnErrorResponse>;
  const remaining =
    typeof error.orderTriesRemaining === "number" ? error.orderTriesRemaining : null;
  switch (error.code) {
    case "NOT_CONFIGURED":
    case "GLOBAL_LIMIT_REACHED":
      return { kind: "unavailable" };
    case "ORDER_TRY_LIMIT_REACHED":
      return { kind: "order_limit_reached" };
    case "RATE_LIMITED":
      return {
        kind: "rate_limited",
        retryAfterSeconds:
          typeof error.retryAfterSeconds === "number" ? error.retryAfterSeconds : null,
      };
    case "PROVIDER_REJECTED":
      return { kind: "photo_blocked", orderTriesRemaining: remaining };
    default:
      return { kind: "failed", orderTriesRemaining: remaining };
  }
};

export const requestAiTryOnPreview = async ({
  request,
  credentials,
  fetchImpl = (input, init) => fetch(input, init),
  endpoint = AI_TRY_ON_ENDPOINT,
}: {
  request: AiTryOnGenerationRequest;
  credentials?: AiTryOnCredentials;
  fetchImpl?: FetchLike;
  endpoint?: string;
}): Promise<AiTryOnPreviewOutcome> => {
  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(await credentialHeaders(credentials)),
      },
      body: JSON.stringify(request),
    });
    return mapAiTryOnPreviewResponse(response.status, await readJson(response));
  } catch {
    return { kind: "failed", orderTriesRemaining: null };
  }
};

// ------------------------------------------------------------ Step 6 storage

/** Owner-only read of a stored preview (by server session). null when gone. */
export const fetchStoredAiTryOnPreview = async ({
  credentials,
  previewId,
  fetchImpl = (input, init) => fetch(input, init),
  endpoint = AI_TRY_ON_ENDPOINT,
}: {
  credentials: AiTryOnCredentials;
  previewId: string;
  fetchImpl?: FetchLike;
  endpoint?: string;
}): Promise<{ mimeType: string; data: string } | null> => {
  try {
    const response = await fetchImpl(`${endpoint}?previewId=${encodeURIComponent(previewId)}`, {
      method: "GET",
      headers: { Accept: "application/json", ...(await credentialHeaders(credentials)) },
      cache: "no-store",
    });
    const body = (await readJson(response)) as Record<string, unknown> | null;
    const image = isRecord(body) && isRecord(body.image) ? body.image : null;
    if (
      !response.ok ||
      !image ||
      typeof image.data !== "string" ||
      typeof image.mimeType !== "string" ||
      !IMAGE_MIME_TYPES.has(image.mimeType)
    ) {
      return null;
    }
    return { mimeType: image.mimeType, data: image.data };
  } catch {
    return null;
  }
};

/**
 * Deletes one stored preview, or all of the session's previews
 * (`previewId: null`). `closeSession` also ends the session (fresh order).
 */
export const deleteStoredAiTryOnPreviews = async ({
  credentials,
  previewId,
  closeSession = false,
  fetchImpl = (input, init) => fetch(input, init),
  endpoint = AI_TRY_ON_ENDPOINT,
  keepalive = false,
}: {
  credentials: AiTryOnCredentials;
  previewId: string | null;
  closeSession?: boolean;
  fetchImpl?: FetchLike;
  endpoint?: string;
  keepalive?: boolean;
}): Promise<boolean> => {
  try {
    const target = previewId
      ? `previewId=${encodeURIComponent(previewId)}`
      : `all=1${closeSession ? "&close=1" : ""}`;
    const response = await fetchImpl(`${endpoint}?${target}`, {
      method: "DELETE",
      headers: { Accept: "application/json", ...(await credentialHeaders(credentials)) },
      keepalive,
    });
    return response.ok;
  } catch {
    return false;
  }
};
