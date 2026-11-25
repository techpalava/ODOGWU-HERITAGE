import type { DesignStudioStageId } from "../types";

/**
 * Target descriptor for the Design Studio hand guide.
 */
export interface HandGuideTarget {
  /** Ordered list of CSS selectors to evaluate in priority order (first visible match wins). */
  selectors: string[];
  /** Primary human-readable hint text shown next to the hand. */
  hint: string;
  /** Optional hint shown when the Continue button is already unlocked on a prefilled/select stage. */
  continueHint?: string;
  /** Whether the target is primarily a Continue button. */
  isContinue?: boolean;
}

export interface HandGuideRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface HandGuideViewport {
  width: number;
  height: number;
}

export type HandGuideAnchor = "below-right" | "above-left" | "top-center" | "diagonal-up-left";

export type HandGuidePlacement =
  | {
      mode: "anchored";
      x: number;
      y: number;
      anchor: HandGuideAnchor;
    }
  | {
      mode: "off-screen";
      direction: "up" | "down";
    };

export const CONTINUE_UNLOCKED_SELECTOR =
  '[data-studio-nav="forward"][data-continue-unlock-glow="on"]';

export const MODAL_CHECKBOX_SELECTOR = '[data-hand-guide-target="modal-checkbox"]';
export const MODAL_PRIMARY_SELECTOR = '[data-hand-guide-target="modal-primary"]';

/**
 * Resolves the ideal hand guide target for a given Design Studio stage.
 * Evaluates `selectors` in strict priority order rather than DOM order.
 */
export function resolveHandGuideTarget(stageId: DesignStudioStageId): HandGuideTarget {
  switch (stageId) {
    case "garment_type":
      return {
        selectors: [
          '[data-hand-guide-target="garment-type-select"]',
          '[data-hand-guide-target="garment-type-audience"]',
          CONTINUE_UNLOCKED_SELECTOR,
        ],
        hint: "Select a garment",
        continueHint: "Continue to Fabric",
      };
    case "fabric":
      return {
        selectors: [
          '[data-hand-guide-target="fabric-select"]',
          CONTINUE_UNLOCKED_SELECTOR,
        ],
        hint: "Choose a fabric",
        continueHint: "Ready — adjust below or continue",
      };
    case "design_style":
      return {
        selectors: [
          '[data-hand-guide-target="design-style-select"]',
          CONTINUE_UNLOCKED_SELECTOR,
        ],
        hint: "Pick a design style",
        continueHint: "Ready — adjust below or continue",
      };
    case "custom_details":
      return {
        selectors: [
          '[data-hand-guide-target="custom-details-required"]',
          CONTINUE_UNLOCKED_SELECTOR,
        ],
        hint: "Optional — customize below or continue",
        continueHint: "Optional — customize below or continue",
      };
    case "personalized_additions":
      return {
        selectors: [CONTINUE_UNLOCKED_SELECTOR],
        hint: "Optional — add extras below or continue",
        continueHint: "Optional — add extras below or continue",
        isContinue: true,
      };
    case "measurement":
      return {
        selectors: [
          '[data-hand-guide-target="measurement-option-group"]',
          '[data-hand-guide-target="measurement-required-field"]',
          CONTINUE_UNLOCKED_SELECTOR,
        ],
        hint: "Select a measurement option",
        continueHint: "Continue to AI Try-On",
      };
    case "try_on":
      return {
        selectors: [CONTINUE_UNLOCKED_SELECTOR],
        hint: "Optional — try on below or continue",
        continueHint: "Optional — try on below or continue",
        isContinue: true,
      };
    case "summary":
      return {
        selectors: [CONTINUE_UNLOCKED_SELECTOR],
        hint: "Continue to delivery",
        continueHint: "Continue to delivery",
        isContinue: true,
      };
    case "shipping":
      return {
        selectors: [
          '[data-hand-guide-target="shipping-delivery-option"]',
          '[data-hand-guide-target="shipping-required-field"]',
          CONTINUE_UNLOCKED_SELECTOR,
        ],
        hint: "Choose delivery or pickup",
        continueHint: "Continue to payment",
      };
    case "payment":
      return {
        selectors: [
          '[data-hand-guide-target="payment-terms-checkbox"]',
          '[data-hand-guide-target="payment-pay-button"]',
          CONTINUE_UNLOCKED_SELECTOR,
        ],
        hint: "Review and place order",
        continueHint: "Review and place order",
      };
    default:
      return {
        selectors: [CONTINUE_UNLOCKED_SELECTOR],
        hint: "Continue",
        continueHint: "Continue",
        isContinue: true,
      };
  }
}

/**
 * Resolves the target descriptor for an open guided modal (`data-hand-guide-modal`).
 */
export function resolveModalHandGuideTarget(modalKind: string | null): HandGuideTarget {
  if (modalKind === "fabric-capacity") {
    return {
      selectors: [MODAL_PRIMARY_SELECTOR],
      hint: "Continue or add a garment",
    };
  }
  if (modalKind === "apply-design-style") {
    return {
      selectors: [MODAL_CHECKBOX_SELECTOR, MODAL_PRIMARY_SELECTOR],
      hint: "Choose garments to apply",
      continueHint: "Apply design style",
    };
  }
  return {
    selectors: [MODAL_CHECKBOX_SELECTOR, MODAL_PRIMARY_SELECTOR],
    hint: "Select or continue",
  };
}

/**
 * Finds all visible matching elements for the highest-priority selector that has at least one visible match.
 */
export function findPrioritizedHandGuideElements(
  selectors: readonly string[],
  queryAll: (selector: string) => Iterable<HTMLElement>,
  isVisible: (el: HTMLElement) => boolean,
): { elements: HTMLElement[]; matchedSelector: string | null } {
  for (const selector of selectors) {
    const visible: HTMLElement[] = [];
    for (const el of queryAll(selector)) {
      if (isVisible(el)) {
        visible.push(el);
      }
    }
    if (visible.length > 0) {
      return { elements: visible, matchedSelector: selector };
    }
  }
  return { elements: [], matchedSelector: null };
}

/**
 * Finds the first visible matching element according to strict selector priority order.
 */
export function findPrioritizedHandGuideElement(
  selectors: readonly string[],
  queryAll: (selector: string) => Iterable<HTMLElement>,
  isVisible: (el: HTMLElement) => boolean,
): HTMLElement | null {
  return findPrioritizedHandGuideElements(selectors, queryAll, isVisible).elements[0] ?? null;
}

/**
 * Picks the contextual hint text based on the target stage and matched selector.
 */
export function getHandGuideHintForElement(
  target: HandGuideTarget,
  matchedContinueOrPrimary: boolean,
  matchedSelector?: string | null,
): string {
  if (matchedSelector === '[data-hand-guide-target="measurement-required-field"]') {
    return "Enter required measurement";
  }
  if (matchedSelector === '[data-hand-guide-target="shipping-required-field"]') {
    return "Enter delivery details";
  }
  if (matchedContinueOrPrimary && target.continueHint) {
    return target.continueHint;
  }
  return target.hint;
}

/**
 * Computes anchored vs off-screen placement for the guided hand.
 * - `neutralGroup`: top-center of a multi-option group so no single option is favored.
 * - `diagonalUpLeft`: rotated diagonally up-left onto the target's bottom-right corner (e.g. Pay button).
 * - Default: below-right (fingertip pointing up-left onto target), flipping to above-left near edges.
 */
export function computeHandGuidePlacement(
  rect: HandGuideRect,
  viewport: HandGuideViewport,
  options?: {
    handSize?: { width: number; height: number };
    offset?: number;
    neutralGroup?: boolean;
    diagonalUpLeft?: boolean;
  },
): HandGuidePlacement {
  const handSize = options?.handSize ?? { width: 32, height: 32 };
  const offset = options?.offset ?? 8;

  const isOutOfView =
    rect.bottom < 0 ||
    rect.top > viewport.height ||
    rect.right < 0 ||
    rect.left > viewport.width;

  if (isOutOfView) {
    return {
      mode: "off-screen",
      direction: rect.top < 0 ? "up" : "down",
    };
  }

  if (options?.neutralGroup) {
    const x = Math.max(
      8,
      Math.min(
        rect.left + rect.width / 2 - handSize.width / 2,
        viewport.width - handSize.width - 8,
      ),
    );
    const y = Math.max(8, rect.top - handSize.height + 4);
    return {
      mode: "anchored",
      x,
      y,
      anchor: "top-center",
    };
  }

  if (options?.diagonalUpLeft) {
    const x = Math.max(
      8,
      Math.min(rect.right - 6, viewport.width - handSize.width - 8),
    );
    const y = Math.max(
      8,
      Math.min(rect.bottom - 6, viewport.height - handSize.height - 8),
    );
    return {
      mode: "anchored",
      x,
      y,
      anchor: "diagonal-up-left",
    };
  }

  const margin = 12;
  let anchor: HandGuideAnchor = "below-right";
  let x = rect.right - 6 + offset;
  let y = rect.bottom - 4 + offset;

  const clipsRight = x + handSize.width > viewport.width - margin;
  const clipsBottom = y + handSize.height > viewport.height - margin;

  if (clipsRight || clipsBottom) {
    anchor = "above-left";
    x = rect.left - handSize.width - offset + 4;
    y = rect.top - handSize.height - offset + 4;
  }

  x = Math.max(8, Math.min(x, viewport.width - handSize.width - 8));
  y = Math.max(8, Math.min(y, viewport.height - handSize.height - 8));

  return {
    mode: "anchored",
    x,
    y,
    anchor,
  };
}

/**
 * Determines whether the desktop far-cursor trigger should fire.
 */
export function shouldTriggerFarCursor(params: {
  distancePx: number;
  previousDistancePx: number | null;
  elapsedFarMs: number;
  isFinePointer: boolean;
}): boolean {
  if (!params.isFinePointer) return false;
  if (params.distancePx <= 280) return false;
  if (
    params.previousDistancePx !== null &&
    params.distancePx < params.previousDistancePx - 12
  ) {
    return false;
  }
  return params.elapsedFarMs >= 3500;
}

/**
 * Checks if the hand guide should be suppressed for a given stage.
 */
export function shouldSuppressHandGuide(_stageId: DesignStudioStageId): boolean {
  return false;
}
