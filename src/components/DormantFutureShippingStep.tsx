import {
  CheckCircle2,
  Info,
  LockKeyhole,
  MapPin,
  PackageCheck,
  RefreshCw,
  Truck,
} from "lucide-react";
import { DesignStudioBackButton } from "./DesignStudioBackButton";
import type {
  FutureShippingDestinationZone,
  FutureShippingFulfilmentSelection,
  FutureShippingStateV1,
} from "../types";
import {
  FUTURE_SHIPPING_DESTINATION_ZONE_OPTIONS,
  type FutureShippingFieldId,
  type FutureShippingStageResolution,
} from "../utils/designStudioFutureShipping";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";

interface DormantFutureShippingStepProps {
  state: FutureShippingStateV1;
  resolution: FutureShippingStageResolution;
  selectedDesignPrice: number | null;
  garmentCount: number;
  onChange: (state: FutureShippingStateV1) => void;
  onRefreshQuote: () => void;
  onBack: () => void;
  canContinueToReview: boolean;
  onContinueToReview: () => void;
}

const moneyFromCents = (amountCents: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${(amountCents / 100).toFixed(2)}`;

const money = (amount: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${amount.toFixed(2)}`;

const inputClassName =
  "min-h-11 w-full min-w-0 rounded-xl border border-heritage-green/20 bg-white px-3 py-2.5 text-sm text-heritage-ink outline-none transition placeholder:text-heritage-ink/35 focus:border-heritage-gold focus:ring-2 focus:ring-heritage-gold/25";

export const DormantFutureShippingStep = ({
  state,
  resolution,
  selectedDesignPrice,
  garmentCount,
  onChange,
  onRefreshQuote,
  onBack,
  canContinueToReview,
  onContinueToReview,
}: DormantFutureShippingStepProps) => {
  const customer = state.customerInformation;
  const address = customer.deliveryAddress;
  const errorFor = (field: FutureShippingFieldId) =>
    resolution.diagnostics.find((diagnostic) => diagnostic.field === field);
  const updateCustomer = (
    patch: Partial<FutureShippingStateV1["customerInformation"]>,
  ) =>
    onChange({
      ...state,
      customerInformation: { ...customer, ...patch },
    });
  const updateAddress = (
    patch: Partial<FutureShippingStateV1["customerInformation"]["deliveryAddress"]>,
  ) =>
    updateCustomer({
      deliveryAddress: { ...address, ...patch },
    });
  const selectFulfilment = (
    fulfilmentMethod: FutureShippingFulfilmentSelection,
  ) => onChange({ ...state, fulfilmentMethod, quoteReference: null });
  const selectDestinationZone = (
    destinationZoneId: FutureShippingDestinationZone | null,
  ) =>
    onChange({
      ...state,
      destinationZoneId,
      destinationZoneSource: destinationZoneId
        ? "customer_provisional"
        : null,
    });
  const isDelivery = state.fulfilmentMethod === "destination_delivery";
  const statusMessage =
    resolution.status === "quote_ready"
      ? `Post-Eindhoven baseline delivery is available for ${resolution.destinationLabel}.`
      : resolution.status === "pickup_arrangement_pending"
        ? "Your contact details are complete. The collection location and any applicable fee will be confirmed."
        : resolution.status === "quote_stale"
          ? "Shipping details changed. Refresh the delivery status before continuing later."
          : resolution.status === "quote_pending"
            ? "A parcel estimate or delivery quote is still required."
            : resolution.status === "quote_unavailable"
              ? "A post-Eindhoven delivery quote is required for this selection."
              : resolution.diagnostics[0]?.message ||
                "Complete the Shipping information below.";

  return (
    <section
      aria-labelledby="future-shipping-title"
      data-stage-id="shipping"
      data-shipping-status={resolution.status}
      className="mx-auto max-w-6xl space-y-5 font-sans"
    >
      <header className="rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <DesignStudioBackButton
          destination="Summary"
          onClick={onBack}
          className="mb-5"
        />
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
          Step 8 of 9
        </p>
        <h2
          id="future-shipping-title"
          className="mt-2 font-serif text-2xl font-bold text-heritage-green sm:text-3xl"
        >
          Shipping &amp; Collection
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
          Choose how you want to receive your order after it arrives in Eindhoven.
        </p>
      </header>

      <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-heritage-green/20 bg-heritage-green/5 p-4 sm:p-5">
        <Info aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-green" size={19} />
        <p className="min-w-0 text-sm font-semibold leading-relaxed text-heritage-green">
          Lagos-to-Eindhoven shipping: Included in Garment Construction.
        </p>
      </div>

      <fieldset
        aria-describedby={
          errorFor("fulfilmentMethod")
            ? "future-shipping-fulfilment-error"
            : undefined
        }
        className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6"
      >
        <legend className="px-1 font-serif text-lg font-bold text-heritage-green">
          How would you like to receive your order?
        </legend>
        <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
          <label
            className={`flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${
              state.fulfilmentMethod === "eindhoven_pickup"
                ? "border-heritage-gold bg-heritage-gold/8"
                : "border-heritage-green/15 hover:border-heritage-gold/50"
            }`}
          >
            <input
              type="radio"
              name="future-fulfilment-method"
              value="eindhoven_pickup"
              checked={state.fulfilmentMethod === "eindhoven_pickup"}
              onChange={() => selectFulfilment("eindhoven_pickup")}
              className="mt-1 h-4 w-4 shrink-0 accent-heritage-green"
            />
            <MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-gold" size={19} />
            <span className="min-w-0">
              <span className="block break-words font-bold text-heritage-green">
                Collect in Eindhoven
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-heritage-ink/65">
                The arranged collection location and any applicable collection fee will be confirmed.
              </span>
            </span>
          </label>
          <label
            className={`flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${
              state.fulfilmentMethod === "destination_delivery"
                ? "border-heritage-gold bg-heritage-gold/8"
                : "border-heritage-green/15 hover:border-heritage-gold/50"
            }`}
          >
            <input
              type="radio"
              name="future-fulfilment-method"
              value="destination_delivery"
              checked={state.fulfilmentMethod === "destination_delivery"}
              onChange={() => selectFulfilment("destination_delivery")}
              className="mt-1 h-4 w-4 shrink-0 accent-heritage-green"
            />
            <Truck aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-gold" size={19} />
            <span className="min-w-0">
              <span className="block break-words font-bold text-heritage-green">
                Deliver to another location
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-heritage-ink/65">
                Enter the delivery address and select a provisional destination region.
              </span>
            </span>
          </label>
        </div>
        {errorFor("fulfilmentMethod") && (
          <p id="future-shipping-fulfilment-error" className="mt-2 text-xs text-red-700">
            {errorFor("fulfilmentMethod")!.message}
          </p>
        )}
      </fieldset>

      {state.fulfilmentMethod && (
        <section className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="font-serif text-lg font-bold text-heritage-green">
            Shipping information
          </h3>
          <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
            <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65">
              Full name
              <input
                value={customer.fullName}
                onChange={(event) => updateCustomer({ fullName: event.target.value })}
                aria-invalid={Boolean(errorFor("fullName"))}
                aria-describedby={errorFor("fullName") ? "future-shipping-full-name-error" : undefined}
                autoComplete="name"
                className={`${inputClassName} mt-1.5`}
              />
              {errorFor("fullName") && (
                <span id="future-shipping-full-name-error" className="mt-1 block normal-case tracking-normal text-red-700">
                  {errorFor("fullName")!.message}
                </span>
              )}
            </label>
            <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65">
              Phone number
              <input
                type="tel"
                value={customer.phone}
                onChange={(event) => updateCustomer({ phone: event.target.value })}
                aria-invalid={Boolean(errorFor("phone"))}
                aria-describedby={errorFor("phone") ? "future-shipping-phone-error" : undefined}
                autoComplete="tel"
                className={`${inputClassName} mt-1.5`}
              />
              {errorFor("phone") && (
                <span id="future-shipping-phone-error" className="mt-1 block normal-case tracking-normal text-red-700">
                  {errorFor("phone")!.message}
                </span>
              )}
            </label>
            <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65 md:col-span-2">
              Email
              <input
                type="email"
                value={customer.email}
                onChange={(event) => updateCustomer({ email: event.target.value })}
                aria-invalid={Boolean(errorFor("email"))}
                aria-describedby={errorFor("email") ? "future-shipping-email-error" : undefined}
                autoComplete="email"
                className={`${inputClassName} mt-1.5`}
              />
              {errorFor("email") && (
                <span id="future-shipping-email-error" className="mt-1 block normal-case tracking-normal text-red-700">
                  {errorFor("email")!.message}
                </span>
              )}
            </label>

            {isDelivery && (
              <>
                <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65 md:col-span-2">
                  Address line 1
                  <input
                    value={address.addressLine1}
                    onChange={(event) => updateAddress({ addressLine1: event.target.value })}
                    aria-invalid={Boolean(errorFor("addressLine1"))}
                    aria-describedby={errorFor("addressLine1") ? "future-shipping-address-error" : undefined}
                    autoComplete="address-line1"
                    className={`${inputClassName} mt-1.5`}
                  />
                  {errorFor("addressLine1") && (
                    <span id="future-shipping-address-error" className="mt-1 block normal-case tracking-normal text-red-700">
                      {errorFor("addressLine1")!.message}
                    </span>
                  )}
                </label>
                <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65 md:col-span-2">
                  Address line 2 <span className="font-normal normal-case tracking-normal">(optional)</span>
                  <input
                    value={address.addressLine2 || ""}
                    onChange={(event) => updateAddress({ addressLine2: event.target.value })}
                    autoComplete="address-line2"
                    className={`${inputClassName} mt-1.5`}
                  />
                </label>
                <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65">
                  City
                  <input
                    value={address.city}
                    onChange={(event) => updateAddress({ city: event.target.value })}
                    aria-invalid={Boolean(errorFor("city"))}
                    aria-describedby={errorFor("city") ? "future-shipping-city-error" : undefined}
                    autoComplete="address-level2"
                    className={`${inputClassName} mt-1.5`}
                  />
                  {errorFor("city") && (
                    <span id="future-shipping-city-error" className="mt-1 block normal-case tracking-normal text-red-700">
                      {errorFor("city")!.message}
                    </span>
                  )}
                </label>
                <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65">
                  Postal code
                  <input
                    value={address.postalCode}
                    onChange={(event) => updateAddress({ postalCode: event.target.value })}
                    aria-invalid={Boolean(errorFor("postalCode"))}
                    aria-describedby={errorFor("postalCode") ? "future-shipping-postal-error" : undefined}
                    autoComplete="postal-code"
                    className={`${inputClassName} mt-1.5`}
                  />
                  {errorFor("postalCode") && (
                    <span id="future-shipping-postal-error" className="mt-1 block normal-case tracking-normal text-red-700">
                      {errorFor("postalCode")!.message}
                    </span>
                  )}
                </label>
                <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65">
                  Country code
                  <input
                    value={address.countryCode}
                    onChange={(event) => updateAddress({ countryCode: event.target.value })}
                    aria-invalid={Boolean(errorFor("countryCode"))}
                    aria-describedby={errorFor("countryCode") ? "future-shipping-country-error" : undefined}
                    autoComplete="country"
                    placeholder="e.g. NL"
                    className={`${inputClassName} mt-1.5`}
                  />
                  {errorFor("countryCode") && (
                    <span id="future-shipping-country-error" className="mt-1 block normal-case tracking-normal text-red-700">
                      {errorFor("countryCode")!.message}
                    </span>
                  )}
                </label>
                <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65">
                  Destination region
                  <select
                    value={state.destinationZoneId || ""}
                    onChange={(event) =>
                      selectDestinationZone(
                        (event.target.value || null) as FutureShippingDestinationZone | null,
                      )
                    }
                    aria-invalid={Boolean(errorFor("destinationZoneId"))}
                    aria-describedby={errorFor("destinationZoneId") ? "future-shipping-zone-error" : "future-shipping-zone-help"}
                    className={`${inputClassName} mt-1.5`}
                  >
                    <option value="">Select region</option>
                    {FUTURE_SHIPPING_DESTINATION_ZONE_OPTIONS.map((zone) => (
                      <option key={zone.id} value={zone.id}>{zone.label}</option>
                    ))}
                  </select>
                  <span id="future-shipping-zone-help" className="mt-1 block normal-case tracking-normal text-heritage-ink/50">
                    This selection is provisional until authoritative country mapping is available.
                  </span>
                  {errorFor("destinationZoneId") && (
                    <span id="future-shipping-zone-error" className="mt-1 block normal-case tracking-normal text-red-700">
                      {errorFor("destinationZoneId")!.message}
                    </span>
                  )}
                </label>
              </>
            )}

            <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65 md:col-span-2">
              Comment <span className="font-normal normal-case tracking-normal">(optional)</span>
              <textarea
                value={customer.comment}
                onChange={(event) => updateCustomer({ comment: event.target.value })}
                rows={4}
                className={`${inputClassName} mt-1.5 resize-y`}
              />
            </label>
          </div>
        </section>
      )}

      <section className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6">
        <div aria-live="polite" role="status" className="flex min-w-0 items-start gap-3">
          {resolution.status === "quote_ready" ? (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-green" size={19} />
          ) : (
            <PackageCheck aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-gold" size={19} />
          )}
          <div className="min-w-0">
            <h3 className="font-serif text-lg font-bold text-heritage-green">
              Delivery status
            </h3>
            <p className="mt-1 break-words text-sm leading-relaxed text-heritage-ink/70">
              {statusMessage}
            </p>
            <p className="mt-2 text-xs text-heritage-ink/55">
              Garment count from Step 1: {garmentCount}
            </p>
            {resolution.status === "quote_stale" && (
              <button
                type="button"
                onClick={onRefreshQuote}
                className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/25 px-4 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                <RefreshCw aria-hidden="true" size={14} />
                Refresh delivery status
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="min-w-0 rounded-2xl border border-heritage-gold/30 bg-heritage-green p-5 text-white shadow-sm sm:p-6">
        <h3 className="font-serif text-xl font-bold">Price overview</h3>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex min-w-0 flex-wrap justify-between gap-2">
            <dt className="min-w-0 break-words">Selected Design Price</dt>
            <dd className="shrink-0 font-mono font-bold">
              {selectedDesignPrice === null ? "Pending" : money(selectedDesignPrice)}
            </dd>
          </div>
          <p className="text-xs leading-relaxed text-white/70">
            Garment construction includes fabric, tax, Lagos-to-Eindhoven
            shipping, and sewing.
          </p>
          <div className="border-t border-white/15 pt-3">
            <div className="flex min-w-0 flex-wrap justify-between gap-2">
              <dt className="min-w-0 break-words">Post-Eindhoven adjustment</dt>
              <dd className="shrink-0 font-mono font-bold">
                {resolution.postEindhovenAdjustmentCents === null
                  ? "Pending confirmation"
                  : moneyFromCents(resolution.postEindhovenAdjustmentCents)}
              </dd>
            </div>
            {resolution.quoteReady && resolution.destinationLabel && (
              <p className="mt-1 text-xs text-white/70">
                Baseline delivery to {resolution.destinationLabel}, confirmed by the future tariff resolver.
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-wrap justify-between gap-2 border-t border-white/15 pt-3 text-base">
            <dt className="font-bold">Projected total</dt>
            <dd className="shrink-0 font-mono font-bold">
              {resolution.projectedTotalCents === null
                ? "Available after confirmation"
                : moneyFromCents(resolution.projectedTotalCents)}
            </dd>
          </div>
        </dl>
      </section>

      <footer className="rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <DesignStudioBackButton
            destination="Summary"
            onClick={onBack}
            className="w-full sm:w-auto"
          />
          <div className="min-w-0 sm:text-right">
            <p id="future-payment-lock-reason" className="mb-2 text-xs leading-relaxed text-heritage-ink/60">
              {canContinueToReview
                ? "Your order review is ready. Online payment remains unavailable."
                : "Complete all Shipping requirements before reviewing your order."}
            </p>
            <button
              type="button"
              onClick={onContinueToReview}
              disabled={!canContinueToReview}
              aria-describedby="future-payment-lock-reason"
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-heritage-green/35 sm:w-auto"
            >
              {canContinueToReview ? (
                <PackageCheck aria-hidden="true" size={14} />
              ) : (
                <LockKeyhole aria-hidden="true" size={14} />
              )}
              Review Order
            </button>
          </div>
        </div>
      </footer>
    </section>
  );
};
