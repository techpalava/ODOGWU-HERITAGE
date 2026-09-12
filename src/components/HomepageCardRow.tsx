import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const CARD_SCROLL_GAP_PX = 24;

export const homepageCardRowItemClassName =
  "snap-start shrink-0 w-[min(75vw,20rem)] sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-4.5rem)/4)]";

export default function HomepageCardRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateOverflow = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(maxScroll > 4 && el.scrollLeft < maxScroll - 4);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(el);
    window.addEventListener("resize", updateOverflow);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateOverflow);
    };
  }, [children, updateOverflow]);

  const scrollByCard = (direction: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>(":scope > *");
    const amount = card
      ? card.getBoundingClientRect().width + CARD_SCROLL_GAP_PX
      : el.clientWidth * 0.8;
    el.scrollBy({ left: direction * amount, behavior: "smooth" });
  };

  return (
    <div className="relative max-w-full px-4 sm:px-8">
      {canPrev ? (
        <button
          type="button"
          aria-label={`Previous ${label}`}
          onClick={() => scrollByCard(-1)}
          className="absolute left-1 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-heritage-gold/30 bg-white/95 text-heritage-green shadow-md transition hover:bg-heritage-gold hover:text-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold sm:left-2"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      ) : null}
      {canNext ? (
        <button
          type="button"
          aria-label={`Next ${label}`}
          onClick={() => scrollByCard(1)}
          className="absolute right-1 top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-heritage-gold/30 bg-white/95 text-heritage-green shadow-md transition hover:bg-heritage-gold hover:text-heritage-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-heritage-gold sm:right-2"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      ) : null}
      <div
        ref={scrollerRef}
        onScroll={updateOverflow}
        className="flex snap-x snap-mandatory gap-6 overflow-x-auto scroll-pl-1 scroll-pr-8 pb-8 pt-4 hide-scrollbar cursor-grab active:cursor-grabbing"
      >
        {children}
      </div>
    </div>
  );
}
