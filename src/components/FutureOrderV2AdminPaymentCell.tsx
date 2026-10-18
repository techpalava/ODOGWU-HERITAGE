import {
  presentFutureOrderV2AdminPayment,
} from "../utils/futureOrderV2AdminPayment";
import { formatFutureOrderV2PaidAmount, type FutureOrderV2PaymentRecord } from "../utils/futureOrderV2PaymentRecord";

export const FutureOrderV2AdminPaymentCell = ({
  orderId,
  record,
  settledAddition = null,
}: {
  orderId: string;
  record: FutureOrderV2PaymentRecord | undefined;
  settledAddition?: {
    readonly paidCents: number;
    readonly references: readonly string[];
    readonly totalPaidCents: number;
  } | null;
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
        Paid (test){" "}
        {settledAddition
          ? formatFutureOrderV2PaidAmount(settledAddition.totalPaidCents)
          : payment.amountLabel}
      </span>
      <p className="text-[10px] text-gray-500">on {payment.paidOnLabel}</p>
      {settledAddition ? (
        <p className="text-[10px] text-gray-500">Base {payment.amountLabel}</p>
      ) : null}
      <a
        href={payment.providerUrl}
        target="_blank"
        rel="noreferrer"
        data-future-order-v2-stripe-link={orderId}
        data-future-order-v2-provider={payment.providerLabel.toLowerCase()}
        className="block break-all font-mono text-[10px] text-heritage-green underline"
      >
        {payment.providerLabel}: {payment.paymentIntentId}
      </a>
      {settledAddition ? (
        <div data-future-order-v2-addition-paid={orderId}>
          <p className="text-[10px] text-gray-500">
            Addition {formatFutureOrderV2PaidAmount(settledAddition.paidCents)}
          </p>
          {settledAddition.references.map((reference) => (
            <a
              key={reference}
              href={`https://dashboard.stripe.com/test/payments/${encodeURIComponent(reference)}`}
              target="_blank"
              rel="noreferrer"
              data-future-order-v2-addition-link={orderId}
              className="block break-all font-mono text-[10px] text-heritage-green underline"
            >
              Stripe: {reference}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
};
