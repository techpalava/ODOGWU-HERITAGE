import { useMemo, useState, type KeyboardEvent } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, PenLine } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import {
  resolvePublishedReviewsForDisplay,
  selectSliderReviews,
} from "../utils/customerReviews";
import { CustomerReviewCard } from "./CustomerReviewCard";
import CustomerReviewForm from "./CustomerReviewForm";

export default function CustomerReviewsSlider() {
  const customerReviews = useAppStore((state) => state.customerReviews);
  const hasLoaded = useAppStore((state) => state.hasLoadedCustomerReviews);
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const [startIndex, setStartIndex] = useState(0);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const slides = useMemo(
    () =>
      selectSliderReviews(
        resolvePublishedReviewsForDisplay(customerReviews, hasLoaded),
      ),
    [customerReviews, hasLoaded],
  );
  const count = slides.length;
  const safeStart = count > 0 ? startIndex % count : 0;
  // Rotating the list keeps one source of truth: mobile shows the first
  // card, desktop shows all of them starting from the same card.
  const ordered = slides
    .slice(safeStart)
    .concat(slides.slice(0, safeStart));

  const goPrevious = () =>
    setStartIndex((index) => (count > 0 ? (index - 1 + count) % count : 0));
  const goNext = () =>
    setStartIndex((index) => (count > 0 ? (index + 1) % count : 0));

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
    "flex h-10 w-10 items-center justify-center rounded-full border border-heritage-gold/30 bg-white text-heritage-green shadow-sm transition hover:bg-heritage-gold hover:text-heritage-forest focus:outline-none focus:ring-2 focus:ring-heritage-gold/40 disabled:opacity-40";

  return (
    <section
      id="home-customer-reviews"
      aria-labelledby="home-customer-reviews-title"
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <span className="block text-xs font-bold uppercase tracking-widest text-heritage-gold">
            Reviews
          </span>
          <h2
            id="home-customer-reviews-title"
            className="font-serif text-2xl font-semibold text-heritage-green sm:text-3xl"
          >
            What our community says
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrevious}
            disabled={count <= 1}
            aria-label="Previous review"
            aria-controls="home-customer-reviews-track"
            className={arrowClass}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={count <= 1}
            aria-label="Next review"
            aria-controls="home-customer-reviews-track"
            className={arrowClass}
          >
            <ChevronRight size={18} />
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
        className="grid grid-cols-1 gap-6 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold/40 md:grid-cols-3"
      >
        {ordered.map((review, index) => (
          <CustomerReviewCard
            key={review.id}
            review={review}
            className={index === 0 ? "" : "hidden md:flex"}
          />
        ))}
        {count === 0 && hasLoaded && (
          <div className="rounded-2xl border border-heritage-gold/20 bg-heritage-cream p-8 text-center md:col-span-3">
            <p className="font-serif text-lg text-heritage-green">
              Be the first to share your Odogwu Heritage story.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => setIsFormOpen(true)}
          className="flex items-center justify-center gap-2 rounded-xl bg-heritage-green px-5 py-3 text-xs font-bold uppercase tracking-wider text-heritage-gold transition hover:bg-heritage-forest"
        >
          <PenLine size={14} /> Write a review
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reviews")}
          className="flex items-center justify-center gap-2 rounded-xl border border-heritage-gold/40 px-5 py-3 text-xs font-bold uppercase tracking-wider text-heritage-green transition hover:bg-heritage-gold/10"
        >
          See all reviews <ArrowRight size={14} />
        </button>
      </div>

      <CustomerReviewForm
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
      />
    </section>
  );
}
