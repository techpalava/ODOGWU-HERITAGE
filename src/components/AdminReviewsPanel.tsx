import { useEffect, useMemo, useState } from "react";
import { Check, Eye, EyeOff, ImageOff, Star, Trash2 } from "lucide-react";
import {
  approveReviewPhoto,
  deleteReviewPhotoFiles,
  rejectReviewPhoto,
  resolveReviewPhotoUrl,
} from "../services/customerReviewPhotoService";
import { StorageService } from "../services/storageService";
import { useAppStore } from "../store/useAppStore";
import type { CustomerReview } from "../types";
import {
  CUSTOMER_REVIEW_FEATURED_CAP,
  SEED_CUSTOMER_REVIEWS,
  canFeatureReview,
  countFeaturedReviews,
  filterReviewsWithPendingPhotos,
  formatReviewNationalities,
  hasPendingReviewPhoto,
  sortReviewsNewestFirst,
} from "../utils/customerReviews";
import { ReviewPhotoLightbox, ReviewStars } from "./CustomerReviewCard";

/** Photo moderation hooks, injectable for tests. */
export interface AdminReviewPhotoActions {
  resolvePhotoUrl(path: string): Promise<string>;
  approve(review: CustomerReview): Promise<unknown>;
  reject(review: CustomerReview): Promise<void>;
  deleteFiles(review: CustomerReview): Promise<void>;
}

const defaultPhotoActions: AdminReviewPhotoActions = {
  resolvePhotoUrl: (path) => resolveReviewPhotoUrl(path),
  approve: (review) => approveReviewPhoto(review),
  reject: (review) => rejectReviewPhoto(review),
  deleteFiles: (review) => deleteReviewPhotoFiles(review),
};

function AdminReviewPhotoThumb({
  review,
  resolvePhotoUrl,
}: {
  review: CustomerReview;
  resolvePhotoUrl: AdminReviewPhotoActions["resolvePhotoUrl"];
}) {
  const approvedUrl =
    review.photoStatus === "approved" && review.photoUrl ? review.photoUrl : null;
  const [url, setUrl] = useState<string | null>(approvedUrl);
  const [failed, setFailed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const path = review.photoPath;

  useEffect(() => {
    if (approvedUrl) {
      setUrl(approvedUrl);
      return;
    }
    if (!path) return;
    let cancelled = false;
    setFailed(false);
    resolvePhotoUrl(path)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch((error) => {
        console.error("Review photo could not be loaded:", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [approvedUrl, path, resolvePhotoUrl]);

  const pending = review.photoStatus !== "approved";
  return (
    <div className="mt-2 flex items-center gap-2" data-admin-review-photo={review.photoStatus ?? "pending"}>
      {url ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={`View photo from ${review.authorName}`}
          className="shrink-0 overflow-hidden rounded-lg border border-heritage-gold/25"
        >
          <img
            src={url}
            alt={`Photo from ${review.authorName}`}
            data-admin-review-photo-thumb="true"
            className="h-14 w-14 object-cover"
          />
        </button>
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-heritage-gold/25 bg-heritage-cream text-[9px] text-heritage-ink/50">
          {failed ? "Unavailable" : "Loading…"}
        </div>
      )}
      <span
        className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
          pending
            ? "bg-amber-100 text-amber-800"
            : "bg-heritage-green/10 text-heritage-green"
        }`}
      >
        {pending ? "Photo under review" : "Photo approved"}
      </span>
      {url && isOpen && (
        <ReviewPhotoLightbox
          src={url}
          alt={`Photo from ${review.authorName}`}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

function formatCreatedAt(createdAt: string): string {
  if (!createdAt) return "—";
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

export default function AdminReviewsPanel({
  photoActions = defaultPhotoActions,
}: {
  photoActions?: AdminReviewPhotoActions;
} = {}) {
  const reviews = useAppStore((state) => state.adminCustomerReviews);
  const [filter, setFilter] = useState<"all" | "photos-pending">("all");
  const [message, setMessage] = useState<{
    text: string;
    tone: "success" | "error";
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingPhotoCount = filterReviewsWithPendingPhotos(reviews).length;
  const sorted = useMemo(
    () =>
      sortReviewsNewestFirst(
        filter === "photos-pending" ? filterReviewsWithPendingPhotos(reviews) : reviews,
      ),
    [reviews, filter],
  );
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
      async () => {
        await StorageService.deleteCustomerReview(review.id);
        if (review.photoPath) {
          // Best effort: the review is gone either way.
          await photoActions.deleteFiles(review).catch((error) => {
            console.error("Review photo files could not be deleted:", error);
          });
        }
      },
      "Review deleted.",
    );
  };

  const approvePhoto = (review: CustomerReview) =>
    void run(
      review.id,
      async () => {
        await photoActions.approve(review);
      },
      "Photo approved. It now shows with the review.",
    );

  const rejectPhoto = (review: CustomerReview) => {
    if (
      !window.confirm(
        `Reject and delete the photo from ${review.authorName}? The review text stays.`,
      )
    ) {
      return;
    }
    void run(
      review.id,
      () => photoActions.reject(review),
      "Photo rejected and deleted.",
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

        <div
          className="mb-4 flex flex-wrap gap-2"
          role="group"
          aria-label="Filter reviews"
        >
          {(
            [
              ["all", "All reviews"],
              ["photos-pending", `Photos under review (${pendingPhotoCount})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              data-admin-review-filter={value}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                filter === value
                  ? "border-heritage-green bg-heritage-green text-heritage-gold"
                  : "border-heritage-gold/30 text-heritage-green hover:bg-heritage-gold/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {sorted.length === 0 ? (
          <p className="text-sm text-heritage-ink/60">
            {filter === "photos-pending" ? "No photos waiting for review." : "No reviews yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead className="border-b border-heritage-gold/20 text-[10px] uppercase tracking-wider text-heritage-ink/60">
                <tr>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Nationality</th>
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
                      {review.photoPath && (
                        <AdminReviewPhotoThumb
                          review={review}
                          resolvePhotoUrl={photoActions.resolvePhotoUrl}
                        />
                      )}
                    </td>
                    <td
                      className="max-w-[160px] py-3 pr-3 text-heritage-ink/70"
                      data-admin-review-nationality={[
                        review.nationality,
                        review.secondNationality,
                      ]
                        .filter(Boolean)
                        .join("/")}
                    >
                      {formatReviewNationalities(review) || "—"}
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
                        {hasPendingReviewPhoto(review) && (
                          <button
                            type="button"
                            data-admin-review-approve-photo="true"
                            onClick={() => approvePhoto(review)}
                            disabled={busyId !== null}
                            className={actionClass}
                          >
                            <Check size={12} /> Approve photo
                          </button>
                        )}
                        {review.photoPath && (
                          <button
                            type="button"
                            data-admin-review-reject-photo="true"
                            onClick={() => rejectPhoto(review)}
                            disabled={busyId !== null}
                            className={`${actionClass} text-red-700`}
                          >
                            <ImageOff size={12} /> Reject photo
                          </button>
                        )}
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
