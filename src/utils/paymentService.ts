import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

/**
 * Lazily initializes the Stripe SDK client.
 * This pattern ensures that if STRIPE_SECRET_KEY is missing from environment variables,
 * the application does not crash on startup (e.g., during keyless testing or preview).
 * It will fail with a clear, descriptive error only when a payment API route is invoked.
 */
export function getStripeClient(): Stripe {
  if (stripeInstance) {
    return stripeInstance;
  }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || key.trim() === '' || key === 'MY_STRIPE_SECRET_KEY') {
    throw new Error('STRIPE_SECRET_KEY is not configured in the server environment. Please define it in your keys or .env file.');
  }

  stripeInstance = new Stripe(key);

  return stripeInstance;
}
