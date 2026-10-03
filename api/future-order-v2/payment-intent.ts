import type { HttpRequest, HttpResponse } from "../../src/server/httpTypes.js";
import {
  handleFutureOrderV2StripeConfig,
  handleFutureOrderV2StripePayment,
} from "../../src/server/futureOrderV2StripePayment.js";

/** GET → Stripe publishable config. POST → create PaymentIntent. */
export default async function handler(req: HttpRequest, res: HttpResponse) {
  if (req.method === "GET") {
    return handleFutureOrderV2StripeConfig(req, res);
  }
  return handleFutureOrderV2StripePayment(req, res);
}
