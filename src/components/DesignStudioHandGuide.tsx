import { useEffect, useRef, useState, useCallback } from "react";
import { resolveHandGuideTarget, HandGuideTarget, shouldSuppressHandGuide } from "../utils/designStudioHandGuide";
import { useDesignStudioBlockingOverlayOpen } from "./designStudioBlockingOverlay";
import type { DesignStudioStageId } from "../types";

interface DesignStudioHandGuideProps {
  /** Current Design Studio stage ID. */
  stageId: DesignStudioStageId;
  /** Optional callback when the hand guide is dismissed by the user. */
  onDismiss?: () => void;
}

/**
 * Animated hand guide that points to the next actionable element in the Design Studio.
 * Shows after 7s of inactivity (idle) or when cursor stays >280px from target for 3.5s (far-cursor).
 * Auto-hides when cursor <90px from target, user types, blocking overlay opens, or target clicked.
 * Respects `prefers-reduced-motion` and sessionStorage dismiss flag.
 */
export function DesignStudioHandGuide({ stageId, onDismiss }: DesignStudioHandGuideProps) {
  const blockingOverlayOpen = useDesignStudioBlockingOverlayOpen();
  const targetRef = useRef<HandGuideTarget | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number; anchor: "below-right" | "above-left" } | null>(null);
  const [mode, setMode] = useState<"anchored" | "off-screen">("anchored");
  const [hint, setHint] = useState("");

  // Timers
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const farCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // State for hysteresis
  const lastActivityRef = useRef<number>(Date.now());
  const cursorPositionRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isTypingRef = useRef(false);
  const dismissedRef = useRef(false);

  // Reduced motion preference
  const prefersReducedMotion = useRef(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotion.current = mediaQuery.matches;
    const handler = (e: MediaQueryListEvent) => { prefersReducedMotion.current = e.matches; };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Check sessionStorage dismiss flag
  useEffect(() => {
    const dismissed = sessionStorage.getItem("designStudioHandGuideDismissed");
    dismissedRef.current = dismissed === "true";
  }, []);

  // Resolve target when stageId changes
  useEffect(() => {
    if (shouldSuppressHandGuide(stageId)) {
      setIsVisible(false);
      return;
    }
    const target = resolveHandGuideTarget(stageId);
    targetRef.current = target;
    setHint(target.hint);
    // Reset visibility when stage changes
    setIsVisible(false);
    clearTimers();
    resetActivity();
  }, [stageId]);

  // Find target element in DOM
  const findTargetElement = useCallback((): HTMLElement | null => {
    if (!targetRef.current) return null;
    const { selector } = targetRef.current;
    // Try each selector in order (comma-separated)
    const selectors = selector.split(",").map((s) => s.trim());
    for (const sel of selectors) {
      const el = document.querySelector<HTMLElement>(sel);
      if (el && isElementVisible(el)) {
        return el;
      }
    }
    return null;
  }, []);

  // Check if element is visible in viewport (not hidden, not zero size)
  const isElementVisible = (el: HTMLElement): boolean => {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  // Compute position of hand relative to target
  const computePosition = useCallback(() => {
    const targetEl = findTargetElement();
    if (!targetEl) {
      elementRef.current = null;
      setMode("off-screen");
      setPosition(null);
      return;
    }
    elementRef.current = targetEl;
    const rect = targetEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Determine if target is in viewport
    const inViewport = rect.top >= 0 && rect.left >= 0 && rect.bottom <= viewportHeight && rect.right <= viewportWidth;

    if (!inViewport) {
      setMode("off-screen");
      setPosition(null);
      return;
    }

    setMode("anchored");

    // Default anchor: below-right of target, fingertip pointing up-left to target's bottom-right corner
    // Hand dimensions (approx)
    const handWidth = 48;
    const handHeight = 48;
    const offset = 12; // gap between hand and target

    // Try below-right first
    let anchorX = rect.right + offset;
    let anchorY = rect.bottom + offset;
    let anchor: "below-right" | "above-left" = "below-right";

    // Check if hand would clip viewport edges
    if (anchorX + handWidth > viewportWidth - 16) {
      // Flip to above-left
      anchorX = rect.left - handWidth - offset;
      anchorY = rect.top - handHeight - offset;
      anchor = "above-left";
    }
    if (anchorY + handHeight > viewportHeight - 16) {
      // If still clips bottom, flip vertically
      if (anchor === "below-right") {
        anchorX = rect.right + offset;
        anchorY = rect.top - handHeight - offset;
        anchor = "above-left"; // actually above-right but we only have two anchors
      } else {
        anchorY = rect.bottom + offset;
      }
    }
    // Ensure not negative
    anchorX = Math.max(8, Math.min(anchorX, viewportWidth - handWidth - 8));
    anchorY = Math.max(8, Math.min(anchorY, viewportHeight - handHeight - 8));

    setPosition({ x: anchorX, y: anchorY, anchor });
  }, [findTargetElement]);
// Activity detection
  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    clearTimers();
    startTimers();
  }, []);

  const handleCursorMove = useCallback((e: MouseEvent) => {
    cursorPositionRef.current = { x: e.clientX, y: e.clientY };
    handleActivity();
  }, [handleActivity]);

  const handleKeyDown = useCallback(() => {
    isTypingRef.current = true;
    // Auto-hide immediately when typing starts
    setIsVisible(false);
    clearTimers();
    // Reset typing flag after a short delay
    setTimeout(() => { isTypingRef.current = false; }, 100);
  }, []);

  const handleScroll = useCallback(() => {
    handleActivity();
  }, [handleActivity]);

  const handleClick = useCallback((e: MouseEvent) => {
    // If click is on the target element, advance/reset timer for next step
    const targetEl = elementRef.current;
    if (targetEl && targetEl.contains(e.target as Node)) {
      // User clicked the target, hide guide and reset timers for next step
      setIsVisible(false);
      clearTimers();
      // The stage will change, triggering new target resolution
    }
  }, []);

  // Start idle and far-cursor timers
  const startTimers = useCallback(() => {
    if (dismissedRef.current || blockingOverlayOpen || isTypingRef.current) return;
    if (isVisible) return; // already visible

    // Idle trigger: 7 seconds
    idleTimerRef.current = setTimeout(() => {
      if (!dismissedRef.current && !blockingOverlayOpen && !isTypingRef.current) {
        computePosition();
        setIsVisible(true);
      }
    }, 7000);

    // Far-cursor trigger: desktop fine-pointer only
    // We'll check on each cursor move if cursor is far from target for 3.5s
    // This is handled in the cursor check interval.
  }, [blockingOverlayOpen, isVisible, computePosition]);

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (farCursorTimerRef.current) clearTimeout(farCursorTimerRef.current);
    idleTimerRef.current = null;
    farCursorTimerRef.current = null;
  }, []);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    clearTimers();
    startTimers();
  }, [clearTimers, startTimers]);

  // Periodic check for far-cursor and auto-hide conditions
  useEffect(() => {
    if (typeof window === "undefined") return;
    const checkInterval = setInterval(() => {
      if (dismissedRef.current || blockingOverlayOpen || isTypingRef.current) {
        if (isVisible) setIsVisible(false);
        return;
      }

      const targetEl = elementRef.current || findTargetElement();
      if (!targetEl) {
        // No target found, hide
        if (isVisible) setIsVisible(false);
        return;
      }

      const rect = targetEl.getBoundingClientRect();
      const cursor = cursorPositionRef.current;
      const distance = Math.hypot(cursor.x - (rect.left + rect.width / 2), cursor.y - (rect.top + rect.height / 2));

      // Auto-hide if cursor within 90px of target
      if (distance < 90) {
        if (isVisible) setIsVisible(false);
        clearTimers();
        return;
      }

      // Far-cursor trigger: if cursor >280px from target for 3.5s without moving toward it
      // We'll track if cursor has been far for 3.5s
      // For simplicity, we'll start a timer when distance > 280px
      if (distance > 280) {
        if (!farCursorTimerRef.current) {
          farCursorTimerRef.current = setTimeout(() => {
            if (!isVisible && !dismissedRef.current && !blockingOverlayOpen && !isTypingRef.current) {
              computePosition();
              setIsVisible(true);
            }
            farCursorTimerRef.current = null;
          }, 3500);
        }
      } else {
        if (farCursorTimerRef.current) {
          clearTimeout(farCursorTimerRef.current);
          farCursorTimerRef.current = null;
        }
      }
    }, 200);

    return () => clearInterval(checkInterval);
  }, [blockingOverlayOpen, isVisible, findTargetElement, computePosition, clearTimers]);

  // Event listeners
  useEffect(() => {
    window.addEventListener("mousemove", handleCursorMove);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("click", handleClick);
    return () => {
      window.removeEventListener("mousemove", handleCursorMove);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("click", handleClick);
    };
  }, [handleCursorMove, handleKeyDown, handleScroll, handleClick]);

  // Recompute position on resize/scroll
  useEffect(() => {
    if (!isVisible) return;
    const handleResize = () => computePosition();
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, { passive: true });
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize);
    };
  }, [isVisible, computePosition]);

  // Dismiss handler
  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    dismissedRef.current = true;
    sessionStorage.setItem("designStudioHandGuideDismissed", "true");
    clearTimers();
    onDismiss?.();
  }, [onDismiss, clearTimers]);
// Render nothing if not visible or dismissed or blocking overlay open
  if (!isVisible || dismissedRef.current || blockingOverlayOpen || shouldSuppressHandGuide(stageId)) {
    return null;
  }

  // Off-screen mode: render a fixed bottom-center pill with jump link
  if (mode === "off-screen") {
    const targetEl = findTargetElement();
    const direction = targetEl ? (targetEl.getBoundingClientRect().top < 0 ? "↑" : "↓") : "↑";
    const actionText = hint || "Continue";

    return (
      <div
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2 bg-heritage-green text-white rounded-full shadow-lg"
        style={{ maxWidth: "90vw" }}
        role="dialog"
        aria-label="Hand guide jump target"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {direction} Jump to: {actionText}
        </span>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-1 rounded-full hover:bg-white/20 transition-colors"
          aria-label="Hide guide"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        {/* Animated hand below-right pointing up-left at the pill */}
        <HandSVG className="ml-2 w-8 h-8 text-heritage-gold animate-hand-tap" aria-hidden="true" />
      </div>
    );
  }

  // Anchored mode: render hand overlay at computed position
  if (!position) return null;

  const { x, y, anchor } = position;
  const isAboveLeft = anchor === "above-left";

  return (
    <div
      className="fixed pointer-events-none z-[99]"
      style={{ left: x, top: y }}
      aria-hidden="true"
    >
      <div className={`relative ${isAboveLeft ? "rotate-180" : ""}`}>
        <HandSVG
          className={`w-12 h-12 text-heritage-green ${prefersReducedMotion.current ? "" : "animate-hand-tap"}`}
          aria-hidden="true"
        />
        {/* Fingertip ripple ring */}
        {!prefersReducedMotion.current && (
          <div className="absolute -bottom-2 -left-2 w-8 h-8 rounded-full border-2 border-heritage-gold animate-ripple" aria-hidden="true" />
        )}
        {/* Hint pill */}
        <div
          className={`absolute ${isAboveLeft ? "bottom-full left-1/2 -translate-x-1/2 mb-2" : "top-full left-1/2 -translate-x-1/2 mt-2"} 
                     px-3 py-1.5 bg-heritage-green text-white text-xs font-medium rounded-full whitespace-nowrap shadow-lg`}
          role="tooltip"
        >
          {hint}
        </div>
      </div>
    </div>
  );
}

/** SVG pointing hand icon (crisp, heritage colors) */
function HandSVG({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* Hand shape */}
      <path
        d="M22 6C22 4.89543 21.1046 4 20 4H12C10.8954 4 10 4.89543 10 6V8H8C6.89543 8 6 8.89543 6 10V22C6 23.1046 6.89543 24 8 24H24C25.1046 24 26 23.1046 26 22V12C26 10.8954 25.1046 10 24 10H22V6Z"
        fill="#0A291B"
        stroke="#C5A85C"
        strokeWidth="1.5"
      />
      {/* Index finger pointing */}
      <path
        d="M18 10C18 8.89543 18.8954 8 20 8H22C23.1046 8 24 8.89543 24 10V14C24 15.1046 23.1046 16 22 16H20C18.8954 16 18 15.1046 18 14V10Z"
        fill="#0A291B"
        stroke="#C5A85C"
        strokeWidth="1.5"
      />
      {/* Thumb */}
      <path
        d="M10 14C10 12.8954 10.8954 12 12 12H14C15.1046 12 16 12.8954 16 14V18C16 19.1046 15.1046 20 14 20H12C10.8954 20 10 19.1046 10 18V14Z"
        fill="#0A291B"
        stroke="#C5A85C"
        strokeWidth="1.5"
      />
    </svg>
  );
}