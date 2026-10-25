import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { studioOutlinedNavInteractionClass } from "./DesignStudioBackButton";

export const FABRIC_PIECE_PLACEMENT_TITLE = "Pair or use a new piece?";
export const FABRIC_PIECE_PLACEMENT_NEW_PIECE_LABEL = "Use a new piece";
export const formatFabricPiecePairLabel = (selectionNumber: number): string =>
  `Pair with Selection ${selectionNumber}`;

/**
 * Asked before a garment joins an existing piece of the same print. The
 * customer may pair it with that piece or start a separate piece and leave
 * the leftover capacity unused. "Use a new piece" is disabled, with the
 * reason shown, when another piece would exceed Fabrics Needed or stock.
 */
export const FabricPiecePlacementDialog = ({
  fabricName,
  garmentLabel,
  pairSelectionNumber,
  pairRemainingUnits,
  newPieceAvailable,
  newPieceBlockedMessage,
  onPair,
  onNewPiece,
  onCancel,
}: {
  fabricName: string;
  garmentLabel: string;
  pairSelectionNumber: number;
  pairRemainingUnits: number;
  newPieceAvailable: boolean;
  newPieceBlockedMessage: string | null;
  onPair: () => void;
  onNewPiece: () => void;
  onCancel: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const blockedId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const pairRef = useRef<HTMLButtonElement | null>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || typeof document === "undefined") return;
    const previousFocus = document.activeElement as HTMLElement | null;
    (pairRef.current || dialog).focus?.();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
      );
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog.addEventListener("keydown", keydown);
    return () => {
      dialog.removeEventListener("keydown", keydown);
      if (previousFocus?.isConnected) previousFocus.focus?.();
    };
  }, []);

  const pairLabel = formatFabricPiecePairLabel(pairSelectionNumber);
  const content = (
    <div className="fixed inset-0 z-[10001] flex items-end justify-center bg-heritage-ink/40 p-3 sm:items-center sm:p-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-fabric-piece-placement-dialog="true"
        data-testid="fabric-piece-placement-dialog"
        className="w-full max-w-md min-w-0 rounded-2xl border border-heritage-gold/40 bg-white p-4 shadow-xl sm:p-5"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <h2
            id={titleId}
            className="min-w-0 break-words font-serif text-lg font-bold text-heritage-green"
          >
            {FABRIC_PIECE_PLACEMENT_TITLE}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel fabric assignment"
            data-fabric-piece-placement-cancel="true"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <p
          id={descriptionId}
          className="mt-2 break-words text-sm leading-relaxed text-heritage-ink/75"
        >
          {`Selection ${pairSelectionNumber} is a piece of ${fabricName} with ${pairRemainingUnits}/2 left. Put ${garmentLabel} on that piece, or start a new piece of the same print and leave ${pairRemainingUnits}/2 unused.`}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            ref={pairRef}
            type="button"
            onClick={onPair}
            data-fabric-piece-placement-pair="true"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-heritage-green px-4 text-xs font-bold uppercase tracking-wider text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
          >
            {pairLabel}
          </button>
          <button
            type="button"
            onClick={newPieceAvailable ? onNewPiece : undefined}
            disabled={!newPieceAvailable}
            aria-describedby={!newPieceAvailable ? blockedId : undefined}
            data-fabric-piece-placement-new-piece="true"
            data-fabric-piece-placement-new-piece-available={
              newPieceAvailable ? "true" : "false"
            }
            className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl border-2 border-heritage-green bg-white px-4 text-xs font-bold uppercase tracking-wider text-heritage-green disabled:cursor-not-allowed disabled:opacity-45 ${studioOutlinedNavInteractionClass}`}
          >
            {FABRIC_PIECE_PLACEMENT_NEW_PIECE_LABEL}
          </button>
          {!newPieceAvailable && newPieceBlockedMessage ? (
            <p
              id={blockedId}
              data-fabric-piece-placement-new-piece-blocked="true"
              className="break-words text-xs leading-relaxed text-red-700"
            >
              {newPieceBlockedMessage}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
  return typeof document !== "undefined" && document.body
    ? createPortal(content, document.body)
    : content;
};
