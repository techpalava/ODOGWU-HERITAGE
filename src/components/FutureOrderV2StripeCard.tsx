import { useEffect, useRef, useState } from "react";
import { loadStripe, type Stripe, type StripeCardElement } from "@stripe/stripe-js";
import {
  registerFutureOrderV2PaymentConfirmer,
  type FutureOrderV2PaymentMethod,
} from "../utils/futureOrderV2Payment";
import { describeFutureOrderV2CardError } from "../utils/futureOrderV2CardErrors";
import {
  buildFutureOrderV2StripeReturnUrl,
  stashFutureOrderV2StripeReturnContext,
  type FutureOrderV2StripeReturnSurface,
} from "../utils/futureOrderV2StripeReturn";

/**
 * Card via Stripe Element, or iDEAL bank redirect.
 * The test card is 4242 4242 4242 4242.
 */
export const FutureOrderV2StripeCard = ({
  disabled,
  orderId,
  returnSurface,
  onReadyChange,
  onMethodChange,
}: {
  disabled: boolean;
  orderId: string;
  returnSurface: FutureOrderV2StripeReturnSurface;
  onReadyChange: (ready: boolean) => void;
  onMethodChange?: (method: FutureOrderV2PaymentMethod) => void;
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<StripeCardElement | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const methodRef = useRef<FutureOrderV2PaymentMethod>("card");
  const orderIdRef = useRef(orderId);
  const returnSurfaceRef = useRef(returnSurface);
  const onReadyChangeRef = useRef(onReadyChange);
  const onMethodChangeRef = useRef(onMethodChange);
  onReadyChangeRef.current = onReadyChange;
  onMethodChangeRef.current = onMethodChange;
  orderIdRef.current = orderId;
  returnSurfaceRef.current = returnSurface;

  const [method, setMethod] = useState<FutureOrderV2PaymentMethod>("card");
  const [cardReady, setCardReady] = useState(false);
  const [idealReady, setIdealReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  methodRef.current = method;

  const reportReady = (
    nextMethod: FutureOrderV2PaymentMethod,
    nextCardReady: boolean,
    nextIdealReady: boolean,
  ) => {
    onReadyChangeRef.current(
      nextMethod === "ideal" ? nextIdealReady : nextCardReady,
    );
  };

  useEffect(() => {
    let cancelled = false;
    let card: StripeCardElement | null = null;
    setCardReady(false);
    setIdealReady(false);
    onReadyChangeRef.current(false);

    const mountCard = async () => {
      const response = await fetch("/api/future-order-v2/payment-intent");
      const payload: unknown = await response.json();
      if (!response.ok) {
        const error =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Stripe payments are not available.";
        throw new Error(error);
      }
      const publishableKey =
        payload &&
        typeof payload === "object" &&
        "publishableKey" in payload &&
        typeof payload.publishableKey === "string"
          ? payload.publishableKey
          : "";
      if (!publishableKey.startsWith("pk_test_")) {
        throw new Error("The Stripe test publishable key is not configured.");
      }
      const stripe = await loadStripe(publishableKey);
      if (!stripe || cancelled || !mountRef.current) {
        throw new Error("Stripe payments could not be loaded.");
      }
      stripeRef.current = stripe;
      const elements = stripe.elements();
      card = elements.create("card", { hidePostalCode: true });
      cardRef.current = card;
      card.mount(mountRef.current);
      card.on("ready", () => {
        if (cancelled) return;
        setTestMode(true);
        setCardReady(true);
        setIdealReady(true);
        reportReady(methodRef.current, true, true);
      });
      card.on("change", (event) => {
        if (!cancelled) setFieldError(event.error?.message ?? null);
      });

      registerFutureOrderV2PaymentConfirmer(async (clientSecret) => {
        const activeStripe = stripeRef.current;
        if (!activeStripe) {
          return {
            status: "failed",
            message: "Stripe payments could not be loaded.",
          };
        }

        if (methodRef.current === "ideal") {
          const activeOrderId = orderIdRef.current;
          if (!activeOrderId) {
            return {
              status: "failed",
              message: "Prepare the order before paying with iDEAL.",
            };
          }
          stashFutureOrderV2StripeReturnContext({
            orderId: activeOrderId,
            paymentReference: `future-v2-payment-${activeOrderId}`,
            surface: returnSurfaceRef.current,
          });
          const result = await activeStripe.confirmIdealPayment(
            clientSecret,
            {
              payment_method: { ideal: {} },
              return_url: buildFutureOrderV2StripeReturnUrl(activeOrderId),
            },
            { handleActions: false },
          );
          if (result.error) {
            return {
              status: "failed",
              message: describeFutureOrderV2CardError({
                code: result.error.code,
                declineCode: result.error.decline_code,
                message: result.error.message,
              }),
            };
          }
          const paymentIntent = result.paymentIntent;
          const paymentIntentId = paymentIntent?.id || "";
          if (paymentIntent?.status === "succeeded" && paymentIntentId.startsWith("pi_")) {
            return { status: "confirmed", paymentIntentId };
          }
          const redirectUrl =
            paymentIntent?.next_action?.type === "redirect_to_url"
              ? paymentIntent.next_action.redirect_to_url?.url
              : null;
          if (redirectUrl) {
            window.location.assign(redirectUrl);
            return { status: "redirecting" };
          }
          return {
            status: "failed",
            message: "Stripe did not return a bank redirect for iDEAL.",
          };
        }

        if (!cardRef.current) {
          return {
            status: "failed",
            message: "Stripe payments could not be loaded.",
          };
        }
        const result = await activeStripe.confirmCardPayment(clientSecret, {
          payment_method: { card: cardRef.current },
        });
        const paymentIntent =
          result.paymentIntent ?? result.error?.payment_intent ?? null;
        const paymentIntentId = paymentIntent?.id || "";
        if (paymentIntent?.status === "succeeded" && paymentIntentId.startsWith("pi_")) {
          return { status: "confirmed", paymentIntentId };
        }
        if (result.error) {
          return {
            status: "failed",
            message: describeFutureOrderV2CardError({
              code: result.error.code,
              declineCode: result.error.decline_code,
              message: result.error.message,
            }),
          };
        }
        if (!paymentIntentId.startsWith("pi_")) {
          return {
            status: "failed",
            message: "Stripe did not return a payment reference.",
          };
        }
        return {
          status: "failed",
          message:
            paymentIntent?.status === "processing"
              ? "The card payment is still processing. Retry this same order in a moment."
              : "The card payment was not completed. Retry this same order.",
        };
      });
    };

    mountCard().catch((error: unknown) => {
      if (cancelled) return;
      setMessage(
        error instanceof Error
          ? error.message
          : "Stripe payments are not available.",
      );
      setCardReady(false);
      setIdealReady(false);
      onReadyChangeRef.current(false);
    });

    return () => {
      cancelled = true;
      registerFutureOrderV2PaymentConfirmer(null);
      card?.destroy();
      cardRef.current = null;
      stripeRef.current = null;
    };
  }, []);

  useEffect(() => {
    cardRef.current?.update({ disabled: disabled || method !== "card" });
  }, [disabled, method]);

  useEffect(() => {
    reportReady(method, cardReady, idealReady);
  }, [method, cardReady, idealReady]);

  const selectMethod = (next: FutureOrderV2PaymentMethod) => {
    setMethod(next);
    onMethodChangeRef.current?.(next);
    reportReady(next, cardReady, idealReady);
  };

  return (
    <div className="mt-4 max-w-md space-y-3">
      <div
        className="grid grid-cols-2 gap-2"
        role="radiogroup"
        aria-label="Payment method"
        data-future-order-v2-payment-methods
      >
        <button
          type="button"
          role="radio"
          aria-checked={method === "card"}
          data-future-order-v2-method-card
          disabled={disabled}
          onClick={() => selectMethod("card")}
          className={`rounded-xl border-2 px-3 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
            method === "card"
              ? "border-heritage-gold bg-heritage-gold/15 text-white"
              : "border-white/25 bg-white/5 text-white/70 hover:border-white/40"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          Card
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={method === "ideal"}
          data-future-order-v2-method-ideal
          disabled={disabled}
          onClick={() => selectMethod("ideal")}
          className={`rounded-xl border-2 px-3 py-2.5 text-xs font-bold uppercase tracking-wider transition ${
            method === "ideal"
              ? "border-heritage-gold bg-heritage-gold/15 text-white"
              : "border-white/25 bg-white/5 text-white/70 hover:border-white/40"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          iDEAL
        </button>
      </div>

      <div className={method === "card" ? "block" : "hidden"}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/70">
          Card
        </p>
        <div
          ref={mountRef}
          data-future-order-v2-card
          className="min-h-11 rounded-xl border border-white/30 bg-white px-3 py-3"
        />
        {fieldError && (
          <p
            data-future-order-v2-card-field-error
            className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-red-700"
          >
            {fieldError}
          </p>
        )}
        {testMode && (
          <p className="mt-2 text-xs leading-relaxed text-white/75">
            Test card 4242 4242 4242 4242. Use any future expiry and any CVC.
          </p>
        )}
      </div>

      <div className={method === "ideal" ? "block" : "hidden"}>
        <p
          data-future-order-v2-ideal-help
          className="text-xs leading-relaxed text-white/75"
        >
          Pay with iDEAL. You will be redirected to your Dutch bank to authorize
          this payment, then returned here.
        </p>
      </div>

      {message && (
        <p role="alert" className="text-xs leading-relaxed text-heritage-gold">
          {message}
        </p>
      )}
    </div>
  );
};
