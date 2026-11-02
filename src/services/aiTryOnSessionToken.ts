import {
  createAiTryOnCredentials,
  deleteStoredAiTryOnPreviews,
  readAiTryOnIdToken,
  type AiTryOnCredentials,
} from "./aiTryOnGateway";

/**
 * Browser side of the Step 7 AI Try-on session.
 *
 * The SERVER issues the session. A signed-in customer's session is found
 * from their Firebase ID token, so nothing secret is kept here for them.
 * A guest keeps the server-issued token (`tts1_…`) in localStorage, per
 * draft identity, so a reload keeps the same order's tries and previews.
 * The token is not a browser-chosen key: the server only accepts tokens it
 * minted, and a guest who clears storage gets a new session only within the
 * server's per-IP limit for new guest sessions.
 *
 * When the dormant draft is cleared (order paid, or a fresh order started),
 * `retireAiTryOnSessions` asks the server to delete every stored preview and
 * close the session(s), so the next order gets a fresh one. Payment also
 * closes the signed-in session on the server, so this is a second line.
 */
export const AI_TRY_ON_SESSION_STORAGE_KEY = "odogwu.aiTryOn.sessions.v1";
/** Step 5/6 browser-chosen keys; no longer used, removed on retire. */
export const AI_TRY_ON_LEGACY_ORDER_KEY_STORAGE_KEY = "odogwu.aiTryOn.orderKeys.v1";
export const AI_TRY_ON_GUEST_IDENTITY_KEY = "guest";

type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const TOKEN_PATTERN = /^tts1_[A-Za-z0-9_-]{43}$/;

const defaultStore = (): KeyStore | null => {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

const readMap = (store: KeyStore): Record<string, string> => {
  try {
    const parsed = JSON.parse(store.getItem(AI_TRY_ON_SESSION_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const readAiTryOnSessionToken = (
  identityKey: string,
  store: KeyStore | null = defaultStore(),
): string | null => {
  if (!store) return null;
  const token = readMap(store)[identityKey];
  return typeof token === "string" && TOKEN_PATTERN.test(token) ? token : null;
};

/** Saves (or with null, forgets) the token the server issued for this identity. */
export const saveAiTryOnSessionToken = (
  identityKey: string,
  token: string | null,
  store: KeyStore | null = defaultStore(),
): void => {
  if (!store) return;
  try {
    const map = readMap(store);
    if (token && TOKEN_PATTERN.test(token)) map[identityKey] = token;
    else delete map[identityKey];
    store.setItem(AI_TRY_ON_SESSION_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full or blocked: the session still works for this page.
  }
};

/**
 * Credentials for the current draft identity. A signed-in customer also
 * sends the guest token (if any) once, so the server can move the guest
 * session's tries and previews into the account.
 */
export const aiTryOnCredentialsForIdentity = (
  identityKey: string,
  store: KeyStore | null = defaultStore(),
): AiTryOnCredentials => {
  const signedIn = identityKey.startsWith("authenticated:");
  const token =
    readAiTryOnSessionToken(identityKey, store) ??
    (signedIn ? readAiTryOnSessionToken(AI_TRY_ON_GUEST_IDENTITY_KEY, store) : null);
  return createAiTryOnCredentials(token, signedIn ? readAiTryOnIdToken : async () => null);
};

/**
 * Deletes the stored previews and closes the session(s) of the cleared
 * draft (keepalive, so it survives navigation), then forgets the tokens.
 * Best effort: the server-side payment cleanup and the 30-day expiry back
 * it up.
 */
export const retireAiTryOnSessions = (
  store: KeyStore | null = defaultStore(),
  closeSession: (credentials: AiTryOnCredentials) => unknown = (credentials) =>
    deleteStoredAiTryOnPreviews({ credentials, previewId: null, closeSession: true, keepalive: true }),
  getIdToken: () => Promise<string | null> = readAiTryOnIdToken,
): void => {
  const close = (credentials: AiTryOnCredentials) => {
    try {
      void Promise.resolve(closeSession(credentials)).catch(() => undefined);
    } catch {
      // Best effort.
    }
  };
  if (store) {
    Object.values(readMap(store))
      .filter((token): token is string => typeof token === "string" && TOKEN_PATTERN.test(token))
      .forEach((token) => close(createAiTryOnCredentials(token, async () => null)));
  }
  // The signed-in customer's account session (found from the ID token).
  close(createAiTryOnCredentials(null, getIdToken));
  if (!store) return;
  try {
    store.removeItem(AI_TRY_ON_SESSION_STORAGE_KEY);
    store.removeItem(AI_TRY_ON_LEGACY_ORDER_KEY_STORAGE_KEY);
  } catch {
    // Ignore blocked storage.
  }
};
