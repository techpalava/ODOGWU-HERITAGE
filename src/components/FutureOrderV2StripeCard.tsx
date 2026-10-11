import { useEffect, useRef, useState } from "react";
import {
  loadStripe,
  type Stripe,
  type StripeCardElement,
  type StripeElements,
  type StripeExpressCheckoutElementConfirmEvent,
} from "@stripe/stripe-js";
import {
  registerFutureOrderV2PaymentConfirmer,
  type FutureOrderV2PaymentConfirmContext,
  type FutureOrderV2PaymentConfirmation,
  type FutureOrderV2PaymentMethod,
} from "../utils/futureOrderV2Payment";
import { describeFutureOrderV2CardError } from "../utils/futureOrderV2CardErrors";
import {
  buildFutureOrderV2StripeReturnUrl,
  stashFutureOrderV2StripeReturnContext,
  type FutureOrderV2StripeReturnSurface,
} from "../utils/futureOrderV2StripeReturn";

/** Matches the server minimum. This sizes the wallet sheet only; the charge is the persisted total. */
const EXPRESS_CHECKOUT_MINIMUM_CENTS = 50;

export const isFutureOrderV2ExpressCheckoutAmount = (
  amountCents: number | null | undefined,
): amountCents is number =>
  typeof amountCents === "number" &&
  Number.isSafeInteger(amountCents) &&
  amountCents >= EXPRESS_CHECKOUT_MINIMUM_CENTS;

export const isFutureOrderV2ExpressWalletAvailable = (
  paymentMethods:
    | { readonly applePay?: boolean; readonly googlePay?: boolean }
    | null
    | undefined,
): boolean => Boolean(paymentMethods?.applePay || paymentMethods?.googlePay);

const walletFlagsFromChange = (
  paymentMethods:
    | {
        readonly applePay?: { readonly available?: boolean };
        readonly googlePay?: { readonly available?: boolean };
      }
    | undefined,
): { applePay: boolean; googlePay: boolean } | undefined => {
  if (!paymentMethods) return undefined;
  return {
    applePay: paymentMethods.applePay?.available === true,
    googlePay: paymentMethods.googlePay?.available === true,
  };
};

/**
 * Card via Stripe Element, iDEAL bank redirect, or Apple Pay / Google Pay.
 * Wallets use a separate Express Checkout Element and confirm as card.
 * The test card is 4242 4242 4242 4242.
 */
export const FutureOrderV2StripeCard = ({
  disabled,
  orderId,
  returnSurface,
  amountCents = null,
  onExpressCheckoutConfirm,
  onReadyChange,
  onMethodChange,
}: {
  disabled: boolean;
  orderId: string;
  returnSurface: FutureOrderV2StripeReturnSurface;
  /** Reviewed total shown in the wallet sheet. The PaymentIntent amount stays server-side. */
  amountCents?: number | null;
  /**
   * Existing pay action. It calls authorizeFutureOrderV2Payment; the registered
   * confirmer then runs stripe.confirmPayment for the Express Checkout Element.
   */
  onExpressCheckoutConfirm?: () => void | Promise<void>;
  onReadyChange: (ready: boolean) => void;
  onMethodChange?: (method: FutureOrderV2PaymentMethod) => void;
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const expressMountRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<StripeCardElement | null>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const expressElementsRef = useRef<StripeElements | null>(null);
  const expressConfirmingRef = useRef(false);
  const expressConfirmEventRef = useRef<StripeExpressCheckoutElementConfirmEvent | null>(
    null,
  );
  const expressConfirmOutcomeRef = useRef<
    "idle" | "confirmed" | "failed" | "redirecting"
  >("idle");
  const methodRef = useRef<FutureOrderV2PaymentMethod>("card");
  const orderIdRef = useRef(orderId);
  const returnSurfaceRef = useRef(returnSurface);
  const onReadyChangeRef = useRef(onReadyChange);
  const onMethodChangeRef = useRef(onMethodChange);
  const onExpressCheckoutConfirmRef = useRef(onExpressCheckoutConfirm);
  const amountCentsRef = useRef(amountCents);
  const disabledRef = useRef(disabled);
  onReadyChangeRef.current = onReadyChange;
  onMethodChangeRef.current = onMethodChange;
  onExpressCheckoutConfirmRef.current = onExpressCheckoutConfirm;
  amountCentsRef.current = amountCents;
  disabledRef.current = disabled;
  orderIdRef.current = orderId;
  returnSurfaceRef.current = returnSurface;

  const [method, setMethod] = useState<FutureOrderV2PaymentMethod>("card");
  const [cardReady, setCardReady] = useState(false);
  const [idealReady, setIdealReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [stripeClient, setStripeClient] = useState<Stripe | null>(null);
  const [expressCheckoutResolved, setExpressCheckoutResolved] = useState(false);
  const [expressCheckoutVisible, setExpressCheckoutVisible] = useState(false);

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

    const failExpressCheckout = (
      confirmation: Extract<FutureOrderV2PaymentConfirmation, { status: "failed" }>,
    ): FutureOrderV2PaymentConfirmation => {
      expressConfirmOutcomeRef.current = "failed";
      expressConfirmEventRef.current?.paymentFailed({
        message: confirmation.message,
      });
      return confirmation;
    };

    const confirmExpressCheckout = async (
      clientSecret: string,
      context: FutureOrderV2PaymentConfirmContext,
    ): Promise<FutureOrderV2PaymentConfirmation> => {
      const activeStripe = stripeRef.current;
      const elements = expressElementsRef.current;
      const activeOrderId = context.orderId || orderIdRef.current;
      if (!activeStripe || !elements || !activeOrderId) {
        return failExpressCheckout({
          status: "failed",
          message: "Apple Pay and Google Pay could not be confirmed.",
        });
      }
      stashFutureOrderV2StripeReturnContext({
        orderId: activeOrderId,
        paymentReference: `future-v2-payment-${activeOrderId}`,
        surface: returnSurfaceRef.current,
      });
      const result = await activeStripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: buildFutureOrderV2StripeReturnUrl(activeOrderId),
        },
        redirect: "if_required",
      });
      const paymentIntent =
        result.paymentIntent ?? result.error?.payment_intent ?? null;
      const paymentIntentId = paymentIntent?.id || "";
      if (paymentIntent?.status === "succeeded" && paymentIntentId.startsWith("pi_")) {
        expressConfirmOutcomeRef.current = "confirmed";
        return { status: "confirmed", paymentIntentId };
      }
      if (result.error) {
        return failExpressCheckout({
          status: "failed",
          message: describeFutureOrderV2CardError({
            code: result.error.code,
            declineCode: result.error.decline_code,
            message: result.error.message,
          }),
        });
      }
      const redirectUrl =
        paymentIntent?.next_action?.type === "redirect_to_url"
          ? paymentIntent.next_action.redirect_to_url?.url
          : null;
      if (redirectUrl) {
        expressConfirmOutcomeRef.current = "redirecting";
        window.location.assign(redirectUrl);
        return { status: "redirecting" };
      }
      return failExpressCheckout({
        status: "failed",
        message:
          paymentIntent?.status === "processing"
            ? "The payment is still processing. Retry this same order in a moment."
            : "The payment was not completed. Retry this same order.",
      });
    };

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

      registerFutureOrderV2PaymentConfirmer(async (clientSecret, context) => {
        if (expressConfirmingRef.current) {
          return confirmExpressCheckout(clientSecret, context);
        }

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
          const idealResult = await activeStripe.confirmIdealPayment(
            clientSecret,
            {
              payment_method: { ideal: {} },
              return_url: buildFutureOrderV2StripeReturnUrl(activeOrderId),
            },
            { handleActions: false },
          );
          if (idealResult.error) {
            return {
              status: "failed",
              message: describeFutureOrderV2CardError({
                code: idealResult.error.code,
                declineCode: idealResult.error.decline_code,
                message: idealResult.error.message,
              }),
            };
          }
          const paymentIntent = idealResult.paymentIntent;
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
        const cardResult = await activeStripe.confirmCardPayment(clientSecret, {
          payment_method: { card: cardRef.current },
        });
        const paymentIntent =
          cardResult.paymentIntent ?? cardResult.error?.payment_intent ?? null;
        const paymentIntentId = paymentIntent?.id || "";
        if (paymentIntent?.status === "succeeded" && paymentIntentId.startsWith("pi_")) {
          return { status: "confirmed", paymentIntentId };
        }
        if (cardResult.error) {
          return {
            status: "failed",
            message: describeFutureOrderV2CardError({
              code: cardResult.error.code,
              declineCode: cardResult.error.decline_code,
              message: cardResult.error.message,
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
      if (!cancelled) setStripeClient(stripe);
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
    const stripe = stripeClient;
    const mount = expressMountRef.current;
    if (!stripe || !mount) return;
    if (
      !isFutureOrderV2ExpressCheckoutAmount(amountCents) ||
      !onExpressCheckoutConfirmRef.current
    ) {
      setExpressCheckoutResolved(true);
      setExpressCheckoutVisible(false);
      return;
    }

    let cancelled = false;
    setExpressCheckoutResolved(false);
    setExpressCheckoutVisible(false);
    const elements = stripe.elements({
      mode: "payment",
      amount: amountCents,
      currency: "eur",
      allowedPaymentMethodTypes: ["card", "ideal"],
    });
    const expressCheckout = elements.create("expressCheckout", {
      paymentMethods: {
        applePay: "auto",
        googlePay: "auto",
        link: "never",
        paypal: "never",
        amazonPay: "never",
        klarna: "never",
      },
    });
    expressElementsRef.current = elements;
    expressCheckout.mount(mount);

    const applyAvailability = (
      flags: { applePay?: boolean; googlePay?: boolean } | undefined,
    ) => {
      if (cancelled) return;
      setExpressCheckoutResolved(true);
      setExpressCheckoutVisible(isFutureOrderV2ExpressWalletAvailable(flags));
    };
    expressCheckout.on("ready", (event) => {
      applyAvailability(event.availablePaymentMethods);
    });
    expressCheckout.on("availablepaymentmethodschange", (event) => {
      applyAvailability(walletFlagsFromChange(event.paymentMethods));
    });
    expressCheckout.on("click", (event) => {
      if (
        disabledRef.current ||
        expressConfirmingRef.current ||
        !onExpressCheckoutConfirmRef.current ||
        !isFutureOrderV2ExpressCheckoutAmount(amountCentsRef.current)
      ) {
        event.reject();
        return;
      }
      event.resolve();
    });
    expressCheckout.on("confirm", (event) => {
      const confirmPay = onExpressCheckoutConfirmRef.current;
      const activeElements = expressElementsRef.current;
      if (
        !confirmPay ||
        !activeElements ||
        disabledRef.current ||
        expressConfirmingRef.current
      ) {
        event.paymentFailed({
          message: "Apple Pay and Google Pay could not be confirmed.",
        });
        return;
      }
      expressConfirmingRef.current = true;
      expressConfirmEventRef.current = event;
      expressConfirmOutcomeRef.current = "idle";
      void (async () => {
        try {
          const { error: submitError } = await activeElements.submit();
          if (submitError) {
            const submitMessage = describeFutureOrderV2CardError({
              code: submitError.code,
              declineCode: submitError.decline_code,
              message: submitError.message,
            });
            event.paymentFailed({ message: submitMessage });
            if (!cancelled) setMessage(submitMessage);
            return;
          }
          await confirmPay();
          if (expressConfirmOutcomeRef.current === "idle") {
            event.paymentFailed({
              message: "The payment could not be confirmed. Retry this same order.",
            });
          }
        } catch {
          event.paymentFailed({
            message: "The payment could not be confirmed. Retry this same order.",
          });
          if (!cancelled) {
            setMessage("The payment could not be confirmed. Retry this same order.");
          }
        } finally {
          expressConfirmingRef.current = false;
          expressConfirmEventRef.current = null;
          expressConfirmOutcomeRef.current = "idle";
        }
      })();
    });

    return () => {
      cancelled = true;
      expressCheckout.destroy();
      if (expressElementsRef.current === elements) {
        expressElementsRef.current = null;
      }
    };
  }, [stripeClient, amountCents]);

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
        data-future-order-v2-express-checkout={
          expressCheckoutVisible ? "available" : "hidden"
        }
        hidden={expressCheckoutResolved && !expressCheckoutVisible}
        aria-hidden={expressCheckoutVisible ? undefined : true}
        className={expressCheckoutVisible ? undefined : "invisible"}
      >
        <div ref={expressMountRef} />
      </div>

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
