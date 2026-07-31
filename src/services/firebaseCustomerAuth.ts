import {
  signInWithCustomToken,
  type User,
} from "firebase/auth";
import type { Customer } from "../types";
import { auth } from "./firebase";

type AuthResponse = {
  customer: Customer;
  customToken?: string;
  admin?: boolean;
  error?: string;
};

const AUTH_SERVER_UNAVAILABLE_MESSAGE =
  "Authentication server is temporarily unavailable. Please try again.";

function createAuthError(message: string, code?: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  return error;
}

async function parseAuthResponse(response: Response): Promise<AuthResponse> {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("application/json")) {
    throw createAuthError(
      AUTH_SERVER_UNAVAILABLE_MESSAGE,
      "AUTH_SERVER_UNAVAILABLE",
    );
  }

  let payload: AuthResponse;
  try {
    payload = (await response.json()) as AuthResponse;
  } catch {
    throw createAuthError(
      AUTH_SERVER_UNAVAILABLE_MESSAGE,
      "AUTH_SERVER_UNAVAILABLE",
    );
  }

  if (!payload || typeof payload !== "object") {
    throw createAuthError(
      AUTH_SERVER_UNAVAILABLE_MESSAGE,
      "AUTH_SERVER_UNAVAILABLE",
    );
  }

  return payload;
}

async function requestAuth(
  path: string,
  body?: Record<string, unknown>,
  idToken?: string,
): Promise<AuthResponse> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify(body || {}),
    });
  } catch {
    throw createAuthError(
      AUTH_SERVER_UNAVAILABLE_MESSAGE,
      "AUTH_SERVER_UNAVAILABLE",
    );
  }

  const payload = await parseAuthResponse(response);
  if (!response.ok) {
    throw createAuthError(
      payload.error || "Authentication failed.",
      payload.error,
    );
  }
  return payload;
}

export const FirebaseCustomerAuth = {
  async bootstrap(user: User): Promise<Customer> {
    const result = await requestAuth(
      "/api/auth/bootstrap",
      undefined,
      await user.getIdToken(),
    );
    await user.getIdToken(true);
    return result.customer;
  },

  async signInWithPin(
    identifier: string,
    pin: string,
  ): Promise<Customer> {
    const result = await requestAuth("/api/auth/pin-login", {
      identifier,
      pin,
    });
    if (!result.customToken) {
      throw new Error("The authentication server returned no token.");
    }
    await signInWithCustomToken(auth, result.customToken);
    return result.customer;
  },

  async registerWithPin(input: {
    name: string;
    email: string;
    pin: string;
  }): Promise<Customer> {
    const result = await requestAuth("/api/auth/pin-register", input);
    if (!result.customToken) {
      throw new Error("The authentication server returned no token.");
    }
    await signInWithCustomToken(auth, result.customToken);
    return result.customer;
  },
};
