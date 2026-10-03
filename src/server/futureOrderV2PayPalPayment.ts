import type { Firestore } from "firebase-admin/firestore";
import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import { parseFutureOrderMasterOrderV2 } from "../utils/futureOrderV2Storage.js";
import { parsePersistedFutureOrderV2 } from "../utils/futureOrderV2PersistenceContract.js";
import {
  getFutureOrderV2ProviderTransactionId,
  parseFutureOrderV2PaymentRecord,
  type FutureOrderV2PaymentRecord,
  type FutureOrderV2PaymentRecordV2,
} from "../utils/futureOrderV2PaymentRecord.js";
import {
  createAdminFutureOrderV2PaymentRecordStore,
  type FutureOrderV2PaymentRecordStore,
} from "./futureOrderV2PaymentRecord.js";

const MINIMUM_EUR_CENTS = 50;
const SAFE_ORDER_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PAYPAL_ORDER_ID = /^[A-Z0-9]{10,50}$/i;

interface VerifiedToken {
  readonly uid: string;
  readonly firebase?: { readonly sign_in_provider?: unknown };
}

type PayPalAdminServices = {
  auth: { verifyIdToken(token: string): Promise<VerifiedToken> };
  db: unknown;
};

export interface FutureOrderV2PayPalOrderSummary {
  readonly id: string;
  readonly status: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly customId: string;
  readonly invoiceId: string;
}

export interface FutureOrderV2PayPalPaymentDependencies {
  readClientId?: () => string;
  readClientSecret?: () => string;
  readEnv?: () => string;
  createPayPalOrder?: (input: {
    amountCents: number;
    orderId: string;
    paymentReference: string;
  }) => Promise<{ id: string }>;
  capturePayPalOrder?: (paypalOrderId: string) => Promise<FutureOrderV2PayPalOrderSummary>;
  getServices?: () => PayPalAdminServices;
  createStore?: (db: unknown) => FutureOrderV2PaymentRecordStore;
  now?: () => Date;
}

const setNoStore = (res: HttpResponse): HttpResponse => {
  res.setHeader("Cache-Control", "no-store");
  return res;
};

const sendError = (
  res: HttpResponse,
  status: number,
  code: string,
  message: string,
) => setNoStore(res).status(status).json({ error: message, code });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const getBearerToken = (req: HttpRequest): string | null => {
  const header = req.headers.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  return match?.[1] || null;
};

const readPayPalEnv = (dependencies: FutureOrderV2PayPalPaymentDependencies): string =>
  (dependencies.readEnv?.() ?? process.env.PAYPAL_ENV ?? "sandbox").trim().toLowerCase();

const readPayPalClientId = (dependencies: FutureOrderV2PayPalPaymentDependencies): string =>
  (dependencies.readClientId?.() ?? process.env.PAYPAL_CLIENT_ID ?? "").trim();

const readPayPalClientSecret = (
  dependencies: FutureOrderV2PayPalPaymentDependencies,
): string =>
  (dependencies.readClientSecret?.() ?? process.env.PAYPAL_CLIENT_SECRET ?? "").trim();

/** Sandbox-only for V2, matching Stripe test-key gating. */
export const isFutureOrderV2PayPalSandboxConfigured = (
  dependencies: FutureOrderV2PayPalPaymentDependencies = {},
): boolean => {
  const env = readPayPalEnv(dependencies);
  const clientId = readPayPalClientId(dependencies);
  const secret = readPayPalClientSecret(dependencies);
  return env === "sandbox" && Boolean(clientId) && Boolean(secret);
};

const paypalApiBase = (env: string): string =>
  env === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

const getPayPalAccessToken = async (
  dependencies: FutureOrderV2PayPalPaymentDependencies,
): Promise<string> => {
  const clientId = readPayPalClientId(dependencies);
  const secret = readPayPalClientSecret(dependencies);
  const env = readPayPalEnv(dependencies);
  if (env !== "sandbox") {
    throw new Error("PayPal live payments are not configured for Future Order V2.");
  }
  if (!clientId || !secret) {
    throw new Error("PayPal sandbox payments are not configured.");
  }
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 30_000) {
    return cachedAccessToken.token;
  }
  const response = await fetch(`${paypalApiBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const payload: unknown = await response.json();
  if (
    !response.ok ||
    !isRecord(payload) ||
    typeof payload.access_token !== "string"
  ) {
    throw new Error("PayPal could not issue an access token.");
  }
  const expiresIn =
    typeof payload.expires_in === "number" ? payload.expires_in : 300;
  cachedAccessToken = {
    token: payload.access_token,
    expiresAt: now + expiresIn * 1000,
  };
  return payload.access_token;
};

const eurosFromCents = (amountCents: number): string =>
  (amountCents / 100).toFixed(2);

const parsePayPalAmountCents = (value: unknown): number | null => {
  if (!isRecord(value) || typeof value.value !== "string") return null;
  const cents = Math.round(Number.parseFloat(value.value) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
};

export const createFutureOrderV2PayPalSandboxOrder = async (
  input: {
    amountCents: number;
    orderId: string;
    paymentReference: string;
  },
  dependencies: FutureOrderV2PayPalPaymentDependencies = {},
): Promise<{ id: string }> => {
  const env = readPayPalEnv(dependencies);
  const token = await getPayPalAccessToken(dependencies);
  const response = await fetch(`${paypalApiBase(env)}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": input.paymentReference,
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: input.orderId,
          invoice_id: input.paymentReference,
          amount: {
            currency_code: "EUR",
            value: eurosFromCents(input.amountCents),
          },
        },
      ],
      application_context: {
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        brand_name: "ODOGWU HERITAGE",
        locale: "nl-NL",
      },
    }),
  });
  const payload: unknown = await response.json();
  if (
    !response.ok ||
    !isRecord(payload) ||
    typeof payload.id !== "string" ||
    !PAYPAL_ORDER_ID.test(payload.id)
  ) {
    throw new Error("PayPal could not create this order.");
  }
  return { id: payload.id };
};

const readPurchaseUnitIds = (
  unit: Record<string, unknown>,
): { customId: string; invoiceId: string; amountCents: number; currency: string } => {
  const amount = isRecord(unit.amount) ? unit.amount : null;
  const amountCents = parsePayPalAmountCents(amount);
  const currency =
    amount && typeof amount.currency_code === "string"
      ? amount.currency_code.toLowerCase()
      : "";
  return {
    customId: typeof unit.custom_id === "string" ? unit.custom_id : "",
    invoiceId: typeof unit.invoice_id === "string" ? unit.invoice_id : "",
    amountCents: amountCents ?? -1,
    currency,
  };
};

export const captureFutureOrderV2PayPalSandboxOrder = async (
  paypalOrderId: string,
  dependencies: FutureOrderV2PayPalPaymentDependencies = {},
): Promise<FutureOrderV2PayPalOrderSummary> => {
  const env = readPayPalEnv(dependencies);
  const token = await getPayPalAccessToken(dependencies);
  const response = await fetch(
    `${paypalApiBase(env)}/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok || !isRecord(payload) || typeof payload.id !== "string") {
    throw new Error("PayPal could not capture this payment.");
  }
  const units = Array.isArray(payload.purchase_units) ? payload.purchase_units : [];
  const unit = units.find(isRecord) ?? null;
  if (!unit) {
    throw new Error("PayPal capture did not include a purchase unit.");
  }
  const parsed = readPurchaseUnitIds(unit);
  // Prefer capture amount when present.
  const captures =
    isRecord(unit.payments) && Array.isArray(unit.payments.captures)
      ? unit.payments.captures.filter(isRecord)
      : [];
  const captureAmount = captures[0] ? parsePayPalAmountCents(captures[0].amount) : null;
  const captureCurrency =
    captures[0] &&
    isRecord(captures[0].amount) &&
    typeof captures[0].amount.currency_code === "string"
      ? captures[0].amount.currency_code.toLowerCase()
      : parsed.currency;
  return {
    id: payload.id,
    status: typeof payload.status === "string" ? payload.status : "",
    amountCents: captureAmount ?? parsed.amountCents,
    currency: captureCurrency,
    customId: parsed.customId,
    invoiceId: parsed.invoiceId,
  };
};

export const handleFutureOrderV2PayPalConfig = (
  _req: HttpRequest,
  res: HttpResponse,
  dependencies: FutureOrderV2PayPalPaymentDependencies = {},
) => {
  if (!isFutureOrderV2PayPalSandboxConfigured(dependencies)) {
    return sendError(
      res,
      503,
      "PAYPAL_SANDBOX_REQUIRED",
      "PayPal sandbox payments are not configured.",
    );
  }
  return setNoStore(res).status(200).json({
    clientId: readPayPalClientId(dependencies),
    env: "sandbox",
    currency: "EUR",
    locale: "nl_NL",
    testMode: true,
  });
};

export const handleFutureOrderV2PayPalCreateOrder = async (
  req: HttpRequest,
  res: HttpResponse,
  dependencies: FutureOrderV2PayPalPaymentDependencies = {},
) => {
  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use POST for this payment.");
  }
  if (!isFutureOrderV2PayPalSandboxConfigured(dependencies)) {
    return sendError(
      res,
      503,
      "PAYPAL_SANDBOX_REQUIRED",
      "PayPal sandbox payments are not configured.",
    );
  }

  const body = isRecord(req.body) ? req.body : null;
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const paymentReference =
    typeof body?.paymentReference === "string" ? body.paymentReference : "";
  if (!orderId || paymentReference !== `future-v2-payment-${orderId}`) {
    return sendError(
      res,
      400,
      "INVALID_PAYMENT_REFERENCE",
      "This payment does not match the prepared order.",
    );
  }

  const parsed = parseFutureOrderMasterOrderV2(body?.masterOrder);
  if (parsed.status !== "valid" || parsed.value.orderId !== orderId) {
    return sendError(
      res,
      400,
      "INVALID_PREPARED_ORDER",
      "The prepared order could not be verified for payment.",
    );
  }
  const pricing = parsed.value.cartItem.candidate.pricing;
  const amountCents = pricing.exactTotalCents;
  if (
    pricing.status !== "exact" ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < MINIMUM_EUR_CENTS
  ) {
    return sendError(
      res,
      400,
      "INVALID_EXACT_TOTAL",
      "The reviewed total is not ready to charge.",
    );
  }

  const createPayPalOrder =
    dependencies.createPayPalOrder ??
    ((input: {
      amountCents: number;
      orderId: string;
      paymentReference: string;
    }) => createFutureOrderV2PayPalSandboxOrder(input, dependencies));

  try {
    const paypalOrder = await createPayPalOrder({
      amountCents,
      orderId,
      paymentReference,
    });
    return setNoStore(res).status(200).json({ paypalOrderId: paypalOrder.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PayPal error";
    console.warn("Future order V2 PayPal order could not be created:", message);
    return sendError(
      res,
      502,
      "PAYPAL_ORDER_FAILED",
      "PayPal could not start this payment. Retry this same order.",
    );
  }
};

export const saveVerifiedFutureOrderV2PayPalPayment = async ({
  store,
  orderId,
  paypalOrderId,
  capture,
  expectedOwnerUid,
  now,
}: {
  store: FutureOrderV2PaymentRecordStore;
  orderId: string;
  paypalOrderId: string;
  capture: FutureOrderV2PayPalOrderSummary;
  expectedOwnerUid: string;
  now: () => Date;
}): Promise<
  | { readonly status: "recorded" | "already_recorded"; readonly record: FutureOrderV2PaymentRecord }
  | {
      readonly status:
        | "conflict"
        | "order_not_found"
        | "owner_mismatch"
        | "not_payable"
        | "not_succeeded"
        | "mismatch";
    }
> => {
  const order = parsePersistedFutureOrderV2(await store.readOrder(orderId), orderId);
  if (order.status !== "valid") return { status: "order_not_found" };
  const ownerUid = order.value.ownerUid;
  if (ownerUid !== expectedOwnerUid) return { status: "owner_mismatch" };
  const pricing = order.value.masterOrder.cartItem.candidate.pricing;
  if (pricing.status !== "exact" || !Number.isSafeInteger(pricing.exactTotalCents)) {
    return { status: "not_payable" };
  }
  if (capture.status !== "COMPLETED") return { status: "not_succeeded" };
  if (
    capture.id !== paypalOrderId ||
    capture.customId !== orderId ||
    capture.invoiceId !== `future-v2-payment-${orderId}` ||
    capture.currency !== "eur" ||
    capture.amountCents !== pricing.exactTotalCents
  ) {
    return { status: "mismatch" };
  }

  const proposed: FutureOrderV2PaymentRecordV2 = {
    schemaVersion: 2,
    provider: "paypal",
    providerTransactionId: paypalOrderId,
    orderId,
    ownerUid,
    amountCents: capture.amountCents,
    currency: "eur",
    status: "succeeded",
    testMode: true,
    recordedAt: now().toISOString(),
  };

  return store.runTransaction(async (transaction) => {
    const existingValue = await transaction.getPayment(orderId);
    if (existingValue === null) {
      transaction.createPayment(orderId, proposed);
      return { status: "recorded" as const, record: proposed };
    }
    const existing = parseFutureOrderV2PaymentRecord(existingValue);
    if (
      existing &&
      getFutureOrderV2ProviderTransactionId(existing) === paypalOrderId &&
      existing.ownerUid === ownerUid
    ) {
      return { status: "already_recorded" as const, record: existing };
    }
    return { status: "conflict" as const };
  });
};

export const handleFutureOrderV2PayPalCapture = async (
  req: HttpRequest,
  res: HttpResponse,
  dependencies: FutureOrderV2PayPalPaymentDependencies = {},
) => {
  if (req.method !== "POST") {
    return sendError(res, 405, "METHOD_NOT_ALLOWED", "Use POST for this payment.");
  }
  if (!isFutureOrderV2PayPalSandboxConfigured(dependencies)) {
    return sendError(
      res,
      503,
      "PAYPAL_SANDBOX_REQUIRED",
      "PayPal sandbox payments are not configured.",
    );
  }

  const bearerToken = getBearerToken(req);
  if (!bearerToken) {
    return sendError(res, 401, "AUTH_REQUIRED", "Firebase authentication is required.");
  }

  const body = isRecord(req.body) ? req.body : null;
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const paypalOrderId =
    typeof body?.paypalOrderId === "string" ? body.paypalOrderId : "";
  if (!SAFE_ORDER_ID.test(orderId) || !PAYPAL_ORDER_ID.test(paypalOrderId)) {
    return sendError(
      res,
      400,
      "INVALID_PAYMENT_RECORD_REQUEST",
      "This payment does not match a prepared order.",
    );
  }

  const getServices =
    dependencies.getServices ||
    (getAdminServices as unknown as () => PayPalAdminServices);
  const createStore =
    dependencies.createStore ||
    ((db: unknown) => createAdminFutureOrderV2PaymentRecordStore(db as Firestore));
  const capturePayPalOrder =
    dependencies.capturePayPalOrder ??
    ((id: string) => captureFutureOrderV2PayPalSandboxOrder(id, dependencies));
  const now = dependencies.now || (() => new Date());

  let services: PayPalAdminServices;
  let token: VerifiedToken;
  try {
    services = getServices();
    token = await services.auth.verifyIdToken(bearerToken);
  } catch {
    return sendError(
      res,
      401,
      "AUTH_REQUIRED",
      "Firebase authentication could not be verified.",
    );
  }
  const signInProvider = token.firebase?.sign_in_provider;
  if (typeof signInProvider !== "string" || !signInProvider) {
    return sendError(
      res,
      401,
      "AUTH_REQUIRED",
      "Firebase authentication could not be verified.",
    );
  }
  if (signInProvider === "anonymous") {
    return sendError(
      res,
      403,
      "ANONYMOUS_NOT_ALLOWED",
      "Sign in with your account to record this payment.",
    );
  }

  let capture: FutureOrderV2PayPalOrderSummary;
  try {
    capture = await capturePayPalOrder(paypalOrderId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown PayPal error";
    console.warn("Future order V2 PayPal capture failed:", message);
    return sendError(
      res,
      502,
      "PAYPAL_CAPTURE_FAILED",
      "PayPal could not complete this payment. Retry this same order.",
    );
  }

  let outcome: Awaited<ReturnType<typeof saveVerifiedFutureOrderV2PayPalPayment>>;
  try {
    outcome = await saveVerifiedFutureOrderV2PayPalPayment({
      store: createStore(services.db),
      orderId,
      paypalOrderId,
      capture,
      expectedOwnerUid: token.uid,
      now,
    });
  } catch {
    return sendError(
      res,
      503,
      "PAYMENT_RECORD_UNAVAILABLE",
      "The payment could not be saved right now. Retry saving it.",
    );
  }

  switch (outcome.status) {
    case "order_not_found":
      return sendError(res, 404, "ORDER_NOT_FOUND", "This prepared order could not be found.");
    case "owner_mismatch":
      return sendError(res, 403, "OWNER_MISMATCH", "This order belongs to another account.");
    case "not_payable":
      return sendError(res, 409, "ORDER_NOT_PAYABLE", "This order does not have a confirmed total.");
    case "not_succeeded":
      return sendError(res, 409, "PAYMENT_NOT_SUCCEEDED", "PayPal has not completed this payment.");
    case "mismatch":
      return sendError(
        res,
        409,
        "PAYMENT_MISMATCH",
        "This payment does not match the prepared order.",
      );
    case "conflict":
      return sendError(
        res,
        409,
        "PAYMENT_ALREADY_RECORDED",
        "A different payment is already recorded for this order.",
      );
    case "recorded":
    case "already_recorded":
      return setNoStore(res).status(200).json({
        status: outcome.status === "already_recorded" ? "already_recorded" : "recorded",
        record: outcome.record,
      });
  }
};
