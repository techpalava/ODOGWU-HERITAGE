import { useEffect, useRef, useState, type FormEvent } from "react";
import { Star, X } from "lucide-react";
import { auth } from "../services/firebase";
import { StorageService } from "../services/storageService";
import { useAppStore } from "../store/useAppStore";
import {
  CUSTOMER_REVIEW_LIMITS,
  validateCustomerReviewInput,
} from "../utils/customerReviews";

interface CustomerReviewFormProps {
  open: boolean;
  onClose: () => void;
}

export default function CustomerReviewForm({
  open,
  onClose,
}: CustomerReviewFormProps) {
  const setNotification = useAppStore((state) => state.setNotification);
  const [authorName, setAuthorName] = useState("");
  const [location, setLocation] = useState("");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    nameInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const reset = () => {
    setAuthorName("");
    setLocation("");
    setRating(0);
    setBody("");
    setWebsite("");
    setError(null);
  };

  const finish = () => {
    reset();
    onClose();
    setNotification({
      message: "Thank you! Your review has been published.",
      type: "success",
    });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    // Honeypot: real visitors never see or fill this field.
    if (website.trim()) {
      finish();
      return;
    }

    const validation = validateCustomerReviewInput({
      authorName,
      location,
      body,
      rating,
    });
    if ("error" in validation) {
      setError(validation.error);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await StorageService.createCustomerReview(
        validation.value,
        auth.currentUser?.uid ?? null,
      );
      finish();
    } catch (submitError) {
      console.error("Customer review submission failed:", submitError);
      setError("We could not publish your review. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const limits = CUSTOMER_REVIEW_LIMITS;
  const labelClass =
    "block text-[10px] font-bold uppercase tracking-wider text-heritage-green";
  const inputClass =
    "mt-1 w-full rounded-xl border border-heritage-gold/30 bg-white px-3 py-2.5 text-sm text-heritage-ink focus:border-heritage-gold focus:outline-none focus:ring-2 focus:ring-heritage-gold/30";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-heritage-green/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-review-form-title"
        className="w-full max-w-lg rounded-3xl border border-heritage-gold/25 bg-heritage-cream p-6 shadow-2xl sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <span className="block text-xs font-bold uppercase tracking-widest text-heritage-gold">
              Share your experience
            </span>
            <h2
              id="customer-review-form-title"
              className="font-serif text-2xl font-semibold text-heritage-green"
            >
              Write a review
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close review form"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-heritage-gold/25 text-heritage-green hover:bg-heritage-gold/10"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="review-author-name" className={labelClass}>
              Your name
            </label>
            <input
              id="review-author-name"
              ref={nameInputRef}
              type="text"
              required
              maxLength={limits.authorNameMax}
              value={authorName}
              onChange={(event) => setAuthorName(event.target.value)}
              className={inputClass}
              autoComplete="name"
            />
          </div>

          <div>
            <label htmlFor="review-location" className={labelClass}>
              Location <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              id="review-location"
              type="text"
              maxLength={limits.locationMax}
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className={inputClass}
              placeholder="e.g. Eindhoven"
            />
          </div>

          <fieldset>
            <legend className={labelClass}>Rating</legend>
            <div className="mt-1 flex gap-1" role="radiogroup" aria-label="Star rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} star${value === 1 ? "" : "s"}`}
                  onClick={() => setRating(value)}
                  className="rounded-lg p-1 focus:outline-none focus:ring-2 focus:ring-heritage-gold/40"
                >
                  <Star
                    size={26}
                    aria-hidden="true"
                    className={
                      value <= rating
                        ? "fill-heritage-gold text-heritage-gold"
                        : "text-heritage-beige"
                    }
                  />
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="review-body" className={labelClass}>
              Your review
            </label>
            <textarea
              id="review-body"
              required
              rows={5}
              minLength={limits.bodyMin}
              maxLength={limits.bodyMax}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              className={`${inputClass} resize-none`}
            />
            <span className="mt-1 block text-right text-[10px] text-heritage-ink/50">
              {body.trim().length}/{limits.bodyMax}
            </span>
          </div>

          <div className="hidden" aria-hidden="true">
            <label htmlFor="review-website">Website</label>
            <input
              id="review-website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="text-xs font-semibold text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-heritage-green px-5 py-3 text-xs font-bold uppercase tracking-wider text-heritage-gold transition hover:bg-heritage-forest disabled:opacity-60"
          >
            {isSubmitting ? "Publishing…" : "Publish review"}
          </button>
        </form>
      </div>
    </div>
  );
}
