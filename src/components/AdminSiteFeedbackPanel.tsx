import { useEffect, useState } from "react";
import { ExternalLink, ImageOff, MessageSquare } from "lucide-react";
import {
  SITE_FEEDBACK_TYPE_LABELS,
  isSiteFeedbackType,
  siteFeedbackNationalityLabel,
} from "../utils/siteFeedback";

/** One `site_feedback` document, as the admin list shows it. */
export interface SiteFeedbackAdminEntry {
  id: string;
  type: string;
  message: string;
  email: string | null;
  nationality: string | null;
  photoPath: string | null;
  page: string;
  tab: string;
  studioStep: string | null;
  viewport: string;
  userAgent: string;
  uid: string | null;
  status: string;
  /** Milliseconds since epoch, or null while the server timestamp is pending. */
  createdAtMs: number | null;
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const strOrNull = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

/** Parses a raw Firestore document defensively (v1 and v2 documents). */
export function toSiteFeedbackAdminEntry(
  id: string,
  data: Record<string, unknown>,
): SiteFeedbackAdminEntry {
  const createdAt = data.createdAt as { toMillis?: () => number } | null | undefined;
  return {
    id,
    type: str(data.type),
    message: str(data.message),
    email: strOrNull(data.email),
    nationality: strOrNull(data.nationality),
    photoPath: strOrNull(data.photoPath),
    page: str(data.page),
    tab: str(data.tab),
    studioStep: strOrNull(data.studioStep),
    viewport: str(data.viewport),
    userAgent: str(data.userAgent),
    uid: strOrNull(data.uid),
    status: str(data.status) || "new",
    createdAtMs:
      createdAt && typeof createdAt.toMillis === "function" ? createdAt.toMillis() : null,
  };
}

function formatWhen(ms: number | null): string {
  if (ms === null) return "Just now";
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

type ResolvePhotoUrl = (path: string) => Promise<string>;

function FeedbackPhoto({ path, resolvePhotoUrl }: { path: string; resolvePhotoUrl: ResolvePhotoUrl }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    resolvePhotoUrl(path)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch((error) => {
        console.error("Feedback photo could not be loaded:", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path, resolvePhotoUrl]);

  if (failed) {
    return (
      <span className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-heritage-gold/30 bg-heritage-cream text-[10px] text-heritage-ink/60">
        <ImageOff aria-hidden="true" size={18} />
        Photo unavailable
      </span>
    );
  }
  if (!url) {
    return <span className="h-24 w-24 shrink-0 animate-pulse rounded-xl bg-heritage-cream" aria-label="Loading photo" />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      data-site-feedback-admin-photo="true"
      className="group relative block h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-heritage-gold/40"
      title="Open full size"
    >
      <img src={url} alt="Feedback photo" className="h-full w-full object-cover" />
      <span className="absolute bottom-1 right-1 rounded-full bg-white/90 p-1 text-heritage-green opacity-0 transition group-hover:opacity-100">
        <ExternalLink aria-hidden="true" size={12} />
      </span>
    </a>
  );
}

/** View-only list of site feedback, newest first. */
export function SiteFeedbackAdminList({
  entries,
  resolvePhotoUrl,
  loading = false,
  error = null,
}: {
  entries: readonly SiteFeedbackAdminEntry[];
  resolvePhotoUrl: ResolvePhotoUrl;
  loading?: boolean;
  error?: string | null;
}) {
  return (
    <div className="space-y-5 text-left" data-site-feedback-admin="true">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-heritage-green text-heritage-gold">
          <MessageSquare aria-hidden="true" size={16} />
        </span>
        <div>
          <h3 className="font-serif text-xl font-semibold text-heritage-green">Site Feedback</h3>
          <p className="text-xs text-heritage-ink/60">
            Messages from the Feedback button, newest first (latest 100).
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {loading && !error && <p className="text-sm text-heritage-ink/60">Loading feedback…</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="text-sm text-heritage-ink/60">No feedback yet.</p>
      )}

      <ul className="space-y-3">
        {entries.map((entry) => {
          const typeLabel = isSiteFeedbackType(entry.type)
            ? SITE_FEEDBACK_TYPE_LABELS[entry.type]
            : entry.type || "—";
          const nationalityLabel = siteFeedbackNationalityLabel(entry.nationality);
          return (
            <li
              key={entry.id}
              data-site-feedback-admin-entry={entry.id}
              className="rounded-2xl border border-heritage-gold/25 bg-heritage-cream/40 p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="rounded-full bg-heritage-green px-2.5 py-0.5 font-bold uppercase tracking-wider text-heritage-gold">
                  {typeLabel}
                </span>
                <span className="text-heritage-ink/60">{formatWhen(entry.createdAtMs)}</span>
                {nationalityLabel && (
                  <span
                    data-site-feedback-admin-nationality={entry.nationality ?? ""}
                    className="rounded-full border border-heritage-gold/40 bg-white px-2.5 py-0.5 font-semibold text-heritage-green"
                  >
                    {nationalityLabel}
                  </span>
                )}
                {entry.email && (
                  <a href={`mailto:${entry.email}`} className="font-semibold text-heritage-green underline">
                    {entry.email}
                  </a>
                )}
              </div>
              <div className="mt-3 flex gap-4">
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-heritage-ink">
                  {entry.message}
                </p>
                {entry.photoPath && (
                  <FeedbackPhoto path={entry.photoPath} resolvePhotoUrl={resolvePhotoUrl} />
                )}
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-[11px] text-heritage-ink/60 sm:grid-cols-2">
                <div className="min-w-0 truncate"><dt className="inline font-semibold">Page: </dt><dd className="inline">{entry.page || "—"}</dd></div>
                <div className="min-w-0 truncate"><dt className="inline font-semibold">Tab: </dt><dd className="inline">{entry.tab || "—"}{entry.studioStep ? ` · ${entry.studioStep}` : ""}</dd></div>
                <div className="min-w-0 truncate"><dt className="inline font-semibold">Screen: </dt><dd className="inline">{entry.viewport || "—"}</dd></div>
                <div className="min-w-0 truncate"><dt className="inline font-semibold">Signed in: </dt><dd className="inline">{entry.uid ? "Yes" : "No"}</dd></div>
                <div className="min-w-0 truncate sm:col-span-2" title={entry.userAgent}><dt className="inline font-semibold">Browser: </dt><dd className="inline">{entry.userAgent || "—"}</dd></div>
              </dl>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const resolveStoragePhotoUrl: ResolvePhotoUrl = async (path) => {
  const [{ getDownloadURL, ref }, { storage }] = await Promise.all([
    import("firebase/storage"),
    import("../services/firebase"),
  ]);
  return getDownloadURL(ref(storage, path));
};

/** Admin Portal page: live `site_feedback` list (rules: admins only). */
export default function AdminSiteFeedbackPanel() {
  const [entries, setEntries] = useState<SiteFeedbackAdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      const [{ collection, limit, onSnapshot, orderBy, query }, { db }] = await Promise.all([
        import("firebase/firestore"),
        import("../services/firebase"),
      ]);
      if (cancelled) return;
      unsubscribe = onSnapshot(
        query(collection(db, "site_feedback"), orderBy("createdAt", "desc"), limit(100)),
        (snapshot) => {
          setEntries(
            snapshot.docs.map((doc) =>
              toSiteFeedbackAdminEntry(doc.id, doc.data({ serverTimestamps: "estimate" }) as Record<string, unknown>),
            ),
          );
          setLoading(false);
          setError(null);
        },
        (listenError) => {
          console.error("Site feedback could not be loaded:", listenError);
          setError("Site feedback could not be loaded. Check that you are signed in as an admin.");
          setLoading(false);
        },
      );
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  return (
    <SiteFeedbackAdminList
      entries={entries}
      resolvePhotoUrl={resolveStoragePhotoUrl}
      loading={loading}
      error={error}
    />
  );
}
