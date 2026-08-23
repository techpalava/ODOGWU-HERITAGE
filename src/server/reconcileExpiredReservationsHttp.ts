/**
 * HTTP wrapper for expired reservation reconciliation.
 *
 * Vercel cron: POST /api/orders/reconcile-expired-reservations every 5–15 min
 * with `x-reservation-reconcile-secret: $RESERVATION_RECONCILE_SECRET`.
 */
import { getAdminServices } from "./firebaseAdmin.js";
import type { HttpRequest, HttpResponse } from "./httpTypes.js";
import { reconcileExpiredReservations } from "./reconcileExpiredReservations.js";
import { timingSafeEqualString } from "../utils/timingSafeEqualString.js";
import Stripe from "stripe";

type ReconcileAdminServices = {
  auth: {
    verifyIdToken(token: string): Promise<{
      uid: string;
      firebase?: { sign_in_provider?: string };
      admin?: boolean;
    }>;
  };
  db: Parameters<typeof reconcileExpiredReservations>[0]["db"];
};

export interface ReconcileExpiredReservationsHttpDependencies {
  getServices?: () => ReconcileAdminServices;
  getStripe?: () => Stripe | null;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
}

const getHeader = (req: HttpRequest, name: string): string | undefined => {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
};

const setNoStore = (res: HttpResponse): HttpResponse => {
  res.setHeader("Cache-Control", "no-store");
  return res;
};

const resolveStripe = (
  getStripe: (() => Stripe | null) | undefined,
  env: NodeJS.ProcessEnv,
): Stripe | null => {
  if (getStripe) return getStripe();
  const key = env.STRIPE_SECRET_KEY;
  if (!key || key.trim() === "" || key === "MY_STRIPE_SECRET_KEY") {
    return null;
  }
  return new Stripe(key);
};

const authorizeReconcile = async (
  req: HttpRequest,
  services: ReconcileAdminServices,
  env: NodeJS.ProcessEnv,
): Promise<boolean> => {
  const reconcileSecret = env.RESERVATION_RECONCILE_SECRET?.trim();
  const providedSecret = getHeader(req, "x-reservation-reconcile-secret");
  if (
    reconcileSecret &&
    timingSafeEqualString(providedSecret, reconcileSecret)
  ) {
    return true;
  }

  const authorization = getHeader(req, "authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }
  try {
    const token = await services.auth.verifyIdToken(authorization.slice(7));
    return Boolean(token.admin === true);
  } catch {
    return false;
  }
};

export const createReconcileExpiredReservationsHandler = (
  dependencies: ReconcileExpiredReservationsHttpDependencies = {},
) => {
  const getServices = dependencies.getServices || getAdminServices;
  const now = dependencies.now || (() => new Date());
  const env = dependencies.env || process.env;

  return async (req: HttpRequest, res: HttpResponse) => {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return setNoStore(res).status(405).json({ error: "Method not allowed." });
    }

    const services = getServices();
    const authorized = await authorizeReconcile(req, services, env);
    if (!authorized) {
      return setNoStore(res).status(401).json({
        error: "Reservation reconcile authorization failed.",
        code: "AUTH_REQUIRED",
      });
    }

    try {
      const stripe = resolveStripe(dependencies.getStripe, env);
      const result = await reconcileExpiredReservations({
        db: services.db,
        stripe,
        now,
      });
      return setNoStore(res).status(200).json(result);
    } catch (error) {
      console.error("reconcile-expired-reservations failed", error);
      return setNoStore(res).status(503).json({
        error: "Reservation reconcile is temporarily unavailable.",
        code: "SERVER_ERROR",
      });
    }
  };
};

export const handleReconcileExpiredReservations =
  createReconcileExpiredReservationsHandler();
