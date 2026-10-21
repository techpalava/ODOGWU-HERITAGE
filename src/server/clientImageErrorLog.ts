import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  CLIENT_IMAGE_ERROR_CONNECTION_TYPES,
  CLIENT_IMAGE_ERROR_FABRIC_CODE_PATTERN,
  CLIENT_IMAGE_ERROR_FIELD_LIMITS,
  CLIENT_IMAGE_ERROR_HOST_PATTERN,
  CLIENT_IMAGE_ERROR_MAX_BODY_BYTES,
  CLIENT_IMAGE_ERROR_ROUTE,
  CLIENT_IMAGE_ERROR_SOURCES,
  CLIENT_IMAGE_ERROR_SURFACES,
  type ClientImageErrorReport,
} from "../utils/clientImageErrorSchema.js";

/**
 * `POST /api/client-image-error`: the browser reports a Fabric photo that
 * would not load. The body is validated and size-limited, requests are
 * rate-limited per client IP, and one structured `console.warn` line is
 * written to the Vercel function logs. No Firestore/Storage writes.
 *
 * On Vercel the path is rewritten onto api/health.ts (`?route=client-image-error`)
 * because the project is at the 12-function Hobby cap.
 */

type RequestWithRoute = HttpRequest & { query?: unknown; url?: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isClientImageErrorRequest = (req: RequestWithRoute): boolean => {
  const query = isRecord(req.query) ? req.query : null;
  const route = Array.isArray(query?.route) ? query?.route[0] : query?.route;
  if (route === CLIENT_IMAGE_ERROR_ROUTE) return true;
  if (typeof req.url !== "string") return false;
  const path = req.url.split("?")[0] ?? "";
  return (
    path === `/api/${CLIENT_IMAGE_ERROR_ROUTE}` ||
    /[?&]route=client-image-error(?:&|$)/.test(req.url)
  );
};

export type ClientImageErrorValidation =
  | { ok: true; report: ClientImageErrorReport }
  | { ok: false; status: 400 | 413; code: string; error: string };

const ALLOWED_KEYS = new Set([
  "fabricCode",
  "imageHost",
  "attempts",
  "finalFailure",
  "surface",
  "source",
  "online",
  "effectiveType",
  "userAgent",
]);

const invalid = (error: string): ClientImageErrorValidation => ({
  ok: false,
  status: 400,
  code: "INVALID_CLIENT_IMAGE_ERROR",
  error,
});

const bodyByteLength = (value: string): number =>
  typeof Buffer !== "undefined"
    ? Buffer.byteLength(value, "utf8")
    : new TextEncoder().encode(value).length;

/** Reads the body Vercel/Express gave us: parsed object, JSON string, or raw bytes. */
const readBody = (
  req: HttpRequest,
): { ok: true; value: unknown } | { ok: false; result: ClientImageErrorValidation } => {
  let raw: unknown = req.body;
  if (raw === undefined || raw === null || raw === "") {
    raw = req.rawBody;
  }
  if (raw instanceof Uint8Array) {
    raw = new TextDecoder().decode(raw);
  }
  if (typeof raw === "string") {
    if (bodyByteLength(raw) > CLIENT_IMAGE_ERROR_MAX_BODY_BYTES) {
      return {
        ok: false,
        result: { ok: false, status: 413, code: "BODY_TOO_LARGE", error: "Body too large." },
      };
    }
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch {
      return { ok: false, result: invalid("Body must be JSON.") };
    }
  }
  if (isRecord(raw)) {
    let serialized = "";
    try {
      serialized = JSON.stringify(raw);
    } catch {
      return { ok: false, result: invalid("Body must be JSON.") };
    }
    if (bodyByteLength(serialized) > CLIENT_IMAGE_ERROR_MAX_BODY_BYTES) {
      return {
        ok: false,
        result: { ok: false, status: 413, code: "BODY_TOO_LARGE", error: "Body too large." },
      };
    }
    return { ok: true, value: raw };
  }
  return { ok: false, result: invalid("Body must be a JSON object.") };
};

export const validateClientImageErrorBody = (
  req: HttpRequest,
): ClientImageErrorValidation => {
  const declaredLength = Number(
    Array.isArray(req.headers["content-length"])
      ? req.headers["content-length"][0]
      : req.headers["content-length"],
  );
  if (Number.isFinite(declaredLength) && declaredLength > CLIENT_IMAGE_ERROR_MAX_BODY_BYTES) {
    return { ok: false, status: 413, code: "BODY_TOO_LARGE", error: "Body too large." };
  }
  const read = readBody(req);
  if ("result" in read) return read.result;
  const body = read.value;
  if (!isRecord(body)) return invalid("Body must be a JSON object.");
  for (const key of Object.keys(body)) {
    if (!ALLOWED_KEYS.has(key)) return invalid(`Unknown field: ${key.slice(0, 40)}`);
  }
  const limits = CLIENT_IMAGE_ERROR_FIELD_LIMITS;
  const { fabricCode, imageHost, attempts, finalFailure, surface, source, online } = body;
  if (typeof fabricCode !== "string" || !CLIENT_IMAGE_ERROR_FABRIC_CODE_PATTERN.test(fabricCode)) {
    return invalid("fabricCode is invalid.");
  }
  if (
    typeof imageHost !== "string" ||
    imageHost.length > limits.imageHostMaxLength ||
    !CLIENT_IMAGE_ERROR_HOST_PATTERN.test(imageHost)
  ) {
    return invalid("imageHost is invalid.");
  }
  if (
    typeof attempts !== "number" ||
    !Number.isInteger(attempts) ||
    attempts < 1 ||
    attempts > limits.maxAttempts
  ) {
    return invalid("attempts is invalid.");
  }
  if (typeof finalFailure !== "boolean") return invalid("finalFailure must be a boolean.");
  if (typeof online !== "boolean") return invalid("online must be a boolean.");
  if (
    typeof surface !== "string" ||
    !(CLIENT_IMAGE_ERROR_SURFACES as readonly string[]).includes(surface)
  ) {
    return invalid("surface is invalid.");
  }
  if (
    typeof source !== "string" ||
    !(CLIENT_IMAGE_ERROR_SOURCES as readonly string[]).includes(source)
  ) {
    return invalid("source is invalid.");
  }
  const effectiveType = body.effectiveType;
  if (
    effectiveType !== undefined &&
    effectiveType !== null &&
    !(
      typeof effectiveType === "string" &&
      (CLIENT_IMAGE_ERROR_CONNECTION_TYPES as readonly string[]).includes(effectiveType)
    )
  ) {
    return invalid("effectiveType is invalid.");
  }
  const userAgent = body.userAgent;
  if (
    userAgent !== undefined &&
    (typeof userAgent !== "string" || userAgent.length > limits.userAgentMaxLength)
  ) {
    return invalid("userAgent is invalid.");
  }
  return {
    ok: true,
    report: {
      fabricCode,
      imageHost: imageHost.toLowerCase(),
      attempts,
      finalFailure,
      surface: surface as ClientImageErrorReport["surface"],
      source: source as ClientImageErrorReport["source"],
      online,
      effectiveType: (effectiveType as ClientImageErrorReport["effectiveType"]) ?? null,
      ...(typeof userAgent === "string" ? { userAgent } : {}),
    },
  };
};

/** Fixed-window limiter. Best effort: each warm function instance keeps its own counts. */
export const createClientImageErrorRateLimiter = ({
  perClientLimit = 20,
  globalLimit = 600,
  windowMs = 60_000,
  maxTrackedClients = 5_000,
  now = () => Date.now(),
}: {
  perClientLimit?: number;
  globalLimit?: number;
  windowMs?: number;
  maxTrackedClients?: number;
  now?: () => number;
} = {}) => {
  let windowStart = now();
  let globalCount = 0;
  const counts = new Map<string, number>();
  return (clientKey: string): boolean => {
    const current = now();
    if (current - windowStart >= windowMs) {
      windowStart = current;
      globalCount = 0;
      counts.clear();
    }
    if (globalCount >= globalLimit) return false;
    const used = counts.get(clientKey) ?? 0;
    if (used >= perClientLimit) return false;
    if (!counts.has(clientKey) && counts.size >= maxTrackedClients) return false;
    counts.set(clientKey, used + 1);
    globalCount += 1;
    return true;
  };
};

const headerValue = (req: HttpRequest, name: string): string => {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value) ?? "";
};

export const getClientKey = (req: HttpRequest): string => {
  const forwarded = headerValue(req, "x-forwarded-for").split(",")[0]?.trim();
  const ip = forwarded || headerValue(req, "x-real-ip").trim();
  return (ip || "unknown").slice(0, 64);
};

const defaultLimiter = createClientImageErrorRateLimiter();

export type ClientImageErrorLogger = (line: string) => void;

export const createClientImageErrorHandler = ({
  allow = defaultLimiter,
  log = (line: string) => console.warn(line),
  now = () => new Date(),
}: {
  allow?: (clientKey: string) => boolean;
  log?: ClientImageErrorLogger;
  now?: () => Date;
} = {}) =>
  (req: HttpRequest, res: HttpResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" });
    }
    if (!allow(getClientKey(req))) {
      res.setHeader("Retry-After", "60");
      return res.status(429).json({ error: "Too many reports.", code: "RATE_LIMITED" });
    }
    const result = validateClientImageErrorBody(req);
    if (!("report" in result)) {
      return res.status(result.status).json({ error: result.error, code: result.code });
    }
    const report = result.report;
    // One JSON line, so Vercel log search can filter on "client_image_error".
    log(
      JSON.stringify({
        event: "client_image_error",
        at: now().toISOString(),
        fabricCode: report.fabricCode,
        imageHost: report.imageHost,
        attempts: report.attempts,
        finalFailure: report.finalFailure,
        surface: report.surface,
        source: report.source,
        online: report.online,
        effectiveType: report.effectiveType ?? null,
        userAgent: (report.userAgent || headerValue(req, "user-agent")).slice(
          0,
          CLIENT_IMAGE_ERROR_FIELD_LIMITS.userAgentMaxLength,
        ),
        country: headerValue(req, "x-vercel-ip-country").slice(0, 8) || null,
      }),
    );
    return res.status(202).json({ ok: true });
  };

export const handleClientImageError = createClientImageErrorHandler();
