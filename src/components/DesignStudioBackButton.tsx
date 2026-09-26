import { ArrowLeft, ArrowRight, LockKeyhole, PackageCheck } from "lucide-react";
import type { ReactNode } from "react";

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
      className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border-2 border-heritage-green/75 bg-white px-4 text-xs font-bold uppercase tracking-wider text-heritage-ink shadow-sm transition hover:border-heritage-green hover:bg-heritage-green hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-heritage-ink/20 disabled:bg-heritage-cream/50 disabled:text-heritage-ink/45 disabled:shadow-none ${className}`}
    >
      <ArrowLeft aria-hidden="true" size={16} className="shrink-0" />
      <span className="flex flex-col items-start text-left leading-tight">
        <span className="whitespace-nowrap">Back one step{showDestination ? " " : ""}</span>
        {showDestination && (
          <span className="whitespace-nowrap font-semibold normal-case tracking-normal text-current/75">
            to {destination}
          </span>
        )}
      </span>
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
      className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-heritage-green/35 disabled:shadow-none ${className}`}
    >
      <span className="flex flex-col items-start text-left leading-tight">
        <span className="whitespace-nowrap">{primary}{secondary ? " " : ""}</span>
        {secondary && (
          <span className="whitespace-nowrap font-semibold normal-case tracking-normal text-white/80">
            {secondary}
          </span>
        )}
      </span>
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
  <div className={`flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between ${className}`}>
    <DesignStudioBackButton
      destination={backDestination}
      onClick={onBack}
      disabled={backDisabled}
      className="w-full lg:w-auto"
    />
    {(forward || note) && (
      <div className="flex w-full min-w-0 flex-col gap-2 lg:w-auto lg:items-end">
        {note}
        {forward && (
          <DesignStudioForwardButton
            {...forward}
            className={`w-full lg:w-auto ${forward.className || ""}`}
          />
        )}
      </div>
    )}
  </div>
);
