import { useMemo, useState } from "react";
import { Eye, EyeOff, Star, Trash2 } from "lucide-react";
import { StorageService } from "../services/storageService";
import { useAppStore } from "../store/useAppStore";
import type { CustomerReview } from "../types";
import {
  CUSTOMER_REVIEW_FEATURED_CAP,
  SEED_CUSTOMER_REVIEWS,
  canFeatureReview,
  countFeaturedReviews,
  sortReviewsNewestFirst,
} from "../utils/customerReviews";
import { ReviewStars } from "./CustomerReviewCard";

function formatCreatedAt(createdAt: string): string {
  if (!createdAt) return "—";
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function AdminReviewsPanel() {
  const reviews = useAppStore((state) => state.adminCustomerReviews);
  const [message, setMessage] = useState<{
    text: string;
    tone: "success" | "error";
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = useMemo(() => sortReviewsNewestFirst(reviews), [reviews]);
  const featuredCount = countFeaturedReviews(reviews);
  const missingSeeds = SEED_CUSTOMER_REVIEWS.filter(
    (seed) => !reviews.some((review) => review.id === seed.id),
  );

  const run = async (id: string, action: () => Promise<void>, done: string) => {
    setBusyId(id);
    setMessage(null);
    try {
      await action();
      setMessage({ text: done, tone: "success" });
    } catch (error) {
      console.error("Review admin action failed:", error);
      setMessage({ text: "That change could not be saved.", tone: "error" });
    } finally {
      setBusyId(null);
    }
  };

  const toggleStatus = (review: CustomerReview) =>
    run(
      review.id,
      () =>
        StorageService.updateCustomerReview(review.id, {
          status: review.status === "published" ? "hidden" : "published",
        }),
      review.status === "published" ? "Review hidden." : "Review published.",
    );

  const toggleFeatured = (review: CustomerReview) => {
    if (!review.featured && !canFeatureReview(reviews, review.id)) {
      setMessage({
        text: `Only ${CUSTOMER_REVIEW_FEATURED_CAP} reviews can be featured. Unfeature one first.`,
        tone: "error",
      });
      return;
    }
    void run(
      review.id,
      () =>
        StorageService.updateCustomerReview(review.id, {
          featured: !review.featured,
        }),
      review.featured ? "Review unfeatured." : "Review featured.",
    );
  };

  const saveDisplayOrder = (review: CustomerReview, raw: string) => {
    const next = Number(raw);
    if (!Number.isInteger(next) || next === review.displayOrder) return;
    void run(
      review.id,
      () => StorageService.updateCustomerReview(review.id, { displayOrder: next }),
      "Display order saved.",
    );
  };

  const remove = (review: CustomerReview) => {
    if (
      !window.confirm(
        `Delete the review from ${review.authorName}? This cannot be undone.`,
      )
    ) {
      return;
    }
    void run(
      review.id,
      () => StorageService.deleteCustomerReview(review.id),
      "Review deleted.",
    );
  };

  const addStarterReviews = () => {
    let featuredSlots = CUSTOMER_REVIEW_FEATURED_CAP - featuredCount;
    const seeds = missingSeeds.map((seed) => {
      const featured = featuredSlots > 0;
      if (featured) featuredSlots -= 1;
      return { ...seed, featured };
    });
    return run(
      "seed",
      () => StorageService.seedCustomerReviews(seeds),
      "Starter reviews added.",
    );
  };

  const actionClass =
    "inline-flex items-center gap-1 rounded-lg border border-heritage-gold/25 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-heritage-green hover:bg-heritage-gold/10 disabled:opacity-40";

  return (
    <div className="space-y-6 text-left">
      <div className="rounded-2xl border border-heritage-gold/20 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold text-heritage-green">
              Customer Reviews
            </h2>
            <p className="text-xs text-heritage-ink/60">
              {reviews.length} total · {featuredCount}/
              {CUSTOMER_REVIEW_FEATURED_CAP} featured on the homepage
            </p>
          </div>
          {missingSeeds.length > 0 && (
            <button
              type="button"
              onClick={() => void addStarterReviews()}
              disabled={busyId !== null}
              className="rounded-xl bg-heritage-green px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-heritage-gold hover:bg-heritage-forest disabled:opacity-50"
            >
              Add {missingSeeds.length} starter{" "}
              {missingSeeds.length === 1 ? "review" : "reviews"}
            </button>
          )}
        </div>

        {message && (
          <p
            role="status"
            className={`mb-4 text-xs font-semibold ${
              message.tone === "success" ? "text-heritage-green" : "text-red-700"
            }`}
          >
            {message.text}
          </p>
        )}

        {sorted.length === 0 ? (
          <p className="text-sm text-heritage-ink/60">No reviews yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b border-heritage-gold/20 text-[10px] uppercase tracking-wider text-heritage-ink/60">
                <tr>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Rating</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Featured</th>
                  <th className="py-2 pr-3">Order</th>
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((review) => (
                  <tr
                    key={review.id}
                    className="border-b border-heritage-gold/10 align-top"
                  >
                    <td className="max-w-[220px] py-3 pr-3">
                      <strong className="block text-heritage-green">
                        {review.authorName}
                      </strong>
                      {review.location && (
                        <span className="block text-[10px] text-heritage-ink/50">
                          {review.location}
                        </span>
                      )}
                      <span
                        className="mt-1 block line-clamp-2 text-[11px] text-heritage-ink/70"
                        title={review.body}
                      >
                        {review.body}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <ReviewStars rating={review.rating} size={12} />
                    </td>
                    <td className="py-3 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          review.status === "published"
                            ? "bg-heritage-green/10 text-heritage-green"
                            : "bg-heritage-beige/40 text-heritage-ink/60"
                        }`}
                      >
                        {review.status}
                      </span>
                    </td>
                    <td className="py-3 pr-3">{review.featured ? "Yes" : "No"}</td>
                    <td className="py-3 pr-3">
                      <input
                        type="number"
                        step={1}
                        defaultValue={review.displayOrder}
                        key={`${review.id}-${review.displayOrder}`}
                        onBlur={(event) =>
                          saveDisplayOrder(review, event.target.value)
                        }
                        aria-label={`Display order for ${review.authorName}`}
                        className="w-16 rounded-lg border border-heritage-gold/25 px-2 py-1"
                        disabled={busyId !== null}
                      />
                    </td>
                    <td className="whitespace-nowrap py-3 pr-3 text-heritage-ink/60">
                      {formatCreatedAt(review.createdAt)}
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => void toggleStatus(review)}
                          disabled={busyId !== null}
                          className={actionClass}
                        >
                          {review.status === "published" ? (
                            <>
                              <EyeOff size={12} /> Hide
                            </>
                          ) : (
                            <>
                              <Eye size={12} /> Publish
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleFeatured(review)}
                          disabled={busyId !== null}
                          className={actionClass}
                        >
                          <Star size={12} />
                          {review.featured ? "Unfeature" : "Feature"}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(review)}
                          disabled={busyId !== null}
                          className={`${actionClass} text-red-700`}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
