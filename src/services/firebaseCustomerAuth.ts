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

async function requestAuth(
  path: string,
  body?: Record<string, unknown>,
  idToken?: string,
): Promise<AuthResponse> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(body || {}),
  });
  const payload = (await response.json()) as AuthResponse;
  if (!response.ok) {
    const error = new Error(payload.error || "Authentication failed.");
    (error as Error & { code?: string }).code = payload.error;
    throw error;
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
