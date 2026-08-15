import { ArrowLeft } from "lucide-react";

interface DesignStudioBackButtonProps {
  destination?: string;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export const DesignStudioBackButton = ({
  destination,
  disabled = false,
  onClick,
  className = "",
}: DesignStudioBackButtonProps) => {
  const label = disabled
    ? "Back one step is unavailable on Garment Type"
    : `Back one step to ${destination}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-heritage-green/75 bg-white px-4 text-xs font-bold uppercase tracking-wider text-heritage-ink shadow-sm transition hover:border-heritage-green hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-heritage-ink/20 disabled:bg-heritage-cream/50 disabled:text-heritage-ink/45 disabled:shadow-none ${className}`}
    >
      <ArrowLeft aria-hidden="true" size={16} className="shrink-0" />
      <span>Back one step</span>
      {destination && !disabled && (
        <span className="normal-case tracking-normal text-current/75">
          to {destination}
        </span>
      )}
    </button>
  );
};
