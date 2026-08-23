/**
 * How long an ACTIVE fabric reservation may hold stock before expiry cleanup
 * may release it (subject to Stripe payment-state checks).
 *
 * 30 minutes balances checkout + iDEAL redirect time in development/review
 * without locking inventory indefinitely. Production may raise this via the
 * same named constant (do not scatter literals).
 */
export const DEPOSIT_RESERVATION_MINUTES = 30;

export const depositReservationTtlMs = (): number =>
  DEPOSIT_RESERVATION_MINUTES * 60 * 1000;
