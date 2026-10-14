import { ArrowLeft, ArrowRight, LockKeyhole, PackageCheck } from "lucide-react";
import type { ReactNode } from "react";

const studioNavButtonClass =
  "inline-flex min-h-12 max-w-full min-w-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-xs font-bold leading-snug [overflow-wrap:normal] [word-break:normal] transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2";

/** Outlined Continue, Back, and skip controls fill heritage green with white text and icons. */
export const studioOutlinedNavInteractionClass =
  "transition duration-200 ease-out enabled:hover:border-heritage-green enabled:hover:bg-heritage-green enabled:hover:text-white focus-visible:border-heritage-green focus-visible:bg-heritage-green focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2";

const StudioNavLabel = ({
  primary,
  secondary,
}: {
  primary: string;
  secondary?: string | null;
}) => (
  <span className="min-w-0 text-balance text-center leading-snug [overflow-wrap:normal] [word-break:normal]">
    <span className="uppercase tracking-wide">{primary}</span>
    {secondary ? (
      <span className="font-semibold normal-case tracking-normal text-current/75 group-enabled:group-hover:text-white group-focus-visible:text-white">
        {" "}
        {secondary}
      </span>
    ) : null}
  </span>
);

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
  const showDestination = Boolean(destination) && !disabled;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-studio-nav="back"
      className={`${studioNavButtonClass} group border-2 border-heritage-green/75 bg-white text-heritage-ink shadow-sm ${studioOutlinedNavInteractionClass} disabled:cursor-not-allowed disabled:border-heritage-ink/20 disabled:bg-heritage-cream/50 disabled:text-heritage-ink/45 disabled:shadow-none ${className}`}
    >
      <ArrowLeft aria-hidden="true" size={16} className="shrink-0" />
      <StudioNavLabel
        primary="Back one step"
        secondary={showDestination ? `to ${destination}` : null}
      />
    </button>
  );
};

type DesignStudioForwardIcon = "arrow" | "lock" | "package";

export interface DesignStudioForwardButtonProps {
  destination?: string;
  onClick?: () => void;
  disabled?: boolean;
  locked?: boolean;
  icon?: DesignStudioForwardIcon;
  ariaLabel?: string;
  describedBy?: string;
  "aria-describedby"?: string;
  label?: string;
  className?: string;
}

export const DesignStudioForwardButton = ({
  destination,
  onClick,
  disabled = false,
  locked = false,
  icon = "arrow",
  ariaLabel,
  describedBy,
  "aria-describedby": ariaDescribedBy,
  label,
  className = "",
}: DesignStudioForwardButtonProps) => {
  const secondary = label || !destination ? null : `to ${destination}`;
  const primary = label ?? "Continue";
  const accessible = ariaLabel ?? (destination ? `Continue to ${destination}` : primary);
  const Icon = locked || icon === "lock"
    ? LockKeyhole
    : icon === "package"
      ? PackageCheck
      : ArrowRight;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={accessible}
      aria-describedby={ariaDescribedBy || describedBy}
      data-studio-nav="forward"
      className={`${studioNavButtonClass} group bg-heritage-green text-white shadow-sm enabled:hover:bg-heritage-forest disabled:cursor-not-allowed disabled:bg-heritage-green/35 disabled:shadow-none ${className}`}
    >
      <StudioNavLabel primary={primary} secondary={secondary} />
      <Icon aria-hidden="true" size={16} className="shrink-0" />
    </button>
  );
};

export const DesignStudioStepActions = ({
  backDestination,
  onBack,
  backDisabled = false,
  forward,
  note,
  className = "",
}: {
  backDestination?: string;
  onBack?: () => void;
  backDisabled?: boolean;
  forward?: DesignStudioForwardButtonProps;
  note?: ReactNode;
  className?: string;
}) => (
  <div
    data-studio-step-actions="true"
    className={`flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${className}`}
  >
    <DesignStudioBackButton
      destination={backDestination}
      onClick={onBack}
      disabled={backDisabled}
      className="w-full sm:max-w-xs sm:flex-1"
    />
    {(forward || note) && (
      <div className="flex w-full min-w-0 flex-col gap-2 sm:max-w-xs sm:flex-1">
        {note}
        {forward && (
          <DesignStudioForwardButton
            {...forward}
            className={`w-full ${forward.className || ""}`}
          />
        )}
      </div>
    )}
  </div>
);
