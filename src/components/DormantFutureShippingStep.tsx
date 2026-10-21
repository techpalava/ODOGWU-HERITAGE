import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  MapPin,
  PackageCheck,
  Pencil,
  Truck,
} from "lucide-react";
import { DesignStudioStepActions } from "./DesignStudioBackButton";
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
  DEFAULT_FUTURE_PICKUP_LOCATION,
  FUTURE_PICKUP_ATELIER_ADDRESS,
  FUTURE_PICKUP_ATELIER_PHONE_DISPLAY,
  FUTURE_PICKUP_ATELIER_WHATSAPP_URL,
  type FutureShippingFieldId,
  type FutureShippingStageResolution,
  futureShippingRequiresRegion,
  resolveFutureShippingCityHint,
} from "../utils/designStudioFutureShipping";
import { formatStep8CustomerDestination } from "../utils/step8AdditionalDelivery";
import { formatDesignStudioStepCounter } from "../utils/designSourceJourney";
import { garmentConstructionInclusionNote } from "../utils/designPriceBreakdownPresentation";
import { resolveIndividualInboundShippingDisplay } from "../utils/individualInboundShippingDisplay";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";

interface DormantFutureShippingStepProps {
  state: FutureShippingStateV1;
  resolution: FutureShippingStageResolution;
  selectedDesignPrice: number | null;
  garmentCount: number;
  orderType?: string | null;
  onChange: (state: FutureShippingStateV1) => void;
  onRefreshQuote: () => void;
  onBack: () => void;
  canContinueToReview: boolean;
  priceEvaluationPending?: boolean;
  onEditPersonalizedAdditions?: () => void;
  onContinueToReview: () => void;
  /**
   * When set (for example a closed community batch), Review Order stays
   * clickable but only explains why the order cannot be reviewed.
   */
  reviewBlockedMessage?: string | null;
  /**
   * Set while the order's batch is still being checked (batch list loading).
   * Review stays unavailable, with this quiet note instead of a closed error.
   */
  reviewCheckingMessage?: string | null;
}

type ReviewActionSlot = "header" | "footer";

const moneyFromCents = (amountCents: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${(amountCents / 100).toFixed(2)}`;

const money = (amount: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${amount.toFixed(2)}`;

const inputClassName =
  "min-h-11 w-full min-w-0 rounded-xl border border-heritage-green/20 bg-white px-3 py-2.5 text-sm text-heritage-ink outline-none transition placeholder:text-heritage-ink/35 focus:border-heritage-gold focus:ring-2 focus:ring-heritage-gold/25";

const SHIPPING_FIELD_FOCUS_ORDER: readonly FutureShippingFieldId[] = [
  "fulfilmentMethod",
  "fullName",
  "phone",
  "email",
  "countryCode",
  "otherDestinationCountry",
  "addressLine1",
  "city",
  "stateRegion",
  "postalCode",
];

const SHIPPING_FIELD_ELEMENT_ID: Partial<Record<FutureShippingFieldId, string>> = {
  fulfilmentMethod: "future-shipping-fulfilment",
  fullName: "future-shipping-full-name",
  phone: "future-shipping-phone",
  email: "future-shipping-email",
  countryCode: "future-shipping-country",
  otherDestinationCountry: "future-shipping-other-destination",
  addressLine1: "future-shipping-address",
  city: "future-shipping-city",
  stateRegion: "future-shipping-region",
  postalCode: "future-shipping-postal",
};

const focusShippingField = (field: FutureShippingFieldId) => {
  if (typeof document === "undefined") return;
  const id = SHIPPING_FIELD_ELEMENT_ID[field];
  const node = id ? document.getElementById(id) : null;
  if (!node || typeof node.focus !== "function") return;
  node.focus();
  if (typeof node.scrollIntoView === "function") {
    node.scrollIntoView({ block: "center" });
  }
};

export const DormantFutureShippingStep = ({
  state,
  resolution,
  selectedDesignPrice,
  garmentCount,
  orderType = null,
  onChange,
  onBack,
  canContinueToReview,
  priceEvaluationPending = false,
  onEditPersonalizedAdditions,
  onContinueToReview,
  reviewBlockedMessage = null,
  reviewCheckingMessage = null,
}: DormantFutureShippingStepProps) => {
  const reviewBlocked = Boolean(reviewBlockedMessage);
  const reviewChecking = !reviewBlocked && Boolean(reviewCheckingMessage);
  const reviewReady = canContinueToReview && !reviewBlocked && !reviewChecking;
  const [reviewBlockedNotice, setReviewBlockedNotice] = useState<{
    slot: ReviewActionSlot;
    nonce: number;
  } | null>(null);
  const headerBlockedNoticeRef = useRef<HTMLParagraphElement>(null);
  const footerBlockedNoticeRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!reviewBlockedNotice) return;
    const target =
      reviewBlockedNotice.slot === "header"
        ? headerBlockedNoticeRef.current
        : footerBlockedNoticeRef.current;
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, [reviewBlockedNotice]);
  useEffect(() => {
    if (!reviewBlocked) setReviewBlockedNotice(null);
  }, [reviewBlocked]);
  const customer = state.customerInformation;
  const address = customer.deliveryAddress;
  const [touchedFields, setTouchedFields] = useState<ReadonlySet<FutureShippingFieldId>>(
    () => new Set(),
  );
  const [reviewAttempted, setReviewAttempted] = useState(false);
  const diagnosticFor = (field: FutureShippingFieldId) =>
    resolution.diagnostics.find((diagnostic) => diagnostic.field === field);
  const shownError = (field: FutureShippingFieldId) => {
    const diagnostic = diagnosticFor(field);
    if (!diagnostic) return undefined;
    if (reviewAttempted || touchedFields.has(field)) return diagnostic;
    return undefined;
  };
  const revealField = (field: FutureShippingFieldId) => {
    setTouchedFields((current) => {
      if (current.has(field)) return current;
      const next = new Set(current);
      next.add(field);
      return next;
    });
  };
  const attemptReview = (slot: ReviewActionSlot = "footer") => {
    if (reviewBlocked) {
      setReviewBlockedNotice((current) => ({
        slot,
        nonce: (current?.nonce ?? 0) + 1,
      }));
      return;
    }
    if (reviewChecking && canContinueToReview) return;
    if (canContinueToReview) {
      onContinueToReview();
      return;
    }
    setReviewAttempted(true);
    const firstInvalid = SHIPPING_FIELD_FOCUS_ORDER.find((field) => diagnosticFor(field));
    if (firstInvalid) focusShippingField(firstInvalid);
  };
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
  const inboundShipping = resolveIndividualInboundShippingDisplay({
    orderType,
    physicalGarmentCount: garmentCount,
    fulfilmentMethod: state.fulfilmentMethod,
  });
  const displayedTotalCents =
    resolution.projectedTotalCents === null
      ? null
      : resolution.projectedTotalCents + (inboundShipping?.amountCents ?? 0);
  const constructionNote =
    orderType === "Individual"
      ? garmentConstructionInclusionNote(orderType)
      : "Garment construction already includes fabric, tax, Standard Shipping to Eindhoven, and sewing.";
  const shippingIntro =
    orderType === "Individual"
      ? isPickup
        ? "Pick up in Eindhoven has no shipping charge."
        : "Lagos → Eindhoven shipping is added to the total. This step adds pickup or additional delivery from Eindhoven."
      : "Standard Shipping to Eindhoven is already included. This step only adds pickup or additional delivery from Eindhoven.";
  const isOtherDestination =
    isDelivery && state.destinationSelectionMode === "other_destination";
  const regionRequired = futureShippingRequiresRegion(state);
  const isNetherlandsDelivery = !isOtherDestination && address.countryCode === "NL";
  const cityHint = resolveFutureShippingCityHint({
    city: address.city,
    isNetherlandsDelivery,
  });
  const addressCheckCountry =
    formatStep8CustomerDestination({
      countryCode: isOtherDestination ? "" : address.countryCode,
      otherDestinationCountry: isOtherDestination ? state.otherDestinationCountry : "",
    }) || "Not entered";
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
        ? inboundShipping
          ? "Pickup contact details are complete. Pickup adds no further delivery charge."
          : "Pickup contact details are complete. No additional shipping charge applies."
        : `Shipping is ready for ${resolution.destinationLabel}.`
      : resolution.status === "quote_pending" || resolution.quoteRequired
        ? isOtherDestination
          ? "Shipping to this destination requires a custom quote."
          : "Custom shipping quote required"
        : resolution.diagnostics.find(
            (diagnostic) =>
              reviewAttempted || touchedFields.has(diagnostic.field),
          )?.message ||
          "Complete the delivery details below.";

  return (
    <section
      aria-labelledby="future-shipping-title"
      data-stage-id="shipping"
      data-shipping-status={resolution.status}
      className="mx-auto max-w-6xl space-y-5 overflow-x-hidden font-sans"
    >
      <header className="min-w-0 rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm sm:p-7">
        <DesignStudioStepActions
          slot="header"
          backDestination="Summary"
          onBack={onBack}
          className={reviewBlockedNotice?.slot === "header" ? "mb-3" : "mb-5"}
          forward={{
            label: "Review Order",
            onClick: () => attemptReview("header"),
            onLockedClick: () => attemptReview("header"),
            disabled: !reviewReady,
            locked: !reviewReady,
            icon: reviewReady ? "package" : "lock",
            describedBy: "future-payment-lock-reason",
            ariaLabel: "Review Order",
          }}
        />
        {reviewBlocked && reviewBlockedNotice?.slot === "header" ? (
          <p
            key={reviewBlockedNotice.nonce}
            ref={headerBlockedNoticeRef}
            id="future-shipping-review-blocked-header"
            role="alert"
            tabIndex={-1}
            data-future-shipping-review-blocked="header"
            className="mb-5 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
          >
            <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
            <span>{reviewBlockedMessage}</span>
          </p>
        ) : null}
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
          {formatDesignStudioStepCounter("shipping")}
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

      {priceEvaluationPending ? (
        <div
          role="status"
          data-future-shipping-price-evaluation-pending="true"
          className="flex min-w-0 items-start gap-3 rounded-2xl border border-heritage-gold/35 bg-heritage-gold/8 p-4 sm:p-5"
        >
          <AlertTriangle
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-heritage-gold"
            size={19}
          />
          <div className="min-w-0">
            <h3 className="font-serif text-lg font-bold text-heritage-green">
              Evaluation pending
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-heritage-ink/70">
              {canContinueToReview
                ? "The total today is the base garment. Personalized additions are reviewed after you order. Review Order is available."
                : "The total today is the base garment. Personalized additions are reviewed after you order. Complete delivery or pickup to continue."}
            </p>
            {onEditPersonalizedAdditions ? (
              <button
                type="button"
                onClick={onEditPersonalizedAdditions}
                className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/20 px-3 text-[10px] font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
              >
                <Pencil aria-hidden="true" size={13} />
                Edit Personalized Additions
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-heritage-green/20 bg-heritage-green/5 p-4 sm:p-5">
        <Info aria-hidden="true" className="mt-0.5 shrink-0 text-heritage-green" size={19} />
        <p className="min-w-0 text-sm font-semibold leading-relaxed text-heritage-green">
          {shippingIntro}
        </p>
      </div>

      <fieldset
        id="future-shipping-fulfilment"
        tabIndex={-1}
        aria-describedby={
          shownError("fulfilmentMethod")
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
                Collect your finished order at the Eindhoven pickup location below.
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
        {shownError("fulfilmentMethod") && (
          <p id="future-shipping-fulfilment-error" className="mt-2 text-xs text-red-700">
            {shownError("fulfilmentMethod")!.message}
          </p>
        )}
      </fieldset>

      {state.fulfilmentMethod && (
        <section className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-5 shadow-sm sm:p-6">
          <h3 className="font-serif text-lg font-bold text-heritage-green">
            {isPickup ? "Recipient Contact" : "Delivery details"}
          </h3>
          <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-2">
            <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65">
              {isPickup ? "Full name" : "Recipient name"}
              <input
                id="future-shipping-full-name"
                value={customer.fullName}
                onChange={(event) => updateCustomer({ fullName: event.target.value })}
                onBlur={() => revealField("fullName")}
                aria-invalid={Boolean(shownError("fullName"))}
                aria-describedby={shownError("fullName") ? "future-shipping-full-name-error" : undefined}
                autoComplete="name"
                className={`${inputClassName} mt-1.5`}
              />
              {shownError("fullName") && (
                <span id="future-shipping-full-name-error" className="mt-1 block normal-case tracking-normal text-red-700">
                  {shownError("fullName")!.message}
                </span>
              )}
            </label>
            <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65">
              {isPickup ? "Phone No. (Whatsapp Preferred)" : "Phone"}
              <input
                id="future-shipping-phone"
                type="tel"
                value={customer.phone}
                onChange={(event) => updateCustomer({ phone: event.target.value })}
                onBlur={() => revealField("phone")}
                placeholder="+31 6 12345678"
                aria-invalid={Boolean(shownError("phone"))}
                aria-describedby={
                  isPickup
                    ? shownError("phone")
                      ? "future-shipping-phone-hint future-shipping-phone-error"
                      : "future-shipping-phone-hint"
                    : shownError("phone")
                      ? "future-shipping-phone-error"
                      : undefined
                }
                autoComplete="tel"
                className={`${inputClassName} mt-1.5`}
              />
              {isPickup && (
                <span
                  id="future-shipping-phone-hint"
                  className="mt-1 block text-[11px] font-normal normal-case leading-snug tracking-normal text-heritage-ink/55"
                >
                  Include country code for WhatsApp.
                </span>
              )}
              {shownError("phone") && (
                <span id="future-shipping-phone-error" className="mt-1 block normal-case tracking-normal text-red-700">
                  {shownError("phone")!.message}
                </span>
              )}
            </label>
            <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65 md:col-span-2">
              Email
              <input
                id="future-shipping-email"
                type="email"
                value={customer.email}
                onChange={(event) => updateCustomer({ email: event.target.value })}
                onBlur={() => revealField("email")}
                aria-invalid={Boolean(shownError("email"))}
                aria-describedby={shownError("email") ? "future-shipping-email-error" : undefined}
                autoComplete="email"
                className={`${inputClassName} mt-1.5`}
              />
              {shownError("email") && (
                <span id="future-shipping-email-error" className="mt-1 block normal-case tracking-normal text-red-700">
                  {shownError("email")!.message}
                </span>
              )}
            </label>

            {isPickup && (
              <div
                data-testid="future-shipping-pickup-location"
                className="min-w-0 rounded-xl border border-heritage-green/15 bg-heritage-cream/30 p-3 md:col-span-2"
              >
                <h4 className="font-serif text-xl font-bold text-heritage-green">
                  Pickup location
                </h4>
                <p className="mt-1.5 flex min-w-0 items-start gap-2 break-words text-base font-bold text-heritage-green">
                  <MapPin
                    aria-hidden="true"
                    className="mt-0.5 shrink-0 text-heritage-gold"
                    size={18}
                  />
                  <span className="min-w-0">
                    {state.pickupLocation.trim() || DEFAULT_FUTURE_PICKUP_LOCATION}
                  </span>
                </p>
                <p className="mt-2.5 text-sm leading-relaxed text-heritage-ink/80">
                  <span className="text-xs font-bold uppercase tracking-wider text-heritage-ink/60">
                    Address
                  </span>
                  <span className="mt-1 block font-semibold normal-case tracking-normal">
                    {FUTURE_PICKUP_ATELIER_ADDRESS}
                  </span>
                </p>
                <p className="mt-2.5 text-sm leading-relaxed text-heritage-ink/80">
                  <span className="text-xs font-bold uppercase tracking-wider text-heritage-ink/60">
                    Phone
                  </span>
                  <a
                    href={FUTURE_PICKUP_ATELIER_WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`WhatsApp ${FUTURE_PICKUP_ATELIER_PHONE_DISPLAY}`}
                    className="mt-1 block normal-case tracking-normal font-bold text-heritage-green underline underline-offset-2"
                  >
                    {FUTURE_PICKUP_ATELIER_PHONE_DISPLAY} (WhatsApp)
                  </a>
                </p>
                <p className="mt-2.5 text-sm font-medium leading-relaxed text-heritage-ink/70">
                  This is where you collect your order in Eindhoven. It is set by the atelier and cannot be edited here.
                </p>
              </div>
            )}

            {isDelivery && (
              <>
                <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65 md:col-span-2">
                  Delivery Country
                  <select
                    id="future-shipping-country"
                    value={countrySelectValue}
                    onChange={(event) => selectDeliveryCountry(event.target.value)}
                    onBlur={() => revealField("countryCode")}
                    aria-invalid={Boolean(shownError("countryCode") || shownError("otherDestinationCountry"))}
                    aria-describedby={
                      shownError("countryCode")
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
                  {shownError("countryCode") && (
                    <span id="future-shipping-country-error" className="mt-1 block normal-case tracking-normal text-red-700">
                      {shownError("countryCode")!.message}
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
                        id="future-shipping-other-destination"
                        value={state.otherDestinationCountry}
                        onChange={(event) =>
                          onChange({
                            ...state,
                            otherDestinationCountry: event.target.value,
                          })
                        }
                        onBlur={() => revealField("otherDestinationCountry")}
                        aria-invalid={Boolean(shownError("otherDestinationCountry"))}
                        aria-describedby={
                          shownError("otherDestinationCountry")
                            ? "future-shipping-other-destination-error"
                            : undefined
                        }
                        className={`${inputClassName} mt-1.5`}
                      />
                      {shownError("otherDestinationCountry") && (
                        <span
                          id="future-shipping-other-destination-error"
                          className="mt-1 block normal-case tracking-normal text-red-700"
                        >
                          {shownError("otherDestinationCountry")!.message}
                        </span>
                      )}
                    </label>
                  </div>
                )}
                <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65 md:col-span-2">
                  Address line 1
                  <input
                    id="future-shipping-address"
                    value={address.addressLine1}
                    onChange={(event) => updateAddress({ addressLine1: event.target.value })}
                    onBlur={() => revealField("addressLine1")}
                    aria-invalid={Boolean(shownError("addressLine1"))}
                    aria-describedby={shownError("addressLine1") ? "future-shipping-address-error" : undefined}
                    autoComplete="address-line1"
                    className={`${inputClassName} mt-1.5`}
                  />
                  {shownError("addressLine1") && (
                    <span id="future-shipping-address-error" className="mt-1 block normal-case tracking-normal text-red-700">
                      {shownError("addressLine1")!.message}
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
                    id="future-shipping-city"
                    value={address.city}
                    onChange={(event) => updateAddress({ city: event.target.value })}
                    onBlur={() => revealField("city")}
                    aria-invalid={Boolean(shownError("city"))}
                    aria-describedby={
                      [
                        cityHint ? "future-shipping-city-hint" : "",
                        shownError("city") ? "future-shipping-city-error" : "",
                      ]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    autoComplete="address-level2"
                    className={`${inputClassName} mt-1.5`}
                  />
                  {cityHint && (
                    <span
                      id="future-shipping-city-hint"
                      data-testid="future-shipping-city-hint"
                      className="mt-1 block text-[11px] font-normal normal-case leading-snug tracking-normal text-heritage-ink/55"
                    >
                      {cityHint}
                    </span>
                  )}
                  {shownError("city") && (
                    <span id="future-shipping-city-error" className="mt-1 block normal-case tracking-normal text-red-700">
                      {shownError("city")!.message}
                    </span>
                  )}
                </label>
                <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65">
                  State / Province / Region
                  {!regionRequired && (
                    <span
                      data-testid="future-shipping-region-optional"
                      className="ml-1 font-normal normal-case tracking-normal text-heritage-ink/50"
                    >
                      (optional)
                    </span>
                  )}
                  <input
                    id="future-shipping-region"
                    value={address.stateRegion || ""}
                    onChange={(event) => updateAddress({ stateRegion: event.target.value })}
                    onBlur={() => revealField("stateRegion")}
                    aria-required={regionRequired}
                    aria-invalid={Boolean(shownError("stateRegion"))}
                    aria-describedby={
                      shownError("stateRegion") ? "future-shipping-region-error" : undefined
                    }
                    autoComplete="address-level1"
                    className={`${inputClassName} mt-1.5`}
                  />
                  {shownError("stateRegion") && (
                    <span
                      id="future-shipping-region-error"
                      className="mt-1 block normal-case tracking-normal text-red-700"
                    >
                      {shownError("stateRegion")!.message}
                    </span>
                  )}
                </label>
                <label className="min-w-0 text-xs font-bold uppercase tracking-wider text-heritage-ink/65">
                  Postal / ZIP code
                  <input
                    id="future-shipping-postal"
                    value={address.postalCode}
                    onChange={(event) => updateAddress({ postalCode: event.target.value })}
                    onBlur={() => revealField("postalCode")}
                    aria-invalid={Boolean(shownError("postalCode"))}
                    aria-describedby={shownError("postalCode") ? "future-shipping-postal-error" : undefined}
                    autoComplete="postal-code"
                    className={`${inputClassName} mt-1.5`}
                  />
                  {shownError("postalCode") && (
                    <span id="future-shipping-postal-error" className="mt-1 block normal-case tracking-normal text-red-700">
                      {shownError("postalCode")!.message}
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
            {isPickup && (
              <div className="min-w-0">
                <dt className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/50">
                  Pickup location
                </dt>
                <dd className="mt-1 break-words font-semibold text-heritage-green">
                  {state.pickupLocation.trim() || DEFAULT_FUTURE_PICKUP_LOCATION}
                </dd>
              </div>
            )}
            {isDelivery && (
              <>
                <div className="min-w-0 sm:col-span-2" data-delivery-address-check="true">
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
                  <dd className="mt-2 rounded-xl border border-heritage-gold/20 bg-heritage-cream/60 p-3">
                    <dl className="grid min-w-0 gap-2 text-xs sm:grid-cols-2">
                      {[
                        { label: "City", value: address.city.trim() || "Not entered" },
                        {
                          label: "State / Province / Region",
                          value: (address.stateRegion || "").trim() || "Not entered",
                        },
                        {
                          label: isOtherDestination ? "Country / territory" : "Country",
                          value: addressCheckCountry,
                        },
                        {
                          label: "Postal / ZIP code",
                          value: address.postalCode.trim() || "Not entered",
                        },
                      ].map((row) => (
                        <div key={row.label} className="min-w-0">
                          <dt className="text-[10px] uppercase tracking-wider text-heritage-ink/50">
                            {row.label}
                          </dt>
                          <dd className="break-words font-semibold text-heritage-green">
                            {row.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <p className="mt-2 text-[11px] leading-snug text-heritage-ink/60">
                      Check this matches the courier address before continuing.
                    </p>
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
            {isDelivery && (
            <div className="min-w-0 sm:col-span-2">
              <dt className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/50">
                Shipping
              </dt>
              <dd className="mt-1 font-mono font-bold text-heritage-green">
                {resolution.quoteRequired
                  ? "Custom shipping quote required"
                  : resolution.postEindhovenAdjustmentCents === null
                    ? "Pending"
                    : moneyFromCents(resolution.postEindhovenAdjustmentCents)}
              </dd>
            </div>
            )}
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
        <h3 className="font-serif text-xl font-bold">Cost Breakdown</h3>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex min-w-0 flex-wrap justify-between gap-2 text-white/80">
            <dt className="min-w-0 break-words">Order Subtotal</dt>
            <dd className="shrink-0 font-mono font-medium text-white">
              {selectedDesignPrice === null ? "Pending" : money(selectedDesignPrice)}
            </dd>
          </div>
          {inboundShipping ? (
            <div
              data-shipping-lagos-inbound="true"
              data-amount-cents={inboundShipping.amountCents}
              className="flex min-w-0 flex-wrap justify-between gap-2 text-white/80"
            >
              <dt className="min-w-0 break-words">{inboundShipping.label}</dt>
              <dd className="shrink-0 font-mono font-medium text-white">
                {money(inboundShipping.priceEur)}
              </dd>
            </div>
          ) : null}
          <p className="text-xs leading-relaxed text-white/70">
            {constructionNote}
          </p>
          {isDelivery && (
          <div className="border-t border-white/15 pt-3">
            <div className="flex min-w-0 flex-wrap justify-between gap-2">
              <dt className="min-w-0 break-words text-white/80">Shipping</dt>
              <dd className="shrink-0 font-mono font-medium text-white">
                {resolution.quoteRequired
                  ? "Quote required"
                  : resolution.postEindhovenAdjustmentCents === null
                    ? "Pending"
                    : moneyFromCents(resolution.postEindhovenAdjustmentCents)}
              </dd>
            </div>
          </div>
          )}
          <div className="flex min-w-0 flex-wrap justify-between gap-2 border-t-2 border-white/35 pt-3 text-base">
            <dt className="font-bold uppercase tracking-wide">
              {displayedTotalCents === null ? "Current Subtotal" : "Total"}
            </dt>
            <dd
              data-shipping-displayed-total-cents={displayedTotalCents ?? undefined}
              className={
                displayedTotalCents === null
                  ? "min-w-0 font-serif text-sm font-semibold sm:text-base"
                  : "shrink-0 font-serif text-2xl font-bold sm:text-3xl"
              }
            >
              {displayedTotalCents === null
                ? "Available after delivery is resolved"
                : moneyFromCents(displayedTotalCents)}
            </dd>
          </div>
        </dl>
      </section>

      <footer className="rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5">
        <DesignStudioStepActions
          slot="footer"
          backDestination="Summary"
          onBack={onBack}
          note={reviewBlocked ? (
            <p
              key={reviewBlockedNotice?.slot === "footer" ? reviewBlockedNotice.nonce : "idle"}
              ref={footerBlockedNoticeRef}
              id="future-payment-lock-reason"
              role={reviewBlockedNotice?.slot === "footer" ? "alert" : "status"}
              tabIndex={-1}
              data-future-shipping-review-blocked={reviewBlockedNotice?.slot === "footer" ? "footer" : "idle"}
              className={reviewBlockedNotice?.slot === "footer"
                ? "flex w-full items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-semibold text-red-900 outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
                : "w-full text-xs font-semibold leading-relaxed text-red-800 outline-none"}
            >
              {reviewBlockedNotice?.slot === "footer" ? (
                <AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={16} />
              ) : null}
              <span>{reviewBlockedMessage}</span>
            </p>
          ) : (
            <p id="future-payment-lock-reason" className="w-full text-xs leading-relaxed text-heritage-ink/60">
              {reviewChecking && canContinueToReview
                ? reviewCheckingMessage
                : priceEvaluationPending && canContinueToReview
                ? "Your order review is ready. The total today is the base garment. Personalized additions are reviewed after you order."
                : canContinueToReview
                  ? "Your order review is ready. Select Review Order to check your order and pay securely."
                  : resolution.quoteRequired
                    ? "Custom shipping quote required before reviewing payment."
                    : "Complete delivery or pickup before reviewing your order."}
            </p>
          )}
          forward={{
            label: "Review Order",
            onClick: () => attemptReview("footer"),
            onLockedClick: () => attemptReview("footer"),
            disabled: !reviewReady,
            locked: !reviewReady,
            icon: reviewReady ? "package" : "lock",
            describedBy: "future-payment-lock-reason",
            ariaLabel: "Review Order",
          }}
        />
      </footer>
    </section>
  );
};
