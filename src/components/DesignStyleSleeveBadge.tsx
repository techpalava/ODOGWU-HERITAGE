import { getDesignStyleSleeveOptionLabel } from "../utils/designStyleSleeveOption";

interface DesignStyleSleeveBadgeProps {
  sleeveOption: unknown;
  className?: string;
}

/**
 * Informational badge for Design Style sleeve option.
 * Renders null when no valid sleeve option is provided (i.e., "Not specified").
 * Mount at bottom-left of photo containers so it never overlaps "From gallery"
 * (top-left) or "IN USE"/"Selected" (top-right).
 */
export function DesignStyleSleeveBadge({
  sleeveOption,
  className = "",
}: DesignStyleSleeveBadgeProps) {
  const label = getDesignStyleSleeveOptionLabel(sleeveOption);
  if (!label) return null;

  return (
    <span
      data-testid="design-style-sleeve-badge"
      className={`pointer-events-none rounded-full border border-heritage-green/20 bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-heritage-green shadow-sm backdrop-blur-sm ${className}`}
    >
      {label}
    </span>
  );
}