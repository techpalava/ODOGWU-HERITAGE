import { waitUntil } from "@vercel/functions";

/**
 * Keeps post-payment work that outlived its bounded await alive after the
 * HTTP response, so Vercel does not freeze it half-way (M1 deep check).
 *
 * The payment routes still await the copy, cleanup and email for their
 * normal budget; this only covers the rare tail that runs past it. Outside
 * Vercel (local server, tests) there is no request context and this is a
 * no-op. Never throws, and the promise's rejection is swallowed.
 */
export type KeepAliveAfterResponse = (work: Promise<unknown>) => void;

export const keepAliveAfterResponse: KeepAliveAfterResponse = (work) => {
  try {
    waitUntil(work.catch(() => undefined));
  } catch {
    // No Vercel request context: nothing to extend.
  }
};
