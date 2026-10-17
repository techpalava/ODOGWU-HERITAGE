/**
 * The "At least one garment must remain in your order." reason used to sit
 * under the only garment as permanent text on Steps 6-9. The Remove button now
 * stays visibly unavailable (aria-disabled, with a hover tooltip), and the
 * reason is only shown on screen after the customer actually tries to remove
 * that last garment. Screen readers still get it through aria-describedby.
 */
export const BLOCKED_GARMENT_REMOVAL_BUTTON_CLASS =
  "aria-disabled:cursor-not-allowed aria-disabled:opacity-45 aria-disabled:hover:bg-transparent";

export const BlockedGarmentRemovalReason = ({
  id,
  reason,
  revealed,
  className,
}: {
  id: string;
  reason: string | null | undefined;
  revealed: boolean;
  className: string;
}) => {
  if (!reason) return null;
  return revealed ? (
    <p
      id={id}
      role="status"
      data-garment-removal-blocked-reason="visible"
      className={className}
    >
      {reason}
    </p>
  ) : (
    <span
      id={id}
      data-garment-removal-blocked-reason="hidden"
      className="sr-only"
    >
      {reason}
    </span>
  );
};
