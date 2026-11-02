/**
 * Wording approved by Xavier (2 Nov 2026, 17:53 WAT), use verbatim. Every new customer-facing
 * string for the AI Try-on image outside the AI Try-on step lives here:
 * Summary / Review thumbnails, the order image after payment (confirmation,
 * My Orders, admin), the Delete AI preview button and dialog, the privacy
 * wording and the order confirmation email. Change wording here only.
 *
 * Retention used in the wording: 60 days after payment (Xavier, 2 Nov 2026).
 */
export const AI_TRY_ON_ORDER_IMAGE_COPY_STATUS = "APPROVED" as const;

export const AI_TRY_ON_ORDER_IMAGE_RETENTION_DAYS = 60;

export const AI_TRY_ON_ORDER_IMAGE_COPY = {
  // --- Summary (Step 8) and Order Review & Payment (Step 10), before payment ---
  /** Section description when at least one preview thumbnail is shown. */
  summarySectionWithImages: "Your AI preview for this design. Tap a picture to see it larger.",
  /** Caption above each thumbnail. */
  thumbnailLabel: (name: string) => `AI preview: ${name}`,
  /** Caption for a default-model preview (no customer photo). */
  thumbnailLabelOnModel: (name: string) => `AI preview on our model: ${name}`,
  thumbnailAlt: (name: string) => `AI try-on preview for ${name}`,
  enlarge: (name: string) => `See the AI preview for ${name} larger`,
  closeEnlarged: "Close",
  /** A stored preview was made for an earlier version of the design. */
  staleTitle: (name: string) => `${name}: your design changed after this preview`,
  staleBody:
    "We won't save an out-of-date preview with your order. You can make a new one on AI Try-on. It's optional.",
  staleAction: "Make a new preview",

  // --- Before payment: what happens to the preview at payment (shown once PR 2 lands) ---
  savedWithOrderNotice:
    "When you pay, we save one AI preview per person with your order for 60 days, so you, our team and our tailors can see what you chose.",

  // --- After payment: confirmation, My Orders ---
  orderImageSectionTitle: "Your AI preview",
  orderImageSavedNote: (expiresOn: string) =>
    `Saved with your order until ${expiresOn}. Only you, our team and our tailors can see it.`,
  orderImageExpiredNote: "AI previews are kept for 60 days after payment, so this one has been deleted.",
  orderImageDeletedNote: "You deleted the AI preview for this order.",
  orderImageUnavailable: "We couldn't load the AI preview. Please try again later.",
  deleteButton: "Delete AI preview",
  deleteDialogTitle: "Delete this AI preview?",
  deleteDialogBody:
    "We'll delete the AI preview saved with this order for everyone, including our tailors. This can't be undone. Your order isn't affected.",
  deleteDialogConfirm: "Delete preview",
  deleteDialogCancel: "Keep it",
  deleteSuccess: "AI preview deleted.",
  deleteFailed: "We couldn't delete the AI preview. Please try again.",

  // --- Admin / tailor view ---
  adminSectionTitle: "Customer's AI preview",
  adminSectionNote:
    "For reference only. Make the garment from the order details and measurements, not from this image.",
  adminNoImage: "No AI preview saved with this order.",
  /**
   * DRAFT, NOT YET APPROVED (2 Nov 2026, 18:10 WAT). Admin "Delete AI preview" confirm body.
   * The admin button reuses approved lines 16, 17 and 19-22; line 18 is customer wording.
   */
  adminDeleteDialogBody:
    "This deletes the customer's AI preview for this order for everyone. Use it when cancelling or refunding. This can't be undone.",

  // --- Order confirmation email (link only, no image) ---
  emailSubject: (orderRef: string) => `Your Odogwu Heritage order ${orderRef} is confirmed`,
  emailGreeting: (name: string | null) => (name ? `Hello ${name},` : "Hello,"),
  emailIntro: (orderRef: string) => `Thank you for your order. We've received your payment for order ${orderRef}.`,
  emailViewOrder: "View your order",
  emailAiPreviewLine:
    "Your AI preview is saved with your order for 60 days. You can see it, or delete it, in My Orders. We don't attach it to this email.",
  emailNextSteps: "We'll email you again when your order moves to the next stage.",
  emailSignOff: "The Odogwu Heritage",
  emailFooter: "You're receiving this email because you placed an order with The Odogwu Heritage.",
} as const;

/**
 * Privacy wording (approved). Replaces the AI Try-on retention sentences in
 * src/data/legalContent.ts and the panel notice (PR 4).
 */
export const AI_TRY_ON_ORDER_IMAGE_PRIVACY_COPY = {
  /** Privacy policy, data retention list. */
  retentionLine:
    "AI Try-on: we delete your photo as soon as the preview is created. Before you order, we keep the preview privately for up to 30 days and delete it sooner if you ask. When you place your order, we keep one preview per person on the order with that order for up to 60 days, so you, our team and our tailors can see what you chose, and then delete it. We also delete it if the order is cancelled or refunded, or when you delete it in My Orders. Google keeps the photo and preview for up to 55 days to detect misuse.",
  /** Privacy policy, AI Try-on section: replaces "never shared with our workshop". */
  sectionKeepLine:
    "We delete your photo as soon as the preview is created. Before you order, we keep the preview privately for up to 30 days and delete it earlier if you ask. If you place your order, we keep one preview per person with that order for up to 60 days after payment, and delete it earlier if the order is cancelled or refunded or you delete it in My Orders. Your photo is never shared with our workshop. The preview saved with your order is visible to our team and tailors, for reference only.",
  /** Privacy policy, AI Try-on section: legal basis addition. */
  consentLine:
    "Your consent also covers keeping the preview with your order. You can withdraw it at any time by deleting the AI preview in My Orders.",
  /** Processors list: Brevo line (with the confirmation email). */
  brevoProcessorLine: "Brevo: sends our sign-in code emails and order confirmation emails.",
  /** Short notice on the AI Try-on step (the "How we use your photo" list). */
  panelNotice:
    "we delete your photo straight after the preview is made. We keep the preview privately for up to 30 days, or until you place your order, and delete it sooner if you ask. If you order, we keep one preview per person with the order for 60 days so our team and tailors can see what you chose. We never share your photo with our workshop.",
} as const;
