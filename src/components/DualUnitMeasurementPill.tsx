import type { DualUnitMeasurementParts } from "../utils/measurementBlueprint";

export const MEASUREMENT_CHECK_FLAG_LABEL = "Check this?";
export const MEASUREMENT_CHECK_FLAG_DESCRIPTION =
  "Value outside the usual range, check this";

/**
 * Split pill for a dual-unit measurement: preferred unit (Step 7 unit) on the left,
 * the other unit on the right after a thin divider. Every pill of a size has the
 * same fixed width with 50/50 halves, so left edges line up down a card.
 * Screen readers hear "42 in (106.68 cm)" because the parentheses are visually
 * hidden, not removed. `outsideUsualRange` adds a quiet "Check this?" tag on the
 * left (above the pill on narrow screens so labels keep their room); it is
 * informational only.
 */
export function DualUnitMeasurementPill({
  parts,
  size = "md",
  outsideUsualRange = false,
}: {
  parts: DualUnitMeasurementParts;
  size?: "md" | "sm";
  outsideUsualRange?: boolean;
}) {
  const sizing = size === "sm"
    ? "w-[9.5rem] text-[11px] leading-4"
    : "w-[10.5rem] text-[13px] leading-5";
  const padding = size === "sm" ? "px-1.5 py-px" : "px-2 py-0.5";
  const pill = (
    <span
      data-measurement-pill
      className={`inline-flex shrink-0 overflow-hidden whitespace-nowrap rounded-full border border-[#e3d6bd] font-sans tabular-nums ${sizing}`}
    >
      <span
        data-measurement-preferred
        className={`${padding} w-1/2 bg-[#f3ece0] text-right font-bold text-heritage-green`}
      >
        {parts.preferred}
      </span>
      <span
        data-measurement-alternate
        className={`${padding} w-1/2 border-l border-[#e3d6bd] text-right font-normal text-heritage-ink/55`}
      >
        <span className="sr-only"> (</span>
        {parts.alternate}
        <span className="sr-only">)</span>
      </span>
    </span>
  );
  if (!outsideUsualRange) return pill;
  return (
    <span className="inline-flex max-w-full flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-1.5">
      <span
        data-measurement-check-flag
        title={MEASUREMENT_CHECK_FLAG_DESCRIPTION}
        className="whitespace-nowrap rounded-md border border-amber-200 bg-amber-50 px-1.5 py-px font-sans text-[11px] font-medium text-amber-700"
      >
        <span aria-hidden="true">{MEASUREMENT_CHECK_FLAG_LABEL}</span>
        <span className="sr-only">{MEASUREMENT_CHECK_FLAG_DESCRIPTION}</span>
      </span>
      {pill}
    </span>
  );
}
