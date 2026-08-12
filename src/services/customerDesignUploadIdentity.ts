import { signInAnonymously, type Auth, type User } from "firebase/auth";
import { auth } from "./firebase";

type UploadIdentityUser = Pick<User, "uid" | "isAnonymous">;

export interface CustomerUploadAuthClient {
  currentUser: UploadIdentityUser | null;
}

export interface CustomerUploadIdentity {
  uid: string;
  isAnonymous: boolean;
}

export type CustomerUploadIdentityErrorCode =
  | "ANONYMOUS_AUTH_UNAVAILABLE"
  | "ANONYMOUS_AUTH_FAILED";

export class CustomerUploadIdentityError extends Error {
  readonly code: CustomerUploadIdentityErrorCode;

  constructor(code: CustomerUploadIdentityErrorCode, message: string) {
    super(message);
    this.name = "CustomerUploadIdentityError";
    this.code = code;
  }
}

export type AnonymousSignIn = (
  authClient: CustomerUploadAuthClient,
) => Promise<{ user: UploadIdentityUser }>;

const pendingAnonymousSignIns = new WeakMap<
  object,
  Promise<CustomerUploadIdentity>
>();

const defaultAnonymousSignIn: AnonymousSignIn = async (authClient) =>
  signInAnonymously(authClient as Auth);

const toIdentity = (user: UploadIdentityUser): CustomerUploadIdentity => ({
  uid: user.uid,
  isAnonymous: user.isAnonymous,
});

const toIdentityError = (error: unknown): CustomerUploadIdentityError => {
  const firebaseCode =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";

  if (
    firebaseCode === "auth/operation-not-allowed" ||
    firebaseCode === "auth/admin-restricted-operation"
  ) {
    return new CustomerUploadIdentityError(
      "ANONYMOUS_AUTH_UNAVAILABLE",
      "Guest uploads are unavailable because anonymous authentication is not enabled.",
    );
  }

  return new CustomerUploadIdentityError(
    "ANONYMOUS_AUTH_FAILED",
    "A secure guest upload identity could not be created. Please try again.",
  );
};

/**
 * Lazily resolves the Firebase Auth identity used only for future private
 * customer-design uploads. It intentionally does not create an app customer.
 */
export const ensureCustomerUploadIdentity = async (
  authClient: CustomerUploadAuthClient = auth,
  signIn: AnonymousSignIn = defaultAnonymousSignIn,
): Promise<CustomerUploadIdentity> => {
  const existingUser = authClient.currentUser;
  if (existingUser) return toIdentity(existingUser);

  const pending = pendingAnonymousSignIns.get(authClient as object);
  if (pending) return pending;

  const request = signIn(authClient)
    .then(({ user }) => {
      if (!user?.uid) {
        throw new CustomerUploadIdentityError(
          "ANONYMOUS_AUTH_FAILED",
          "A secure guest upload identity could not be created. Please try again.",
        );
      }
      return toIdentity(user);
    })
    .catch((error: unknown) => {
      if (error instanceof CustomerUploadIdentityError) throw error;
      throw toIdentityError(error);
    })
    .finally(() => {
      pendingAnonymousSignIns.delete(authClient as object);
    });

  pendingAnonymousSignIns.set(authClient as object, request);
  return request;
};
