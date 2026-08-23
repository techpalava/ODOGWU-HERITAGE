import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";

const HERITAGE_GREEN = "#0A291B";

let stripePromise: Promise<Stripe | null> | null = null;

const getStripePromise = (): Promise<Stripe | null> => {
  if (!stripePromise) {
    const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
      | string
      | undefined;
    if (!publishableKey || publishableKey.trim().length === 0) {
      stripePromise = Promise.resolve(null);
    } else {
      stripePromise = loadStripe(publishableKey);
    }
  }
  return stripePromise;
};

export type DepositPaymentFormHandle = {
  confirmPayment: () => Promise<{ paymentIntentId: string }>;
};

type DepositPaymentFormProps = {
  returnUrl?: string;
  onReady?: () => void;
};

const DepositPaymentFormInner = forwardRef<
  DepositPaymentFormHandle,
  DepositPaymentFormProps
>(function DepositPaymentFormInner({ returnUrl, onReady }, ref) {
  const stripe = useStripe();
  const elements = useElements();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready && onReady) {
      onReady();
    }
  }, [ready, onReady]);

  useImperativeHandle(
    ref,
    () => ({
      async confirmPayment() {
        if (!stripe || !elements) {
          throw new Error("Stripe payment form is not ready yet.");
        }
        const result = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: returnUrl || window.location.href,
          },
          redirect: "if_required",
        });
        if (result.error) {
          throw new Error(
            result.error.message || "Stripe payment could not be confirmed.",
          );
        }
        const paymentIntent = result.paymentIntent;
        if (!paymentIntent || paymentIntent.status !== "succeeded") {
          throw new Error("Stripe payment did not complete.");
        }
        return { paymentIntentId: paymentIntent.id };
      },
    }),
    [stripe, elements, returnUrl],
  );

  return (
    <PaymentElement
      onReady={() => setReady(true)}
      options={{
        layout: "tabs",
      }}
    />
  );
});

export const DepositPaymentForm = DepositPaymentFormInner;

type DepositPaymentElementProps = {
  clientSecret: string;
  onReady?: () => void;
  returnUrl?: string;
  formRef?: React.Ref<DepositPaymentFormHandle>;
};

/**
 * Stripe Elements + PaymentElement for deposit checkout.
 * Do not collect card details with custom inputs — PaymentElement only.
 */
export function DepositPaymentElement({
  clientSecret,
  onReady,
  returnUrl,
  formRef,
}: DepositPaymentElementProps) {
  const options = useMemo<StripeElementsOptions>(
    () => ({
      clientSecret,
      appearance: {
        theme: "stripe",
        variables: {
          colorPrimary: HERITAGE_GREEN,
          colorText: HERITAGE_GREEN,
          borderRadius: "12px",
        },
      },
    }),
    [clientSecret],
  );

  return (
    <Elements stripe={getStripePromise()} options={options}>
      <DepositPaymentForm
        ref={formRef}
        returnUrl={returnUrl}
        onReady={onReady}
      />
    </Elements>
  );
}

export default DepositPaymentElement;
