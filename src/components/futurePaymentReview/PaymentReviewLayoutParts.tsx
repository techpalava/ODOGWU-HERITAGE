import { ArrowDown, ChevronDown, LockKeyhole } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { FuturePaymentReviewGarmentPicture } from "../../utils/futurePaymentReviewPictures";
import { PRICING_CURRENCY_SYMBOL } from "../../utils/money";
import {
  PaymentReviewDesignImage,
  PaymentReviewFabricImage,
  PaymentReviewGarmentReferenceImage,
} from "./PaymentReviewImages";

/** Lists longer than this collapse behind a "Show all" toggle on Stage 10. */
export const PAYMENT_REVIEW_LONG_LIST_THRESHOLD = 4;

/** Id of the Stage 10 payment column; the mobile sticky bar scrolls to it. */
export const PAYMENT_REVIEW_PAY_PANEL_ID = "future-payment-review-pay-panel";

const moneyFromCents = (amountCents: number): string =>
  `${PRICING_CURRENCY_SYMBOL}${(amountCents / 100).toFixed(2)}`;

/**
 * Collapsed-by-default disclosure. Content stays mounted in the DOM (native
 * <details>), so selectors, tests and find-in-page keep working.
 */
export const PaymentReviewDisclosure = ({
  id,
  showLabel,
  hideLabel,
  children,
  className = "mt-3",
}: {
  id: string;
  showLabel: string;
  hideLabel: string;
  children: ReactNode;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <details
      data-payment-review-disclosure={id}
      className={`group min-w-0 ${className}`}
      onToggle={(event) =>
        setOpen((event.currentTarget as HTMLDetailsElement).open)
      }
    >
      <summary
        data-payment-review-disclosure-toggle={id}
        className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-heritage-green/15 px-3 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-green/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden"
      >
        <ChevronDown
          aria-hidden="true"
          size={14}
          className="shrink-0 transition-transform group-open:rotate-180"
        />
        {open ? hideLabel : showLabel}
      </summary>
      <div className="min-w-0 pt-3">{children}</div>
    </details>
  );
};

/** Wraps children in a PaymentReviewDisclosure only when `collapse` is true. */
export const PaymentReviewMaybeDisclosure = ({
  collapse,
  children,
  ...disclosure
}: {
  collapse: boolean;
  id: string;
  showLabel: string;
  hideLabel: string;
  className?: string;
  children: ReactNode;
}) =>
  collapse ? (
    <PaymentReviewDisclosure {...disclosure}>
      {children}
    </PaymentReviewDisclosure>
  ) : (
    <>{children}</>
  );

const PictureCaption = ({
  title,
  detail,
}: {
  title: string;
  detail?: string | null;
}) => (
  <figcaption className="mt-1 min-w-0 text-center">
    <span className="block text-[9px] font-bold uppercase tracking-wider text-heritage-ink/50">
      {title}
    </span>
    {detail ? (
      <span className="block break-words text-[11px] leading-snug text-heritage-ink/70">
        {detail}
      </span>
    ) : null}
  </figcaption>
);

/** Stage 10 "pictures first" section: one card per physical garment. */
export const PaymentReviewGarmentPictures = ({
  pictures,
}: {
  pictures: readonly FuturePaymentReviewGarmentPicture[];
}) => {
  if (pictures.length === 0) return null;
  return (
    <section
      aria-labelledby="future-payment-review-pictures-title"
      data-payment-review-pictures
      className="min-w-0 rounded-2xl border border-heritage-gold/20 bg-white p-4 shadow-sm sm:p-5"
    >
      <h2
        id="future-payment-review-pictures-title"
        className="break-words font-serif text-base font-bold text-heritage-green"
      >
        Your garments at a glance
      </h2>
      <p className="mt-1 break-words text-xs leading-relaxed text-heritage-ink/60">
        Design, fabric and garment type for each piece. Reference photos show
        the garment type only.
      </p>
      <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
        {pictures.map((picture) => (
          <article
            key={picture.garmentKey}
            data-payment-review-picture-card={picture.garmentKey}
            className="min-w-0 rounded-xl border border-heritage-green/15 bg-heritage-cream/20 p-3"
          >
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words font-serif text-sm font-bold text-heritage-green">
                  {picture.label}
                </h3>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-heritage-gold">
                  {picture.role === "main"
                    ? "Main garment"
                    : "Additional garment"}
                  {picture.wearerLabel ? ` · ${picture.wearerLabel}` : ""}
                </p>
              </div>
              <p
                className="shrink-0 font-mono text-sm font-bold text-heritage-green"
                data-payment-review-picture-price={picture.garmentKey}
              >
                {picture.constructionTotalCents === null
                  ? "Pending"
                  : moneyFromCents(picture.constructionTotalCents)}
              </p>
            </div>
            <div className="mt-3 grid min-w-0 grid-cols-3 gap-2">
              <figure className="min-w-0">
                <PaymentReviewDesignImage
                  design={picture.design}
                  garmentLabel={picture.label}
                />
                <PictureCaption
                  title={
                    picture.design.sourceKind === "uploaded"
                      ? "Your design"
                      : "Design"
                  }
                  detail={picture.design.name}
                />
              </figure>
              {picture.fabrics.length > 0 ? (
                picture.fabrics.map((fabric) => (
                  <figure key={fabric.allocationId} className="min-w-0">
                    <PaymentReviewFabricImage fabric={fabric} />
                    <PictureCaption title="Fabric" detail={fabric.fabricName} />
                  </figure>
                ))
              ) : (
                <figure className="min-w-0">
                  <div className="flex aspect-[4/5] w-full items-center justify-center rounded-lg border border-dashed border-heritage-green/20 p-1 text-center text-[10px] font-bold uppercase tracking-wider text-heritage-ink/45">
                    Fabric pending
                  </div>
                  <PictureCaption title="Fabric" />
                </figure>
              )}
              <figure className="min-w-0">
                <PaymentReviewGarmentReferenceImage
                  imageUrl={picture.referenceImageUrl}
                  garmentLabel={picture.label}
                />
                <PictureCaption title="Garment type" />
              </figure>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

/** Small thumbnails for the desktop sticky order card. */
export const PaymentReviewPictureStrip = ({
  pictures,
}: {
  pictures: readonly FuturePaymentReviewGarmentPicture[];
}) => {
  if (pictures.length === 0) return null;
  return (
    <ul
      data-payment-review-picture-strip
      aria-label="Garments in this order"
      className="flex min-w-0 gap-3 overflow-x-auto pb-1"
    >
      {pictures.map((picture) => (
        <li key={picture.garmentKey} className="w-[104px] shrink-0">
          <div className="grid grid-cols-2 gap-1">
            <PaymentReviewDesignImage
              design={picture.design}
              garmentLabel={picture.label}
            />
            {picture.fabrics[0] ? (
              <PaymentReviewFabricImage fabric={picture.fabrics[0]} />
            ) : (
              <PaymentReviewGarmentReferenceImage
                imageUrl={picture.referenceImageUrl}
                garmentLabel={picture.label}
              />
            )}
          </div>
          <p
            className="mt-1 truncate text-[11px] font-semibold text-heritage-green"
            title={picture.label}
          >
            {picture.label}
          </p>
        </li>
      ))}
    </ul>
  );
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Phone-only bar with the total and a "Pay €X" shortcut. The button only
 * scrolls to the payment panel; it never starts a payment. The bar shows only
 * while the payment panel is still below the screen, so it never covers the
 * panel itself or the page footer.
 */
export const PaymentReviewStickyPayBar = ({
  totalLabel,
  totalText,
  payText,
  targetId = PAYMENT_REVIEW_PAY_PANEL_ID,
}: {
  totalLabel: string;
  totalText: string;
  payText: string;
  targetId?: string;
}) => {
  const [hideBar, setHideBar] = useState(false);
  useEffect(() => {
    if (
      typeof document === "undefined" ||
      typeof IntersectionObserver === "undefined"
    )
      return;
    const target = document.getElementById(targetId);
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        const panelStillBelow =
          !entry.isIntersecting && entry.boundingClientRect.top > 0;
        setHideBar(!panelStillBelow);
      },
      { threshold: 0 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);
  return (
    <div
      data-payment-review-sticky-bar
      data-payment-review-sticky-bar-hidden={hideBar ? "true" : "false"}
      aria-hidden={hideBar || undefined}
      className={`fixed inset-x-0 bottom-0 z-40 !m-0 border-t border-heritage-gold/30 bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgba(0,0,0,0.08)] backdrop-blur transition-transform duration-200 lg:hidden ${
        hideBar ? "pointer-events-none translate-y-full" : "translate-y-0"
      }`}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-xl min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-heritage-ink/55">
            {totalLabel}
          </p>
          <p className="break-words font-mono text-lg font-bold text-heritage-green">
            {totalText}
          </p>
        </div>
        <button
          type="button"
          data-payment-review-sticky-pay
          tabIndex={hideBar ? -1 : undefined}
          aria-label={`Go to payment: ${payText}`}
          onClick={() => {
            if (typeof document === "undefined") return;
            const target = document.getElementById(targetId);
            target?.scrollIntoView({
              behavior: prefersReducedMotion() ? "auto" : "smooth",
              block: "start",
            });
          }}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-heritage-gold px-5 text-xs font-bold uppercase tracking-wider text-heritage-green shadow-md transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-green focus-visible:ring-offset-2"
        >
          <LockKeyhole aria-hidden="true" size={14} />
          {payText}
          <ArrowDown aria-hidden="true" size={14} />
        </button>
      </div>
    </div>
  );
};
