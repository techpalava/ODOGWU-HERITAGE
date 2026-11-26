import { useEffect, useRef, useState, useCallback } from "react";
import {
  CONTINUE_UNLOCKED_SELECTOR,
  MODAL_PRIMARY_SELECTOR,
  computeHandGuidePlacement,
  findPrioritizedHandGuideElements,
  getHandGuideHintForElement,
  resolveHandGuideTarget,
  resolveModalHandGuideTarget,
  shouldSuppressHandGuide,
  shouldTriggerFarCursor,
  type HandGuideAnchor,
  type HandGuideTarget,
} from "../utils/designStudioHandGuide";
import { useDesignStudioBlockingOverlayOpen } from "./designStudioBlockingOverlay";
import type { DesignStudioStageId } from "../types";

interface DesignStudioHandGuideProps {
  /** Current Design Studio stage ID. */
  stageId: DesignStudioStageId;
  /** Optional callback when the hand guide is dismissed by the user. */
  onDismiss?: () => void;
}

const SESSION_DISMISS_KEY = "designStudioHandGuideDismissed";
const IDLE_DELAY_MS = 7000;
const NEAR_AUTO_HIDE_PX = 90;
const FAR_CURSOR_DISTANCE_PX = 280;
const ALTERNATE_CARD_INTERVAL_MS = 3500;

const isTextEntryElement = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
};

/**
 * Checks open dialogs in the DOM:
 * - Guided step modals (`[data-hand-guide-modal]`) allow guiding inside the modal.
 * - Any other open dialog (e.g. `Send feedback`, auth, alerts) suppresses the guide.
 */
const inspectOpenDialogState = (): {
  suppressedByDialog: boolean;
  guidedModalEl: HTMLElement | null;
  guidedModalKind: string | null;
} => {
  if (typeof document === "undefined") {
    return { suppressedByDialog: false, guidedModalEl: null, guidedModalKind: null };
  }
  const openDialogs = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]'),
  ).filter((el) => {
    const style = window.getComputedStyle(el);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      el.getBoundingClientRect().width > 0
    );
  });

  if (openDialogs.length === 0) {
    return { suppressedByDialog: false, guidedModalEl: null, guidedModalKind: null };
  }

  // Prefer the topmost guided modal if one is open and no non-guided dialog (e.g. Send feedback) sits above it.
  const topDialog = openDialogs[openDialogs.length - 1]!;
  const modalKind = topDialog.getAttribute("data-hand-guide-modal");
  if (modalKind) {
    return { suppressedByDialog: false, guidedModalEl: topDialog, guidedModalKind: modalKind };
  }

  return { suppressedByDialog: true, guidedModalEl: null, guidedModalKind: null };
};

/**
 * Animated hand guide that points to the next actionable element in the Design Studio.
 * - Shows after 7s of inactivity (idle) or when a desktop fine-pointer cursor stays >280px
 *   away from the target for 3.5s without moving closer.
 * - Guides inside step workflow modals (`UNUSED FABRIC CAPACITY AVAILABLE`, `Apply Design Style`)
 *   while suppressing completely on feedback popups and other site dialogs.
 * - Auto-hides when cursor <90px from target, user types, target is clicked, or dismissed.
 */
export function DesignStudioHandGuide({
  stageId,
  onDismiss,
}: DesignStudioHandGuideProps) {
  const blockingOverlayOpen = useDesignStudioBlockingOverlayOpen();
  const targetRef = useRef<HandGuideTarget | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const alternateIndexRef = useRef(0);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<{
    x: number;
    y: number;
    anchor: HandGuideAnchor;
  } | null>(null);
  const [mode, setMode] = useState<"anchored" | "off-screen">("anchored");
  const [offScreenDirection, setOffScreenDirection] = useState<"up" | "down">("up");
  const [hint, setHint] = useState("");
  const [subtleAnimation, setSubtleAnimation] = useState(false);
  const [inModal, setInModal] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const farSinceRef = useRef<number | null>(null);
  const farLastDistanceRef = useRef<number | null>(null);
  const cursorPositionRef = useRef<{ x: number; y: number } | null>(null);
  const isTypingRef = useRef(false);
  const dismissedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    try {
      dismissedRef.current = sessionStorage.getItem(SESSION_DISMISS_KEY) === "true";
    } catch {
      dismissedRef.current = false;
    }
  }, []);

  const isElementVisible = useCallback((el: HTMLElement): boolean => {
    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }, []);

  const resolveActiveTargets = useCallback((): {
    elements: HTMLElement[];
    matchedSelector: string | null;
    descriptor: HandGuideTarget | null;
    suppressed: boolean;
    modalActive: boolean;
  } => {
    const dialogState = inspectOpenDialogState();
    if (dialogState.suppressedByDialog) {
      return {
        elements: [],
        matchedSelector: null,
        descriptor: null,
        suppressed: true,
        modalActive: false,
      };
    }

    if (dialogState.guidedModalEl) {
      const modalDescriptor = resolveModalHandGuideTarget(dialogState.guidedModalKind);
      const { elements, matchedSelector } = findPrioritizedHandGuideElements(
        modalDescriptor.selectors,
        (sel) => dialogState.guidedModalEl!.querySelectorAll<HTMLElement>(sel),
        isElementVisible,
      );
      return {
        elements,
        matchedSelector,
        descriptor: modalDescriptor,
        suppressed: false,
        modalActive: true,
      };
    }

    if (blockingOverlayOpen || typeof document === "undefined") {
      return {
        elements: [],
        matchedSelector: null,
        descriptor: null,
        suppressed: true,
        modalActive: false,
      };
    }

    const descriptor = targetRef.current ?? resolveHandGuideTarget(stageId);
    const selectors =
      stageId === "fabric" && document.querySelector('[data-fabric-in-use="true"]')
        ? [CONTINUE_UNLOCKED_SELECTOR]
        : descriptor.selectors;

    const { elements, matchedSelector } = findPrioritizedHandGuideElements(
      selectors,
      (sel) => document.querySelectorAll<HTMLElement>(sel),
      isElementVisible,
    );

    return {
      elements,
      matchedSelector,
      descriptor,
      suppressed: false,
      modalActive: false,
    };
  }, [stageId, blockingOverlayOpen, isElementVisible]);

  const computePosition = useCallback((): boolean => {
    const resolved = resolveActiveTargets();
    if (resolved.suppressed || resolved.elements.length === 0 || !resolved.descriptor) {
      elementRef.current = null;
      return false;
    }

    const isShippingAlternating =
      resolved.matchedSelector === '[data-hand-guide-target="shipping-delivery-option"]' &&
      resolved.elements.length > 1;

    const activeIdx = isShippingAlternating
      ? alternateIndexRef.current % resolved.elements.length
      : 0;
    const targetEl = resolved.elements[activeIdx]!;
    elementRef.current = targetEl;

    const isContinueOrPrimary =
      targetEl.matches(CONTINUE_UNLOCKED_SELECTOR) ||
      targetEl.matches(MODAL_PRIMARY_SELECTOR);
    setHint(
      getHandGuideHintForElement(
        resolved.descriptor,
        isContinueOrPrimary,
        resolved.matchedSelector,
      ),
    );
    setSubtleAnimation(isShippingAlternating);
    setInModal(resolved.modalActive);

    const rect = targetEl.getBoundingClientRect();
    const isNeutralGroup =
      resolved.matchedSelector === '[data-hand-guide-target="measurement-option-group"]';
    const isDiagonalPay =
      resolved.matchedSelector === '[data-hand-guide-target="payment-pay-button"]';

    const placement = computeHandGuidePlacement(
      {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      { width: window.innerWidth, height: window.innerHeight },
      {
        neutralGroup: isNeutralGroup,
        diagonalUpLeft: isDiagonalPay,
      },
    );

    if (placement.mode === "off-screen") {
      setMode("off-screen");
      setOffScreenDirection(placement.direction);
      setPosition(null);
      return true;
    }

    setMode("anchored");
    setPosition({ x: placement.x, y: placement.y, anchor: placement.anchor });
    return true;
  }, [resolveActiveTargets]);

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    farSinceRef.current = null;
    farLastDistanceRef.current = null;
  }, []);

  const startIdleTimer = useCallback(() => {
    if (dismissedRef.current || isTypingRef.current) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (!dismissedRef.current && !isTypingRef.current && computePosition()) {
        setIsVisible(true);
      }
    }, IDLE_DELAY_MS);
  }, [computePosition]);

  useEffect(() => {
    if (shouldSuppressHandGuide(stageId)) {
      setIsVisible(false);
      clearTimers();
      return;
    }
    const target = resolveHandGuideTarget(stageId);
    targetRef.current = target;
    alternateIndexRef.current = 0;
    setHint(target.hint);
    setIsVisible(false);
    clearTimers();
    startIdleTimer();
  }, [stageId, clearTimers, startIdleTimer]);

  // Alternate between Delivery & Pickup cards softly on repeat while visible
  useEffect(() => {
    if (!isVisible || !subtleAnimation) return;
    const interval = setInterval(() => {
      alternateIndexRef.current = (alternateIndexRef.current + 1) % 2;
      computePosition();
    }, ALTERNATE_CARD_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isVisible, subtleAnimation, computePosition]);

  const handleCursorMove = useCallback(
    (e: MouseEvent) => {
      cursorPositionRef.current = { x: e.clientX, y: e.clientY };
      startIdleTimer();
    },
    [startIdleTimer],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isTextEntryElement(e.target)) {
        isTypingRef.current = true;
        setIsVisible(false);
        clearTimers();
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          isTypingRef.current = false;
          startIdleTimer();
        }, 1200);
      } else {
        startIdleTimer();
      }
    },
    [clearTimers, startIdleTimer],
  );

  const handleScroll = useCallback(() => {
    startIdleTimer();
  }, [startIdleTimer]);

  const handleDocumentClick = useCallback(
    (e: MouseEvent) => {
      const targetEl = elementRef.current;
      if (targetEl && targetEl.contains(e.target as Node)) {
        setIsVisible(false);
        clearTimers();
        startIdleTimer();
      }
    },
    [clearTimers, startIdleTimer],
  );

  // Periodic check for dialog suppression, far-cursor trigger & <90px auto-hide
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isFinePointer = window.matchMedia("(pointer: fine)").matches;

    const checkInterval = setInterval(() => {
      if (dismissedRef.current || isTypingRef.current) {
        if (isVisible) setIsVisible(false);
        return;
      }

      const resolved = resolveActiveTargets();
      if (resolved.suppressed || resolved.elements.length === 0) {
        if (isVisible) setIsVisible(false);
        farSinceRef.current = null;
        return;
      }

      const targetEl =
        elementRef.current && resolved.elements.includes(elementRef.current)
          ? elementRef.current
          : resolved.elements[0]!;
      elementRef.current = targetEl;

      const cursor = cursorPositionRef.current;
      if (!cursor) return;

      const rect = targetEl.getBoundingClientRect();
      const distance = Math.hypot(
        cursor.x - (rect.left + rect.width / 2),
        cursor.y - (rect.top + rect.height / 2),
      );

      if (distance < NEAR_AUTO_HIDE_PX) {
        if (isVisible) setIsVisible(false);
        farSinceRef.current = null;
        farLastDistanceRef.current = distance;
        return;
      }

      if (!isVisible && isFinePointer && distance > FAR_CURSOR_DISTANCE_PX) {
        const now = Date.now();
        if (
          farSinceRef.current === null ||
          (farLastDistanceRef.current !== null &&
            distance < farLastDistanceRef.current - 12)
        ) {
          farSinceRef.current = now;
        }
        farLastDistanceRef.current = distance;

        const elapsedFarMs = now - farSinceRef.current;
        if (
          shouldTriggerFarCursor({
            distancePx: distance,
            previousDistancePx: null,
            elapsedFarMs,
            isFinePointer,
          }) &&
          computePosition()
        ) {
          setIsVisible(true);
          farSinceRef.current = null;
        }
      } else {
        farSinceRef.current = null;
        farLastDistanceRef.current = distance;
      }
    }, 200);

    return () => clearInterval(checkInterval);
  }, [isVisible, resolveActiveTargets, computePosition]);

  useEffect(() => {
    window.addEventListener("mousemove", handleCursorMove);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("click", handleDocumentClick);
    return () => {
      window.removeEventListener("mousemove", handleCursorMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("click", handleDocumentClick);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      clearTimers();
    };
  }, [
    handleCursorMove,
    handleKeyDown,
    handleScroll,
    handleDocumentClick,
    clearTimers,
  ]);

  useEffect(() => {
    if (!isVisible) return;
    const handleViewportChange = () => {
      if (!computePosition()) {
        setIsVisible(false);
      }
    };
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, { passive: true });
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange);
    };
  }, [isVisible, computePosition]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    dismissedRef.current = true;
    try {
      sessionStorage.setItem(SESSION_DISMISS_KEY, "true");
    } catch {
      // Ignore storage failures
    }
    clearTimers();
    onDismiss?.();
  }, [onDismiss, clearTimers]);

  const handleJumpToTarget = useCallback(() => {
    const targetEl = elementRef.current || resolveActiveTargets().elements[0];
    if (!targetEl) {
      setIsVisible(false);
      return;
    }
    targetEl.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
    });
    setTimeout(() => {
      computePosition();
    }, reducedMotion ? 0 : 400);
  }, [resolveActiveTargets, reducedMotion, computePosition]);

  if (!isVisible || dismissedRef.current || shouldSuppressHandGuide(stageId)) {
    return null;
  }

  const zIndexClass = inModal ? "z-[10010]" : "z-[99]";

  if (mode === "off-screen") {
    const arrow = offScreenDirection === "up" ? "↑" : "↓";
    return (
      <div
        className={`fixed bottom-20 left-1/2 -translate-x-1/2 sm:bottom-6 ${inModal ? "z-[10010]" : "z-[65]"}`}
        style={{ maxWidth: "90vw" }}
        role="region"
        aria-label="Design Studio step guide"
      >
        <div className="relative inline-flex items-center gap-1.5 rounded-full border border-heritage-gold bg-heritage-green py-1.5 pl-3.5 pr-2 text-heritage-cream shadow-lg">
          <button
            type="button"
            onClick={handleJumpToTarget}
            className="cursor-pointer truncate text-xs font-semibold tracking-wide text-heritage-cream hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
          >
            {arrow} Jump to: {hint || "Continue"}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-heritage-gold transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
            aria-label="Hide guide"
            title="Hide guide for this session"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <div
            className="pointer-events-none absolute -bottom-7 right-4 flex items-center justify-center"
            aria-hidden="true"
          >
            {!reducedMotion && (
              <span className="absolute -left-1 -top-1 h-6 w-6 rounded-full border-2 border-heritage-gold animate-ripple" />
            )}
            <HandSVG
              className={`h-7 w-7 drop-shadow-md ${reducedMotion ? "" : "animate-hand-tap"}`}
            />
          </div>
        </div>
      </div>
    );
  }

  if (!position) return null;

  const { x, y, anchor } = position;
  const isAboveLeft = anchor === "above-left";
  const isTopCenter = anchor === "top-center";
  const isDiagonal = anchor === "diagonal-up-left";

  const rotationClass = isAboveLeft
    ? "rotate-180"
    : isTopCenter
      ? "rotate-180"
      : isDiagonal
        ? "-rotate-[38deg]"
        : "";

  const animClass = reducedMotion
    ? ""
    : subtleAnimation
      ? "animate-hand-soft"
      : "animate-hand-tap";

  return (
    <div
      className={`pointer-events-none fixed ${zIndexClass} transition-all duration-300`}
      style={{ left: x, top: y }}
      aria-hidden="true"
    >
      <div className="relative flex flex-col items-center">
        <div className={`relative ${rotationClass}`}>
          {!reducedMotion && !subtleAnimation && (
            <span className="absolute -left-1.5 -top-1.5 h-6 w-6 rounded-full border-2 border-heritage-gold animate-ripple" />
          )}
          <HandSVG className={`h-8 w-8 drop-shadow-md ${animClass}`} />
        </div>

        <div
          className={`absolute ${
            isAboveLeft || isTopCenter ? "bottom-full mb-1.5" : "top-full mt-1.5"
          } left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-heritage-gold bg-heritage-green px-2.5 py-1 text-xs font-semibold text-heritage-cream shadow-md`}
          role="tooltip"
        >
          {hint}
        </div>
      </div>
    </div>
  );
}

/** Crisp SVG pointing hand icon (heritage green fill + heritage gold outline), pointing up-left. */
function HandSVG({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        d="M10.5 3.5C10.5 2.4 11.4 1.5 12.5 1.5C13.6 1.5 14.5 2.4 14.5 3.5V11.2L15.7 10.6C16.6 10.1 17.7 10.5 18.2 11.4L19.1 11.1C20 10.7 21 11.2 21.4 12.1L22.2 12C23.1 11.8 24 12.5 24 13.5V18.8C24 22.8 20.8 26 16.8 26H13.6C11.1 26 8.8 24.7 7.5 22.5L4.6 17.5C4.1 16.6 4.4 15.4 5.3 14.9C6.1 14.4 7.2 14.7 7.7 15.5L10.5 19.2V3.5Z"
        fill="#0A291B"
        stroke="#C5A85C"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
