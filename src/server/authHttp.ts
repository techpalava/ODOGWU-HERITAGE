import { getAdminServices } from "./firebaseAdmin";
import {
  bootstrapFirebaseCustomer,
  loginWithPin,
  registerWithPin,
} from "./customerAuth";
import type { HttpRequest, HttpResponse } from "./httpTypes";

function authErrorResponse(error: unknown) {
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
    case "INVALID_REGISTRATION":
      return {
        status: 400,
        message: "Enter a valid name, email address and 4-digit PIN.",
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

function sendAuthError(res: HttpResponse, error: unknown) {
  const mapped = authErrorResponse(error);
  setNoStore(res);
  return res.status(mapped.status).json({ error: mapped.message });
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
    const decodedToken = await adminAuth.verifyIdToken(bearer.slice(7));
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
    const result = await loginWithPin(
      adminDb,
      adminAuth,
      identifier,
      pin,
    );
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
