import {
  CheckCircle2,
  Info,
  LockKeyhole,
  MapPin,
  PackageCheck,
  Truck,
} from "lucide-react";
import { DesignStudioBackButton } from "./DesignStudioBackButton";
import type {
  FutureShippingFulfilmentSelection,
  FutureShippingStateV1,
} from "../types";
import {
  STEP8_CUSTOMER_COUNTRY_GROUPS,
  STEP8_OTHER_DESTINATION_LABEL,
  STEP8_OTHER_DESTINATION_SELECT_VALUE,
} from "../config/Step8AdditionalDeliveryConfig";
import {
  type FutureShippingFieldId,
  type FutureShippingStageResolution,
} from "../utils/designStudioFutureShipping";
import {
  formatStep8CustomerDestination,
  step8RequiresRegion,
} from "../utils/step8AdditionalDelivery";
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
  ) =>
    onChange({
      ...state,
      fulfilmentMethod,
      destinationSelectionMode:
        fulfilmentMethod === "destination_delivery"
          ? state.destinationSelectionMode
          : null,
      quoteReference: null,
    });
  const selectDeliveryCountry = (value: string) => {
    if (value === STEP8_OTHER_DESTINATION_SELECT_VALUE) {
      onChange({
        ...state,
        destinationSelectionMode: "other_destination",
        quoteReference: null,
        customerInformation: {
          ...customer,
          deliveryAddress: { ...address, countryCode: "" },
        },
      });
      return;
    }
    onChange({
      ...state,
      destinationSelectionMode: value ? "supported_country" : null,
      otherDestinationCountry: "",
      quoteReference: null,
      customerInformation: {
        ...customer,
        deliveryAddress: { ...address, countryCode: value },
      },
    });
  };
  const isDelivery = state.fulfilmentMethod === "destination_delivery";
  const isPickup = state.fulfilmentMethod === "eindhoven_pickup";
  const isOtherDestination =
    isDelivery && state.destinationSelectionMode === "other_destination";
  const regionRequired = !isOtherDestination && step8RequiresRegion(address.countryCode);
  const countrySelectValue = isOtherDestination
    ? STEP8_OTHER_DESTINATION_SELECT_VALUE
    : address.countryCode || "";
  const showDeliverySummary =
    isPickup ||
    (isDelivery &&
      Boolean(
        address.city &&
          address.addressLine1 &&
          (isOtherDestination
            ? state.otherDestinationCountry
            : address.countryCode),
      ));
  const statusMessage =
    resolution.status === "quote_ready"
      ? isPickup
        ? "Pickup contact details are complete. Additional Delivery is €0.00."
        : `Additional Delivery is ready for ${resolution.destinationLabel}.`
      : resolution.status === "quote_pending" || resolution.quoteRequired
        ? isOtherDestination
          ? "Shipping to this destination requires a custom quote."
          : "Custom shipping quote required"
        : resolution.diagnostics[0]?.message ||
          "Complete the delivery details below.";

  return (
    <section
      aria-labelledby="future-shipping-title"
      data-stage-id="shipping"
      data-shipping-status={resolution.status}
      className="mx-auto max-w-6xl space-y-5 overflow-x-hidden font-sans"
    >
      <header className="min-w-0 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
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
          Delivery &amp; Pickup
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-heritage-ink/70">
          How would you like to receive your order?
        </p>
      </header>

      <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-heritage-green/20 bg-heritage-green/5 p-4 sm:p-5">
        <Info aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-green" size={19} />
        <p className="min-w-0 text-sm font-semibold leading-relaxed text-heritage-green">
          Standard Shipping to Eindhoven is already included. Step 8 only adds
          pickup or additional delivery from Eindhoven.
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
              isPickup
                ? "border-heritage-gold bg-heritage-gold/8"
                : "border-heritage-green/15 hover:border-heritage-gold/50"
            }`}
          >
            <input
              type="radio"
              name="future-fulfilment-method"
              value="eindhoven_pickup"
              checked={isPickup}
              onChange={() => selectFulfilment("eindhoven_pickup")}
              className="mt-1 h-4 w-4 shrink-0 accent-heritage-green"
            />
            <MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-gold" size={19} />
            <span className="min-w-0">
              <span className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
                <span className="break-words font-bold text-heritage-green">
                  Pick Up in Eindhoven
                </span>
                <span className="shrink-0 font-mono text-xs font-bold text-heritage-green">
                  Free · €0.00
                </span>
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-heritage-ink/65">
                Pick up your finished order at an arranged location in Eindhoven.
              </span>
            </span>
          </label>
          <label
            className={`flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition focus-within:ring-2 focus-within:ring-heritage-gold focus-within:ring-offset-2 ${
              isDelivery
                ? "border-heritage-gold bg-heritage-gold/8"
                : "border-heritage-green/15 hover:border-heritage-gold/50"
            }`}
          >
            <input
              type="radio"
              name="future-fulfilment-method"
              value="destination_delivery"
              checked={isDelivery}
              onChange={() => selectFulfilment("destination_delivery")}
              className="mt-1 h-4 w-4 shrink-0 accent-heritage-green"
            />
            <Truck aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-gold" size={19} />
            <span className="min-w-0">
              <span className="block break-words font-bold text-heritage-green">
                Deliver to an Address
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-heritage-ink/65">
                Additional delivery cost is based on destination and estimated shipment weight.
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
            {isPickup ? "Pickup contact" : "Delivery details"}
          </h3>
          <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
            <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65">
              {isPickup ? "Full name" : "Recipient name"}
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
              Phone
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
                  Delivery Country
                  <select
                    value={countrySelectValue}
                    onChange={(event) => selectDeliveryCountry(event.target.value)}
                    aria-invalid={Boolean(errorFor("countryCode") || errorFor("otherDestinationCountry"))}
                    aria-describedby={
                      errorFor("countryCode")
                        ? "future-shipping-country-error"
                        : "future-shipping-country-help"
                    }
                    autoComplete="country"
                    className={`${inputClassName} mt-1.5`}
                  >
                    <option value="">Select a supported country</option>
                    {STEP8_CUSTOMER_COUNTRY_GROUPS.map((group) => (
                      <optgroup key={group.id} label={group.label}>
                        {group.countries.map((country) => (
                          <option key={country.countryCode} value={country.countryCode}>
                            {country.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <optgroup label="Other Destination">
                      <option value={STEP8_OTHER_DESTINATION_SELECT_VALUE}>
                        {STEP8_OTHER_DESTINATION_LABEL}
                      </option>
                    </optgroup>
                  </select>
                  <span
                    id="future-shipping-country-help"
                    className="mt-1 block font-normal normal-case tracking-normal text-heritage-ink/55"
                  >
                    Select a supported delivery country or request a custom shipping quote for another destination.
                  </span>
                  {errorFor("countryCode") && (
                    <span id="future-shipping-country-error" className="mt-1 block normal-case tracking-normal text-red-700">
                      {errorFor("countryCode")!.message}
                    </span>
                  )}
                </label>
                {isOtherDestination && (
                  <div className="min-w-0 rounded-xl border border-heritage-gold/30 bg-heritage-gold/5 p-3 md:col-span-2">
                    <p className="text-sm font-semibold text-heritage-green">
                      Shipping to this destination requires a custom quote.
                    </p>
                    <label className="mt-3 block min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65">
                      Destination country / territory
                      <input
                        value={state.otherDestinationCountry}
                        onChange={(event) =>
                          onChange({
                            ...state,
                            otherDestinationCountry: event.target.value,
                          })
                        }
                        aria-invalid={Boolean(errorFor("otherDestinationCountry"))}
                        aria-describedby={
                          errorFor("otherDestinationCountry")
                            ? "future-shipping-other-destination-error"
                            : undefined
                        }
                        className={`${inputClassName} mt-1.5`}
                      />
                      {errorFor("otherDestinationCountry") && (
                        <span
                          id="future-shipping-other-destination-error"
                          className="mt-1 block normal-case tracking-normal text-red-700"
                        >
                          {errorFor("otherDestinationCountry")!.message}
                        </span>
                      )}
                    </label>
                  </div>
                )}
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
                  State / Province / Region{" "}
                  {regionRequired ? null : (
                    <span className="font-normal normal-case tracking-normal">(if applicable)</span>
                  )}
                  <input
                    value={address.stateRegion || ""}
                    onChange={(event) => updateAddress({ stateRegion: event.target.value })}
                    aria-invalid={Boolean(errorFor("stateRegion"))}
                    aria-describedby={
                      errorFor("stateRegion") ? "future-shipping-region-error" : undefined
                    }
                    autoComplete="address-level1"
                    className={`${inputClassName} mt-1.5`}
                  />
                  {errorFor("stateRegion") && (
                    <span
                      id="future-shipping-region-error"
                      className="mt-1 block normal-case tracking-normal text-red-700"
                    >
                      {errorFor("stateRegion")!.message}
                    </span>
                  )}
                </label>
                <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65">
                  Postal / ZIP code
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
              </>
            )}

            <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65 md:col-span-2">
              {isPickup ? "Comment / Pickup note" : "Delivery comment"}{" "}
              <span className="font-normal normal-case tracking-normal">(optional)</span>
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

      {showDeliverySummary && (
        <section
          data-delivery-summary="true"
          className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6"
        >
          <h3 className="font-serif text-lg font-bold text-heritage-green">
            Delivery Summary
          </h3>
          <dl className="mt-4 grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/50">
                Method
              </dt>
              <dd className="mt-1 break-words font-semibold text-heritage-green">
                {isPickup ? "Pick Up in Eindhoven" : "Deliver to an Address"}
              </dd>
            </div>
            {isDelivery && (
              <>
                <div className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/50">
                    Destination
                  </dt>
                  <dd className="mt-1 break-words font-semibold text-heritage-green">
                    {formatStep8CustomerDestination({
                      city: address.city,
                      countryCode: address.countryCode,
                      otherDestinationCountry: state.otherDestinationCountry,
                    }) ||
                      resolution.destinationLabel ||
                      "Pending"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/50">
                    Shipment Weight
                  </dt>
                  <dd className="mt-1 font-mono font-semibold text-heritage-green">
                    {resolution.parcelWeightKg === null
                      ? "Pending"
                      : `${resolution.parcelWeightKg.toFixed(1)} kg`}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/50">
                    Weight Tier
                  </dt>
                  <dd className="mt-1 font-semibold text-heritage-green">
                    {resolution.weightTier === "0_2"
                      ? "0–2 kg"
                      : resolution.weightTier === "2_5"
                        ? ">2–5 kg"
                        : resolution.weightTier === "5_10"
                          ? ">5–10 kg"
                          : resolution.weightTier === "10_20"
                            ? ">10–20 kg"
                            : resolution.weightTier === "over_20"
                              ? ">20 kg"
                              : "Pending"}
                  </dd>
                </div>
              </>
            )}
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/50">
                Additional Delivery
              </dt>
              <dd className="mt-1 font-mono font-bold text-heritage-green">
                {resolution.quoteRequired
                  ? "Custom shipping quote required"
                  : resolution.postEindhovenAdjustmentCents === null
                    ? "Pending"
                    : moneyFromCents(resolution.postEindhovenAdjustmentCents)}
              </dd>
            </div>
          </dl>
          {isDelivery &&
            resolution.destinationLabel &&
            !resolution.quoteRequired &&
            resolution.weightTier &&
            resolution.weightTier !== "2_5" && (
              <p className="mt-3 text-xs leading-relaxed text-heritage-ink/55">
                Typical 2–5 kg rate for this destination is a headline only. Your
                charge uses the calculated weight tier.
              </p>
            )}
          <p className="mt-2 text-xs text-heritage-ink/55">
            Physical garments in this order: {garmentCount}
          </p>
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
            Garment construction already includes fabric, tax, Standard Shipping
            to Eindhoven, and sewing.
          </p>
          <div className="border-t border-white/15 pt-3">
            <div className="flex min-w-0 flex-wrap justify-between gap-2">
              <dt className="min-w-0 break-words">Additional Delivery</dt>
              <dd className="shrink-0 font-mono font-bold">
                {resolution.quoteRequired
                  ? "Quote required"
                  : resolution.postEindhovenAdjustmentCents === null
                    ? "Pending"
                    : moneyFromCents(resolution.postEindhovenAdjustmentCents)}
              </dd>
            </div>
          </div>
          <div className="flex min-w-0 flex-wrap justify-between gap-2 border-t border-white/15 pt-3 text-base">
            <dt className="font-bold">Projected total</dt>
            <dd className="shrink-0 font-mono font-bold">
              {resolution.projectedTotalCents === null
                ? "Available after delivery is resolved"
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
                : resolution.quoteRequired
                  ? "Custom shipping quote required before reviewing payment."
                  : "Complete delivery or pickup before reviewing your order."}
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
