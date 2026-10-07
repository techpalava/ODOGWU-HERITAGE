import { useState } from "react";
import { LockKeyhole, Trash2 } from "lucide-react";
import { auth } from "../services/firebase";
import { useAppStore } from "../store/useAppStore";
import { FutureOrderV2StripeCard } from "./FutureOrderV2StripeCard";
import { FutureOrderV2PaymentAlert } from "./FutureOrderV2PaymentAlert";
import { persistFutureOrderV2 } from "../services/futureOrderV2Persistence";
import { recordFutureOrderV2Payment } from "../services/futureOrderV2PaymentRecordClient";
import {
  authorizeFutureOrderV2Payment,
  executeFutureOrderV2Payment,
  validatePreparedFutureOrderV2PaymentEligibility,
} from "../utils/futureOrderV2Payment";
import { createFutureOrderV2PreparationAttempt } from "../utils/futureOrderV2Preparation";
import {
  getFutureOrderV2CartLineLabel,
  getFutureOrderV2CartLineTotalCents,
} from "../utils/futureOrderV2CartBag";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";
import type { FutureOrderCartItemV2 } from "../utils/futureOrderV2Storage";

const moneyFromCents = (amountCents: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${(amountCents / 100).toFixed(2)}`;

export const FutureOrderV2CartPayPanel = ({
  item,
}: {
  item: FutureOrderCartItemV2;
}) => {
  const currentUser = useAppStore((state) => state.currentUser);
  const batches = useAppStore((state) => state.batches);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const setCheckoutIntent = useAppStore((state) => state.setCheckoutIntent);
  const setIsCartOpen = useAppStore((state) => state.setIsCartOpen);
  const setNotification = useAppStore((state) => state.setNotification);
  const dropFutureOrderV2CartItem = useAppStore(
    (state) => state.dropFutureOrderV2CartItem,
  );
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [orderId, setOrderId] = useState("");
  const [stripeReady, setStripeReady] = useState(false);

  const totalCents = getFutureOrderV2CartLineTotalCents(item);
  const label = getFutureOrderV2CartLineLabel(item);

  const requireSignIn = () => {
    setCheckoutIntent(true);
    setIsCartOpen(false);
    setActiveTab("login");
    setNotification({
      message: "Sign in or create an account to pay this order.",
      type: "info",
    });
  };

  const handlePay = async () => {
    const identity = auth.currentUser;
    if (!currentUser || !identity || identity.isAnonymous) {
      requireSignIn();
      return;
    }
    if (paying) return;
    setPaying(true);
    setMessage(null);
    try {
      const prepared = createFutureOrderV2PreparationAttempt({
        candidate: item.candidate,
        ids: {
          cartItemId: item.cartItemId,
          orderId: `future-order-${item.cartItemId.replace(/^future-cart-/, "")}`,
        },
      });
      if (prepared.status !== "valid") {
        setMessage(
          prepared.blockers[0]?.message ||
            "This parked order cannot be prepared for payment.",
        );
        return;
      }
      const persistResult = await persistFutureOrderV2({
        masterOrder: prepared.attempt.masterOrder,
        customerOwnerUid: identity.uid,
      });
      if (
        persistResult.status !== "created" &&
        persistResult.status !== "already_persisted"
      ) {
        setMessage("This order could not be prepared for payment. Try again.");
        return;
      }
      setOrderId(prepared.attempt.orderId);
      const outcome = await executeFutureOrderV2Payment({
        prepared: prepared.attempt,
        authorize: authorizeFutureOrderV2Payment,
        validateBeforeAuthorization: () =>
          validatePreparedFutureOrderV2PaymentEligibility({
            prepared: prepared.attempt,
            liveBatches: batches,
          }),
      });
      if (outcome.status === "redirecting") {
        return;
      }
      if (outcome.status !== "authorized") {
        setMessage(outcome.message);
        return;
      }
      const recorded = await recordFutureOrderV2Payment({
        orderId: prepared.attempt.orderId,
        paymentIntentId: outcome.providerTransactionReference,
      });
      if (recorded.status !== "recorded") {
        setMessage(recorded.message);
        return;
      }
      dropFutureOrderV2CartItem(item.cartItemId);
      setNotification({
        message: "Payment received. This order has left your cart.",
        type: "success",
      });
    } catch {
      setMessage("Payment could not be completed. Retry this same order.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <article
      data-testid="future-order-v2-cart-line"
      data-cart-item-id={item.cartItemId}
      className="rounded-2xl border border-heritage-gold/30 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-serif text-sm font-bold text-heritage-green">
            {label}
          </h3>
          <p className="mt-1 font-mono text-sm font-semibold text-heritage-gold">
            {totalCents === null ? "Unavailable" : moneyFromCents(totalCents)}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-heritage-ink/70">
            Complete made-to-measure order. Pay with the same Stripe test
            checkout used in Design Studio.
          </p>
        </div>
        <button
          type="button"
          aria-label={`Remove ${label} from cart`}
          onClick={() => dropFutureOrderV2CartItem(item.cartItemId)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-heritage-ink/50 transition hover:bg-red-50 hover:text-red-700"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <FutureOrderV2StripeCard
        disabled={paying}
        orderId={orderId}
        returnSurface="dashboard"
        onReadyChange={setStripeReady}
      />
      {message ? <FutureOrderV2PaymentAlert message={message} /> : null}
      <button
        type="button"
        data-testid="future-order-v2-cart-pay"
        disabled={paying || !stripeReady}
        onClick={() => void handlePay()}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-gold px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-heritage-forest transition hover:bg-heritage-green hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LockKeyhole size={14} />
        {paying ? "Processing payment..." : "Pay this order"}
      </button>
    </article>
  );
};
