import type { HttpRequest, HttpResponse } from "../../src/server/httpTypes.js";
import {
  EMAIL_CODE_REQUEST_ROUTE,
  EMAIL_CODE_VERIFY_ROUTE,
  getAuthRoute,
  handleEmailCodeRequest,
  handleEmailCodeVerify,
  handlePinLogin,
} from "../../src/server/authHttp.js";

/**
 * PIN login. `/api/auth/email-code/request` and `/api/auth/email-code/verify`
 * are rewritten here by vercel.json because Vercel Hobby allows at most 12
 * functions.
 */
export default function handler(
  req: HttpRequest & { query?: unknown; url?: string },
  res: HttpResponse,
) {
  const route = getAuthRoute(req);
  if (route === EMAIL_CODE_REQUEST_ROUTE) return handleEmailCodeRequest(req, res);
  if (route === EMAIL_CODE_VERIFY_ROUTE) return handleEmailCodeVerify(req, res);
  return handlePinLogin(req, res);
}
