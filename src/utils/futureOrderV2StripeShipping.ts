import type { DeliveryAddress, FutureShippingStateV1 } from "../types.js";
import { FUTURE_PICKUP_ATELIER_ADDRESS } from "./designStudioFutureShipping.js";
import {
  isStep8FakeCountryCode,
  isValidIsoCountryCode,
  normalizeStep8CountryCode,
} from "./step8AdditionalDelivery.js";

/** Eindhoven atelier. Klarna shipping for pickup uses this address, not the contact's home address. */
const ATELIER_PICKUP_COUNTRY = "NL";

export interface FutureOrderV2StripeShippingAddress {
  readonly line1: string;
  readonly line2?: string;
  readonly city: string;
  readonly postalCode: string;
  readonly state?: string;
  readonly country: string;
}

/** Step 9 contact plus the address Stripe should store. Email is for Klarna billing, not the charge. */
export interface FutureOrderV2StripeShipping {
  readonly name: string;
  readonly email: string;
  readonly phone?: string;
  readonly address: FutureOrderV2StripeShippingAddress;
}

export interface FutureOrderV2KlarnaBillingDetails {
  readonly email: string;
  readonly name: string;
  readonly phone?: string;
  readonly address: {
    readonly line1: string;
    readonly line2?: string;
    readonly city: string;
    readonly postal_code: string;
    readonly state?: string;
    readonly country: string;
  };
}

const trimmed = (value: string | null | undefined): string => (value ?? "").trim();

/**
 * The display line is "street, postal code, city".
 * Pickup payments use that atelier address with country NL.
 */
const atelierPickupAddress = (): FutureOrderV2StripeShippingAddress | null => {
  const parts = FUTURE_PICKUP_ATELIER_ADDRESS.split(",").map((part) => part.trim());
  const [line1, postalCode, city] = parts;
  if (!line1 || !postalCode || !city || parts.length !== 3) return null;
  return {
    line1,
    city,
    postalCode,
    country: ATELIER_PICKUP_COUNTRY,
  };
};

const deliveryAddress = (
  address: DeliveryAddress | null | undefined,
): FutureOrderV2StripeShippingAddress | null => {
  if (!address) return null;
  const country = normalizeStep8CountryCode(address.countryCode);
  const line1 = trimmed(address.addressLine1);
  const city = trimmed(address.city);
  const postalCode = trimmed(address.postalCode);
  const line2 = trimmed(address.addressLine2);
  const state = trimmed(address.stateRegion);
  if (
    !line1 ||
    !city ||
    !postalCode ||
    !isValidIsoCountryCode(country) ||
    isStep8FakeCountryCode(country)
  ) {
    return null;
  }
  return {
    line1,
    ...(line2 ? { line2 } : {}),
    city,
    ...(state ? { state } : {}),
    postalCode,
    country,
  };
};

/**
 * Shipping for the shared card / iDEAL / Klarna PaymentIntent.
 * Pickup uses the atelier address. Delivery uses the persisted Step 9 address.
 * Returns null when the address is not a Stripe country, so card and iDEAL can still be created.
 */
export const resolveFutureOrderV2StripeShipping = (
  state: FutureShippingStateV1 | null | undefined,
): FutureOrderV2StripeShipping | null => {
  const customer = state?.customerInformation;
  const name = trimmed(customer?.fullName);
  const email = trimmed(customer?.email);
  const phone = trimmed(customer?.phone);
  if (!name || !email) return null;

  const address =
    state?.fulfilmentMethod === "eindhoven_pickup"
      ? atelierPickupAddress()
      : state?.fulfilmentMethod === "destination_delivery"
        ? deliveryAddress(customer?.deliveryAddress)
        : null;
  if (!address) return null;

  return {
    name,
    email,
    ...(phone ? { phone } : {}),
    address,
  };
};

/** Billing details Klarna requires at confirm time. The PaymentIntent amount is unchanged. */
export const toFutureOrderV2KlarnaBillingDetails = (
  shipping: FutureOrderV2StripeShipping,
): FutureOrderV2KlarnaBillingDetails => ({
  email: shipping.email,
  name: shipping.name,
  ...(shipping.phone ? { phone: shipping.phone } : {}),
  address: {
    line1: shipping.address.line1,
    ...(shipping.address.line2 ? { line2: shipping.address.line2 } : {}),
    city: shipping.address.city,
    ...(shipping.address.state ? { state: shipping.address.state } : {}),
    postal_code: shipping.address.postalCode,
    country: shipping.address.country,
  },
});
