import type { HttpRequest, HttpResponse } from "../../src/server/httpTypes.js";
import { handleUploadedDesignDraftTransfer } from "../../src/server/uploadedDesignDraftTransferHttp.js";
import { handleAiTryOn, isAiTryOnRequest } from "../../src/server/aiTryOnHttp.js";

/**
 * POST → transfer an uploaded design draft. `/api/ai-try-on` is rewritten
 * here by vercel.json (Hobby allows only 12 functions); it runs the
 * server-side Gemini AI Try-on and stays unavailable until
 * AI_TRY_ON_ENABLED and GEMINI_API_KEY are set.
 */
export default function handler(
  req: HttpRequest & { query?: unknown; url?: string },
  res: HttpResponse,
) {
  if (isAiTryOnRequest(req)) return handleAiTryOn(req, res);
  return handleUploadedDesignDraftTransfer(req, res);
}
