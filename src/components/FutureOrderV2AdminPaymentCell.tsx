import {
  presentFutureOrderV2AdminPayment,
} from "../utils/futureOrderV2AdminPayment";
import type { FutureOrderV2PaymentRecord } from "../utils/futureOrderV2PaymentRecord";

export const FutureOrderV2AdminPaymentCell = ({
  orderId,
  record,
}: {
  orderId: string;
  record: FutureOrderV2PaymentRecord | undefined;
}) => {
  const payment = presentFutureOrderV2AdminPayment(record);
  if (payment.kind === "awaiting") {
    return (
      <span
        data-future-order-v2-awaiting={orderId}
        className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800"
      >
        Awaiting payment
      </span>
    );
  }
  return (
    <div className="space-y-1">
      <span
        data-future-order-v2-paid={orderId}
        className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-800"
      >
        Paid (test) {payment.amountLabel}
      </span>
      <p className="text-[10px] text-gray-500">on {payment.paidOnLabel}</p>
      <a
        href={payment.stripeUrl}
        target="_blank"
        rel="noreferrer"
        data-future-order-v2-stripe-link={orderId}
        className="block break-all font-mono text-[10px] text-heritage-green underline"
      >
        {payment.paymentIntentId}
      </a>
    </div>
  );
};
