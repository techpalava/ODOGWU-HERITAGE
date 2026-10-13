import { useEffect, useState, type RefObject } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useDesignStudioBlockingOverlayOpen } from "./designStudioBlockingOverlay";
import {
  attachDesignStudioScrollProgressListener,
  resolveDesignStudioScrollFab,
  scrollDesignStudioToBottom,
  scrollDesignStudioToTop,
} from "../utils/designStudioScrollFabs";

const SCROLL_FAB_CLASS_NAME =
  "fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex size-11 items-center justify-center rounded-full border border-heritage-gold/40 bg-white text-heritage-green shadow-md transition hover:bg-heritage-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 sm:bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] sm:right-6";

export function shouldShowDesignStudioGoToBottom(args: {
  scrollBelowFortyPercent: boolean;
  blockingOverlayOpen: boolean;
}): boolean {
  return args.scrollBelowFortyPercent && !args.blockingOverlayOpen;
}

export function shouldShowDesignStudioGoToTop(args: {
  scrollAtOrAboveFortyPercent: boolean;
  blockingOverlayOpen: boolean;
}): boolean {
  return args.scrollAtOrAboveFortyPercent && !args.blockingOverlayOpen;
}

export function DesignStudioGoToBottomButton({
  onClick,
  stageLabel,
}: {
  onClick: () => void;
  stageLabel: string;
}) {
  return (
    <button
      type="button"
      data-design-studio-go-to-bottom="true"
      aria-label={`Go to bottom of ${stageLabel}`}
      title="Go to bottom"
      onClick={onClick}
      className={SCROLL_FAB_CLASS_NAME}
    >
      <ArrowDown aria-hidden="true" size={18} />
    </button>
  );
}

export function DesignStudioGoToTopButton({
  onClick,
  stageLabel,
}: {
  onClick: () => void;
  stageLabel: string;
}) {
  return (
    <button
      type="button"
      data-design-studio-go-to-top="true"
      aria-label={`Go to top of ${stageLabel}`}
      title="Go to top"
      onClick={onClick}
      className={SCROLL_FAB_CLASS_NAME}
    >
      <ArrowUp aria-hidden="true" size={18} />
    </button>
  );
}

export function DesignStudioScrollFabHost({
  stageLabel,
  topTargetRef,
  bottomTargetRef,
  progress: progressOverride,
}: {
  stageLabel: string;
  topTargetRef: RefObject<HTMLElement | null>;
  bottomTargetRef:
    | RefObject<HTMLElement | null>
    | RefObject<HTMLDivElement | null>;
  /** Test seam. Production listens to document scroll instead. */
  progress?: number;
}) {
  const blockingOverlayOpen = useDesignStudioBlockingOverlayOpen();
  const [listenedProgress, setListenedProgress] = useState(0);

  useEffect(() => {
    if (progressOverride !== undefined) return;
    return attachDesignStudioScrollProgressListener({
      onProgressChange: setListenedProgress,
    });
  }, [progressOverride, stageLabel]);

  const progress = progressOverride ?? listenedProgress;
  const fab = resolveDesignStudioScrollFab({
    progress,
    blockingOverlayOpen,
  });

  if (fab === "bottom") {
    return (
      <DesignStudioGoToBottomButton
        stageLabel={stageLabel}
        onClick={() =>
          scrollDesignStudioToBottom({ target: bottomTargetRef.current })
        }
      />
    );
  }
  if (fab === "top") {
    return (
      <DesignStudioGoToTopButton
        stageLabel={stageLabel}
        onClick={() =>
          scrollDesignStudioToTop({ target: topTargetRef.current })
        }
      />
    );
  }
  return null;
}
