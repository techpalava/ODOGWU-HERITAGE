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
  created?: boolean;
  ok?: boolean;
  expiresInSeconds?: number;
  resendAfterSeconds?: number;
  error?: string;
  code?: string;
};

export type EmailCodeRequestResult = {
  expiresInSeconds: number;
  resendAfterSeconds: number;
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
      payload.code || payload.error,
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
    emailCode?: string,
  ): Promise<Customer> {
    const result = await requestAuth("/api/auth/pin-login", {
      identifier,
      pin,
      ...(emailCode ? { emailCode } : {}),
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

  /** Emails a one-time 6-digit code. Same answer whether or not an account exists. */
  async requestEmailCode(
    email: string,
    name?: string,
  ): Promise<EmailCodeRequestResult> {
    const result = await requestAuth("/api/auth/email-code/request", {
      email,
      ...(name ? { name } : {}),
    });
    return {
      expiresInSeconds: result.expiresInSeconds ?? 600,
      resendAfterSeconds: result.resendAfterSeconds ?? 60,
    };
  },

  /** Signs in (or creates the account) with a one-time email code. */
  async signInWithEmailCode(
    email: string,
    code: string,
  ): Promise<{ customer: Customer; created: boolean }> {
    const result = await requestAuth("/api/auth/email-code/verify", {
      email,
      code,
    });
    if (!result.customToken) {
      throw new Error("The authentication server returned no token.");
    }
    await signInWithCustomToken(auth, result.customToken);
    return { customer: result.customer, created: result.created === true };
  },
};
