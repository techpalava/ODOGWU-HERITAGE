import type { ConstructionDetail } from "../types";
import {
  DECORATIVE_FEATURE_OPTIONS,
  STYLE_REQUIRED_DECORATIVE_FEATURES,
  TRADITIONAL_ACCESSORY_OPTIONS,
} from "../utils/decorativePricing";

export const ACTIVE_DECORATIVE_PRICE_OVERRIDE_OPTIONS = [
  ...DECORATIVE_FEATURE_OPTIONS.map((code) => ({
    type: "embroideryDesign" as const,
    code,
    label: code,
  })),
  ...STYLE_REQUIRED_DECORATIVE_FEATURES.map((code) => ({
    type: "embroideryDesign" as const,
    code,
    label: code,
  })),
  ...TRADITIONAL_ACCESSORY_OPTIONS.map((code) => ({
    type: "accessories" as const,
    code,
    label: code,
  })),
] as const;

type ActiveDecorativePriceOverride =
  (typeof ACTIVE_DECORATIVE_PRICE_OVERRIDE_OPTIONS)[number];

const isMatchingOverride = (
  detail: ConstructionDetail,
  override: ActiveDecorativePriceOverride,
): boolean => detail.type === override.type && detail.code === override.code;

/**
 * Updates only a price override consumed by decorativePricing. Historical
 * construction detail entries outside that active set remain untouched.
 */
export const updateActiveDecorativePriceOverride = ({
  constructionDetails,
  override,
  price,
}: {
  constructionDetails: readonly ConstructionDetail[];
  override: ActiveDecorativePriceOverride;
  price: number | null;
}): ConstructionDetail[] => {
  if (price === null) {
    return constructionDetails.filter(
      (detail) => !isMatchingOverride(detail, override),
    );
  }

  let replaced = false;
  const updated = constructionDetails.flatMap((detail) => {
    if (!isMatchingOverride(detail, override)) return [detail];
    if (replaced) return [];
    replaced = true;
    return [{ ...detail, price }];
  });

  return replaced
    ? updated
    : [...updated, { type: override.type, code: override.code, price }];
};

export const DesignStyleDecorativePriceOverrides = ({
  constructionDetails = [],
  onChange,
}: {
  constructionDetails?: readonly ConstructionDetail[];
  onChange: (next: ConstructionDetail[]) => void;
}) => (
  <section
    className="space-y-3 rounded-xl border border-heritage-gold/20 bg-heritage-cream/10 p-4 sm:col-span-2"
    data-testid="design-style-decorative-price-overrides"
  >
    <div>
      <h4 className="font-bold text-sm text-heritage-green">
        Optional Decorative Price Overrides
      </h4>
      <p className="mt-1 text-[10px] leading-relaxed text-heritage-ink/60">
        Leave a value blank to use the standard price. These are the only
        style-specific construction details used for decorative and accessory
        pricing.
      </p>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {ACTIVE_DECORATIVE_PRICE_OVERRIDE_OPTIONS.map((override) => {
        const current = constructionDetails.find((detail) =>
          isMatchingOverride(detail, override),
        );
        return (
          <label
            key={`${override.type}:${override.code}`}
            className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-heritage-gold/15 bg-white px-3 py-2 text-xs"
          >
            <span className="min-w-0 break-words font-semibold text-heritage-green">
              {override.label}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <span className="text-heritage-ink/55">€</span>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                aria-label={`Custom price for ${override.label}`}
                value={current?.price ?? ""}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  if (!raw) {
                    onChange(
                      updateActiveDecorativePriceOverride({
                        constructionDetails,
                        override,
                        price: null,
                      }),
                    );
                    return;
                  }
                  const price = Number(raw);
                  if (!Number.isFinite(price) || price < 0) return;
                  onChange(
                    updateActiveDecorativePriceOverride({
                      constructionDetails,
                      override,
                      price,
                    }),
                  );
                }}
                className="w-24 rounded-lg border border-heritage-gold/20 bg-white px-2 py-1.5 text-right font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
              />
            </span>
          </label>
        );
      })}
    </div>
  </section>
);
