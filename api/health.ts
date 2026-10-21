import type { HttpRequest, HttpResponse } from "../src/server/httpTypes.js";
import { handleHealth } from "../src/server/appVersion.js";
import {
  handleClientImageError,
  isClientImageErrorRequest,
} from "../src/server/clientImageErrorLog.js";

/**
 * GET → health/build id. `/api/client-image-error` is rewritten here by
 * vercel.json (Hobby allows only 12 functions); it logs a Fabric photo load
 * failure reported by the browser and stores nothing.
 */
export default function handler(
  req: HttpRequest & { query?: unknown; url?: string },
  res: HttpResponse,
) {
  if (isClientImageErrorRequest(req)) {
    return handleClientImageError(req, res);
  }
  return handleHealth(req, res);
}
