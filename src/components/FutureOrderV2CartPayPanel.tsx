import { useState } from "react";
import { LockKeyhole, Trash2 } from "lucide-react";
import { auth } from "../services/firebase";
import { useAppStore } from "../store/useAppStore";
import { FutureOrderV2StripeCard } from "./FutureOrderV2StripeCard";
import { FutureOrderV2PaymentAlert } from "./FutureOrderV2PaymentAlert";
import { persistFutureOrderV2 } from "../services/futureOrderV2Persistence";
import { recordFutureOrderV2Payment } from "../services/futureOrderV2PaymentRecordClient";
import { retireStudioFutureDesignDraft } from "../services/retirePaidStudioDraft";
import {
  authorizeFutureOrderV2Payment,
  executeFutureOrderV2Payment,
  validatePreparedFutureOrderV2PaymentEligibility,
} from "../utils/futureOrderV2Payment";
import {
  createFutureOrderV2PreparationAttempt,
  createFutureOrderV2PreparationIds,
  getFutureOrderV2CandidateFingerprint,
} from "../utils/futureOrderV2Preparation";
import {
  peekSavedOrderCartLink,
  rememberSavedOrderPaymentLink,
  takeSavedOrderCartLink,
  takeSavedOrderPaymentLink,
} from "../utils/savedStudioOrderModel";
import { getSavedStudioOrderRepository } from "../services/savedStudioOrderService";
import {
  getFutureOrderV2CartLineLabel,
  getFutureOrderV2CartLineTotalCents,
} from "../utils/futureOrderV2CartBag";
import {
  COMMUNITY_BATCH_CHECKING_MESSAGE,
  COMMUNITY_BATCH_CLOSED_MESSAGE,
  resolveCommunityBatchClosureStatus,
} from "../utils/communityBatchOrderClosure";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";
import {
  formatIndividualShippingNote,
  resolveIndividualInboundShippingDisplay,
} from "../utils/individualInboundShippingDisplay";
import { FUTURE_ORDER_PRICE_OUTDATED_CODE } from "../utils/futureOrderPayableTotal";
import type { FutureOrderCartItemV2 } from "../utils/futureOrderV2Storage";
import { getOrderGarmentPictures } from "../utils/orderGarmentPictures";
import { OrderGarmentPictureStrip } from "./orderPictures/OrderGarmentPictures";

const moneyFromCents = (amountCents: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${(amountCents / 100).toFixed(2)}`;

export const FutureOrderV2CartPayPanel = ({
  item,
}: {
  item: FutureOrderCartItemV2;
}) => {
  const currentUser = useAppStore((state) => state.currentUser);
  const batches = useAppStore((state) => state.batches);
  const fabrics = useAppStore((state) => state.fabrics);
  const hasLoadedBatches = useAppStore((state) => state.hasLoadedBatches);
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
  const garmentPictures = getOrderGarmentPictures(item.candidate, fabrics);
  const communityBatchClosureStatus = resolveCommunityBatchClosureStatus(
    item.candidate.orderIdentity,
    batches,
    hasLoadedBatches,
  );
  const communityBatchClosed = communityBatchClosureStatus === "closed";
  const communityBatchChecking = communityBatchClosureStatus === "loading";
  const includedInbound = resolveIndividualInboundShippingDisplay({
    orderType: item.candidate.orderIdentity?.orderType ?? null,
    physicalGarmentCount: item.candidate.garments.length,
    fulfilmentMethod: item.candidate.shipping.state.fulfilmentMethod,
  });

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
    if (communityBatchChecking) return;
    if (communityBatchClosed) {
      setMessage(COMMUNITY_BATCH_CLOSED_MESSAGE);
      return;
    }
    if (paying) return;
    setPaying(true);
    setMessage(null);
    try {
      const preferredIds = {
        cartItemId: item.cartItemId,
        orderId: `future-order-${item.cartItemId.replace(/^future-cart-/, "")}`,
      };
      let preparedResult = createFutureOrderV2PreparationAttempt({
        candidate: item.candidate,
        ids: preferredIds,
      });
      if (preparedResult.status !== "valid") {
        setMessage(
          preparedResult.blockers[0]?.message ||
            "This parked order cannot be prepared for payment.",
        );
        return;
      }
      let prepared = preparedResult.attempt;
      let persistResult = await persistFutureOrderV2({
        masterOrder: prepared.masterOrder,
        customerOwnerUid: identity.uid,
      });
      if (
        persistResult.status === "conflict" &&
        persistResult.code === "ORDER_ID_PAYLOAD_CONFLICT"
      ) {
        preparedResult = createFutureOrderV2PreparationAttempt({
          candidate: item.candidate,
          ids: createFutureOrderV2PreparationIds(),
        });
        if (preparedResult.status !== "valid") {
          setMessage(
            preparedResult.blockers[0]?.message ||
              "This parked order cannot be prepared for payment.",
          );
          return;
        }
        prepared = preparedResult.attempt;
        persistResult = await persistFutureOrderV2({
          masterOrder: prepared.masterOrder,
          customerOwnerUid: identity.uid,
        });
      }
      if (
        persistResult.status !== "created" &&
        persistResult.status !== "already_persisted"
      ) {
        setMessage("This order could not be prepared for payment. Try again.");
        return;
      }
      setOrderId(prepared.orderId);
      // Link the payment order to the saved order this cart line came from,
      // so a redirect return removes only that saved order.
      const cartLineSavedOrderId = peekSavedOrderCartLink(
        getFutureOrderV2CandidateFingerprint(item.candidate),
      );
      rememberSavedOrderPaymentLink(prepared.orderId, cartLineSavedOrderId);
      let outcome = await executeFutureOrderV2Payment({
        prepared,
        authorize: authorizeFutureOrderV2Payment,
        validateBeforeAuthorization: () =>
          validatePreparedFutureOrderV2PaymentEligibility({
            prepared,
            liveBatches: batches,
          }),
      });
      if (
        outcome.status === "failed" &&
        outcome.code === FUTURE_ORDER_PRICE_OUTDATED_CODE
      ) {
        preparedResult = createFutureOrderV2PreparationAttempt({
          candidate: item.candidate,
          ids: createFutureOrderV2PreparationIds(),
        });
        if (preparedResult.status !== "valid") {
          setMessage(outcome.message);
          return;
        }
        prepared = preparedResult.attempt;
        persistResult = await persistFutureOrderV2({
          masterOrder: prepared.masterOrder,
          customerOwnerUid: identity.uid,
        });
        if (
          persistResult.status !== "created" &&
          persistResult.status !== "already_persisted"
        ) {
          setMessage(outcome.message);
          return;
        }
        setOrderId(prepared.orderId);
        // Re-priced retry uses a new order id; link it to the same saved order.
        rememberSavedOrderPaymentLink(prepared.orderId, cartLineSavedOrderId);
        outcome = await executeFutureOrderV2Payment({
          prepared,
          authorize: authorizeFutureOrderV2Payment,
          validateBeforeAuthorization: () =>
            validatePreparedFutureOrderV2PaymentEligibility({
              prepared,
              liveBatches: batches,
            }),
        });
      }
      if (outcome.status === "redirecting") {
        return;
      }
      if (outcome.status !== "authorized") {
        setMessage(outcome.message);
        return;
      }
      const recorded = await recordFutureOrderV2Payment({
        orderId: prepared.orderId,
        paymentIntentId: outcome.providerTransactionReference,
      });
      if (recorded.status !== "recorded") {
        setMessage(recorded.message);
        return;
      }
      dropFutureOrderV2CartItem(item.cartItemId);
      // Remove only the saved order linked to this paid cart line. The active
      // Studio draft may belong to a different saved order; leave that alone.
      const savedOrderId =
        takeSavedOrderCartLink(
          getFutureOrderV2CandidateFingerprint(item.candidate),
        ) ?? null;
      const paymentLinkedSavedOrderId = takeSavedOrderPaymentLink(
        prepared.orderId,
      );
      const paidSavedOrderId = savedOrderId || paymentLinkedSavedOrderId;
      const ownerUid = auth.currentUser?.uid;
      if (paidSavedOrderId && ownerUid) {
        void getSavedStudioOrderRepository().remove({
          ownerUid,
          savedOrderId: paidSavedOrderId,
        });
      }
      void retireStudioFutureDesignDraft();
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
          <p className="mt-1 font-mono text-sm font-semibold text-heritage-bronze">
            {totalCents === null ? "Unavailable" : moneyFromCents(totalCents)}
          </p>
          {includedInbound ? (
            <>
            <p
              data-testid="future-order-v2-included-inbound"
              data-amount-cents={includedInbound.amountCents}
              className="mt-1 text-[11px] leading-relaxed text-heritage-ink/70"
            >
              Lagos → Eindhoven shipping {moneyFromCents(includedInbound.amountCents)}
            </p>
            <p
              data-testid="future-order-v2-lagos-note"
              className="mt-1 text-[11px] leading-relaxed text-heritage-ink/70"
            >
              {formatIndividualShippingNote(includedInbound)}
            </p>
            </>
          ) : null}
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
      <OrderGarmentPictureStrip pictures={garmentPictures} />
      {communityBatchClosed ? (
        <p role="status" data-testid="cart-community-batch-closed" className="mt-3 text-sm font-semibold text-red-800">
          {COMMUNITY_BATCH_CLOSED_MESSAGE}
        </p>
      ) : null}
      {/* Same dark payment box as Stage 10, so the shared Stripe card pills
          (white text, gold selection) are readable in the white cart. */}
      <div
        data-cart-payment-box
        className="mt-3 rounded-2xl border border-heritage-gold/30 bg-heritage-green p-4 text-white"
      >
      {communityBatchClosed ? null : (
      <FutureOrderV2StripeCard
        disabled={paying}
        orderId={orderId}
        returnSurface="dashboard"
        amountCents={totalCents}
        onExpressCheckoutConfirm={handlePay}
        onReadyChange={setStripeReady}
        shippingState={item.candidate.shipping.state}
      />
      )}
      {communityBatchChecking ? (
        <p role="status" data-testid="cart-community-batch-checking" className="mt-3 text-xs text-white/75">
          {COMMUNITY_BATCH_CHECKING_MESSAGE}
        </p>
      ) : null}
      {message ? <FutureOrderV2PaymentAlert message={message} /> : null}
      <button
        type="button"
        data-testid="future-order-v2-cart-pay"
        disabled={communityBatchClosed || communityBatchChecking || paying || !stripeReady}
        onClick={communityBatchClosed || communityBatchChecking ? undefined : () => void handlePay()}
        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-gold px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-heritage-forest transition hover:bg-white hover:text-heritage-forest disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LockKeyhole size={14} />
        {paying ? "Processing payment..." : "Pay this order"}
      </button>
      </div>
    </article>
  );
};
