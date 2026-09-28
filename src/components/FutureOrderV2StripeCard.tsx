import { useEffect, useRef, useState } from "react";
import { loadStripe, type StripeCardElement } from "@stripe/stripe-js";
import { registerFutureOrderV2CardConfirmer } from "../utils/futureOrderV2Payment";

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
      registerFutureOrderV2CardConfirmer(async (clientSecret) => {
        const result = await stripe.confirmCardPayment(clientSecret, {
          payment_method: { card: card! },
        });
        if (result.error) {
          return {
            status: "failed",
            message: result.error.message || "The card was not confirmed.",
          };
        }
        const paymentIntentId = result.paymentIntent?.id || "";
        if (!paymentIntentId.startsWith("pi_")) {
          return {
            status: "failed",
            message: "Stripe did not return a payment reference.",
          };
        }
        return { status: "confirmed", paymentIntentId };
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
