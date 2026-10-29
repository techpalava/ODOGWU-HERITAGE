import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, ImagePlus, Loader2, MessageSquare, X } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import {
  SITE_FEEDBACK_LIMITS,
  SITE_FEEDBACK_NATIONALITY_OPTIONS,
  SITE_FEEDBACK_PHOTO_TYPES,
  SITE_FEEDBACK_TYPES,
  SITE_FEEDBACK_TYPE_LABELS,
  readSiteFeedbackSends,
  recordSiteFeedbackSend,
  siteFeedbackRateLimitWaitMs,
  validateSiteFeedback,
  validateSiteFeedbackPhoto,
  type SiteFeedbackContext,
  type SiteFeedbackType,
  type SiteFeedbackValidation,
} from "../utils/siteFeedback.js";

type SubmitFeedback = (
  value: Extract<SiteFeedbackValidation, { ok: true }>["value"],
  context: SiteFeedbackContext,
  photo: File | null,
) => Promise<string>;

const defaultSubmit: SubmitFeedback = async (value, context, photo) => {
  const { submitSiteFeedback } = await import("../services/siteFeedbackService.js");
  return submitSiteFeedback(value, context, photo);
};

/**
 * The tab never sits on top of a control. When the page scrolls a button,
 * link, field, Design Studio step-action row or dialog underneath it, the tab
 * fades out until the spot is clear again (it still shows on keyboard focus).
 */
const PROTECTED_SELECTOR = [
  "[data-studio-step-actions-slot]",
  "[data-feedback-avoid]",
  "[role='dialog']",
  "[aria-modal='true']",
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "label",
  "[role='button']",
  "[role='tab']",
  "[contenteditable='true']",
].join(",");

const safeStorage = (): Storage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

const readStudioStep = (): string | null => {
  if (typeof document === "undefined") return null;
  const target = document.querySelector("[data-design-studio-stage-target]");
  return target?.getAttribute("data-design-studio-stage-target") || null;
};

export function siteFeedbackTabIsCovering(
  tab: HTMLElement,
  doc: Document = document,
): boolean {
  const rect = tab.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (typeof doc.elementsFromPoint !== "function") return false;
  const inset = 2;
  const xs = [rect.left + inset, rect.left + rect.width / 2, rect.right - inset];
  const ys = [rect.top + inset, rect.top + rect.height / 2, rect.bottom - inset];
  for (const x of xs) {
    for (const y of ys) {
      for (const element of doc.elementsFromPoint(x, y)) {
        if (tab.contains(element)) continue;
        if (element.closest(PROTECTED_SELECTOR)) return true;
      }
    }
  }
  return false;
}

export function SiteFeedbackButton({
  submit = defaultSubmit,
}: {
  submit?: SubmitFeedback;
}) {
  const activeTab = useAppStore((state) => state.activeTab);
  const currentUser = useAppStore((state) => state.currentUser);
  const isCartOpen = useAppStore((state) => state.isCartOpen);
  const isMobileMenuOpen = useAppStore((state) => state.isMobileMenuOpen);
  const siteFeedbackOpenRequest = useAppStore(
    (state) => state.siteFeedbackOpenRequest,
  );

  const [open, setOpen] = useState(false);
  const [covering, setCovering] = useState(false);
  const [type, setType] = useState<SiteFeedbackType>("idea");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [nationality, setNationality] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{
    field: string;
    error: string;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const capturedStudioStep = useRef<string | null>(null);

  const tabRef = useRef<HTMLButtonElement>(null);
  // The control that opened the panel (left tab or desktop header button) gets focus back on close.
  const openerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Preview URL for the picked photo; revoked when it changes or unmounts.
  useEffect(() => {
    if (!photo || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
      setPhotoPreview(null);
      return;
    }
    let url: string;
    try {
      url = URL.createObjectURL(photo);
    } catch {
      setPhotoPreview(null);
      return;
    }
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const clearPhoto = () => {
    setPhoto(null);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const onPickPhoto = (file: File | null) => {
    if (!file) {
      clearPhoto();
      return;
    }
    const check = validateSiteFeedbackPhoto(file);
    if (check.ok === false) {
      clearPhoto();
      setFieldError({ field: "photo", error: (check as { error: string }).error });
      return;
    }
    if (fieldError?.field === "photo") setFieldError(null);
    setPhoto(file);
  };
  const ids = useId();

  // Hide the tab whenever it would sit on a control.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const tab = tabRef.current;
      if (!tab) return;
      setCovering(siteFeedbackTabIsCovering(tab));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(check);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule);
    const interval = window.setInterval(schedule, 800);
    return () => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      window.clearInterval(interval);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const openDialog = useCallback(() => {
    openerRef.current =
      typeof document !== "undefined" && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    capturedStudioStep.current = activeTab === "design" ? readStudioStep() : null;
    setEmail((current) => current || currentUser?.email || "");
    setSent(false);
    setSubmitError(null);
    setFieldError(null);
    setOpen(true);
  }, [activeTab, currentUser?.email]);

  const closeDialog = useCallback(() => {
    setOpen(false);
    if (sent) {
      setMessage("");
      setType("idea");
      setPhoto(null);
      setSent(false);
    }
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        const opener = openerRef.current;
        if (opener && opener.isConnected && opener !== document.body) opener.focus();
        else tabRef.current?.focus();
      }, 0);
    }
  }, [sent]);

  // The desktop header Feedback button asks the store to open this same panel.
  const lastOpenRequest = useRef(siteFeedbackOpenRequest);
  useEffect(() => {
    if (siteFeedbackOpenRequest === lastOpenRequest.current) return;
    lastOpenRequest.current = siteFeedbackOpenRequest;
    openDialog();
  }, [siteFeedbackOpenRequest, openDialog]);

  // Esc closes; Tab stays inside the dialog.
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeDialog();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([tabindex='-1']):not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]",
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    const focusTimer = window.setTimeout(() => messageRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      window.clearTimeout(focusTimer);
    };
  }, [open, closeDialog]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    setSubmitError(null);
    const validation = validateSiteFeedback({ type, message, email, nationality });
    if (validation.ok === false) {
      // tsconfig is not strict, so narrow explicitly.
      const failure = validation as Extract<SiteFeedbackValidation, { ok: false }>;
      setFieldError({ field: failure.field, error: failure.error });
      return;
    }
    setFieldError(null);
    // Bots fill the hidden field; pretend it worked and store nothing.
    if (honeypot.trim()) {
      setSent(true);
      return;
    }
    const storage = safeStorage();
    const now = Date.now();
    const waitMs = siteFeedbackRateLimitWaitMs(readSiteFeedbackSends(storage), now);
    if (waitMs > 0) {
      const seconds = Math.ceil(waitMs / 1000);
      setSubmitError(
        seconds > 90
          ? `Thanks, we already have a few messages from you. Please try again in about ${Math.ceil(seconds / 60)} minutes.`
          : `Please wait ${seconds} seconds before sending another message.`,
      );
      return;
    }
    const firebaseUid = currentUser?.ownerUid ?? null;
    const context: SiteFeedbackContext = {
      page: typeof window !== "undefined" ? window.location.pathname + window.location.search + window.location.hash : "",
      tab: String(activeTab ?? ""),
      studioStep: capturedStudioStep.current,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      viewport:
        typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "",
      uid: firebaseUid,
    };
    setSending(true);
    try {
      await submit(validation.value, context, photo);
      recordSiteFeedbackSend(storage, now);
      setSent(true);
    } catch (error) {
      console.error("Feedback could not be sent:", error);
      setSubmitError(
        photo
          ? "Sorry, your feedback could not be sent. Check your connection and try again. If it keeps failing, remove the photo and send again."
          : "Sorry, your feedback could not be sent. Check your connection and try again.",
      );
    } finally {
      setSending(false);
    }
  };

  const hidden = isCartOpen || isMobileMenuOpen || open;
  const messageLength = Array.from(message.trim()).length;
  const errorFor = (field: string) =>
    fieldError?.field === field ? fieldError.error : null;

  return (
    <>
      <button
        ref={tabRef}
        type="button"
        data-site-feedback-tab="true"
        data-covering={covering ? "true" : "false"}
        aria-label="Send feedback"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Send feedback"
        onClick={openDialog}
        tabIndex={hidden ? -1 : 0}
        aria-hidden={hidden ? true : undefined}
        className={`fixed left-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center justify-center gap-1.5 rounded-r-xl border border-l-0 border-heritage-gold/60 bg-heritage-green py-3 pl-[calc(0.25rem+env(safe-area-inset-left,0px))] pr-1 text-heritage-gold shadow-lg transition-opacity duration-200 hover:bg-heritage-forest focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2 focus-visible:pointer-events-auto sm:gap-2 sm:py-4 sm:pr-1.5 xl:hidden ${
          hidden
            ? "pointer-events-none opacity-0"
            : covering
              ? "pointer-events-none opacity-0"
              : "opacity-95"
        }`}
      >
        <MessageSquare aria-hidden="true" size={16} />
        <span className="hidden text-[11px] font-bold uppercase tracking-[0.18em] [writing-mode:vertical-rl] rotate-180 sm:block">
          Feedback
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-heritage-forest/60 p-0 sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${ids}-title`}
            data-site-feedback-dialog="true"
            className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-heritage-gold/40 bg-heritage-cream p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] font-sans text-heritage-ink shadow-2xl sm:max-w-md sm:rounded-3xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-heritage-green text-heritage-gold">
                  <MessageSquare aria-hidden="true" size={16} />
                </span>
                <h2 id={`${ids}-title`} className="font-serif text-xl font-semibold text-heritage-green">
                  Send feedback
                </h2>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                aria-label="Close feedback"
                className="rounded-full p-1.5 text-heritage-green/70 transition hover:bg-heritage-gold/15 hover:text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
              >
                <X aria-hidden="true" size={18} />
              </button>
            </div>

            {sent ? (
              <div className="mt-6 flex flex-col items-center gap-3 text-center" role="status" data-site-feedback-thanks="true">
                <CheckCircle2 aria-hidden="true" size={40} className="text-heritage-gold" />
                <p className="font-serif text-lg font-semibold text-heritage-green">Thank you!</p>
                <p className="text-sm text-heritage-ink/75">
                  Your feedback reached the ODOGWU HERITAGE team. We read every message.
                </p>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="mt-2 rounded-full bg-heritage-green px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-heritage-gold transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold focus-visible:ring-offset-2"
                >
                  Close
                </button>
              </div>
            ) : (
              <form className="mt-4 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
                <p className="text-sm text-heritage-ink/75">
                  Spotted a problem or have an idea? Tell us. We'll see which page you're on.
                </p>
                <fieldset>
                  <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-heritage-green">
                    Type
                  </legend>
                  <div className="flex gap-2" role="radiogroup">
                    {SITE_FEEDBACK_TYPES.map((option) => (
                      <label
                        key={option}
                        className={`flex-1 cursor-pointer rounded-full border px-3 py-2 text-center text-xs font-bold uppercase tracking-wider transition focus-within:ring-2 focus-within:ring-heritage-gold ${
                          type === option
                            ? "border-heritage-green bg-heritage-green text-heritage-gold"
                            : "border-heritage-gold/50 bg-white text-heritage-green hover:bg-heritage-gold/10"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`${ids}-type`}
                          value={option}
                          checked={type === option}
                          onChange={() => setType(option)}
                          className="sr-only"
                        />
                        {SITE_FEEDBACK_TYPE_LABELS[option]}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor={`${ids}-message`} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-heritage-green">
                    Message <span className="text-red-700">*</span>
                  </label>
                  <textarea
                    id={`${ids}-message`}
                    ref={messageRef}
                    required
                    rows={5}
                    maxLength={SITE_FEEDBACK_LIMITS.messageMax}
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    aria-invalid={errorFor("message") ? true : undefined}
                    aria-describedby={`${ids}-message-hint`}
                    placeholder="What happened, or what would make the site better?"
                    className="w-full resize-y rounded-2xl border border-heritage-gold/50 bg-white px-3.5 py-3 text-sm text-heritage-ink outline-none transition focus:border-heritage-green focus:ring-2 focus:ring-heritage-gold/50"
                  />
                  <div id={`${ids}-message-hint`} className="mt-1 flex justify-between gap-2 text-xs">
                    <span className="text-red-700" role={errorFor("message") ? "alert" : undefined}>
                      {errorFor("message") ?? ""}
                    </span>
                    <span className="shrink-0 text-heritage-ink/55">
                      {messageLength}/{SITE_FEEDBACK_LIMITS.messageMax}
                    </span>
                  </div>
                </div>

                <div>
                  <label htmlFor={`${ids}-email`} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-heritage-green">
                    Email <span className="font-normal normal-case tracking-normal text-heritage-ink/55">(optional, if you'd like a reply)</span>
                  </label>
                  <input
                    id={`${ids}-email`}
                    type="email"
                    autoComplete="email"
                    maxLength={SITE_FEEDBACK_LIMITS.emailMax}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    aria-invalid={errorFor("email") ? true : undefined}
                    className="w-full rounded-full border border-heritage-gold/50 bg-white px-4 py-2.5 text-sm text-heritage-ink outline-none transition focus:border-heritage-green focus:ring-2 focus:ring-heritage-gold/50"
                  />
                  {errorFor("email") && (
                    <p className="mt-1 text-xs text-red-700" role="alert">
                      {errorFor("email")}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor={`${ids}-nationality`} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-heritage-green">
                    Nationality <span className="font-normal normal-case tracking-normal text-heritage-ink/55">(optional)</span>
                  </label>
                  <select
                    id={`${ids}-nationality`}
                    data-site-feedback-nationality="true"
                    value={nationality}
                    onChange={(event) => setNationality(event.target.value)}
                    aria-invalid={errorFor("nationality") ? true : undefined}
                    className="w-full rounded-full border border-heritage-gold/50 bg-white px-4 py-2.5 text-sm text-heritage-ink outline-none transition focus:border-heritage-green focus:ring-2 focus:ring-heritage-gold/50"
                  >
                    <option value="">Prefer not to say</option>
                    {SITE_FEEDBACK_NATIONALITY_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errorFor("nationality") && (
                    <p className="mt-1 text-xs text-red-700" role="alert">
                      {errorFor("nationality")}
                    </p>
                  )}
                </div>

                <div data-site-feedback-photo-field="true">
                  <span id={`${ids}-photo-label`} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-heritage-green">
                    Add a photo or screenshot <span className="font-normal normal-case tracking-normal text-heritage-ink/55">(optional, JPEG, PNG or WebP, up to 5 MB)</span>
                  </span>
                  {photo && photoPreview ? (
                    <div className="flex items-center gap-3 rounded-2xl border border-heritage-gold/50 bg-white p-2.5">
                      <img
                        src={photoPreview}
                        alt="Selected photo preview"
                        className="h-14 w-14 shrink-0 rounded-xl object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-heritage-ink/75">{photo.name}</span>
                      <button
                        type="button"
                        onClick={clearPhoto}
                        aria-label="Remove photo"
                        className="rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-gold/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <label
                      htmlFor={`${ids}-photo`}
                      className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed border-heritage-gold/70 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-gold/10 focus-within:ring-2 focus-within:ring-heritage-gold"
                    >
                      <ImagePlus aria-hidden="true" size={16} />
                      Choose photo
                      <input
                        id={`${ids}-photo`}
                        ref={photoInputRef}
                        type="file"
                        accept={SITE_FEEDBACK_PHOTO_TYPES.join(",")}
                        aria-labelledby={`${ids}-photo-label`}
                        aria-invalid={errorFor("photo") ? true : undefined}
                        onChange={(event) => onPickPhoto(event.target.files?.[0] ?? null)}
                        className="sr-only"
                      />
                    </label>
                  )}
                  {errorFor("photo") && (
                    <p className="mt-1 text-xs text-red-700" role="alert" data-site-feedback-photo-error="true">
                      {errorFor("photo")}
                    </p>
                  )}
                </div>

                {/* Honeypot: hidden from people and assistive tech, bots fill it. */}
                <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                  <label htmlFor={`${ids}-website`}>Website</label>
                  <input
                    id={`${ids}-website`}
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(event) => setHoneypot(event.target.value)}
                  />
                </div>

                {submitError && (
                  <p className="rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800" role="alert" data-site-feedback-error="true">
                    {submitError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={sending}
                  className="flex items-center justify-center gap-2 rounded-full bg-heritage-gold px-6 py-3 text-xs font-bold uppercase tracking-wider text-heritage-ink shadow-md transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-green focus-visible:ring-offset-2"
                >
                  {sending && <Loader2 aria-hidden="true" size={14} className="animate-spin" />}
                  {sending ? "Sending…" : "Send feedback"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default SiteFeedbackButton;
