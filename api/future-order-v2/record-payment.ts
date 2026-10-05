import type { IncomingMessage } from "node:http";
import type { HttpRequest, HttpResponse } from "../../src/server/httpTypes.js";
import {
  handleFutureOrderV2PaymentRecord,
  httpRequestFromRawBody,
  readRawHttpBody,
} from "../../src/server/futureOrderV2PaymentRecord.js";

/**
 * Stripe signs the raw request bytes. Leave them unread until
 * `constructEvent`. The Bearer browser path parses this same buffer as JSON.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

const isUnreadNodeRequest = (req: HttpRequest | IncomingMessage): req is IncomingMessage =>
  typeof (req as IncomingMessage).pipe === "function" &&
  (req as HttpRequest).rawBody === undefined;

const sendJson = (res: HttpResponse, status: number, body: Record<string, unknown>) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
};

export default async function handler(
  req: HttpRequest & Partial<IncomingMessage>,
  res: HttpResponse,
) {
  if (!isUnreadNodeRequest(req)) {
    return handleFutureOrderV2PaymentRecord(req, res);
  }
  let rawBody: Buffer;
  try {
    rawBody = await readRawHttpBody(req);
  } catch (error) {
    if (error instanceof Error && error.message === "RECORD_PAYMENT_BODY_TOO_LARGE") {
      return sendJson(res, 413, {
        error: "Request body is too large.",
        code: "PAYLOAD_TOO_LARGE",
      });
    }
    return sendJson(res, 400, {
      error: "Stripe webhook signature could not be verified.",
      code: "INVALID_STRIPE_SIGNATURE",
    });
  }
  return handleFutureOrderV2PaymentRecord(
    httpRequestFromRawBody({
      method: req.method,
      headers: req.headers,
      rawBody,
    }),
    res,
  );
}
