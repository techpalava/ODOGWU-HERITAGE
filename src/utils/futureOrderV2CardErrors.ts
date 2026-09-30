export const FUTURE_ORDER_V2_NOT_CHARGED = "You have not been charged.";

const DECLINE_REASONS: Readonly<Record<string, string>> = {
  generic_decline: "Your bank declined this card. Try another card or contact your bank.",
  do_not_honor: "Your bank declined this card. Try another card or contact your bank.",
  card_declined: "Your bank declined this card. Try another card or contact your bank.",
  insufficient_funds: "The card has insufficient funds. Try another card.",
  expired_card: "The card has expired. Check the expiry date or use another card.",
  incorrect_cvc: "The security code (CVC) is incorrect. Check it and try again.",
  invalid_cvc: "The security code (CVC) is incorrect. Check it and try again.",
  incorrect_number: "The card number is incorrect. Check it and try again.",
  invalid_number: "The card number is incorrect. Check it and try again.",
  processing_error: "Something went wrong processing the card. Try again in a moment.",
  authentication_required:
    "Your bank's security check was not completed. Try again and finish the check.",
  payment_intent_authentication_failure:
    "Your bank's security check was not completed. Try again and finish the check.",
};

/** Explains a Stripe card error in plain language; the customer was never charged. */
export const describeFutureOrderV2CardError = ({
  code,
  declineCode,
  message,
}: {
  code?: string | null;
  declineCode?: string | null;
  message?: string | null;
}): string => {
  const reason =
    (declineCode && DECLINE_REASONS[declineCode]) ||
    (code && DECLINE_REASONS[code]) ||
    message?.trim() ||
    "The card payment was not completed. Try again.";
  return `${reason} ${FUTURE_ORDER_V2_NOT_CHARGED}`;
};
