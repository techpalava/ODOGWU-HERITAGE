import { ArrowLeft, ArrowRight, LockKeyhole, PackageCheck } from "lucide-react";
import type { ReactNode } from "react";

const studioNavButtonClass =
  "inline-flex min-h-12 max-w-full min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-[11px] font-bold leading-tight sm:gap-2 sm:px-3 sm:text-xs [overflow-wrap:normal] [word-break:normal] transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2";

/** Back and other secondary controls: white at rest, heritage green fill with white text on hover and focus. */
export const studioOutlinedNavInteractionClass =
  "transition duration-200 ease-out enabled:hover:border-heritage-green enabled:hover:bg-heritage-green enabled:hover:text-white focus-visible:border-heritage-green focus-visible:bg-heritage-green focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2";

/** Forward Continue controls: solid heritage green at rest, white with green text and border on hover and focus. */
export const studioContinueNavInteractionClass =
  "border-2 border-heritage-green bg-heritage-green text-white shadow-sm transition duration-200 ease-out enabled:hover:border-heritage-green enabled:hover:bg-white enabled:hover:text-heritage-green focus-visible:border-heritage-green focus-visible:bg-white focus-visible:text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2";

/**
 * Gold beam on enabled Design Studio step navigation: Back one step, Continue,
 * and Continue variants such as Review Order. Uses the heritage gold token.
 * Reduced motion gets a static gold ring, and the beam pauses on keyboard
 * focus so the gold focus ring stays legible. Never apply it to a disabled or
 * locked button.
 */
export const STUDIO_NAV_GOLD_BEAM_CLASS =
  "motion-safe:animate-studio-nav-gold-beam motion-safe:focus-visible:animate-none motion-reduce:studio-nav-gold-beam-static";

/** Gold beam class + data attribute for an enabled step navigation button. */
export const getStudioNavGoldBeam = (
  active: boolean,
): { className: string; "data-studio-nav-beam": "gold" | "off" } => ({
  className: active ? STUDIO_NAV_GOLD_BEAM_CLASS : "",
  "data-studio-nav-beam": active ? "gold" : "off",
});

/**
 * White glow, kept only for the fabric capacity offer's Continue button
 * (not changed here). Step navigation uses STUDIO_NAV_GOLD_BEAM_CLASS.
 * Original note: white glow on an unlocked (enabled) Continue button. The buttons are heritage
 * green, so the glow is white, never gold. Reduced motion gets a static soft
 * white ring, and the pulse pauses on keyboard focus so the gold focus ring
 * stays legible. Never apply it to a disabled or locked Continue.
 */
export const STUDIO_CONTINUE_UNLOCK_GLOW_CLASS =
  "motion-safe:animate-continue-unlock-glow motion-safe:focus-visible:animate-none motion-reduce:shadow-[inset_0_0_0_2px_rgb(255_255_255/0.7),0_0_0_3px_rgb(255_255_255/0.95),0_0_0_4px_rgb(10_41_27/0.18)]";

/** Glow class + data attribute for any Continue / next-step primary button. */
export const getStudioContinueUnlockGlow = (
  unlocked: boolean,
): { className: string; "data-continue-unlock-glow": "on" | "off" } => ({
  className: unlocked ? STUDIO_CONTINUE_UNLOCK_GLOW_CLASS : "",
  "data-continue-unlock-glow": unlocked ? "on" : "off",
});

const StudioNavLabel = ({
  primary,
  secondary,
  emphasis = "fill",
}: {
  primary: string;
  secondary?: string | null;
  emphasis?: "fill" | "outline";
}) => (
  <span
    data-studio-nav-label="stack"
    className="flex min-w-0 flex-1 flex-col items-center justify-center text-center leading-none"
  >
    <span className="max-w-full truncate uppercase tracking-wide">{primary}</span>
    {secondary ? (
      <span
        className={`mt-0.5 max-w-full text-[10px] font-semibold normal-case leading-tight tracking-normal text-current/75 ${
          emphasis === "outline"
            ? "group-enabled:group-hover:text-heritage-green! group-focus-visible:text-heritage-green!"
            : "group-enabled:group-hover:text-white! group-focus-visible:text-white!"
        }`}
      >
        {` ${secondary}`}
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
  const beam = getStudioNavGoldBeam(!disabled);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-studio-nav="back"
      data-studio-nav-beam={beam["data-studio-nav-beam"]}
      className={`${studioNavButtonClass} group border-2 border-heritage-green/75 bg-white text-heritage-ink shadow-sm ${studioOutlinedNavInteractionClass} disabled:cursor-not-allowed disabled:border-heritage-ink/20 disabled:bg-heritage-cream/50 disabled:text-heritage-ink/45 disabled:shadow-none ${beam.className} ${className}`}
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
  /** When locked, keep the button clickable (aria-disabled) and call this instead of onClick. */
  onLockedClick?: () => void;
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
  onLockedClick,
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
  const lockedClickable = locked && disabled && Boolean(onLockedClick);
  const unlockGlow = getStudioContinueUnlockGlow(!disabled && !locked);
  const beam = getStudioNavGoldBeam(!disabled && !locked);
  const Icon = locked || icon === "lock"
    ? LockKeyhole
    : icon === "package"
      ? PackageCheck
      : ArrowRight;

  return (
    <button
      type="button"
      onClick={lockedClickable ? onLockedClick : onClick}
      disabled={lockedClickable ? undefined : disabled}
      aria-disabled={lockedClickable ? "true" : undefined}
      aria-label={accessible}
      aria-describedby={ariaDescribedBy || describedBy}
      data-studio-nav="forward"
      data-continue-unlock-glow={unlockGlow["data-continue-unlock-glow"]}
      data-studio-nav-beam={beam["data-studio-nav-beam"]}
      className={`${studioNavButtonClass} group ${studioContinueNavInteractionClass} disabled:cursor-not-allowed disabled:border-transparent disabled:bg-heritage-green/35 disabled:shadow-none aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-heritage-green/35 aria-disabled:shadow-none ${beam.className} ${className}`}
    >
      <StudioNavLabel primary={primary} secondary={secondary} emphasis="outline" />
      <Icon aria-hidden="true" size={16} className="shrink-0" />
    </button>
  );
};

export const DesignStudioStepActions = ({
  slot,
  backDestination,
  onBack,
  backDisabled = false,
  forward,
  note,
  className = "",
}: {
  /** Header and footer must both use this component so their rows cannot diverge. */
  slot: "header" | "footer";
  backDestination?: string;
  onBack?: () => void;
  backDisabled?: boolean;
  forward?: DesignStudioForwardButtonProps;
  note?: ReactNode;
  className?: string;
}) => (
  <div
    data-studio-step-actions="true"
    data-studio-step-actions-slot={slot}
    className={`flex w-full min-w-0 flex-col gap-3 ${className}`}
  >
    <div
      data-studio-step-actions-buttons="true"
      className="flex w-full min-w-0 flex-row flex-nowrap items-stretch justify-between gap-2 sm:gap-3"
    >
      <DesignStudioBackButton
        destination={backDestination}
        onClick={onBack}
        disabled={backDisabled}
        className="min-w-0 flex-1 basis-0 sm:max-w-xs"
      />
      {forward ? (
        <DesignStudioForwardButton
          {...forward}
          className={`min-w-0 flex-1 basis-0 sm:max-w-xs ${forward.className || ""}`}
        />
      ) : null}
    </div>
    {note ? (
      <div data-studio-step-actions-note="true" className="w-full min-w-0">
        {note}
      </div>
    ) : null}
  </div>
);
