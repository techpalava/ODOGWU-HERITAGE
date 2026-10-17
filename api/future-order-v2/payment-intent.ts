import type { HttpRequest, HttpResponse } from "../../src/server/httpTypes.js";
import {
  handleFutureOrderV2StripeConfig,
  handleFutureOrderV2StripePayment,
} from "../../src/server/futureOrderV2StripePayment.js";
import {
  handleFutureOrderV2PersonalizedPriceDecision,
  isPersonalizedPriceDecisionRequest,
} from "../../src/server/futureOrderV2PersonalizedPriceDecision.js";

/**
 * GET → Stripe publishable config. POST → create PaymentIntent.
 * `/api/future-order-v2/personalized-price-decision` is rewritten here by
 * vercel.json (Hobby allows only 12 functions); it records accept/decline for a
 * priced personalized addition and never charges.
 */
export default async function handler(
  req: HttpRequest & { query?: unknown; url?: string },
  res: HttpResponse,
) {
  if (isPersonalizedPriceDecisionRequest(req)) {
    return handleFutureOrderV2PersonalizedPriceDecision(req, res);
  }
  if (req.method === "GET") {
    return handleFutureOrderV2StripeConfig(req, res);
  }
  return handleFutureOrderV2StripePayment(req, res);
}
