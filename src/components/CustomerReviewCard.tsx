import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import type { CustomerReview } from "../types";
import {
  approvedReviewPhotoUrl,
  formatReviewOrigin,
} from "../utils/customerReviews";

export function ReviewStars({
  rating,
  size = 14,
}: {
  rating: number;
  size?: number;
}) {
  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          size={size}
          aria-hidden="true"
          className={
            value <= rating
              ? "fill-heritage-gold text-heritage-gold"
              : "text-heritage-beige"
          }
        />
      ))}
    </div>
  );
}

/** Full-size view of an approved review photo; tap outside or Escape closes. */
export function ReviewPhotoLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      data-customer-review-photo-lightbox="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-heritage-green"
      >
        <X size={18} />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-h-[calc(100dvh-6rem)] max-w-full rounded-2xl object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}

export function CustomerReviewCard({
  review,
  clamp = true,
  className = "",
}: {
  review: CustomerReview;
  clamp?: boolean;
  className?: string;
}) {
  const initials = review.authorName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const origin = formatReviewOrigin(review);
  // Only an admin-approved photo is ever shown publicly.
  const photoUrl = approvedReviewPhotoUrl(review);
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);
  const photoAlt = `${review.authorName || "Customer"} wearing their ODOGWU outfit`;

  return (
    <article
      className={`flex h-full flex-col justify-between gap-4 rounded-2xl border border-heritage-gold/20 bg-white p-6 shadow-sm ${className}`}
    >
      <div className="space-y-3">
        {photoUrl && (
          <button
            type="button"
            onClick={() => setIsPhotoOpen(true)}
            data-customer-review-photo="true"
            aria-label={`View larger photo: ${photoAlt}`}
            className="block w-full overflow-hidden rounded-xl border border-heritage-gold/15 focus:outline-none focus:ring-2 focus:ring-heritage-gold/40"
          >
            <img
              src={photoUrl}
              alt={photoAlt}
              loading="lazy"
              className="aspect-[4/3] w-full object-cover"
            />
          </button>
        )}
        <ReviewStars rating={review.rating} />
        <p
          className={`font-serif text-[13px] italic leading-relaxed text-heritage-ink/80 ${
            clamp ? "line-clamp-5" : "whitespace-pre-line"
          }`}
        >
          “{review.body}”
        </p>
      </div>
      <div className="flex items-center gap-3 border-t border-heritage-gold/15 pt-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-heritage-green font-serif text-xs font-bold text-heritage-gold">
          {initials || "★"}
        </div>
        <div className="min-w-0">
          <strong className="block truncate text-xs text-heritage-green">
            {review.authorName}
          </strong>
          {origin && (
            <span
              className="block truncate text-[10px] text-heritage-ink/55"
              data-customer-review-origin="true"
              title={origin}
            >
              {origin}
            </span>
          )}
        </div>
      </div>
      {photoUrl && isPhotoOpen && (
        <ReviewPhotoLightbox
          src={photoUrl}
          alt={photoAlt}
          onClose={() => setIsPhotoOpen(false)}
        />
      )}
    </article>
  );
}
