import { useMemo, useState } from "react";
import { PenLine } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import {
  resolvePublishedReviewsForDisplay,
  sortReviewsNewestFirst,
} from "../utils/customerReviews";
import { CustomerReviewCard, ReviewStars } from "./CustomerReviewCard";
import CustomerReviewForm from "./CustomerReviewForm";

export default function ReviewsView() {
  const customerReviews = useAppStore((state) => state.customerReviews);
  const hasLoaded = useAppStore((state) => state.hasLoadedCustomerReviews);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const published = useMemo(
    () =>
      sortReviewsNewestFirst(
        resolvePublishedReviewsForDisplay(customerReviews, hasLoaded),
      ),
    [customerReviews, hasLoaded],
  );
  const average =
    published.length > 0
      ? published.reduce((sum, review) => sum + review.rating, 0) /
        published.length
      : 0;

  return (
    <div id="reviews-view-container" className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl border border-heritage-gold/20 bg-heritage-green p-8 text-white shadow-2xl sm:p-12">
        <div className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full border border-heritage-gold/10"></div>
        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <span className="block text-xs font-bold uppercase tracking-widest text-heritage-gold">
              Reviews
            </span>
            <h1 className="font-display text-3xl tracking-tight sm:text-4xl">
              Stories from our community
            </h1>
            {published.length > 0 && (
              <div className="flex items-center gap-3 text-sm text-heritage-beige">
                <ReviewStars rating={Math.round(average)} size={16} />
                <span>
                  {average.toFixed(1)} from {published.length}{" "}
                  {published.length === 1 ? "review" : "reviews"}
                </span>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="flex items-center justify-center gap-2 rounded-xl bg-heritage-gold px-5 py-3 text-xs font-bold uppercase tracking-wider text-heritage-forest transition hover:bg-heritage-beige"
          >
            <PenLine size={14} /> Write a review
          </button>
        </div>
      </section>

      {!hasLoaded ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-heritage-gold"></div>
        </div>
      ) : published.length === 0 ? (
        <section className="rounded-3xl border border-heritage-gold/20 bg-heritage-cream p-10 text-center">
          <h2 className="font-serif text-2xl font-semibold text-heritage-green">
            No reviews yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-heritage-ink/70">
            Be the first to share how your heritage outfit turned out.
          </p>
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-heritage-green px-5 py-3 text-xs font-bold uppercase tracking-wider text-heritage-gold transition hover:bg-heritage-forest"
          >
            <PenLine size={14} /> Write the first review
          </button>
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {published.map((review) => (
            <CustomerReviewCard key={review.id} review={review} clamp={false} />
          ))}
        </section>
      )}

      <CustomerReviewForm
        open={isFormOpen}
        onClose={() => setIsFormOpen(false)}
      />
    </div>
  );
}
