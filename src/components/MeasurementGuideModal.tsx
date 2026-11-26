import { useEffect, useId, useRef, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Ruler,
  X,
} from "lucide-react";
import { useReturnFocusOnClose } from "./savedOrderDialogKeyboard";

export const MEASUREMENT_GUIDE_PDF_HREF =
  "/guides/odogwu-heritage-measurement-guide.pdf";
export const MEASUREMENT_GUIDE_PDF_IFRAME_SRC = `${MEASUREMENT_GUIDE_PDF_HREF}?v=2`;
export const MEASUREMENT_GUIDE_PDF_DOWNLOAD_FILENAME =
  "Odogwu-Heritage-Measurement-Guide.pdf";

export type MeasurementGuideChecklistCategoryId =
  | "generic"
  | "shirts"
  | "dresses"
  | "skirts"
  | "lower_body";

export interface MeasurementGuideChecklistSection {
  readonly id: MeasurementGuideChecklistCategoryId;
  readonly title: string;
  readonly subtitle: string;
  readonly items: readonly string[];
}

export const MEASUREMENT_GUIDE_CHECKLIST_SECTIONS: readonly MeasurementGuideChecklistSection[] =
  [
    {
      id: "generic",
      title: "Generic Body Lengths (All Garments)",
      subtitle: "Core full-body baseline lengths shared across garments",
      items: [
        "Total Height (Head to Feet)",
        "Head Top to Lower Neck (Backside)",
        "Lower Neck to Waist Length (Backside)",
        "Waist to Feet Length (Just Below Ankle)",
      ],
    },
    {
      id: "shirts",
      title: "Standard Shirt & Long Shirt",
      subtitle: "Upper-body and sleeve points for Standard Length and Long Length shirts",
      items: [
        "Head Circumference",
        "Neck Circumference",
        "Shoulder Length/Width",
        "Short Sleeve Length",
        "Long Sleeve Length",
        "Shirt Length (Standard or Long)",
        "Chest (Bust) Circumference",
        "Tummy (Belly Area) Circumference",
        "Bicep Circumference (fold arm to allow movement)",
        "Elbow Circumference (at ~30° bend)",
        "Arm Hole Circumference",
        "Wrist Circumference",
      ],
    },
    {
      id: "dresses",
      title: "Standard Dress & Long Dress",
      subtitle: "Upper-body, sleeve, bust-shaping, and dress-length points",
      items: [
        "Head Circumference",
        "Neck Circumference",
        "Shoulder Length/Width",
        "Sleeveless & Mid Sleeve Length",
        "Short Sleeve Length",
        "Long Sleeve Length",
        "Standard/Long Dress Length",
        "Chest (Bust) Circumference",
        "Tummy (Belly Area) Circumference",
        "Bicep Circumference (fold arm to allow movement)",
        "Elbow Circumference (at ~30° bend)",
        "Arm Hole Circumference",
        "Wrist Circumference",
        "Under Bust Circumference",
        "Hip Circumference (Dress)",
        "Mid-Shoulder to Bust Length (for square neck)",
        "Mid-Shoulder to Mid-Shoulder Width (for square neck)",
        "Shoulder to Under Bust Length (for tight design under bust)",
      ],
    },
    {
      id: "skirts",
      title: "Standard Skirt & Long Skirt",
      subtitle: "Waist, hip, length, and hem sweep points for Standard Skirt and Long Skirt",
      items: [
        "Waist Circumference",
        "Hip Circumference",
        "Waist-to-Hip Length",
        "Waist-to-Knee Length",
        "Waist-to-Just Above Knee Length",
        "Waist-to-Ankle Length (Long Skirt)",
        "Waist-to-Feet Bodyside Without Shoes (Long Skirt)",
        "Waist-to-Feet Backside Along Buttocks Without Shoes (Long Skirt)",
        "Bottom Circumference of Skirt (Hem Sweep)",
      ],
    },
    {
      id: "lower_body",
      title: "Trouser, Standard Nikka Shorts & Standard Bum Shorts",
      subtitle: "Lower-body circumferences, rise, and outseam lengths",
      items: [
        "Waist Circumference",
        "Hip Circumference",
        "Thigh Circumference",
        "Knee Circumference (Trouser & Standard Nikka Shorts)",
        "Ankle Horizontal & Diagonal Circumference (Trouser)",
        "Waist-to-Hip Length",
        "Waist-to-Thigh/Lap Length (Standard Bum Shorts)",
        "Waist-to-Crotch-Depth Length (Front Rise)",
        "Waist-to-Knee Length (Trouser)",
        "Waist-to-Just Above Knee Length (Standard Nikka Shorts)",
        "Waist-to-Ankle Length (Trouser)",
        "Waist-to-Feet Bodyside & Backside Without Shoes (Trouser)",
      ],
    },
  ];

type MeasurementGuideTab = "checklists" | "pdf";

export interface MeasurementGuideModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Accessible pop-up modal presenting the close-to-body measuring rules,
 * filterable garment checklists, and embedded 25-page illustrated PDF guide.
 */
export const MeasurementGuideModal = ({
  open,
  onClose,
}: MeasurementGuideModalProps) => {
  const titleId = useId();
  const checklistsTabId = useId();
  const pdfTabId = useId();
  const checklistsPanelId = useId();
  const pdfPanelId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const [activeTab, setActiveTab] = useState<MeasurementGuideTab>("checklists");
  const [selectedCategory, setSelectedCategory] = useState<
    "all" | MeasurementGuideChecklistCategoryId
  >("all");

  useReturnFocusOnClose(open);

  useEffect(() => {
    if (!open) return;
    setActiveTab("checklists");
    setSelectedCategory("all");
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    dialogRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  const visibleSections =
    selectedCategory === "all"
      ? MEASUREMENT_GUIDE_CHECKLIST_SECTIONS
      : MEASUREMENT_GUIDE_CHECKLIST_SECTIONS.filter(
          (section) => section.id === selectedCategory,
        );

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center p-2 sm:items-center sm:p-6"
      data-testid="measurement-guide-modal-overlay"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault?.();
          event.stopPropagation?.();
          onClose();
        }
      }}
    >
      <div
        aria-hidden="true"
        data-measurement-guide-backdrop="true"
        className="absolute inset-0 bg-heritage-ink/55 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="measurement-guide-modal"
        className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-heritage-gold/40 bg-white shadow-2xl outline-none"
      >
        <header
          data-measurement-guide-modal-header="true"
          className="sticky top-0 z-20 border-b border-heritage-gold/25 bg-white px-4 py-3.5 sm:px-6 sm:py-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-heritage-gold/30 bg-heritage-cream text-heritage-green">
                <BookOpen size={20} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-heritage-bronze">
                  Tailoring Reference
                </p>
                <h3
                  id={titleId}
                  className="font-serif text-lg font-extrabold text-heritage-green sm:text-xl"
                >
                  Measurement Guide &amp; How-To
                </h3>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href={MEASUREMENT_GUIDE_PDF_HREF}
                download={MEASUREMENT_GUIDE_PDF_DOWNLOAD_FILENAME}
                data-measurement-guide-modal-download="true"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-heritage-green bg-heritage-green px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
              >
                <Download size={14} aria-hidden="true" />
                <span>Download PDF</span>
              </a>
              <a
                href={MEASUREMENT_GUIDE_PDF_HREF}
                target="_blank"
                rel="noopener noreferrer"
                data-measurement-guide-modal-open-new-tab="true"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-heritage-green/25 bg-heritage-cream/50 px-3.5 py-2 text-xs font-bold text-heritage-green transition hover:border-heritage-gold hover:bg-heritage-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
              >
                <ExternalLink size={14} aria-hidden="true" />
                <span>Open Full PDF in New Tab</span>
              </a>
              <button
                type="button"
                aria-label="Close measurement guide"
                data-measurement-guide-modal-close="true"
                onClick={onClose}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-heritage-green/20 text-heritage-ink/70 transition hover:border-heritage-green/45 hover:bg-heritage-cream/40 hover:text-heritage-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div
            role="tablist"
            aria-label="Measurement guide views"
            className="mt-3 flex flex-wrap gap-2 border-t border-heritage-green/10 pt-3"
          >
            <button
              id={checklistsTabId}
              type="button"
              role="tab"
              aria-selected={activeTab === "checklists"}
              aria-controls={checklistsPanelId}
              data-measurement-guide-tab="checklists"
              onClick={() => setActiveTab("checklists")}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold ${
                activeTab === "checklists"
                  ? "border-heritage-green bg-heritage-green text-white shadow-sm"
                  : "border-heritage-green/20 bg-white text-heritage-green hover:border-heritage-gold/60 hover:bg-heritage-cream/40"
              }`}
            >
              <Ruler size={14} aria-hidden="true" />
              <span>Quick Reference &amp; Checklists</span>
            </button>
            <button
              id={pdfTabId}
              type="button"
              role="tab"
              aria-selected={activeTab === "pdf"}
              aria-controls={pdfPanelId}
              data-measurement-guide-tab="pdf"
              onClick={() => setActiveTab("pdf")}
              className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold ${
                activeTab === "pdf"
                  ? "border-heritage-green bg-heritage-green text-white shadow-sm"
                  : "border-heritage-green/20 bg-white text-heritage-green hover:border-heritage-gold/60 hover:bg-heritage-cream/40"
              }`}
            >
              <FileText size={14} aria-hidden="true" />
              <span>Illustrated PDF Guide (25 Pages)</span>
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-heritage-cream/25 p-4 sm:p-6">
          {activeTab === "checklists" ? (
            <div
              id={checklistsPanelId}
              role="tabpanel"
              aria-labelledby={checklistsTabId}
              data-measurement-guide-panel="checklists"
              className="space-y-5"
            >
              <section
                data-measurement-guide-close-to-body="true"
                className="rounded-2xl border border-heritage-gold/40 bg-heritage-cream/80 p-4 shadow-sm sm:p-5"
              >
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-heritage-bronze">
                  Close-to-Body Rule
                </p>
                <h4 className="mt-1 font-serif text-base font-extrabold text-heritage-green sm:text-lg">
                  How to take accurate close-to-body measurements
                </h4>
                <ul className="mt-3 grid gap-2 text-sm leading-relaxed font-semibold text-heritage-ink sm:grid-cols-2">
                  <li className="flex items-start gap-2 rounded-xl border border-heritage-gold/25 bg-white/85 px-3 py-2.5">
                    <CheckCircle2
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-heritage-gold"
                    />
                    <span>
                      Use a <strong className="font-extrabold">flexible measuring tape</strong>, keep it
                      level all around, and hold it{" "}
                      <strong className="font-extrabold">snug (not tight)</strong>.
                    </span>
                  </li>
                  <li className="flex items-start gap-2 rounded-xl border border-heritage-gold/25 bg-white/85 px-3 py-2.5">
                    <CheckCircle2
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-heritage-gold"
                    />
                    <span>
                      Stand straight and relax —{" "}
                      <strong className="font-extrabold">do not suck in your stomach</strong> while
                      measuring waist or tummy.
                    </span>
                  </li>
                  <li className="flex items-start gap-2 rounded-xl border border-heritage-gold/25 bg-white/85 px-3 py-2.5">
                    <CheckCircle2
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-heritage-gold"
                    />
                    <span>
                      <strong className="font-extrabold">Record measurements in inches</strong> (or switch
                      to centimetres using the unit toggle in the form).
                    </span>
                  </li>
                  <li className="flex items-start gap-2 rounded-xl border border-heritage-gold/25 bg-white/85 px-3 py-2.5">
                    <CheckCircle2
                      size={16}
                      aria-hidden="true"
                      className="mt-0.5 shrink-0 text-heritage-gold"
                    />
                    <span>
                      <strong className="font-extrabold">Circumference comfort allowance:</strong> place{" "}
                      <strong className="font-extrabold">
                        1–2 fingers (your index or middle finger, or both
                        fingers)
                      </strong>{" "}
                      inside the tape loop so the fit is comfortable.
                    </span>
                  </li>
                </ul>
              </section>

              <section
                data-measurement-guide-checklists="true"
                className="space-y-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="font-serif text-base font-extrabold text-heritage-green sm:text-lg">
                      Garment Category Checklists
                    </h4>
                    <p className="text-xs font-bold text-heritage-ink sm:text-sm">
                      Review the measurement points required across each garment
                      type, or switch to the Illustrated PDF Guide tab for photo
                      diagrams.
                    </p>
                  </div>
                </div>

                <div
                  role="group"
                  aria-label="Filter measurement checklists by garment category"
                  className="flex flex-wrap gap-2"
                >
                  <button
                    type="button"
                    aria-pressed={selectedCategory === "all"}
                    data-measurement-guide-filter="all"
                    onClick={() => setSelectedCategory("all")}
                    className={`min-h-9 rounded-full border px-3.5 py-1 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold ${
                      selectedCategory === "all"
                        ? "border-heritage-green bg-heritage-green text-white shadow-sm"
                        : "border-heritage-green/20 bg-white text-heritage-green hover:border-heritage-gold/60"
                    }`}
                  >
                    All Categories
                  </button>
                  {MEASUREMENT_GUIDE_CHECKLIST_SECTIONS.map((section) => {
                    const active = selectedCategory === section.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        aria-pressed={active}
                        data-measurement-guide-filter={section.id}
                        onClick={() => setSelectedCategory(section.id)}
                        className={`min-h-9 rounded-full border px-3.5 py-1 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold ${
                          active
                            ? "border-heritage-green bg-heritage-green text-white shadow-sm"
                            : "border-heritage-green/20 bg-white text-heritage-green hover:border-heritage-gold/60"
                        }`}
                      >
                        {section.title}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-4">
                  {visibleSections.map((section) => (
                    <article
                      key={section.id}
                      data-measurement-guide-section={section.id}
                      className="rounded-2xl border border-heritage-gold/25 bg-white p-4 shadow-sm sm:p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h5 className="font-serif text-base font-extrabold text-heritage-green">
                            {section.title}
                          </h5>
                          <p className="mt-0.5 text-xs font-bold text-heritage-ink/90">
                            {section.subtitle}
                          </p>
                        </div>
                        <span className="rounded-full border border-heritage-gold/40 bg-heritage-cream/60 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-heritage-bronze">
                          {section.items.length} points
                        </span>
                      </div>
                      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                        {section.items.map((item, index) => (
                          <li
                            key={item}
                            className="flex items-start gap-2.5 rounded-xl border border-heritage-green/10 bg-heritage-cream/30 px-3 py-2 text-sm font-bold leading-snug text-heritage-ink"
                          >
                            <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-heritage-green/10 text-[10px] font-extrabold text-heritage-green">
                              {index + 1}
                            </span>
                            <span className="pt-0.5">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            <div
              id={pdfPanelId}
              role="tabpanel"
              aria-labelledby={pdfTabId}
              data-measurement-guide-panel="pdf"
              className="space-y-4"
            >
              <div className="flex flex-col gap-3 rounded-2xl border border-heritage-gold/35 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-heritage-bronze">
                    Complete 25-Page Illustrated PDF
                  </p>
                  <p className="mt-1 text-sm font-bold leading-relaxed text-heritage-ink">
                    Browse garment tables (pages 1–2), close-to-body photo
                    diagrams (pages 3–24), and the master overview matrix (page
                    25). On mobile browsers that restrict inline PDF scrolling,
                    use{" "}
                    <strong className="font-extrabold">Open Full PDF in New Tab</strong> or{" "}
                    <strong className="font-extrabold">Download PDF</strong>.
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <a
                    href={MEASUREMENT_GUIDE_PDF_HREF}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-heritage-green/30 bg-heritage-cream/60 px-3.5 py-2 text-xs font-bold text-heritage-green transition hover:border-heritage-gold hover:bg-heritage-cream"
                  >
                    <ExternalLink size={14} aria-hidden="true" />
                    <span>Open Full PDF</span>
                  </a>
                  <a
                    href={MEASUREMENT_GUIDE_PDF_HREF}
                    download={MEASUREMENT_GUIDE_PDF_DOWNLOAD_FILENAME}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-heritage-green px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-heritage-forest"
                  >
                    <Download size={14} aria-hidden="true" />
                    <span>Download PDF</span>
                  </a>
                </div>
              </div>

              <iframe
                src={MEASUREMENT_GUIDE_PDF_IFRAME_SRC}
                title="Odogwu Heritage Illustrated Measurement Guide"
                data-measurement-guide-iframe="true"
                className="h-[65vh] min-h-[420px] w-full rounded-2xl border border-heritage-green/20 bg-white shadow-inner"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
