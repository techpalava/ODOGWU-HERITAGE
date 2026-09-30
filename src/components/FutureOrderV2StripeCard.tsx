import { useEffect, useRef, useState } from "react";
import { loadStripe, type StripeCardElement } from "@stripe/stripe-js";
import { registerFutureOrderV2CardConfirmer } from "../utils/futureOrderV2Payment";
import { describeFutureOrderV2CardError } from "../utils/futureOrderV2CardErrors";

/**
 * Mounts a Stripe card field and confirms the PaymentIntent in the browser.
 * The test card is 4242 4242 4242 4242.
 */
export const FutureOrderV2StripeCard = ({
  disabled,
  onReadyChange,
}: {
  disabled: boolean;
  onReadyChange: (ready: boolean) => void;
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<StripeCardElement | null>(null);
  const onReadyChangeRef = useRef(onReadyChange);
  onReadyChangeRef.current = onReadyChange;
  const [message, setMessage] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let card: StripeCardElement | null = null;
    onReadyChangeRef.current(false);

    const mountCard = async () => {
      const response = await fetch("/api/future-order-v2/stripe-config");
      const payload: unknown = await response.json();
      if (!response.ok) {
        const error =
          payload &&
          typeof payload === "object" &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "The Stripe test card field is not available.";
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
        throw new Error(
          "The Stripe test publishable key is not configured.",
        );
      }
      const stripe = await loadStripe(publishableKey);
      if (!stripe || cancelled || !mountRef.current) {
        throw new Error("The Stripe test card field could not be loaded.");
      }
      const elements = stripe.elements();
      card = elements.create("card", { hidePostalCode: true });
      cardRef.current = card;
      card.mount(mountRef.current);
      card.on("ready", () => {
        if (!cancelled) {
          setTestMode(true);
          onReadyChangeRef.current(true);
        }
      });
      card.on("change", (event) => {
        if (!cancelled) setFieldError(event.error?.message ?? null);
      });
      registerFutureOrderV2CardConfirmer(async (clientSecret) => {
        const result = await stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: card! },
        });
        // A retry of an already-paid order reuses the same PaymentIntent, which
        // Stripe reports as an unexpected-state error carrying the succeeded intent.
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
          : "The Stripe test card field is not available.",
      );
      onReadyChangeRef.current(false);
    });

    return () => {
      cancelled = true;
      registerFutureOrderV2CardConfirmer(null);
      card?.destroy();
      cardRef.current = null;
      onReadyChangeRef.current(false);
    };
  }, []);

  useEffect(() => {
    cardRef.current?.update({ disabled });
  }, [disabled]);

  return (
    <div className="mt-4 max-w-md">
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
      {message && (
        <p role="alert" className="mt-2 text-xs leading-relaxed text-heritage-gold">
          {message}
        </p>
      )}
    </div>
  );
};
