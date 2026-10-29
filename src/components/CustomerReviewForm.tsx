import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Camera, ImagePlus, Star, X } from "lucide-react";
import { auth } from "../services/firebase";
import {
  CustomerReviewPhotoSubmitError,
  submitCustomerReviewWithPhoto,
} from "../services/customerReviewPhotoService";
import { StorageService } from "../services/storageService";
import { useAppStore } from "../store/useAppStore";
import {
  CUSTOMER_REVIEW_LIMITS,
  CUSTOMER_REVIEW_PHOTO_CONSENT_LABEL,
  CUSTOMER_REVIEW_PHOTO_TYPES,
  validateCustomerReviewInput,
  validateCustomerReviewPhotoConsent,
} from "../utils/customerReviews";
import {
  CUSTOMER_REVIEW_PHOTO_COMPRESSION_ERROR,
  CustomerReviewPhotoError,
  prepareCustomerReviewPhoto,
  type PreparedCustomerReviewPhoto,
} from "../utils/customerReviewPhoto";
import { NATIONALITY_OPTIONS } from "../utils/nationalityOptions";

/** Photo hooks, injectable for tests. */
export interface CustomerReviewFormPhotoDeps {
  preparePhoto: (file: File) => Promise<PreparedCustomerReviewPhoto>;
  submitWithPhoto: typeof submitCustomerReviewWithPhoto;
  createPreviewUrl: (blob: Blob) => string;
  revokePreviewUrl: (url: string) => void;
}

const defaultPhotoDeps: CustomerReviewFormPhotoDeps = {
  preparePhoto: (file) => prepareCustomerReviewPhoto(file),
  submitWithPhoto: (value, photo) => submitCustomerReviewWithPhoto(value, photo),
  createPreviewUrl: (blob) =>
    typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(blob)
      : "",
  revokePreviewUrl: (url) => {
    if (url && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(url);
    }
  },
};

const PHOTO_ACCEPT = CUSTOMER_REVIEW_PHOTO_TYPES.join(",");

interface CustomerReviewFormProps {
  open: boolean;
  onClose: () => void;
  photoDeps?: CustomerReviewFormPhotoDeps;
}

export default function CustomerReviewForm({
  open,
  onClose,
  photoDeps = defaultPhotoDeps,
}: CustomerReviewFormProps) {
  const setNotification = useAppStore((state) => state.setNotification);
  const [authorName, setAuthorName] = useState("");
  const [location, setLocation] = useState("");
  const [nationality, setNationality] = useState("");
  const [secondNationality, setSecondNationality] = useState("");
  const [showSecondNationality, setShowSecondNationality] = useState(false);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photo, setPhoto] = useState<{
    prepared: PreparedCustomerReviewPhoto;
    previewUrl: string;
  } | null>(null);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [photoUploadFailed, setPhotoUploadFailed] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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

  const clearPhoto = () => {
    if (photo) photoDeps.revokePreviewUrl(photo.previewUrl);
    setPhoto(null);
    setPhotoConsent(false);
    setPhotoError(null);
    setPhotoUploadFailed(false);
  };

  const handlePhotoPicked = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    // Let the same file be picked again after a remove.
    event.target.value = "";
    if (!file) return;
    clearPhoto();
    setIsPreparingPhoto(true);
    try {
      // Only the re-encoded copy is kept; the original file (with any
      // EXIF/GPS data) is never stored or uploaded.
      const prepared = await photoDeps.preparePhoto(file);
      setPhoto({ prepared, previewUrl: photoDeps.createPreviewUrl(prepared.blob) });
    } catch (prepareError) {
      setPhotoError(
        prepareError instanceof CustomerReviewPhotoError
          ? prepareError.message
          : CUSTOMER_REVIEW_PHOTO_COMPRESSION_ERROR,
      );
    } finally {
      setIsPreparingPhoto(false);
    }
  };

  const reset = () => {
    setAuthorName("");
    setLocation("");
    setNationality("");
    setSecondNationality("");
    setShowSecondNationality(false);
    setRating(0);
    setBody("");
    setWebsite("");
    setError(null);
    clearPhoto();
  };

  const finish = (withPhoto = false) => {
    reset();
    onClose();
    setNotification({
      message: withPhoto
        ? "Thank you! Your review has been published. Your photo is under review and will appear once approved."
        : "Thank you! Your review has been published.",
      type: "success",
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitReview(true);
  };

  const submitReview = async (includePhoto: boolean) => {
    if (isSubmitting || isPreparingPhoto) return;

    // Honeypot: real visitors never see or fill this field.
    if (website.trim()) {
      finish();
      return;
    }

    const validation = validateCustomerReviewInput({
      authorName,
      location,
      nationality,
      secondNationality: showSecondNationality ? secondNationality : "",
      body,
      rating,
    });
    if ("error" in validation) {
      setError(validation.error);
      return;
    }
    const attached = includePhoto ? photo : null;
    const consentError = validateCustomerReviewPhotoConsent(Boolean(attached), photoConsent);
    if (consentError) {
      setError(consentError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setPhotoUploadFailed(false);
    try {
      if (attached) {
        await photoDeps.submitWithPhoto(validation.value, attached.prepared);
      } else {
        await StorageService.createCustomerReview(
          validation.value,
          auth.currentUser?.uid ?? null,
        );
      }
      finish(Boolean(attached));
    } catch (submitError) {
      console.error("Customer review submission failed:", submitError);
      if (
        submitError instanceof CustomerReviewPhotoSubmitError &&
        submitError.stage !== "write"
      ) {
        setPhotoUploadFailed(true);
        setError(
          "Your photo could not be uploaded, so your review was not published yet. Try again, or submit without the photo.",
        );
      } else {
        setError("We could not publish your review. Please try again.");
      }
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
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-heritage-gold/25 bg-heritage-cream p-6 shadow-2xl sm:p-8"
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

          <div data-customer-review-nationality-group="true">
            <label htmlFor="review-nationality" className={labelClass}>
              Nationality <span className="font-normal normal-case">(optional)</span>
            </label>
            <select
              id="review-nationality"
              data-customer-review-nationality="true"
              value={nationality}
              onChange={(event) => setNationality(event.target.value)}
              className={`${inputClass} min-w-0`}
            >
              <option value="">Prefer not to say</option>
              {NATIONALITY_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>

            {showSecondNationality ? (
              <div className="mt-3">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="review-second-nationality" className={labelClass}>
                    Second nationality
                  </label>
                  <button
                    type="button"
                    data-customer-review-remove-second-nationality="true"
                    onClick={() => {
                      setShowSecondNationality(false);
                      setSecondNationality("");
                    }}
                    className="text-[11px] font-semibold text-heritage-green underline underline-offset-2 hover:text-heritage-forest"
                  >
                    Remove
                  </button>
                </div>
                <select
                  id="review-second-nationality"
                  data-customer-review-second-nationality="true"
                  value={secondNationality}
                  onChange={(event) => setSecondNationality(event.target.value)}
                  className={`${inputClass} min-w-0`}
                >
                  <option value="">Choose a country</option>
                  {NATIONALITY_OPTIONS.filter(
                    (option) => option.code !== nationality,
                  ).map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              nationality && (
                <button
                  type="button"
                  data-customer-review-add-second-nationality="true"
                  onClick={() => setShowSecondNationality(true)}
                  className="mt-2 text-[11px] font-semibold text-heritage-green underline underline-offset-2 hover:text-heritage-forest"
                >
                  + Add second nationality
                </button>
              )
            )}
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

          <div data-customer-review-photo-group="true">
            <span className={labelClass}>
              Add a photo of you wearing it{" "}
              <span className="font-normal normal-case">(optional)</span>
            </span>
            <input
              ref={fileInputRef}
              id="review-photo-file"
              data-customer-review-photo-file="true"
              type="file"
              accept={PHOTO_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void handlePhotoPicked(event)}
            />
            <input
              ref={cameraInputRef}
              id="review-photo-camera"
              data-customer-review-photo-camera="true"
              type="file"
              accept={PHOTO_ACCEPT}
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => void handlePhotoPicked(event)}
            />
            {photo ? (
              <div className="mt-2 space-y-3">
                <div className="flex items-start gap-3">
                  {photo.previewUrl ? (
                    <img
                      src={photo.previewUrl}
                      alt="Your photo preview"
                      data-customer-review-photo-preview="true"
                      className="h-24 w-24 shrink-0 rounded-xl border border-heritage-gold/25 object-cover"
                    />
                  ) : (
                    <div
                      data-customer-review-photo-preview="true"
                      className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border border-heritage-gold/25 bg-white text-[10px] text-heritage-ink/50"
                    >
                      Photo ready
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="text-[11px] text-heritage-ink/60">
                      Your photo will appear after our team reviews it.
                    </p>
                    <button
                      type="button"
                      data-customer-review-photo-remove="true"
                      onClick={clearPhoto}
                      className="text-[11px] font-semibold text-heritage-green underline underline-offset-2 hover:text-heritage-forest"
                    >
                      Remove photo
                    </button>
                  </div>
                </div>
                <label className="flex items-start gap-2 text-xs text-heritage-ink/80">
                  <input
                    type="checkbox"
                    id="review-photo-consent"
                    data-customer-review-photo-consent="true"
                    checked={photoConsent}
                    onChange={(event) => setPhotoConsent(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-heritage-green"
                  />
                  <span>{CUSTOMER_REVIEW_PHOTO_CONSENT_LABEL}</span>
                </label>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-customer-review-photo-choose="true"
                  disabled={isPreparingPhoto}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-heritage-gold/30 bg-white px-3 py-2 text-[11px] font-semibold text-heritage-green hover:bg-heritage-gold/10 disabled:opacity-60"
                >
                  <ImagePlus size={14} aria-hidden="true" /> Choose photo
                </button>
                <button
                  type="button"
                  data-customer-review-photo-take="true"
                  disabled={isPreparingPhoto}
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-heritage-gold/30 bg-white px-3 py-2 text-[11px] font-semibold text-heritage-green hover:bg-heritage-gold/10 disabled:opacity-60"
                >
                  <Camera size={14} aria-hidden="true" /> Take photo
                </button>
                {isPreparingPhoto && (
                  <span className="self-center text-[11px] text-heritage-ink/60">
                    Preparing photo…
                  </span>
                )}
              </div>
            )}
            {photoError && (
              <p
                role="alert"
                data-customer-review-photo-error="true"
                className="mt-2 text-xs font-semibold text-red-700"
              >
                {photoError}
              </p>
            )}
            <span className="mt-1 block text-[10px] text-heritage-ink/50">
              JPEG, PNG or WebP, up to 5 MB. One photo.
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
            <p
              role="alert"
              data-customer-review-error="true"
              className="text-xs font-semibold text-red-700"
            >
              {error}
            </p>
          )}

          {photoUploadFailed && photo && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                data-customer-review-photo-retry="true"
                disabled={isSubmitting}
                onClick={() => void submitReview(true)}
                className="flex-1 rounded-xl border border-heritage-green px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-heritage-green hover:bg-heritage-green/5 disabled:opacity-60"
              >
                Try again
              </button>
              <button
                type="button"
                data-customer-review-photo-skip="true"
                disabled={isSubmitting}
                onClick={() => void submitReview(false)}
                className="flex-1 rounded-xl border border-heritage-gold/40 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-heritage-ink/70 hover:bg-heritage-gold/10 disabled:opacity-60"
              >
                Submit without photo
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isPreparingPhoto}
            className="w-full rounded-xl bg-heritage-green px-5 py-3 text-xs font-bold uppercase tracking-wider text-heritage-gold transition hover:bg-heritage-forest disabled:opacity-60"
          >
            {isSubmitting ? "Publishing…" : "Publish review"}
          </button>
        </form>
      </div>
    </div>
  );
}
