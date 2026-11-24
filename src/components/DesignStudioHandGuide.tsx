import { useEffect, useRef, useState, useCallback } from "react";
import {
  CONTINUE_UNLOCKED_SELECTOR,
  computeHandGuidePlacement,
  findPrioritizedHandGuideElement,
  getHandGuideHintForElement,
  resolveHandGuideTarget,
  shouldSuppressHandGuide,
  shouldTriggerFarCursor,
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
 * Animated hand guide that points to the next actionable element in the Design Studio.
 * Shows after 7s of inactivity (idle) or when a desktop fine-pointer cursor stays >280px
 * away from the target for 3.5s without moving closer.
 * Auto-hides when cursor <90px from target, user types, blocking overlay opens, target is
 * clicked, or user dismisses it for the session.
 */
export function DesignStudioHandGuide({
  stageId,
  onDismiss,
}: DesignStudioHandGuideProps) {
  const blockingOverlayOpen = useDesignStudioBlockingOverlayOpen();
  const targetRef = useRef<HandGuideTarget | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<{
    x: number;
    y: number;
    anchor: "below-right" | "above-left";
  } | null>(null);
  const [mode, setMode] = useState<"anchored" | "off-screen">("anchored");
  const [offScreenDirection, setOffScreenDirection] = useState<"up" | "down">("up");
  const [hint, setHint] = useState("");
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

  const findTargetElement = useCallback((): HTMLElement | null => {
    if (!targetRef.current) return null;
    // Skip fabric-select once a fabric is already applied in the current stage view.
    const selectors =
      stageId === "fabric" && document.querySelector('[data-fabric-in-use="true"]')
        ? [CONTINUE_UNLOCKED_SELECTOR]
        : targetRef.current.selectors;

    return findPrioritizedHandGuideElement(
      selectors,
      (sel) => document.querySelectorAll<HTMLElement>(sel),
      isElementVisible,
    );
  }, [stageId, isElementVisible]);

  const computePosition = useCallback((): boolean => {
    const targetEl = findTargetElement();
    if (!targetEl || !targetRef.current) {
      elementRef.current = null;
      return false;
    }
    elementRef.current = targetEl;
    const isContinueTarget = targetEl.matches(CONTINUE_UNLOCKED_SELECTOR);
    setHint(getHandGuideHintForElement(targetRef.current, isContinueTarget));

    const rect = targetEl.getBoundingClientRect();
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
  }, [findTargetElement]);

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    farSinceRef.current = null;
    farLastDistanceRef.current = null;
  }, []);

  const startIdleTimer = useCallback(() => {
    if (dismissedRef.current || blockingOverlayOpen || isTypingRef.current) return;
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (
        !dismissedRef.current &&
        !blockingOverlayOpen &&
        !isTypingRef.current &&
        computePosition()
      ) {
        setIsVisible(true);
      }
    }, IDLE_DELAY_MS);
  }, [blockingOverlayOpen, computePosition]);

  useEffect(() => {
    if (shouldSuppressHandGuide(stageId)) {
      setIsVisible(false);
      clearTimers();
      return;
    }
    const target = resolveHandGuideTarget(stageId);
    targetRef.current = target;
    setHint(target.hint);
    setIsVisible(false);
    clearTimers();
    startIdleTimer();
  }, [stageId, clearTimers, startIdleTimer]);

  useEffect(() => {
    if (blockingOverlayOpen) {
      setIsVisible(false);
      clearTimers();
    } else {
      startIdleTimer();
    }
  }, [blockingOverlayOpen, clearTimers, startIdleTimer]);

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

  // Periodic check for far-cursor trigger & <90px auto-hide
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isFinePointer = window.matchMedia("(pointer: fine)").matches;

    const checkInterval = setInterval(() => {
      if (dismissedRef.current || blockingOverlayOpen || isTypingRef.current) {
        if (isVisible) setIsVisible(false);
        return;
      }

      const targetEl = findTargetElement();
      if (!targetEl) {
        if (isVisible) setIsVisible(false);
        farSinceRef.current = null;
        return;
      }
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
  }, [blockingOverlayOpen, isVisible, findTargetElement, computePosition]);

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
    const targetEl = elementRef.current || findTargetElement();
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
  }, [findTargetElement, reducedMotion, computePosition]);

  if (
    !isVisible ||
    dismissedRef.current ||
    blockingOverlayOpen ||
    shouldSuppressHandGuide(stageId)
  ) {
    return null;
  }

  if (mode === "off-screen") {
    const arrow = offScreenDirection === "up" ? "↑" : "↓";
    return (
      <div
        className="fixed bottom-20 left-1/2 z-[100] -translate-x-1/2 sm:bottom-6"
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

          {/* Animated hand below-right pointing up-left directly at the pill */}
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

  return (
    <div
      className="pointer-events-none fixed z-[99]"
      style={{ left: x, top: y }}
      aria-hidden="true"
    >
      <div className="relative flex flex-col items-center">
        {/* Only the hand + ripple rotates when flipped above-left; tooltip text stays upright */}
        <div className={`relative ${isAboveLeft ? "rotate-180" : ""}`}>
          {!reducedMotion && (
            <span className="absolute -left-1.5 -top-1.5 h-6 w-6 rounded-full border-2 border-heritage-gold animate-ripple" />
          )}
          <HandSVG
            className={`h-8 w-8 drop-shadow-md ${reducedMotion ? "" : "animate-hand-tap"}`}
          />
        </div>

        <div
          className={`absolute ${
            isAboveLeft ? "bottom-full mb-1.5" : "top-full mt-1.5"
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
