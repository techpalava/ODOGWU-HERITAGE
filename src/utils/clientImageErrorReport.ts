import {
  CLIENT_IMAGE_ERROR_CONNECTION_TYPES,
  CLIENT_IMAGE_ERROR_ENDPOINT,
  CLIENT_IMAGE_ERROR_FABRIC_CODE_PATTERN,
  CLIENT_IMAGE_ERROR_FIELD_LIMITS,
  type ClientImageErrorConnectionType,
  type ClientImageErrorReport,
  type ClientImageErrorSource,
  type ClientImageErrorSurface,
} from "./clientImageErrorSchema.js";

/** Share of first failures that are also reported (final failures are always reported). */
export const CLIENT_IMAGE_FIRST_FAILURE_SAMPLE_RATE = 0.1;

const SESSION_STORAGE_KEY = "odogwu.clientImageErrorsReported.v1";
const MAX_REMEMBERED_KEYS = 200;

export interface ClientImageErrorEvent {
  kind: "first" | "final";
  fabricCode: string;
  imageUrl: string;
  attempts: number;
  surface: ClientImageErrorSurface;
  source: ClientImageErrorSource;
}

type NavigatorLike = {
  userAgent?: string;
  onLine?: boolean;
  connection?: { effectiveType?: string } | null;
  sendBeacon?: (url: string, data?: BodyInit | null) => boolean;
};

export interface ClientImageErrorReporterDeps {
  navigator?: NavigatorLike | null;
  fetch?: typeof fetch | null;
  random?: () => number;
  sessionStorage?: Pick<Storage, "getItem" | "setItem"> | null;
  /** False outside a browser page (tests, SSR): nothing is sent. */
  hasPage?: boolean;
}

const rememberedKeys = new Set<string>();

const readDefaultDeps = (): Required<ClientImageErrorReporterDeps> => {
  const hasWindow = typeof window !== "undefined" && Boolean(window.location);
  let storage: Pick<Storage, "getItem" | "setItem"> | null = null;
  try {
    storage = hasWindow ? window.sessionStorage : null;
  } catch {
    storage = null;
  }
  return {
    navigator: typeof navigator !== "undefined" ? (navigator as NavigatorLike) : null,
    fetch: typeof fetch === "function" ? fetch : null,
    random: Math.random,
    sessionStorage: storage,
    hasPage: hasWindow,
  };
};

const imageKey = (event: ClientImageErrorEvent) =>
  `${event.kind}|${event.surface}|${event.fabricCode}|${event.imageUrl.split("?")[0]}`;

const alreadyReported = (
  key: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
): boolean => {
  if (rememberedKeys.has(key)) return true;
  if (!storage) return false;
  try {
    const stored = JSON.parse(storage.getItem(SESSION_STORAGE_KEY) || "[]");
    return Array.isArray(stored) && stored.includes(key);
  } catch {
    return false;
  }
};

const remember = (key: string, storage: Pick<Storage, "getItem" | "setItem"> | null) => {
  rememberedKeys.add(key);
  if (!storage) return;
  try {
    const stored = JSON.parse(storage.getItem(SESSION_STORAGE_KEY) || "[]");
    const keys = Array.isArray(stored) ? stored.filter((value) => typeof value === "string") : [];
    if (!keys.includes(key)) keys.push(key);
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(keys.slice(-MAX_REMEMBERED_KEYS)));
  } catch {
    // Storage full or blocked: the in-memory set still dedupes this page.
  }
};

const hostOf = (url: string): string => {
  try {
    const base = typeof window !== "undefined" && window.location ? window.location.href : undefined;
    return new URL(url, base).host.slice(0, CLIENT_IMAGE_ERROR_FIELD_LIMITS.imageHostMaxLength);
  } catch {
    return "";
  }
};

const readConnectionType = (nav: NavigatorLike | null): ClientImageErrorConnectionType | null => {
  const value = nav?.connection?.effectiveType;
  return (CLIENT_IMAGE_ERROR_CONNECTION_TYPES as readonly string[]).includes(value ?? "")
    ? (value as ClientImageErrorConnectionType)
    : null;
};

/** Builds the request body, or null when the event cannot be described safely. */
export const buildClientImageErrorReport = (
  event: ClientImageErrorEvent,
  nav: NavigatorLike | null,
): ClientImageErrorReport | null => {
  const fabricCode = event.fabricCode.trim();
  if (!CLIENT_IMAGE_ERROR_FABRIC_CODE_PATTERN.test(fabricCode)) return null;
  const imageHost = hostOf(event.imageUrl);
  if (!imageHost) return null;
  return {
    fabricCode,
    imageHost,
    attempts: Math.max(
      1,
      Math.min(CLIENT_IMAGE_ERROR_FIELD_LIMITS.maxAttempts, Math.floor(event.attempts)),
    ),
    finalFailure: event.kind === "final",
    surface: event.surface,
    source: event.source,
    online: nav?.onLine !== false,
    effectiveType: readConnectionType(nav),
    userAgent: (nav?.userAgent || "").slice(0, CLIENT_IMAGE_ERROR_FIELD_LIMITS.userAgentMaxLength),
  };
};

/**
 * Sends one image-failure event. Final failures are sent once per image per
 * session; first failures are sampled and also sent at most once. Uses
 * `navigator.sendBeacon` (survives page unload) and falls back to
 * `fetch(..., { keepalive: true })`. Never throws. Returns true when a request
 * was handed to the browser.
 */
export const reportClientImageError = (
  event: ClientImageErrorEvent,
  deps: ClientImageErrorReporterDeps = {},
): boolean => {
  try {
    const defaults = readDefaultDeps();
    const nav = deps.navigator !== undefined ? deps.navigator : defaults.navigator;
    const doFetch = deps.fetch !== undefined ? deps.fetch : defaults.fetch;
    const random = deps.random ?? defaults.random;
    const storage = deps.sessionStorage !== undefined ? deps.sessionStorage : defaults.sessionStorage;
    const hasPage = deps.hasPage ?? defaults.hasPage;
    if (!hasPage) return false;

    const key = imageKey(event);
    if (alreadyReported(key, storage)) return false;
    if (event.kind === "first" && random() >= CLIENT_IMAGE_FIRST_FAILURE_SAMPLE_RATE) {
      // Not sampled: remember so the same image does not get another roll this session.
      remember(key, storage);
      return false;
    }
    const report = buildClientImageErrorReport(event, nav);
    if (!report) return false;
    remember(key, storage);

    // text/plain keeps sendBeacon a "simple" request in every browser.
    const body = JSON.stringify(report);
    if (typeof nav?.sendBeacon === "function") {
      try {
        if (nav.sendBeacon(CLIENT_IMAGE_ERROR_ENDPOINT, body)) return true;
      } catch {
        // fall through to fetch
      }
    }
    if (typeof doFetch === "function") {
      void doFetch(CLIENT_IMAGE_ERROR_ENDPOINT, {
        method: "POST",
        body,
        keepalive: true,
        credentials: "same-origin",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
      }).catch(() => undefined);
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

/** Test hook: forget which images were already reported in this page. */
export const resetClientImageErrorReportsForTests = (): void => {
  rememberedKeys.clear();
};
