import { ArrowUp } from "lucide-react";

interface CustomDetailsGoToTopButtonProps {
  onClick: () => void;
}

export function shouldShowCustomDetailsGoToTop(args: {
  sentinelOutOfView: boolean;
  fabricModalOpen: boolean;
  choiceDialogOpen: boolean;
}): boolean {
  return (
    args.sentinelOutOfView &&
    !args.fabricModalOpen &&
    !args.choiceDialogOpen
  );
}

export function CustomDetailsGoToTopButton({
  onClick,
}: CustomDetailsGoToTopButtonProps) {
  return (
    <button
      type="button"
      data-custom-details-go-to-top="true"
      aria-label="Go to top of Custom Details"
      title="Go to top"
      onClick={onClick}
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex size-11 items-center justify-center rounded-full border border-heritage-gold/40 bg-white text-heritage-green shadow-md transition hover:bg-heritage-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] sm:right-6"
    >
      <ArrowUp aria-hidden="true" size={18} />
    </button>
  );
}
