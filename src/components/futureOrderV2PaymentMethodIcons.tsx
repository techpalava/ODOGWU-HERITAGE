import type { ReactNode } from "react";

/** Compact marks for the Stage 10 method pills and the test-card hint. */

const METHOD_ICON_CLASS = "h-3.5 w-auto shrink-0";
const CARD_BRAND_CLASS = "h-4 w-auto shrink-0";

function CardMethodGlyph() {
  return (
    <svg viewBox="0 0 24 16" className={METHOD_ICON_CLASS} aria-hidden="true">
      <rect
        x="1.1"
        y="1.1"
        width="21.8"
        height="13.8"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect x="3.2" y="4" width="4.4" height="3" rx="0.5" fill="#C5A85C" />
      <path
        d="M3.3 11.3h7.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IdealMethodGlyph() {
  return (
    <svg viewBox="0 0 30 16" className={METHOD_ICON_CLASS} aria-hidden="true">
      <rect width="30" height="16" rx="3" fill="#D20A62" />
      <rect x="6" y="3.5" width="2.15" height="9" rx="0.4" fill="#fff" />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M12.1 3.5h4.5c2.55 0 4.25 1.75 4.25 4.5S19.15 12.5 16.6 12.5h-4.5V3.5zm2.15 1.85v5.3h2.2c1.35 0 2.2-.95 2.2-2.65s-.85-2.65-2.2-2.65h-2.2z"
      />
    </svg>
  );
}

function KlarnaMethodGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <rect width="16" height="16" rx="3.5" fill="#FFB3C7" />
      <path
        fill="#141414"
        d="M4.1 3.1h2.2v3.75l3.1-3.75h2.5L7.95 8l4.15 4.9h-2.55L6.3 8.95v3.95H4.1V3.1z"
      />
    </svg>
  );
}

/** Pix teal diamond mark, sized like the Klarna square. */
function PixMethodGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <rect
        x="3.05"
        y="3.05"
        width="9.9"
        height="9.9"
        rx="2.2"
        transform="rotate(45 8 8)"
        fill="#32BCAD"
      />
      <path
        d="M5.3 8 8 5.3 10.7 8 8 10.7z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BrandPlate({
  children,
  brand,
  width,
  fill,
  stroke = "#C5A85C",
}: {
  children: ReactNode;
  brand: "visa" | "mastercard" | "amex";
  width: number;
  fill: string;
  stroke?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${width} 16`}
      className={CARD_BRAND_CLASS}
      data-future-order-v2-allowed-card-icon={brand}
      aria-hidden="true"
    >
      <rect
        x="0.6"
        y="0.6"
        width={width - 1.2}
        height="14.8"
        rx="2.4"
        fill={fill}
        stroke={stroke}
        strokeWidth="1"
      />
      {children}
    </svg>
  );
}

function VisaBrandGlyph() {
  return (
    <BrandPlate brand="visa" width={40} fill="#F7F4EC">
      <text
        x="20"
        y="11.15"
        textAnchor="middle"
        fill="#1A1F71"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="8.5"
        fontStyle="italic"
        fontWeight="800"
        letterSpacing="0.4"
      >
        VISA
      </text>
    </BrandPlate>
  );
}

function MastercardBrandGlyph() {
  return (
    <BrandPlate brand="mastercard" width={34} fill="#F7F4EC">
      <circle cx="14.2" cy="8" r="4.15" fill="#EB001B" />
      <circle cx="19.8" cy="8" r="4.15" fill="#F79E1B" />
      <path
        fill="#FF5F00"
        d="M17 4.55a4.15 4.15 0 0 1 0 6.9 4.15 4.15 0 0 1 0-6.9z"
      />
    </BrandPlate>
  );
}

function AmexBrandGlyph() {
  return (
    <BrandPlate brand="amex" width={40} fill="#1F72CD" stroke="#F7F4EC">
      <text
        x="20"
        y="11.05"
        textAnchor="middle"
        fill="#fff"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="7.6"
        fontWeight="800"
        letterSpacing="0.6"
      >
        AMEX
      </text>
    </BrandPlate>
  );
}

export function FutureOrderV2MethodIcon({
  method,
}: {
  method: "card" | "ideal" | "klarna" | "pix";
}) {
  return (
    <span
      data-future-order-v2-method-icon={method}
      aria-hidden="true"
      className="inline-flex shrink-0 items-center"
    >
      {method === "card" ? (
        <CardMethodGlyph />
      ) : method === "ideal" ? (
        <IdealMethodGlyph />
      ) : method === "pix" ? (
        <PixMethodGlyph />
      ) : (
        <KlarnaMethodGlyph />
      )}
    </span>
  );
}

export function FutureOrderV2AllowedCardIcons() {
  return (
    <div
      data-future-order-v2-allowed-card-icons
      aria-hidden="true"
      className="flex items-center gap-1.5"
    >
      <VisaBrandGlyph />
      <MastercardBrandGlyph />
      <AmexBrandGlyph />
    </div>
  );
}
