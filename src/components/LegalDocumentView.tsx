import React from "react";
import { FileText, ShieldCheck } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import type { LegalPageTab } from "../utils/legalPages";

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  /** Paragraphs shown after the bullet list. */
  after?: string[];
}

export interface LegalDocument {
  kind: LegalPageTab;
  title: string;
  intro: string;
  lastUpdated: string;
  sections: LegalSection[];
}

/** Square-bracket placeholders ([CONTACT EMAIL]) stand out until filled in. */
const PLACEHOLDER_PATTERN = /(\[[A-Z0-9][A-Z0-9 ,./&'()-]*\])/g;

const withPlaceholders = (text: string): React.ReactNode =>
  text.split(PLACEHOLDER_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <mark
        key={index}
        data-legal-placeholder={part}
        className="rounded bg-heritage-gold/25 px-1 font-semibold text-heritage-green"
      >
        {part}
      </mark>
    ) : (
      <React.Fragment key={index}>{part}</React.Fragment>
    ),
  );

export default function LegalDocumentView({
  document: legalDocument,
}: {
  document: LegalDocument;
}) {
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const other: LegalPageTab =
    legalDocument.kind === "privacy" ? "terms" : "privacy";
  const otherLabel =
    other === "privacy" ? "Privacy Policy" : "Terms & Conditions";
  const Icon = legalDocument.kind === "privacy" ? ShieldCheck : FileText;

  return (
    <article
      className="max-w-3xl mx-auto font-sans py-4 space-y-8"
      aria-labelledby={`${legalDocument.kind}-title`}
    >
      <header className="text-center space-y-4">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1 bg-heritage-gold/15 text-heritage-gold border border-heritage-gold/25 rounded-full text-[10px] font-bold uppercase tracking-widest">
          <Icon size={12} aria-hidden="true" /> The Odogwu Heritage
        </span>
        <h1
          id={`${legalDocument.kind}-title`}
          className="text-3xl sm:text-5xl font-serif font-semibold text-heritage-green leading-none tracking-tight"
        >
          {legalDocument.title}
        </h1>
        <p className="text-xs font-semibold uppercase tracking-widest text-heritage-ink/60">
          Last updated: {withPlaceholders(legalDocument.lastUpdated)}
        </p>
        <p className="text-sm text-heritage-ink/75 max-w-2xl mx-auto leading-relaxed">
          {withPlaceholders(legalDocument.intro)}
        </p>
      </header>

      <nav
        aria-label="On this page"
        className="rounded-2xl border border-heritage-gold/20 bg-heritage-cream/30 p-5"
      >
        <p className="text-[10px] font-bold uppercase tracking-widest text-heritage-gold mb-2">
          On this page
        </p>
        <ol className="grid gap-1 sm:grid-cols-2 text-sm text-heritage-green list-decimal list-inside">
          {legalDocument.sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  window.document
                    .getElementById(section.id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="hover:text-heritage-gold underline-offset-2 hover:underline"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="rounded-3xl border border-heritage-gold/20 bg-white p-6 sm:p-10 shadow-sm space-y-8">
        {legalDocument.sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-heading`}
            className="scroll-mt-28 space-y-3"
          >
            <h2
              id={`${section.id}-heading`}
              className="text-xl font-serif font-semibold text-heritage-green"
            >
              {index + 1}. {section.title}
            </h2>
            {section.paragraphs?.map((paragraph, i) => (
              <p
                key={i}
                className="text-sm leading-relaxed text-heritage-ink/80"
              >
                {withPlaceholders(paragraph)}
              </p>
            ))}
            {section.bullets && (
              <ul className="list-disc pl-5 space-y-1.5 text-sm leading-relaxed text-heritage-ink/80 marker:text-heritage-gold">
                {section.bullets.map((bullet, i) => (
                  <li key={i}>{withPlaceholders(bullet)}</li>
                ))}
              </ul>
            )}
            {section.after?.map((paragraph, i) => (
              <p
                key={i}
                className="text-sm leading-relaxed text-heritage-ink/80"
              >
                {withPlaceholders(paragraph)}
              </p>
            ))}
          </section>
        ))}
      </div>

      <p className="text-center text-sm text-heritage-ink/70">
        See also our{" "}
        <a
          href={other === "privacy" ? "/privacy" : "/terms"}
          onClick={(event) => {
            event.preventDefault();
            setActiveTab(other);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="font-semibold text-heritage-green underline underline-offset-2 hover:text-heritage-gold"
        >
          {otherLabel}
        </a>
        .
      </p>
    </article>
  );
}
