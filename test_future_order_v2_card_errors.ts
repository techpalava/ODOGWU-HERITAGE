import assert from "node:assert/strict";
import {
  FUTURE_ORDER_V2_NOT_CHARGED,
  describeFutureOrderV2CardError,
} from "./src/utils/futureOrderV2CardErrors";

const cases: Array<[Parameters<typeof describeFutureOrderV2CardError>[0], string]> = [
  [
    { code: "card_declined", declineCode: "generic_decline", message: "Your card was declined." },
    "Your bank declined this card. Try another card or contact your bank.",
  ],
  [
    { code: "card_declined", declineCode: "do_not_honor" },
    "Your bank declined this card. Try another card or contact your bank.",
  ],
  [{ code: "card_declined" }, "Your bank declined this card. Try another card or contact your bank."],
  [
    { code: "card_declined", declineCode: "insufficient_funds" },
    "The card has insufficient funds. Try another card.",
  ],
  [{ code: "expired_card" }, "The card has expired. Check the expiry date or use another card."],
  [{ code: "incorrect_cvc" }, "The security code (CVC) is incorrect. Check it and try again."],
  [{ code: "incorrect_number" }, "The card number is incorrect. Check it and try again."],
  [{ code: "invalid_number" }, "The card number is incorrect. Check it and try again."],
  [{ code: "processing_error" }, "Something went wrong processing the card. Try again in a moment."],
  [
    { code: "payment_intent_authentication_failure" },
    "Your bank's security check was not completed. Try again and finish the check.",
  ],
  [
    { code: "incomplete_number", message: "Your card number is incomplete." },
    "Your card number is incomplete.",
  ],
  [{}, "The card payment was not completed. Try again."],
];

for (const [input, reason] of cases) {
  const described = describeFutureOrderV2CardError(input);
  assert.equal(described, `${reason} ${FUTURE_ORDER_V2_NOT_CHARGED}`, JSON.stringify(input));
  assert.ok(described.endsWith("You have not been charged."));
}

console.log("Future order V2 card error tests passed.");
