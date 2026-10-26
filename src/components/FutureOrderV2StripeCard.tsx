import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  loadStripe,
  type Stripe,
  type StripeCardElement,
  type StripeElements,
  type StripeExpressCheckoutElementConfirmEvent,
} from "@stripe/stripe-js";
import {
  registerFutureOrderV2PaymentConfirmer,
  registerFutureOrderV2PaymentMethodReader,
  readFutureOrderV2JsonBody,
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
import {
  resolveFutureOrderV2StripeShipping,
  toFutureOrderV2KlarnaBillingDetails,
} from "../utils/futureOrderV2StripeShipping";
import {
  FUTURE_ORDER_V2_STRIPE_METHOD_ORDER,
  FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES,
  type FutureOrderV2StripeAccountMethod,
} from "../utils/futureOrderV2StripeMethods";
import {
  clearFutureOrderV2PixPending,
  FUTURE_ORDER_V2_PIX_EBANX_TERMS_URL,
  FUTURE_ORDER_V2_PIX_IOF_DISCLOSURE,
  FUTURE_ORDER_V2_PIX_PENDING_EVENT,
  FUTURE_ORDER_V2_PIX_PENDING_MESSAGE,
  isFutureOrderV2PixAvailable,
  readFutureOrderV2PixPending,
  type FutureOrderV2PixPending,
} from "../utils/futureOrderV2Pix";
import type { FutureShippingStateV1 } from "../types";
import {
  FutureOrderV2AllowedCardIcons,
  FutureOrderV2MethodIcon,
} from "./futureOrderV2PaymentMethodIcons";

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

/**
 * Card Pay waits for the Card Element. iDEAL and Klarna confirm through
 * stripe.confirmIdealPayment / confirmKlarnaPayment and only need Stripe.js.
 * Pix redirects to hosted Checkout and only needs the loaded test config.
 */
export const isFutureOrderV2StripePayReady = ({
  method,
  cardReady,
  stripeClientReady,
}: {
  method: FutureOrderV2PaymentMethod;
  cardReady: boolean;
  stripeClientReady: boolean;
}): boolean =>
  method === "ideal" || method === "klarna" || method === "pix"
    ? stripeClientReady
    : cardReady;

export const FUTURE_ORDER_V2_CARD_LOADING_MESSAGE = "Loading secure card form…";

/** Explains a disabled Pay while the Stripe Card Element has not fired ready. */
export const shouldShowFutureOrderV2CardLoading = ({
  method,
  cardReady,
  loadFailed,
}: {
  method: FutureOrderV2PaymentMethod;
  cardReady: boolean;
  loadFailed: boolean;
}): boolean => method === "card" && !cardReady && !loadFailed;

/** Hidden wallet chrome must not intercept the method pills or Pay. */
export const futureOrderV2ExpressCheckoutShell = (walletsShown: boolean) =>
  walletsShown
    ? {
        "data-future-order-v2-express-checkout": "available" as const,
        hidden: false,
        "aria-hidden": undefined,
        className: undefined as string | undefined,
      }
    : {
        "data-future-order-v2-express-checkout": "hidden" as const,
        hidden: true,
        "aria-hidden": true as const,
        className: "pointer-events-none",
      };

/**
 * Reads the wallet flags from Stripe's availablepaymentmethodschange event.
 * That event also fires on first render, so it alone decides whether the
 * wallet box shows. The deprecated ready payload is not used.
 */
export const futureOrderV2ExpressWalletsFromChange = (
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

const isStripeAccountMethod = (
  value: unknown,
): value is FutureOrderV2StripeAccountMethod =>
  value === "card" || value === "ideal" || value === "klarna";

/** Methods the checkout may show. EUR omits Klarna; an explicit list can include it. */
export const futureOrderV2VisibleStripeMethods = (
  offered: readonly string[] | null | undefined = FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES,
): readonly FutureOrderV2StripeAccountMethod[] => {
  const source =
    offered && offered.length > 0 ? offered : FUTURE_ORDER_V2_STRIPE_PAYMENT_METHOD_TYPES;
  return FUTURE_ORDER_V2_STRIPE_METHOD_ORDER.filter((method) => source.includes(method));
};

/**
 * Pill sizing for the method row. The row is flex-wrap, and each pill is at
 * least as wide as its own icon + label, so a narrow column moves a pill to a
 * new line instead of squeezing a label ("iDEAL") onto two lines. Four pills
 * keep the old 2x2 layout below `sm` and share one row from `sm` when they fit.
 */
const stripeMethodPillBasisClass = (count: number): string =>
  count >= 4 ? "grow basis-[calc(50%-0.25rem)] sm:basis-0" : "grow basis-0";

/**
 * Card via Stripe Element, iDEAL or Klarna redirect, or Apple Pay / Google Pay.
 * Wallets use a separate Express Checkout Element and confirm as card.
 * Klarna is a radio only when this currency offers it, and is never on that element.
 * The test card is 4242 4242 4242 4242.
 */
export const FutureOrderV2StripeCard = ({
  disabled,
  orderId,
  returnSurface,
  amountCents = null,
  shippingState = null,
  offeredPaymentMethodTypes,
  onExpressCheckoutConfirm,
  onReadyChange,
  onMethodChange,
}: {
  disabled: boolean;
  orderId: string;
  returnSurface: FutureOrderV2StripeReturnSurface;
  /** Reviewed total shown in the wallet sheet. The PaymentIntent amount stays server-side. */
  amountCents?: number | null;
  /** Persisted Step 9 shipping. Klarna confirm reads it; the charge amount does not. */
  shippingState?: FutureShippingStateV1 | null;
  /** Overrides the euro method list. Klarna stays hidden unless this includes it. */
  offeredPaymentMethodTypes?: readonly string[];
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
  const shippingStateRef = useRef(shippingState);
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
  shippingStateRef.current = shippingState;

  const [method, setMethod] = useState<FutureOrderV2PaymentMethod>("card");
  const [cardReady, setCardReady] = useState(false);
  const [cardLoadFailed, setCardLoadFailed] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [stripeClient, setStripeClient] = useState<Stripe | null>(null);
  const [expressCheckoutVisible, setExpressCheckoutVisible] = useState(false);
  const [configPaymentMethodTypes, setConfigPaymentMethodTypes] = useState<
    readonly string[] | null
  >(null);

  methodRef.current = method;
  const visibleMethods = futureOrderV2VisibleStripeMethods(
    offeredPaymentMethodTypes ?? configPaymentMethodTypes,
  );
  // Pix is a hosted Checkout option, not a PaymentIntent method. It shows only
  // for orders delivered to Brazil within the Pix amount range.
  const pixAvailable = isFutureOrderV2PixAvailable({ shippingState, amountCents });
  const methodPillCount = visibleMethods.length + (pixAvailable ? 1 : 0);
  const [pixPending, setPixPending] = useState<FutureOrderV2PixPending | null>(() =>
    orderId ? readFutureOrderV2PixPending(orderId) : null,
  );
  const [pixChecking, setPixChecking] = useState(false);
  const [pixStatusMessage, setPixStatusMessage] = useState<string | null>(null);

  const reportReady = (
    nextMethod: FutureOrderV2PaymentMethod,
    nextCardReady: boolean,
    nextStripeClientReady: boolean,
  ) => {
    onReadyChangeRef.current(
      isFutureOrderV2StripePayReady({
        method: nextMethod,
        cardReady: nextCardReady,
        stripeClientReady: nextStripeClientReady,
      }),
    );
  };

  useEffect(() => {
    let cancelled = false;
    let card: StripeCardElement | null = null;
    setCardReady(false);
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
      const payload = await readFutureOrderV2JsonBody(response);
      if (!response.ok || payload == null) {
        const error =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Stripe payments are not available right now. Retry this same order.";
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
      if (
        !offeredPaymentMethodTypes &&
        payload &&
        typeof payload === "object" &&
        "paymentMethodTypes" in payload &&
        Array.isArray(payload.paymentMethodTypes)
      ) {
        const methods = payload.paymentMethodTypes.filter(isStripeAccountMethod);
        if (!cancelled && methods.length > 0) setConfigPaymentMethodTypes(methods);
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
        reportReady(methodRef.current, true, stripeRef.current !== null);
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

        if (methodRef.current === "klarna") {
          if (!context.paymentMethodTypes.includes("klarna")) {
            return {
              status: "failed",
              message: "Klarna is not available for this payment.",
            };
          }
          const activeOrderId = orderIdRef.current;
          const shipping = resolveFutureOrderV2StripeShipping(
            shippingStateRef.current,
          );
          if (!activeOrderId || !shipping) {
            return {
              status: "failed",
              message: "Prepare the order before paying with Klarna.",
            };
          }
          stashFutureOrderV2StripeReturnContext({
            orderId: activeOrderId,
            paymentReference: `future-v2-payment-${activeOrderId}`,
            surface: returnSurfaceRef.current,
          });
          const klarnaResult = await activeStripe.confirmKlarnaPayment(
            clientSecret,
            {
              payment_method: {
                billing_details: toFutureOrderV2KlarnaBillingDetails(shipping),
              },
              return_url: buildFutureOrderV2StripeReturnUrl(activeOrderId),
            },
            { handleActions: false },
          );
          if (klarnaResult.error) {
            return {
              status: "failed",
              message: describeFutureOrderV2CardError({
                code: klarnaResult.error.code,
                declineCode: klarnaResult.error.decline_code,
                message: klarnaResult.error.message,
              }),
            };
          }
          const paymentIntent = klarnaResult.paymentIntent;
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
            message: "Stripe did not return a redirect for Klarna.",
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
      setCardLoadFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Stripe payments are not available.",
      );
      setCardReady(false);
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
      setExpressCheckoutVisible(false);
      return;
    }

    let cancelled = false;
    setExpressCheckoutVisible(false);
    const elements = stripe.elements({
      mode: "payment",
      amount: amountCents,
      currency: "eur",
      allowedPaymentMethodTypes: ["card"],
    });
    const expressCheckout = elements.create("expressCheckout", {
      // "always" lets Stripe show the wallet wherever it supports it. With "auto"
      // Google Pay never shows on Safari, any iOS browser, or Firefox, and only
      // shows elsewhere when a card is already saved. Stripe still hides a wallet
      // the device or browser cannot use.
      paymentMethods: {
        applePay: "always",
        googlePay: "always",
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
      setExpressCheckoutVisible(isFutureOrderV2ExpressWalletAvailable(flags));
    };
    // Only availablepaymentmethodschange drives visibility. It fires on first
    // render and on every change. The ready event fires after it and its
    // availablePaymentMethods field is deprecated, so it must not hide the box.
    expressCheckout.on("availablepaymentmethodschange", (event) => {
      applyAvailability(futureOrderV2ExpressWalletsFromChange(event.paymentMethods));
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
    registerFutureOrderV2PaymentMethodReader(() => methodRef.current);
    return () => registerFutureOrderV2PaymentMethodReader(null);
  }, []);

  useEffect(() => {
    if (!pixAvailable && methodRef.current === "pix") selectMethod("card");
  }, [pixAvailable]);

  useEffect(() => {
    const refresh = () => setPixPending(orderId ? readFutureOrderV2PixPending(orderId) : null);
    refresh();
    if (typeof window === "undefined") return;
    window.addEventListener(FUTURE_ORDER_V2_PIX_PENDING_EVENT, refresh);
    return () => window.removeEventListener(FUTURE_ORDER_V2_PIX_PENDING_EVENT, refresh);
  }, [orderId]);

  const checkPixPayment = async () => {
    if (!pixPending || pixChecking) return;
    setPixChecking(true);
    setPixStatusMessage(null);
    try {
      const { verifyFutureOrderV2PixCheckout } = await import(
        "../services/futureOrderV2PaymentRecordClient"
      );
      const result = await verifyFutureOrderV2PixCheckout(pixPending);
      if (result.status === "recorded") {
        clearFutureOrderV2PixPending();
        setPixPending(null);
        setPixStatusMessage("Pix payment received. Your order is paid.");
      } else if (result.status === "pending") {
        setPixStatusMessage(FUTURE_ORDER_V2_PIX_PENDING_MESSAGE);
      } else {
        setPixStatusMessage(result.message);
      }
    } catch {
      setPixStatusMessage("The Pix payment could not be checked. Try again in a moment.");
    } finally {
      setPixChecking(false);
    }
  };

  const stripeClientReady = stripeClient !== null;

  useEffect(() => {
    reportReady(method, cardReady, stripeClientReady);
  }, [method, cardReady, stripeClientReady]);

  const selectMethod = (next: FutureOrderV2PaymentMethod) => {
    methodRef.current = next;
    setMethod(next);
    onMethodChangeRef.current?.(next);
    reportReady(next, cardReady, stripeClientReady);
  };

  return (
    <div className="mt-4 max-w-md space-y-3">
      <div {...futureOrderV2ExpressCheckoutShell(expressCheckoutVisible)}>
        <div ref={expressMountRef} />
      </div>

      <div
        className="relative z-10 flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="Payment method"
        data-future-order-v2-payment-methods
      >
        {visibleMethods.includes("card") && (
          <button
            type="button"
            role="radio"
            aria-checked={method === "card"}
            data-future-order-v2-method-card
            disabled={disabled}
            onClick={() => selectMethod("card")}
            className={`inline-flex min-w-fit items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-2 px-2 py-2.5 text-xs font-bold uppercase tracking-wider transition sm:px-3 ${stripeMethodPillBasisClass(methodPillCount)} ${
              method === "card"
                ? "border-heritage-gold bg-heritage-gold/15 text-white"
                : "border-white/50 bg-white/5 text-white/70 hover:border-white/70"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <FutureOrderV2MethodIcon method="card" />
            Card
          </button>
        )}
        {visibleMethods.includes("ideal") && (
          <button
            type="button"
            role="radio"
            aria-checked={method === "ideal"}
            data-future-order-v2-method-ideal
            disabled={disabled}
            onClick={() => selectMethod("ideal")}
            className={`inline-flex min-w-fit items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-2 px-2 py-2.5 text-xs font-bold uppercase tracking-wider transition sm:px-3 ${stripeMethodPillBasisClass(methodPillCount)} ${
              method === "ideal"
                ? "border-heritage-gold bg-heritage-gold/15 text-white"
                : "border-white/50 bg-white/5 text-white/70 hover:border-white/70"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <FutureOrderV2MethodIcon method="ideal" />
            iDEAL
          </button>
        )}
        {visibleMethods.includes("klarna") && (
          <button
            type="button"
            role="radio"
            aria-checked={method === "klarna"}
            data-future-order-v2-method-klarna
            disabled={disabled}
            onClick={() => selectMethod("klarna")}
            className={`inline-flex min-w-fit items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-2 px-2 py-2.5 text-xs font-bold uppercase tracking-wider transition sm:px-3 ${stripeMethodPillBasisClass(methodPillCount)} ${
              method === "klarna"
                ? "border-heritage-gold bg-heritage-gold/15 text-white"
                : "border-white/50 bg-white/5 text-white/70 hover:border-white/70"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <FutureOrderV2MethodIcon method="klarna" />
            Klarna
          </button>
        )}
        {pixAvailable && (
          <button
            type="button"
            role="radio"
            aria-checked={method === "pix"}
            data-future-order-v2-method-pix
            disabled={disabled}
            onClick={() => selectMethod("pix")}
            className={`inline-flex min-w-fit items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-2 px-2 py-2.5 text-xs font-bold uppercase tracking-wider transition sm:px-3 ${stripeMethodPillBasisClass(methodPillCount)} ${
              method === "pix"
                ? "border-heritage-gold bg-heritage-gold/15 text-white"
                : "border-white/50 bg-white/5 text-white/70 hover:border-white/70"
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            <FutureOrderV2MethodIcon method="pix" />
            Pix
          </button>
        )}
      </div>

      {pixPending && (
        <div
          role="status"
          data-future-order-v2-pix-pending
          className="space-y-2 rounded-xl border border-heritage-gold/60 bg-heritage-gold/10 px-3 py-2.5"
        >
          <p className="text-xs font-semibold leading-relaxed text-white">
            Awaiting Pix payment
          </p>
          <p className="text-xs leading-relaxed text-white/80">
            {FUTURE_ORDER_V2_PIX_PENDING_MESSAGE}
          </p>
          <button
            type="button"
            data-future-order-v2-pix-check
            disabled={pixChecking}
            onClick={() => void checkPixPayment()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/40 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pixChecking && <Loader2 aria-hidden="true" size={12} className="animate-spin" />}
            Check Pix payment
          </button>
        </div>
      )}
      {pixStatusMessage && (
        <p
          role="status"
          data-future-order-v2-pix-status
          className="text-xs leading-relaxed text-white/80"
        >
          {pixStatusMessage}
        </p>
      )}

      <div className={method === "card" ? "block" : "hidden"}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/70">
          Card
        </p>
        <div
          ref={mountRef}
          data-future-order-v2-card
          className="min-h-11 rounded-xl border border-white/30 bg-white px-3 py-3"
        />
        {shouldShowFutureOrderV2CardLoading({ method, cardReady, loadFailed: cardLoadFailed }) && (
          <p
            role="status"
            data-future-order-v2-card-loading
            className="mt-2 flex items-center gap-2 text-xs leading-relaxed text-white/80"
          >
            <Loader2 aria-hidden="true" size={14} className="shrink-0 animate-spin" />
            {FUTURE_ORDER_V2_CARD_LOADING_MESSAGE}
          </p>
        )}
        {fieldError && (
          <p
            data-future-order-v2-card-field-error
            className="mt-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-red-700"
          >
            {fieldError}
          </p>
        )}
        {testMode && (
          <div className="mt-2 space-y-1.5">
            <FutureOrderV2AllowedCardIcons />
            <p className="text-xs leading-relaxed text-white/75">
              Test card 4242 4242 4242 4242. Use any future expiry and any CVC.
            </p>
          </div>
        )}
      </div>

      {visibleMethods.includes("ideal") && (
        <div className={method === "ideal" ? "block" : "hidden"}>
          <p
            data-future-order-v2-ideal-help
            className="text-xs leading-relaxed text-white/75"
          >
            Pay with iDEAL. You will be redirected to your Dutch bank to authorize
            this payment, then returned here.
          </p>
        </div>
      )}

      {visibleMethods.includes("klarna") && (
        <div className={method === "klarna" ? "block" : "hidden"}>
          <p
            data-future-order-v2-klarna-help
            className="text-xs leading-relaxed text-white/75"
          >
            Pay with Klarna. You will be redirected to Klarna to authorize this
            payment, then returned here.
          </p>
        </div>
      )}

      {pixAvailable && (
        <div className={method === "pix" ? "block" : "hidden"}>
          <p
            data-future-order-v2-pix-help
            className="text-xs leading-relaxed text-white/75"
          >
            Pay with Pix in Brazilian reais. You will go to a secure Stripe page
            that shows the amount in BRL and a Pix QR code to scan or copy into
            your bank app. Your order updates here when the bank confirms it.
          </p>
          <p
            data-future-order-v2-pix-iof
            className="mt-1.5 text-[11px] leading-relaxed text-white/60"
          >
            {FUTURE_ORDER_V2_PIX_IOF_DISCLOSURE}{" "}
            <a
              href={FUTURE_ORDER_V2_PIX_EBANX_TERMS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Ebanx terms
            </a>
          </p>
        </div>
      )}

      {message && (
        <p role="alert" className="text-xs leading-relaxed text-heritage-gold">
          {message}
        </p>
      )}
    </div>
  );
};
