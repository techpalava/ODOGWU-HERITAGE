import { Star } from "lucide-react";
import type { CustomerReview } from "../types";

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

  return (
    <article
      className={`flex h-full flex-col justify-between gap-4 rounded-2xl border border-heritage-gold/20 bg-white p-6 shadow-sm ${className}`}
    >
      <div className="space-y-3">
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
          {review.location && (
            <span className="block truncate text-[10px] text-heritage-ink/55">
              {review.location}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
