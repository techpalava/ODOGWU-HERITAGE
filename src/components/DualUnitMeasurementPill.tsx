import type { DualUnitMeasurementParts } from "../utils/measurementBlueprint";

/**
 * Split pill for a dual-unit measurement: preferred unit (Step 7 unit) on the left,
 * the other unit on the right after a thin divider. Screen readers hear
 * "42 in (106.68 cm)" because the parentheses are visually hidden, not removed.
 */
export function DualUnitMeasurementPill({
  parts,
  size = "md",
}: {
  parts: DualUnitMeasurementParts;
  size?: "md" | "sm";
}) {
  const sizing = size === "sm"
    ? "text-[11px] leading-4"
    : "text-[13px] leading-5";
  const padding = size === "sm" ? "px-2 py-px" : "px-2.5 py-0.5";
  return (
    <span
      data-measurement-pill
      className={`inline-flex shrink-0 overflow-hidden rounded-full border border-[#e3d6bd] font-sans tabular-nums ${sizing}`}
    >
      <span
        data-measurement-preferred
        className={`${padding} bg-[#f3ece0] text-right font-bold text-heritage-green ${size === "sm" ? "min-w-[3.5rem]" : "min-w-[4.25rem]"}`}
      >
        {parts.preferred}
      </span>
      <span
        data-measurement-alternate
        className={`${padding} border-l border-[#e3d6bd] text-right font-normal text-heritage-ink/55 ${size === "sm" ? "min-w-[3.25rem]" : "min-w-[3.75rem]"}`}
      >
        <span className="sr-only"> (</span>
        {parts.alternate}
        <span className="sr-only">)</span>
      </span>
    </span>
  );
}
