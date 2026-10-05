import { ArrowDown } from "lucide-react";

interface CustomDetailsGoToBottomButtonProps {
  onClick: () => void;
}

export function shouldShowCustomDetailsGoToBottom(args: {
  scrollBelowFortyPercent: boolean;
  fabricModalOpen: boolean;
  choiceDialogOpen: boolean;
}): boolean {
  return (
    args.scrollBelowFortyPercent &&
    !args.fabricModalOpen &&
    !args.choiceDialogOpen
  );
}

export function CustomDetailsGoToBottomButton({
  onClick,
}: CustomDetailsGoToBottomButtonProps) {
  return (
    <button
      type="button"
      data-custom-details-go-to-bottom="true"
      aria-label="Go to bottom of Custom Details"
      title="Go to bottom"
      onClick={onClick}
      className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex size-11 items-center justify-center rounded-full border border-heritage-gold/40 bg-white text-heritage-green shadow-md transition hover:bg-heritage-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] sm:right-6"
    >
      <ArrowDown aria-hidden="true" size={18} />
    </button>
  );
}
