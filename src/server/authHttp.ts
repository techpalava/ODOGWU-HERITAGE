import { getAdminServices } from "./firebaseAdmin.js";
import {
  bootstrapFirebaseCustomer,
  completeEmailCodeSignIn,
  loginWithPin,
  registerWithPin,
} from "./customerAuth.js";
import {
  issueEmailCode,
  isValidEmailCode,
  verifyEmailCode,
} from "./authEmailCode.js";
import { requireAuthEmailConfig, sendLoginCodeEmail } from "./brevoEmail.js";
import { createBrevoDailyUsage } from "./brevoDailyCounter.js";
import { isAllowedAdminEmail } from "./adminAllowlist.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import {
  AUTH_RATE_LIMITS,
  AuthRateLimitError,
  consumeAuthRateLimit,
  getClientIp,
} from "./authRateLimit.js";
import { getCanonicalEmail } from "../security/authIdentity.js";

export function authErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  switch (message) {
    case "INVALID_CREDENTIALS":
      return {
        status: 401,
        message: "Incorrect identifier or security PIN.",
      };
    case "PIN_LOCKED":
      return {
        status: 429,
        message:
          "Too many incorrect PIN attempts. Try again in 15 minutes.",
      };
    case "ADMIN_GOOGLE_REQUIRED":
      return {
        status: 403,
        message: "Administrator accounts must sign in with Google.",
      };
    case "ACCOUNT_EXISTS":
      return {
        status: 409,
        message: "An account with this email address already exists.",
      };
    case "EMAIL_ALREADY_REGISTERED":
      return {
        status: 409,
        message:
          "This email is already registered. Sign in with Google or your existing PIN.",
      };
    case "RATE_LIMITED":
      return {
        status: 429,
        message:
          "Too many attempts. Please wait a few minutes and try again.",
      };
    case "INVALID_EMAIL":
      return { status: 400, message: "Enter a valid email address." };
    case "INVALID_CODE":
      return {
        status: 401,
        message:
          "That code is incorrect or has expired. Check your latest email or request a new code.",
      };
    case "CODE_ATTEMPTS_EXCEEDED":
      return {
        status: 429,
        message: "Too many incorrect codes. Request a new code.",
      };
    case "PIN_EMAIL_CONFIRMATION_REQUIRED":
      return {
        status: 403,
        message:
          "For your security, we've emailed you a 6-digit code. Enter it to confirm it's you. Your PIN keeps working afterwards.",
      };
    case "EMAIL_NOT_CONFIGURED":
      return {
        status: 503,
        message:
          "Email codes aren't available right now. Please continue with Google.",
      };
    case "EMAIL_SEND_FAILED":
      return {
        status: 503,
        message:
          "We couldn't send the email. Please try again in a minute or continue with Google.",
      };
    case "INVALID_REGISTRATION":
      return {
        status: 400,
        message: "Enter a valid name, email address and 6-digit PIN.",
      };
    default:
      console.error("Firebase customer authentication failed:", error);
      return {
        status: 503,
        message:
          "Secure authentication is temporarily unavailable. Please try again.",
      };
  }
}

function setNoStore(res: HttpResponse) {
  res.setHeader("Cache-Control", "no-store");
  return res;
}

function getRequestHeader(req: HttpRequest, name: string) {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/** Codes the login screen reacts to; other errors keep the plain body. */
const CLIENT_VISIBLE_AUTH_CODES = new Set([
  "RATE_LIMITED",
  "INVALID_EMAIL",
  "INVALID_CODE",
  "CODE_ATTEMPTS_EXCEEDED",
  "PIN_EMAIL_CONFIRMATION_REQUIRED",
  "EMAIL_NOT_CONFIGURED",
  "EMAIL_SEND_FAILED",
]);

function sendAuthError(res: HttpResponse, error: unknown) {
  const mapped = authErrorResponse(error);
  setNoStore(res);
  if (error instanceof AuthRateLimitError) {
    res.setHeader("Retry-After", String(error.retryAfterSeconds));
  }
  const code = error instanceof Error ? error.message : "";
  return res.status(mapped.status).json(
    CLIENT_VISIBLE_AUTH_CODES.has(code)
      ? { error: mapped.message, code }
      : { error: mapped.message },
  );
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim() : "";
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new Error("INVALID_EMAIL");
  }
  return email;
}

function readBody(req: HttpRequest): Record<string, unknown> {
  return req.body && typeof req.body === "object"
    ? (req.body as Record<string, unknown>)
    : {};
}

export const EMAIL_CODE_REQUEST_ROUTE = "email-code-request";
export const EMAIL_CODE_VERIFY_ROUTE = "email-code-verify";

/**
 * `/api/auth/email-code/*` is rewritten onto the pin-login function by
 * vercel.json (Hobby allows only 12 functions). Read `?route=` from the
 * parsed query or the raw URL.
 */
export function getAuthRoute(
  req: HttpRequest & { query?: unknown; url?: string },
): string | null {
  const query =
    req.query && typeof req.query === "object"
      ? (req.query as Record<string, unknown>)
      : null;
  const raw = Array.isArray(query?.route) ? query?.route[0] : query?.route;
  if (typeof raw === "string") return raw;
  if (typeof req.url !== "string") return null;
  const path = req.url.split("?")[0] ?? "";
  if (path.endsWith("/email-code/request")) return EMAIL_CODE_REQUEST_ROUTE;
  if (path.endsWith("/email-code/verify")) return EMAIL_CODE_VERIFY_ROUTE;
  const match = /[?&]route=([^&]+)/.exec(req.url);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function handleEmailCodeRequest(
  req: HttpRequest,
  res: HttpResponse,
) {
  if (!requirePost(req, res)) return;
  try {
    const body = readBody(req);
    const email = readEmail(body.email);
    const canonicalEmail = getCanonicalEmail(email);
    const name = typeof body.name === "string" ? body.name : undefined;
    const { db: adminDb } = getAdminServices();
    await consumeAuthRateLimit(
      adminDb,
      AUTH_RATE_LIMITS.emailCodeRequestPerIp,
      getClientIp(req),
    );
    await consumeAuthRateLimit(
      adminDb,
      AUTH_RATE_LIMITS.emailCodeRequestPerEmail,
      canonicalEmail,
    );
    if (isAllowedAdminEmail(canonicalEmail)) {
      throw new Error("ADMIN_GOOGLE_REQUIRED");
    }
    requireAuthEmailConfig();
    // Same response whether or not an account exists for this address.
    const result = await issueEmailCode(adminDb, canonicalEmail, {
      purpose: "sign-in",
      name,
      send: (code) =>
        sendLoginCodeEmail(email, code, "sign-in", {
          brevoUsage: createBrevoDailyUsage(adminDb),
        }),
    });
    setNoStore(res);
    return res.json({
      ok: true,
      expiresInSeconds: result.expiresInSeconds,
      resendAfterSeconds: result.resendAfterSeconds,
    });
  } catch (error) {
    return sendAuthError(res, error);
  }
}

export async function handleEmailCodeVerify(
  req: HttpRequest,
  res: HttpResponse,
) {
  if (!requirePost(req, res)) return;
  try {
    const body = readBody(req);
    const email = readEmail(body.email);
    const canonicalEmail = getCanonicalEmail(email);
    if (!isValidEmailCode(body.code)) throw new Error("INVALID_CODE");
    const { auth: adminAuth, db: adminDb } = getAdminServices();
    await consumeAuthRateLimit(
      adminDb,
      AUTH_RATE_LIMITS.emailCodeVerifyPerIp,
      getClientIp(req),
    );
    await consumeAuthRateLimit(
      adminDb,
      AUTH_RATE_LIMITS.emailCodeVerifyPerEmail,
      canonicalEmail,
    );
    const verified = await verifyEmailCode(adminDb, canonicalEmail, body.code, {
      purpose: "sign-in",
    });
    const result = await completeEmailCodeSignIn(adminDb, adminAuth, {
      email,
      name: verified.name,
    });
    setNoStore(res);
    return res.json(result);
  } catch (error) {
    return sendAuthError(res, error);
  }
}

function requirePost(req: HttpRequest, res: HttpResponse): boolean {
  if (req.method === "POST") return true;
  res.setHeader("Allow", "POST");
  setNoStore(res);
  res.status(405).json({ error: "Method not allowed." });
  return false;
}

export async function handleAuthBootstrap(
  req: HttpRequest,
  res: HttpResponse,
) {
  if (!requirePost(req, res)) return;

  try {
    const bearer = getRequestHeader(req, "authorization");
    if (!bearer?.startsWith("Bearer ")) {
      setNoStore(res);
      return res
        .status(401)
        .json({ error: "Firebase login is required." });
    }

    const { auth: adminAuth, db: adminDb } = getAdminServices();
    await consumeAuthRateLimit(
      adminDb,
      AUTH_RATE_LIMITS.bootstrapPerIp,
      getClientIp(req),
    );
    const decodedToken = await adminAuth.verifyIdToken(bearer.slice(7));
    await consumeAuthRateLimit(
      adminDb,
      AUTH_RATE_LIMITS.bootstrapPerUser,
      decodedToken.uid,
    );
    const result = await bootstrapFirebaseCustomer(
      adminDb,
      adminAuth,
      decodedToken,
    );
    setNoStore(res);
    return res.json(result);
  } catch (error) {
    return sendAuthError(res, error);
  }
}

export async function handlePinLogin(req: HttpRequest, res: HttpResponse) {
  if (!requirePost(req, res)) return;

  try {
    const body =
      req.body && typeof req.body === "object"
        ? (req.body as Record<string, unknown>)
        : {};
    const { identifier, pin } = body;
    if (typeof identifier !== "string" || typeof pin !== "string") {
      setNoStore(res);
      return res
        .status(400)
        .json({ error: "Identifier and PIN are required." });
    }

    const { auth: adminAuth, db: adminDb } = getAdminServices();
    await consumeAuthRateLimit(
      adminDb,
      AUTH_RATE_LIMITS.pinLoginPerIp,
      getClientIp(req),
    );
    await consumeAuthRateLimit(
      adminDb,
      AUTH_RATE_LIMITS.pinLoginPerIdentifier,
      identifier.includes("@")
        ? getCanonicalEmail(identifier)
        : identifier.trim(),
    );
    const emailCode =
      typeof body.emailCode === "string" ? body.emailCode : undefined;
    const result = await loginWithPin(adminDb, adminAuth, identifier, pin, {
      emailCode,
      sendConfirmationCode: async (canonicalEmail) => {
        requireAuthEmailConfig();
        await issueEmailCode(adminDb, canonicalEmail, {
          purpose: "pin-confirmation",
          send: (code) =>
            sendLoginCodeEmail(canonicalEmail, code, "pin-confirmation", {
              brevoUsage: createBrevoDailyUsage(adminDb),
            }),
        });
      },
      verifyConfirmationCode: async (canonicalEmail, code) => {
        await verifyEmailCode(adminDb, canonicalEmail, code, {
          purpose: "pin-confirmation",
        });
      },
    });
    setNoStore(res);
    return res.json(result);
  } catch (error) {
    return sendAuthError(res, error);
  }
}

export async function handlePinRegister(
  req: HttpRequest,
  res: HttpResponse,
) {
  if (!requirePost(req, res)) return;

  try {
    const body =
      req.body && typeof req.body === "object"
        ? (req.body as Record<string, unknown>)
        : {};
    const { name, email, pin } = body;
    const { auth: adminAuth, db: adminDb } = getAdminServices();
    await consumeAuthRateLimit(
      adminDb,
      AUTH_RATE_LIMITS.pinRegisterPerIp,
      getClientIp(req),
    );
    if (typeof email === "string" && email.trim()) {
      await consumeAuthRateLimit(
        adminDb,
        AUTH_RATE_LIMITS.pinRegisterPerEmail,
        getCanonicalEmail(email),
      );
    }
    const result = await registerWithPin(adminDb, adminAuth, {
      name: typeof name === "string" ? name : "",
      email: typeof email === "string" ? email : "",
      pin: typeof pin === "string" ? pin : "",
    });
    setNoStore(res);
    return res.status(201).json(result);
  } catch (error) {
    return sendAuthError(res, error);
  }
}
