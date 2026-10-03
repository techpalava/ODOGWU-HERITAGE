import type { HttpRequest, HttpResponse } from "../../src/server/httpTypes.js";
import {
  handleFutureOrderV2PayPalCapture,
  handleFutureOrderV2PayPalConfig,
  handleFutureOrderV2PayPalCreateOrder,
} from "../../src/server/futureOrderV2PayPalPayment.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * Single Hobby-safe serverless entry for PayPal config, create-order, and capture.
 * GET → config. POST body.action "create-order" | "capture".
 */
export default async function handler(req: HttpRequest, res: HttpResponse) {
  if (req.method === "GET") {
    return handleFutureOrderV2PayPalConfig(req, res);
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({
      error: "Use GET or POST for PayPal payments.",
      code: "METHOD_NOT_ALLOWED",
    });
  }
  const body = isRecord(req.body) ? req.body : null;
  const action = typeof body?.action === "string" ? body.action : "";
  if (action === "capture" || typeof body?.paypalOrderId === "string") {
    return handleFutureOrderV2PayPalCapture(req, res);
  }
  return handleFutureOrderV2PayPalCreateOrder(req, res);
}
