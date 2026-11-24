import type { DesignStudioStageId } from "../types";

/**
 * Target descriptor for the hand guide.
 */
export interface HandGuideTarget {
  /** CSS selector to find the target element. */
  selector: string;
  /** Human-readable hint text to show next to the hand. */
  hint: string;
  /** Whether the target is a Continue button (uses data-studio-nav="forward" and data-continue-unlock-glow="on"). */
  isContinue?: boolean;
}

/**
 * Resolves the ideal hand guide target for a given Design Studio stage.
 * The selector targets elements marked with `data-hand-guide-target` or the unlocked Continue button.
 * Returns the highest-priority target for the stage.
 */
export function resolveHandGuideTarget(stageId: DesignStudioStageId): HandGuideTarget {
  switch (stageId) {
    case "garment_type":
      // Priority: first available garment card SELECT button -> first unchecked audience profile -> unlocked Continue
      return {
        selector: '[data-hand-guide-target="garment-type-select"], [data-hand-guide-target="garment-type-audience"], [data-studio-nav="forward"][data-continue-unlock-glow="on"]',
        hint: "Select a garment to begin",
      };
    case "fabric":
      // Priority: first available fabric card SELECT button -> unlocked Continue (with hint if prefilled)
      return {
        selector: '[data-hand-guide-target="fabric-select"], [data-studio-nav="forward"][data-continue-unlock-glow="on"]',
        hint: "Choose a fabric",
      };
    case "design_style":
      // Priority: first available design style card SELECT button -> unlocked Continue
      return {
        selector: '[data-hand-guide-target="design-style-select"], [data-studio-nav="forward"][data-continue-unlock-glow="on"]',
        hint: "Pick a design style",
      };
    case "custom_details":
      // Priority: first missing required detail -> unlocked Continue with optional hint
      return {
        selector: '[data-hand-guide-target="custom-details-required"], [data-studio-nav="forward"][data-continue-unlock-glow="on"]',
        hint: "Optional — customize below or continue",
      };
    case "personalized_additions":
      // Point directly to unlocked Continue with hint
      return {
        selector: '[data-studio-nav="forward"][data-continue-unlock-glow="on"]',
        hint: "Optional — add extras below or continue",
        isContinue: true,
      };
    case "measurement":
      // Priority: Standard Size / Quick Size option -> first missing required measurement field -> unlocked Continue
      return {
        selector: '[data-hand-guide-target="measurement-standard-size"], [data-hand-guide-target="measurement-required-field"], [data-studio-nav="forward"][data-continue-unlock-glow="on"]',
        hint: "Select a size or enter measurements",
      };
    case "try_on":
      // Point directly to unlocked Continue with hint
      return {
        selector: '[data-studio-nav="forward"][data-continue-unlock-glow="on"]',
        hint: "Optional — try on below or continue",
        isContinue: true,
      };
    case "summary":
      // Unlocked Continue to Shipping
      return {
        selector: '[data-studio-nav="forward"][data-continue-unlock-glow="on"]',
        hint: "Continue to delivery",
        isContinue: true,
      };
    case "shipping":
      // Priority: first missing required shipping/contact/method field -> unlocked Continue to Payment
      return {
        selector: '[data-hand-guide-target="shipping-required-field"], [data-studio-nav="forward"][data-continue-unlock-glow="on"]',
        hint: "Enter delivery details",
      };
    case "payment":
      // Priority: any unchecked required review/terms checkbox -> final Pay/Place Order button
      return {
        selector: '[data-hand-guide-target="payment-terms-checkbox"], [data-studio-nav="forward"][data-continue-unlock-glow="on"]',
        hint: "Review and place order",
      };
    default:
      // Fallback to unlocked Continue button
      return {
        selector: '[data-studio-nav="forward"][data-continue-unlock-glow="on"]',
        hint: "Continue",
        isContinue: true,
      };
  }
}

/**
 * Checks if the hand guide should be suppressed for a given stage (e.g., if the stage is complete and auto-advanced).
 * Currently returns false for all stages; can be extended.
 */
export function shouldSuppressHandGuide(stageId: DesignStudioStageId): boolean {
  return false;
}