import { useState } from "react";
import { ArrowRight, MessageCircle, Package, Sparkles } from "lucide-react";
import {
  TRADITIONAL_ACCESSORY_DESCRIPTIONS,
  TRADITIONAL_ACCESSORY_OPTIONS,
  getTraditionalAccessoryPrice,
  type TraditionalAccessory,
} from "../utils/decorativePricing";
import { TRADITIONAL_ACCESSORY_IMAGES } from "../utils/traditionalAccessoryImages";
import {
  FUTURE_PICKUP_ATELIER_PHONE_DISPLAY,
  FUTURE_PICKUP_ATELIER_WHATSAPP_URL,
} from "../utils/designStudioFutureShipping";
import { PRICING_CURRENCY_SYMBOL } from "../utils/money";

export interface AccessoriesViewProps {
  onStartTailoredOrder?: () => void;
}

export const buildAccessoryWhatsappInquiryUrl = (
  accessoryName?: string,
): string => {
  const message = accessoryName
    ? `Hello Odogwu Heritage, I would like to enquire about ordering ${accessoryName}.`
    : "Hello Odogwu Heritage, I would like to enquire about Heritage Accessories.";
  return `${FUTURE_PICKUP_ATELIER_WHATSAPP_URL}?text=${encodeURIComponent(message)}`;
};

const AccessoryShowcasePhoto = ({
  accessory,
}: {
  accessory: TraditionalAccessory;
}) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={accessory}
        data-accessory-showcase-fallback={accessory}
        className="flex aspect-square w-full items-center justify-center rounded-2xl border border-heritage-gold/20 bg-heritage-cream/55 text-xs font-semibold text-heritage-ink/60"
      >
        {accessory}
      </div>
    );
  }

  return (
    <img
      src={TRADITIONAL_ACCESSORY_IMAGES[accessory].src}
      alt={accessory}
      width={640}
      height={640}
      decoding="async"
      onError={() => setFailed(true)}
      className="aspect-square w-full rounded-2xl border border-heritage-gold/20 bg-heritage-cream/40 object-cover"
    />
  );
};

export default function AccessoriesView({
  onStartTailoredOrder,
}: AccessoriesViewProps) {
  return (
    <div
      id="accessories-view-container"
      data-accessories-view="true"
      className="space-y-10 font-sans"
    >
      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-heritage-gold/25 bg-heritage-green p-8 text-white shadow-2xl sm:p-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full border border-heritage-gold/15"
        />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-heritage-gold/30 bg-heritage-gold/15 px-3.5 py-1 text-[10px] font-bold uppercase tracking-widest text-heritage-gold">
              <Sparkles size={12} aria-hidden="true" /> Separate Accessory Desk
            </span>
            <h1 className="font-display text-3xl tracking-tight text-white sm:text-4xl">
              Heritage Accessories
            </h1>
            <p className="text-sm leading-relaxed text-heritage-beige sm:text-base">
              Heritage Accessories — Ordered separately from tailored clothes to
              ensure proper packaging and accurate shipping.
            </p>
            <p className="text-xs leading-relaxed text-heritage-beige/80 sm:text-sm">
              Bulky and structured pieces such as walking sticks, coral bead
              sets, hats, and upcoming leather footwear are arranged directly
              with our atelier on WhatsApp so your tailored clothing weight and
              shipping rates stay accurate.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:shrink-0">
            <a
              href={buildAccessoryWhatsappInquiryUrl()}
              target="_blank"
              rel="noopener noreferrer"
              data-accessories-whatsapp-cta="page"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-heritage-gold px-5 py-3 text-xs font-extrabold uppercase tracking-wider text-heritage-forest shadow-md transition hover:bg-heritage-beige focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-beige focus-visible:ring-offset-2 focus-visible:ring-offset-heritage-green"
            >
              <MessageCircle size={15} aria-hidden="true" />
              <span>Enquire on WhatsApp</span>
            </a>
            {onStartTailoredOrder && (
              <button
                type="button"
                onClick={onStartTailoredOrder}
                data-accessories-studio-cta="true"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-gold/45 bg-heritage-forest/70 px-5 py-3 text-xs font-bold uppercase tracking-wider text-heritage-gold transition hover:bg-heritage-gold/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 focus-visible:ring-offset-heritage-green cursor-pointer"
              >
                <span>Start Tailored Order</span>
                <ArrowRight size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Shipping & Packaging Explanation */}
      <section
        aria-label="Separate ordering information"
        className="flex items-start gap-3 rounded-2xl border border-heritage-gold/25 bg-heritage-cream/55 p-5 text-heritage-ink shadow-xs"
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-heritage-gold/30 bg-white text-heritage-green">
          <Package size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="font-serif text-base font-bold text-heritage-green">
            Why accessories are ordered separately
          </h2>
          <p className="text-xs leading-relaxed text-heritage-ink/75 sm:text-sm">
            Design Studio is dedicated to bespoke tailored garments so
            parcel weight and shipping bands reflect clothing only. Message our
            atelier on WhatsApp ({FUTURE_PICKUP_ATELIER_PHONE_DISPLAY}) to check
            current stock, sizing, protective packaging, and delivery options
            for any accessory below.
          </p>
        </div>
      </section>

      {/* Accessory Showcase Grid */}
      <section aria-label="Heritage Accessories Catalogue">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRADITIONAL_ACCESSORY_OPTIONS.map((accessory) => {
            const indicativePrice = getTraditionalAccessoryPrice(
              null,
              accessory,
            );
            return (
              <article
                key={accessory}
                data-accessory-card={accessory}
                className="flex min-w-0 flex-col justify-between rounded-3xl border border-heritage-gold/25 bg-white p-5 shadow-sm transition hover:border-heritage-gold/60 hover:shadow-md"
              >
                <div className="space-y-4">
                  <AccessoryShowcasePhoto accessory={accessory} />
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h2 className="font-serif text-lg font-bold text-heritage-green">
                        {accessory}
                      </h2>
                      <span className="shrink-0 rounded-full border border-heritage-gold/30 bg-heritage-cream/60 px-2.5 py-0.5 font-mono text-xs font-bold text-heritage-gold">
                        From {PRICING_CURRENCY_SYMBOL}
                        {indicativePrice.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-heritage-ink/75">
                      {TRADITIONAL_ACCESSORY_DESCRIPTIONS[accessory]}
                    </p>
                  </div>
                </div>

                <div className="mt-5 border-t border-heritage-gold/15 pt-4">
                  <a
                    href={buildAccessoryWhatsappInquiryUrl(accessory)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-accessory-whatsapp-link={accessory}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-heritage-green px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-heritage-gold transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                  >
                    <MessageCircle size={14} aria-hidden="true" />
                    <span>Enquire on WhatsApp</span>
                  </a>
                </div>
              </article>
            );
          })}

          {/* Coming Soon: Matching Leather Shoes */}
          <article
            data-accessory-card="Matching Leather Shoes"
            data-accessory-status="coming-soon"
            className="flex min-w-0 flex-col justify-between rounded-3xl border border-dashed border-heritage-gold/45 bg-heritage-cream/35 p-5 shadow-xs"
          >
            <div className="space-y-4">
              <div
                aria-hidden="true"
                className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border border-heritage-gold/25 bg-white/80 p-6 text-center"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-heritage-gold/15 text-heritage-gold">
                  <Sparkles size={22} />
                </span>
                <span className="rounded-full border border-heritage-gold/35 bg-heritage-cream px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-heritage-green">
                  Coming soon
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="font-serif text-lg font-bold text-heritage-green">
                    Matching Leather Shoes
                  </h2>
                  <span className="shrink-0 rounded-full border border-heritage-gold/35 bg-heritage-gold/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-heritage-green">
                    Coming soon
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-heritage-ink/75">
                  Handcrafted leather footwear curated to pair with your
                  tailored Nigerian outfit. Packaged and shipped separately once
                  released.
                </p>
              </div>
            </div>

            <div className="mt-5 border-t border-heritage-gold/20 pt-4">
              <span className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-heritage-gold/30 bg-white/70 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-heritage-ink/60">
                Coming soon
              </span>
            </div>
          </article>
        </div>
      </section>

      {/* Bottom Navigation & Direct Atelier Contact */}
      <section className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-heritage-gold/25 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:p-8">
        <div className="space-y-1">
          <h2 className="font-serif text-xl font-bold text-heritage-green">
            Ready to design your tailored outfit?
          </h2>
          <p className="text-xs leading-relaxed text-heritage-ink/70 sm:text-sm">
            Choose your garment type, fabric, monogram or embroidery, and custom
            fit in Design Studio — or reach out on WhatsApp for accessory
            requests.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          {onStartTailoredOrder && (
            <button
              type="button"
              onClick={onStartTailoredOrder}
              data-accessories-back-to-studio="true"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-heritage-gold transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 cursor-pointer"
            >
              <span>Back to Design Studio</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          )}
          <a
            href={buildAccessoryWhatsappInquiryUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-heritage-green/30 bg-heritage-cream/50 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:border-heritage-gold hover:bg-heritage-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            <MessageCircle size={14} aria-hidden="true" />
            <span>WhatsApp Atelier</span>
          </a>
        </div>
      </section>
    </div>
  );
}
