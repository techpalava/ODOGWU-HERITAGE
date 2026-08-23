# Fabric Inventory + Payment Checkpoint

**Status:** SAFE TO PARK for unrelated client UI work
**Branch:** `feat/automatic-fabric-inventory`
**Date:** 2026-08-23

Do **not** continue payment architecture from here until the deployment QA list below is complete.

---

## CURRENT IMPLEMENTED ARCHITECTURE

- **Canonical server checkout** — prepare-deposit revalidates catalogue, allocations, uploaded-design refs, shipping, and deposit pricing server-side.
- **Inventory reservations** — `inventory_reservations/{checkoutId}` with `ACTIVE | CONSUMED | RELEASED | EXPIRED`; `reservedStock` on Fabrics; `availableStock = stock - reservedStock`.
- **Prepare before PaymentIntent** — reserve inventory first; create/bind Stripe PI only after a successful hold; Stripe idempotency key `deposit_prepare_${checkoutId}`.
- **Exact quote ↔ reservation PI binding** — pre-PI both absent; bound both present and equal; asymmetric fields are `CHECKOUT_STATE_CONFLICT` (no auto-heal on prepare/retry).
- **Atomic prepare lifecycle** (`depositCheckoutLifecycle.ts`) — `assertPayablePreparedCheckout`, `bindPaymentIntentToCheckout`, `abortPreparedCheckoutAfterPaymentIntentFailure`.
- **PaymentElement** — official `@stripe/react-stripe-js` Elements + PaymentElement (no raw card inputs).
- **Webhook** — `POST /api/orders/stripe-webhook` verifies signature; success uses the same confirm finalization domain as browser confirm-deposit.
- **Safe release policy** — shared `makePaymentIntentNonPayableBeforeReservationRelease` for webhook `payment_failed`/`canceled`, customer release, and expiry reconcile.
- **Reservation consumption / release / expiry** — payment success converts ACTIVE → CONSUMED (stock and reserved both decrease); release only after PI is terminal/non-payable.
- **Realtime available stock** — Firestore fabric snapshots drive customer badges from available quantity.
- **Admin reservation protections** — stock edits and quick actions cannot set `stock < reservedStock`.

---

## FINAL STATE-MACHINE FIXES (this park pass)

1. **PI-less PREPARED still requires ACTIVE reservation** — every existing PREPARED quote loads/validates reservation before creating or returning payment data. `RELEASED`/`EXPIRED` → `STALE_CHECKOUT`; missing/asymmetric → conflict; never rebuild a released hold under the same checkout.
2. **Atomic PI-creation failure cleanup** — `abortPreparedCheckoutAfterPaymentIntentFailure` releases ACTIVE reservation and marks quote `CANCELLED` in one transaction (no release-then-swallowed quote write). Abort failure fails closed with no payment data.
3. **Exact quote/reservation PaymentIntent binding** — `bindPaymentIntentToCheckout` writes the same PI id to both sides only from pre-PI `PREPARED`+`ACTIVE`; prepare returns `clientSecret` only after bind succeeds.
4. **`payment_intent.payment_failed` does not release a retryable PI** — retrieve live Stripe status; `succeeded` finalizes; `processing`/`requires_capture`/`requires_action` retain; `requires_payment_method`/`requires_confirmation` cancel-then-release only if cancel verifies `canceled`; otherwise retain.
5. **Central safe-release policy** — webhook, customer cancel, and expiry reconciliation share the same helper so status tables cannot drift.
6. **Executable regressions** — `test_fabric_reservation_payment_integrity.ts` exercises prepare/bind/abort/webhook/customer-release paths with in-memory transactional stores (not source regexes).

### Exact prepare retry rules

| State | Result |
| --- | --- |
| PREPARED + ACTIVE + same PI bound both sides | return same PI/clientSecret; no new hold/PI |
| PREPARED + ACTIVE + no PI either side | may create PI; bind both; return only after bind |
| PREPARED + RELEASED/EXPIRED | `STALE_CHECKOUT`; no PI |
| PREPARED + missing reservation | conflict/stale; no PI |
| PREPARED + asymmetric PI fields | `CHECKOUT_STATE_CONFLICT`; no PI |
| CONFIRMED / agreed final | idempotent confirmed; never create PI |

---

## SECURITY FIXES (retained)

1. **Released/expired reservation cannot return a payable PI** — exact prepare retry requires `PREPARED` quote + `ACTIVE` reservation + owner/fingerprint/lines (+ exact PI symmetry).
2. **Webhook failure/cancel requires strict PI binding** — event PI id must match quote + reservation; metadata owner/checkout/fingerprint must match; mismatch → ignore (no release).
3. **Customer release checks Stripe payment state** — never release while PI can still succeed; cancel-then-release only after verified cancel.
4. **Admin quick stock actions respect reservedStock** — shared `assertStockCoversReserved`; out-of-stock quick action blocked when reserved &gt; 0.
5. **Malformed `reservedStock` fails closed** — only missing field defaults to 0; negative/NaN/non-integer do not inflate availability.
6. **Release underflow fails closed** — no `Math.max` clamp; `reservedStock < qty` throws and commits nothing.
7. **Expiry reconciliation** — uses the same non-payable-before-release policy as webhook/customer release.
8. **Timing-safe reconcile secret** — `timingSafeEqualString` for `RESERVATION_RECONCILE_SECRET`.
9. **Fingerprint** — includes canonical `customer.location`.
10. **Legacy `/api/create-payment-intent`** — refuses protected Design Studio metadata (`checkoutId`, `ownerUid`, `checkoutFingerprint`).

---

## DEPLOYMENT WORK STILL REQUIRED

- `STRIPE_SECRET_KEY`
- `VITE_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESERVATION_RECONCILE_SECRET`
- Stripe webhook registration → `/api/orders/stripe-webhook`
- Vercel reconciliation cron → `POST /api/orders/reconcile-expired-reservations` every 5–15 min with `x-reservation-reconcile-secret`
- Deploy updated `firestore.rules`
- Stripe **test-mode** end-to-end QA

---

## PAYMENTS-PAGE RESUME NOTE

> **Before the Payments page is considered production-ready, resume from this checkpoint and perform Stripe test-mode E2E QA, webhook QA, redirect/iDEAL QA, reservation expiry QA, and final independent security review.**

Do not treat PaymentElement UI polish, additional payment methods, or Payments-page redesign as in-scope until that QA pass completes.
