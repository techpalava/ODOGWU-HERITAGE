import { useMemo, useState, type KeyboardEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, PenLine } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import {
  resolvePublishedReviewsForDisplay,
  selectSliderReviews,
} from "../utils/customerReviews";
import { ReviewStars } from "./CustomerReviewCard";
import CustomerReviewForm from "./CustomerReviewForm";

// Homepage trust band: one rotating review at a time so the order gateway
// below stays close to the top of the page. The full list lives in ReviewsView.
export default function CustomerReviewsSlider() {
  const customerReviews = useAppStore((state) => state.customerReviews);
  const hasLoaded = useAppStore((state) => state.hasLoadedCustomerReviews);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const [index, setIndex] = useState(0);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const slides = useMemo(
    () =>
      selectSliderReviews(
        resolvePublishedReviewsForDisplay(customerReviews, hasLoaded),
      ),
    [customerReviews, hasLoaded],
  );
  const count = slides.length;
  const current = count > 0 ? slides[index % count] : undefined;

  const goPrevious = () =>
    setIndex((value) => (count > 0 ? (value - 1 + count) % count : 0));
  const goNext = () =>
    setIndex((value) => (count > 0 ? (value + 1) % count : 0));

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      goPrevious();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      goNext();
    }
  };

  const arrowClass =
    "flex h-7 w-7 items-center justify-center rounded-full border border-heritage-gold/30 bg-white text-heritage-green transition hover:bg-heritage-gold hover:text-heritage-forest focus:outline-none focus:ring-2 focus:ring-heritage-gold/40 disabled:opacity-40";
  const ctaClass =
    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition";

  return (
    <section
      id="home-customer-reviews"
      aria-labelledby="home-customer-reviews-title"
      className="space-y-2"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          id="home-customer-reviews-title"
          className="min-w-0 truncate font-serif text-base font-semibold text-heritage-green sm:text-lg"
        >
          What our community says
        </h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={goPrevious}
            disabled={count <= 1}
            aria-label="Previous review"
            aria-controls="home-customer-reviews-track"
            className={arrowClass}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={count <= 1}
            aria-label="Next review"
            aria-controls="home-customer-reviews-track"
            className={arrowClass}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div
        id="home-customer-reviews-track"
        role="region"
        aria-roledescription="carousel"
        aria-label="Customer reviews"
        aria-live="polite"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="rounded-xl border border-heritage-gold/20 bg-white px-4 py-2.5 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold/40"
      >
        {current ? (
          <figure
            key={current.id}
            className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4"
          >
            <blockquote className="min-w-0 flex-1 font-serif text-[13px] italic leading-snug text-heritage-ink/80 line-clamp-2">
              "{current.body}"
            </blockquote>
            <ReviewStars rating={current.rating} size={12} />
            <figcaption className="shrink-0 truncate text-[11px] leading-tight sm:max-w-[14rem]">
              <strong className="text-heritage-green">
                {current.authorName}
              </strong>
              {current.location && (
                <span className="text-heritage-ink/55">
                  {" · "}
                  {current.location}
                </span>
              )}
            </figcaption>
          </figure>
        ) : (
          <p className="text-[12px] text-heritage-ink/60">
            {hasLoaded
              ? "Be the first to share your Odogwu Heritage story."
              : "Loading reviews…"}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => setIsFormOpen(true)}
          className={`${ctaClass} bg-heritage-green text-heritage-gold hover:bg-heritage-forest`}
        >
          <PenLine size={12} /> Write a review
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reviews")}
          className={`${ctaClass} border border-heritage-gold/40 text-heritage-green hover:bg-heritage-gold/10`}
        >
          See all reviews <ArrowRight size={12} />
        </button>
      </div>

      <CustomerReviewForm
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
      />
    </section>
  );
}
