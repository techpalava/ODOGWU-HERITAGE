import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import {
  CONTINUE_UNLOCKED_SELECTOR,
  MODAL_PRIMARY_SELECTOR,
  computeHandGuidePlacement,
  findPrioritizedHandGuideElements,
  getHandGuideHintForElement,
  isScrolledPastContinueThreshold,
  resolveHandGuideTarget,
  resolveModalHandGuideTarget,
  shouldSuppressHandGuide,
  shouldTriggerFarCursor,
  type HandGuideAnchor,
  type HandGuideTarget,
  type HandGuideStageState,
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
 * Finds the scrollable container for mobile landing (sticky header offset).
 * For garment-type-select: scrolls the category group container.
 * For garment-type-audience: scrolls the fieldset.
 */
function getMobileScrollTarget(targetEl: HTMLElement, stageId: DesignStudioStageId, matchedSelector: string | null): HTMLElement {
  if (stageId !== "garment_type") return targetEl;
  const isMobile = window.innerWidth < 640;
  if (!isMobile) return targetEl;

  if (matchedSelector === '[data-hand-guide-target="garment-type-select"]') {
    // Scroll the category group container so header lands below sticky header
    return targetEl.closest('[data-testid^="step1-category-group-"]') ?? targetEl;
  }
  if (matchedSelector === '[data-hand-guide-target="garment-type-audience"]') {
    // Scroll the fieldset so "Who is this design for?" heading lands below sticky header
    return targetEl.closest('fieldset') ?? targetEl;
  }
  return targetEl;
}

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
  const labelRef = useRef<HTMLDivElement>(null);
  const offScreenPillRef = useRef<HTMLDivElement>(null);
  const handIconRef = useRef<HTMLDivElement>(null);
  const handSvgRef = useRef<SVGSVGElement>(null);
  const guideContainerRef = useRef<HTMLDivElement>(null);

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

  // Compute stage-specific state for dynamic hints
  const computeStageState = useCallback((): HandGuideStageState => {
    const scrollY = window.scrollY;
    const viewportHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const isMobile = window.innerWidth < 640;

    let hasGarmentSelection = false;
    let hasAudienceSelection = false;

    const unlockedContinueEls = Array.from(
      document.querySelectorAll<HTMLElement>(CONTINUE_UNLOCKED_SELECTOR),
    ).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const continueUnlocked = unlockedContinueEls.length > 0;

    if (stageId === "garment_type") {
      // Check for garment selection via testid + aria-pressed (data-hand-guide-target is only on unselected)
      const garmentSelectEls = document.querySelectorAll('[data-testid^="step1-garment-select-"][aria-pressed="true"]');
      hasGarmentSelection = garmentSelectEls.length > 0;

      // Check for audience selection: any checkbox with garment-type-audience that's checked
      const audienceEls = document.querySelectorAll('[data-hand-guide-target="garment-type-audience"]');
      hasAudienceSelection = Array.from(audienceEls).some((el) => (el as HTMLInputElement).checked);
    }

    return {
      scrollY,
      viewportHeight,
      documentHeight,
      hasGarmentSelection,
      hasAudienceSelection,
      continueUnlocked,
      isMobile,
    };
  }, [stageId]);

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
      : resolved.matchedSelector === CONTINUE_UNLOCKED_SELECTOR
        ? resolved.elements.length - 1
        : 0;
    let targetEl = resolved.elements[activeIdx]!;

    const stageState = computeStageState();
    const { scrollY, viewportHeight, documentHeight, continueUnlocked } = stageState;
    const past65 = isScrolledPastContinueThreshold(scrollY, viewportHeight, documentHeight);

    const forwardBtns = Array.from(
      document.querySelectorAll<HTMLElement>('[data-studio-nav="forward"]'),
    ).filter(isElementVisible);
    const unlockedForwardBtns = forwardBtns.filter((el) =>
      el.matches(CONTINUE_UNLOCKED_SELECTOR),
    );
    const bottomContinueBtn =
      unlockedForwardBtns[unlockedForwardBtns.length - 1] ??
      (stageId !== "garment_type" ? forwardBtns[forwardBtns.length - 1] ?? null : null);

    let forceContinueHint = false;
    if (!resolved.modalActive && bottomContinueBtn) {
      if (continueUnlocked) {
        targetEl = bottomContinueBtn;
        if (past65) {
          forceContinueHint = true;
        }
      } else if (past65 && stageId !== "garment_type") {
        targetEl = bottomContinueBtn;
        forceContinueHint = true;
      }
    }

    elementRef.current = targetEl;

    const isContinueOrPrimary =
      forceContinueHint ||
      targetEl.matches(CONTINUE_UNLOCKED_SELECTOR) ||
      targetEl.matches(MODAL_PRIMARY_SELECTOR);
    setHint(
      forceContinueHint
        ? "Continue"
        : getHandGuideHintForElement(
            resolved.descriptor,
            isContinueOrPrimary,
            resolved.matchedSelector,
            stageState,
          ),
    );
    setSubtleAnimation(isShippingAlternating);
    setInModal(resolved.modalActive);

    const rect = targetEl.getBoundingClientRect();
    const isNeutralGroup =
      resolved.matchedSelector === '[data-hand-guide-target="measurement-option-group"]' &&
      !forceContinueHint;
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
      setOffScreenDirection(forceContinueHint ? "down" : placement.direction);
      setPosition(null);
      return true;
    }

    setMode("anchored");
    setPosition({ x: placement.x, y: placement.y, anchor: placement.anchor });
    return true;
  }, [resolveActiveTargets, computeStageState, isElementVisible, stageId]);

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
    const resolved = resolveActiveTargets();
    const targetEl = elementRef.current || resolved.elements[0];
    if (!targetEl) {
      setIsVisible(false);
      return;
    }

    const isMobile = window.innerWidth < 640;

    if (isMobile && stageId === "garment_type") {
      // On mobile, scroll the correct container so header lands directly below sticky header
      const scrollTarget = getMobileScrollTarget(targetEl, stageId, resolved.matchedSelector);
      const stickyHeaderEl = document.querySelector("header.sticky, header") as HTMLElement | null;
      const stickyOffset = stickyHeaderEl ? stickyHeaderEl.getBoundingClientRect().height + 12 : 96;
      const targetTop = scrollTarget.getBoundingClientRect().top + window.scrollY - stickyOffset;
      window.scrollTo({
        top: Math.max(0, Math.round(targetTop)),
        behavior: reducedMotion ? "auto" : "smooth",
      });
    } else {
      targetEl.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
    }

    setTimeout(() => {
      computePosition();
    }, reducedMotion ? 0 : 400);
  }, [resolveActiveTargets, reducedMotion, computePosition, stageId]);

  // --- Global overlap detection and viewport clamping (runs for both anchored and off-screen) ---
  useLayoutEffect(() => {
    if (!isVisible) return;

    const checkAndFixOverlap = () => {
      const container = guideContainerRef.current;
      const pill = mode === "anchored" ? labelRef.current : offScreenPillRef.current;
      if (!container) return;

      // Reset previous inline transform offsets before measuring
      container.style.transform = "";
      if (labelRef.current) {
        labelRef.current.style.transform = "";
      }

      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 8;

      const protectedSelectors = [
        "button:not([aria-label=\"Hide guide\"]):not([data-hand-guide-jump])",
        "input",
        "select",
        "textarea",
        "[role=\"button\"]",
        "[role=\"checkbox\"]",
        "[role=\"radio\"]",
        "[role=\"option\"]",
        "h1, h2, h3, h4, h5, h6",
        "[data-hand-guide-target]",
        ".group-header",
        ".step-header",
      ];

      const protectedElements = Array.from(
        document.querySelectorAll<HTMLElement>(protectedSelectors.join(", ")),
      ).filter((el) => !container.contains(el));

      const measureEl = pill ?? container;
      const rect = measureEl.getBoundingClientRect();

      let dx = 0;
      let dy = 0;

      // 1. Clamp horizontally and vertically inside viewport
      if (rect.left < margin) {
        dx = margin - rect.left;
      } else if (rect.right > viewportWidth - margin) {
        dx = (viewportWidth - margin) - rect.right;
      }

      if (rect.top < margin) {
        dy = margin - rect.top;
      } else if (rect.bottom > viewportHeight - margin) {
        dy = (viewportHeight - margin) - rect.bottom;
      }

      // 2. Check collision against protected interactive elements & headings
      const shiftedLeft = rect.left + dx;
      const shiftedRight = rect.right + dx;
      const shiftedTop = rect.top + dy;
      const shiftedBottom = rect.bottom + dy;

      for (const protectedEl of protectedElements) {
        const elRect = protectedEl.getBoundingClientRect();
        if (elRect.width === 0 || elRect.height === 0) continue;

        const overlaps =
          shiftedLeft < elRect.right &&
          shiftedRight > elRect.left &&
          shiftedTop < elRect.bottom &&
          shiftedBottom > elRect.top;

        if (overlaps) {
          const shiftAbove = elRect.top - rect.bottom - 8;
          const shiftBelow = elRect.bottom - rect.top + 8;
          const canGoAbove = rect.top + shiftAbove >= margin;
          const canGoBelow = rect.bottom + shiftBelow <= viewportHeight - margin;

          if (canGoAbove && (!canGoBelow || Math.abs(shiftAbove) <= Math.abs(shiftBelow))) {
            dy = shiftAbove;
          } else if (canGoBelow) {
            dy = shiftBelow;
          }
          break;
        }
      }

      if (dx !== 0 || dy !== 0) {
        if (mode === "off-screen") {
          container.style.transform = `translate(calc(-50% + ${Math.round(dx)}px), ${Math.round(dy)}px)`;
        } else if (labelRef.current) {
          labelRef.current.style.transform = `translate(calc(-50% + ${Math.round(dx)}px), ${Math.round(dy)}px)`;
        }
      }
    };

    checkAndFixOverlap();
    const rafId = requestAnimationFrame(checkAndFixOverlap);
    return () => cancelAnimationFrame(rafId);
  }, [isVisible, mode, position, hint, offScreenDirection, reducedMotion, subtleAnimation]);

  if (!isVisible || dismissedRef.current || shouldSuppressHandGuide(stageId)) {
    return null;
  }

  const zIndexClass = inModal ? "z-[10010]" : "z-[99]";
  const jumpLabel = `Jump to: ${hint || "Continue"}`;

  if (mode === "off-screen") {
    const arrow = offScreenDirection === "up" ? "↑" : "↓";
    return (
      <div
        ref={guideContainerRef}
        className={`fixed bottom-20 left-1/2 -translate-x-1/2 sm:bottom-6 ${inModal ? "z-[10010]" : "z-[65]"} transition-all duration-300`}
        style={{ maxWidth: "calc(100vw - 16px)" }}
        role="region"
        aria-label="Design Studio step guide"
      >
        <div
          ref={offScreenPillRef}
          className="relative inline-flex max-w-[calc(100vw-16px)] items-center gap-1.5 rounded-full border border-heritage-gold bg-heritage-green py-1.5 pl-3.5 pr-2 text-heritage-cream shadow-lg"
        >
          <button
            type="button"
            data-hand-guide-jump="true"
            onClick={handleJumpToTarget}
            className="cursor-pointer truncate max-w-[calc(100vw-68px)] text-xs font-semibold tracking-wide text-heritage-cream hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
          >
            {arrow} {jumpLabel}
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
            ref={handIconRef}
            className="pointer-events-none absolute -bottom-7 right-4 flex items-center justify-center"
            aria-hidden="true"
          >
            {!reducedMotion && (
              <span className="absolute -left-1 -top-1 h-6 w-6 rounded-full border-2 border-heritage-gold animate-ripple" />
            )}
            <HandSVG
              ref={handSvgRef}
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
  const anchoredArrow = isAboveLeft || isTopCenter ? "↓" : "↑";

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
      ref={guideContainerRef}
      className={`pointer-events-none fixed ${zIndexClass} transition-all duration-300`}
      style={{ left: x, top: y }}
      role="region"
      aria-label="Design Studio step guide"
    >
      <div className="relative flex flex-col items-center">
        <div className={`relative ${rotationClass}`} aria-hidden="true">
          {!reducedMotion && !subtleAnimation && (
            <span className="absolute -left-1.5 -top-1.5 h-6 w-6 rounded-full border-2 border-heritage-gold animate-ripple" />
          )}
          <HandSVG ref={handSvgRef} className={`h-8 w-8 drop-shadow-md ${animClass}`} />
        </div>

        <div
          ref={labelRef}
          className={`pointer-events-auto absolute ${
            isAboveLeft || isTopCenter ? "bottom-full mb-1.5" : "top-full mt-1.5"
          } left-1/2 -translate-x-1/2 inline-flex max-w-[calc(100vw-16px)] items-center gap-1.5 whitespace-nowrap rounded-full border border-heritage-gold bg-heritage-green py-1 pl-3 pr-1.5 text-xs font-semibold text-heritage-cream shadow-md`}
          role="tooltip"
        >
          <button
            type="button"
            data-hand-guide-jump="true"
            onClick={handleJumpToTarget}
            className="cursor-pointer truncate max-w-[calc(100vw-68px)] text-xs font-semibold tracking-wide text-heritage-cream hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
          >
            {anchoredArrow} {jumpLabel}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-heritage-gold transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
            aria-label="Hide guide"
            title="Hide guide for this session"
          >
            <svg
              width="12"
              height="12"
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
