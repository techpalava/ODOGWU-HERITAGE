/** Absolute production detection. VERCEL_ENV wins when set. */
export const isProductionRuntime = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  if (typeof env.VERCEL_ENV === "string" && env.VERCEL_ENV.length > 0) {
    return env.VERCEL_ENV === "production";
  }
  return env.NODE_ENV === "production";
};

/**
 * Simulated deposit confirmation is NEVER allowed in production,
 * even if ALLOW_SIMULATED_DEPOSIT_PAYMENT=true.
 */
export const isSimulatedDepositPaymentAllowed = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  if (isProductionRuntime(env)) {
    return false;
  }
  const explicit = env.ALLOW_SIMULATED_DEPOSIT_PAYMENT;
  if (explicit === "1" || explicit === "true") return true;
  if (explicit === "0" || explicit === "false") return false;
  const stripeKey = env.STRIPE_SECRET_KEY;
  const hasLiveStripe =
    typeof stripeKey === "string" &&
    stripeKey.trim() !== "" &&
    stripeKey !== "MY_STRIPE_SECRET_KEY";
  return !hasLiveStripe;
};

export type DepositPaymentProof =
  | {
      provider: "stripe";
      paymentIntentId: string;
    }
  | {
      provider: "simulated";
      checkoutId: string;
      simulationToken: string;
    };

export type VerifiedDepositPayment = {
  provider: "stripe" | "simulated";
  paymentIntentId: string;
  checkoutId: string;
  amountCents: number;
  currency: "eur";
  ownerUid: string;
  checkoutFingerprint: string;
};

export class DepositPaymentVerificationError extends Error {
  readonly code:
    | "PAYMENT_NOT_CONFIRMED"
    | "PAYMENT_MISMATCH"
    | "PAYMENT_ALREADY_USED"
    | "SERVER_ERROR";

  constructor(
    code: DepositPaymentVerificationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "DepositPaymentVerificationError";
    this.code = code;
  }
}

export type StripePaymentIntentLike = {
  id: string;
  status: string;
  amount: number;
  currency: string;
  metadata?: Record<string, string> | null;
};

export type StripeRetriever = {
  paymentIntents: {
    retrieve(id: string): Promise<StripePaymentIntentLike>;
  };
};

export const requireStripeMetadata = (
  metadata: Record<string, string> | null | undefined,
  key: string,
): string => {
  const value = metadata?.[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DepositPaymentVerificationError(
      "PAYMENT_MISMATCH",
      `Stripe PaymentIntent is missing required metadata.${key}.`,
    );
  }
  return value.trim();
};

/**
 * Verify a Stripe PaymentIntent against a trusted checkout quote.
 * All binding metadata is mandatory.
 */
export const verifyStripeDepositPaymentIntent = async (input: {
  paymentIntentId: string;
  authenticatedUid: string;
  checkoutId: string;
  expectedDepositCents: number;
  expectedCheckoutFingerprint: string;
  stripe: StripeRetriever;
}): Promise<VerifiedDepositPayment> => {
  let paymentIntent: StripePaymentIntentLike;
  try {
    paymentIntent = await input.stripe.paymentIntents.retrieve(
      input.paymentIntentId,
    );
  } catch {
    throw new DepositPaymentVerificationError(
      "PAYMENT_NOT_CONFIRMED",
      "Stripe PaymentIntent could not be verified.",
    );
  }

  if (paymentIntent.id !== input.paymentIntentId) {
    throw new DepositPaymentVerificationError(
      "PAYMENT_MISMATCH",
      "Stripe PaymentIntent ID mismatch.",
    );
  }
  if (paymentIntent.status !== "succeeded") {
    throw new DepositPaymentVerificationError(
      "PAYMENT_NOT_CONFIRMED",
      "Stripe PaymentIntent has not succeeded.",
    );
  }
  if (paymentIntent.currency !== "eur") {
    throw new DepositPaymentVerificationError(
      "PAYMENT_MISMATCH",
      "Deposit currency must be EUR.",
    );
  }
  if (paymentIntent.amount !== input.expectedDepositCents) {
    throw new DepositPaymentVerificationError(
      "PAYMENT_MISMATCH",
      "Stripe PaymentIntent amount does not match the trusted deposit quote.",
    );
  }

  const ownerUid = requireStripeMetadata(paymentIntent.metadata, "ownerUid");
  const checkoutId = requireStripeMetadata(paymentIntent.metadata, "checkoutId");
  const checkoutFingerprint = requireStripeMetadata(
    paymentIntent.metadata,
    "checkoutFingerprint",
  );

  if (ownerUid !== input.authenticatedUid) {
    throw new DepositPaymentVerificationError(
      "PAYMENT_MISMATCH",
      "Stripe PaymentIntent owner does not match the authenticated customer.",
    );
  }
  if (checkoutId !== input.checkoutId) {
    throw new DepositPaymentVerificationError(
      "PAYMENT_MISMATCH",
      "Stripe PaymentIntent checkout does not match this deposit checkout.",
    );
  }
  if (checkoutFingerprint !== input.expectedCheckoutFingerprint) {
    throw new DepositPaymentVerificationError(
      "PAYMENT_MISMATCH",
      "Stripe PaymentIntent fingerprint does not match the trusted checkout quote.",
    );
  }

  return {
    provider: "stripe",
    paymentIntentId: paymentIntent.id,
    checkoutId,
    amountCents: paymentIntent.amount,
    currency: "eur",
    ownerUid,
    checkoutFingerprint,
  };
};

export const verifySimulatedDepositPayment = (input: {
  checkoutId: string;
  simulationToken: string;
  expectedSimulationToken: string;
  authenticatedUid: string;
  expectedDepositCents: number;
  expectedCheckoutFingerprint: string;
  env?: NodeJS.ProcessEnv;
}): VerifiedDepositPayment => {
  if (!isSimulatedDepositPaymentAllowed(input.env)) {
    throw new DepositPaymentVerificationError(
      "PAYMENT_NOT_CONFIRMED",
      "Simulated deposit payment is not allowed in this environment.",
    );
  }
  if (input.simulationToken !== input.expectedSimulationToken) {
    throw new DepositPaymentVerificationError(
      "PAYMENT_MISMATCH",
      "Simulated payment token does not match the trusted checkout quote.",
    );
  }
  return {
    provider: "simulated",
    paymentIntentId: `sim_${input.checkoutId}`,
    checkoutId: input.checkoutId,
    amountCents: input.expectedDepositCents,
    currency: "eur",
    ownerUid: input.authenticatedUid,
    checkoutFingerprint: input.expectedCheckoutFingerprint,
  };
};

/**
 * Verify client payment proof against a trusted checkout quote.
 */
export const verifyDepositPaymentProof = async (input: {
  paymentProof: DepositPaymentProof;
  authenticatedUid: string;
  checkoutId: string;
  checkoutFingerprint: string;
  expectedDepositCents: number;
  expectedPaymentIntentId: string;
  simulationToken?: string;
  stripe?: StripeRetriever | null;
  env?: NodeJS.ProcessEnv;
}): Promise<VerifiedDepositPayment> => {
  if (input.paymentProof.provider === "stripe") {
    if (input.paymentProof.paymentIntentId !== input.expectedPaymentIntentId) {
      throw new DepositPaymentVerificationError(
        "PAYMENT_MISMATCH",
        "paymentIntentId does not match the prepared checkout quote.",
      );
    }
    if (!input.stripe) {
      throw new DepositPaymentVerificationError(
        "PAYMENT_NOT_CONFIRMED",
        "Stripe payment verification is unavailable.",
      );
    }
    return verifyStripeDepositPaymentIntent({
      paymentIntentId: input.paymentProof.paymentIntentId,
      authenticatedUid: input.authenticatedUid,
      checkoutId: input.checkoutId,
      expectedDepositCents: input.expectedDepositCents,
      expectedCheckoutFingerprint: input.checkoutFingerprint,
      stripe: input.stripe,
    });
  }

  if (input.paymentProof.checkoutId !== input.checkoutId) {
    throw new DepositPaymentVerificationError(
      "PAYMENT_MISMATCH",
      "Simulated payment checkoutId does not match the quote.",
    );
  }
  if (
    typeof input.simulationToken !== "string" ||
    input.simulationToken.trim().length === 0
  ) {
    throw new DepositPaymentVerificationError(
      "PAYMENT_NOT_CONFIRMED",
      "Simulated payment requires a server-issued simulation token.",
    );
  }
  if (input.expectedPaymentIntentId !== `sim_${input.checkoutId}`) {
    throw new DepositPaymentVerificationError(
      "PAYMENT_MISMATCH",
      "Simulated PaymentIntent id does not match the prepared quote.",
    );
  }

  return verifySimulatedDepositPayment({
    checkoutId: input.checkoutId,
    simulationToken: input.paymentProof.simulationToken,
    expectedSimulationToken: input.simulationToken,
    authenticatedUid: input.authenticatedUid,
    expectedDepositCents: input.expectedDepositCents,
    expectedCheckoutFingerprint: input.checkoutFingerprint,
    env: input.env,
  });
};
