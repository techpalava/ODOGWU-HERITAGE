import { AlertCircle } from "lucide-react";

export const FutureOrderV2PaymentAlert = ({
  title = "Payment not completed",
  message,
}: {
  title?: string;
  message: string;
}) => (
  <div
    role="alert"
    data-future-order-v2-payment-error
    className="mt-4 flex max-w-md items-start gap-2 rounded-xl border-2 border-red-300 bg-white p-3 text-left text-red-800"
  >
    <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-red-600" />
    <div className="min-w-0">
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-0.5 break-words text-xs leading-relaxed">{message}</p>
    </div>
  </div>
);
