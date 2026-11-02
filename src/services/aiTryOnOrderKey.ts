import { deleteStoredAiTryOnPreviews } from "./aiTryOnGateway";
/**
 * Browser-held key for the per-order AI Try-on limit (5 tries per order)
 * and owner key for the order's stored previews (Step 6).
 *
 * One random key per draft identity (guest or signed-in user), kept in
 * localStorage so a reload does not reset the order's tries. It is cleared
 * with the dormant draft (after an order is paid or the draft is discarded),
 * so the next order starts with its own 5 tries. The server stores only a
 * hash of this key. It is not bound to the account or a server draft yet;
 * see the Step 5 PR notes.
 */
export const AI_TRY_ON_ORDER_KEY_STORAGE_KEY = "odogwu.aiTryOn.orderKeys.v1";

type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const defaultStore = (): KeyStore | null => {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

const ORDER_KEY_PATTERN = /^tryon-[0-9a-f]{32}$/;

const randomHex = (bytes: number) => {
  const values = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("");
};

export const createAiTryOnOrderKey = (): string => `tryon-${randomHex(16)}`;

const readMap = (store: KeyStore): Record<string, string> => {
  try {
    const parsed = JSON.parse(store.getItem(AI_TRY_ON_ORDER_KEY_STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/** Same key for the same identity until cleared; falls back to an in-memory key. */
export const getOrCreateAiTryOnOrderKey = (
  identityKey: string,
  store: KeyStore | null = defaultStore(),
): string => {
  if (!store) return createAiTryOnOrderKey();
  const map = readMap(store);
  const existing = map[identityKey];
  if (typeof existing === "string" && ORDER_KEY_PATTERN.test(existing)) return existing;
  const created = createAiTryOnOrderKey();
  try {
    store.setItem(
      AI_TRY_ON_ORDER_KEY_STORAGE_KEY,
      JSON.stringify({ ...map, [identityKey]: created }),
    );
  } catch {
    // Storage full or blocked: the key still works for this page.
  }
  return created;
};

/**
 * Clears the keys when the dormant draft is cleared (order placed, or the
 * draft discarded). First asks the server to delete every stored preview of
 * those orders ("until you place your order"); the request uses keepalive
 * so it survives navigation. If it fails, the 30-day expiry still applies.
 */
export const clearAiTryOnOrderKeys = (
  store: KeyStore | null = defaultStore(),
  deletePreviews: (orderKey: string) => unknown = (orderKey) =>
    deleteStoredAiTryOnPreviews({ orderKey, previewId: null, keepalive: true }),
): void => {
  if (!store) return;
  try {
    Object.values(readMap(store))
      .filter((key) => typeof key === "string" && ORDER_KEY_PATTERN.test(key))
      .forEach((orderKey) => {
        try {
          void deletePreviews(orderKey);
        } catch {
          // Best effort; the 30-day expiry is the backstop.
        }
      });
  } catch {
    // Ignore unreadable storage.
  }
  try {
    store.removeItem(AI_TRY_ON_ORDER_KEY_STORAGE_KEY);
  } catch {
    // Ignore blocked storage.
  }
};
