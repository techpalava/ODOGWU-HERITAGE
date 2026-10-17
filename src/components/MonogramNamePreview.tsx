import type { FabricGarmentType, MonogramPlacement } from "../types";
import { DEFAULT_MONOGRAM_PLACEMENT } from "../utils/decorativePricing";

const DRESS_SILHOUETTE_TYPES = new Set<FabricGarmentType>([
  "dress",
  "full_length_gown",
  "skirt",
  "long_skirt",
]);

export const monogramPreviewSilhouette = (
  garmentType: FabricGarmentType,
): "shirt" | "dress" =>
  DRESS_SILHOUETTE_TYPES.has(garmentType) ? "dress" : "shirt";

/**
 * Front-view coordinates. Left Chest is the wearer's left, so it sits on the
 * right side of the drawing. Upper Back uses the same outline from behind.
 */
export const monogramPreviewLetteringPosition = (
  placement: MonogramPlacement,
  silhouette: "shirt" | "dress",
): { top: string; left: string; rotate: number } => {
  switch (placement) {
    case "right_chest":
      return { top: "46%", left: "36%", rotate: 0 };
    case "neckline":
      return { top: silhouette === "dress" ? "16%" : "18%", left: "50%", rotate: 0 };
    case "upper_back":
      return { top: "34%", left: "50%", rotate: 0 };
    case "cuff":
      return { top: "36%", left: "14%", rotate: -28 };
    case "hem":
      return { top: silhouette === "dress" ? "80%" : "74%", left: "50%", rotate: 0 };
    case "left_chest":
    default:
      return { top: "46%", left: "64%", rotate: 0 };
  }
};

const ShirtSilhouette = ({ back }: { back: boolean }) => (
  <svg viewBox="0 0 80 100" className="h-full w-full" aria-hidden="true">
    <path
      d="M28 18c0-7 24-7 24 0l6 3 16 12-8 12-8-6v47H22V39l-8 6-8-12 16-12 6-3z"
      fill="#F9F6F0"
      stroke="#0A291B"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    {back ? (
      <path d="M40 18v64" fill="none" stroke="#0A291B" strokeWidth="1" strokeDasharray="2 2" />
    ) : (
      <path d="M34 16l6 8 6-8" fill="none" stroke="#0A291B" strokeWidth="1.3" strokeLinejoin="round" />
    )}
  </svg>
);

const DressSilhouette = ({ back }: { back: boolean }) => (
  <svg viewBox="0 0 80 100" className="h-full w-full" aria-hidden="true">
    <path
      d="M31 15c0-6 18-6 18 0l5 2 13 9-6 10-7-5-1 14c2 14 16 32 18 42H9c2-10 16-28 18-42l-1-14-7 5-6-10 13-9 5-2z"
      fill="#F9F6F0"
      stroke="#0A291B"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    {back ? (
      <path d="M40 16v72" fill="none" stroke="#0A291B" strokeWidth="1" strokeDasharray="2 2" />
    ) : (
      <path d="M35 14l5 6 5-6" fill="none" stroke="#0A291B" strokeWidth="1.3" strokeLinejoin="round" />
    )}
  </svg>
);

export const MonogramNamePreview = ({
  garmentKey,
  garmentType,
  name,
  placement,
}: {
  garmentKey: string;
  garmentType: FabricGarmentType;
  name: string;
  placement?: MonogramPlacement;
}) => {
  const resolvedPlacement = placement ?? DEFAULT_MONOGRAM_PLACEMENT;
  const silhouette = monogramPreviewSilhouette(garmentType);
  const position = monogramPreviewLetteringPosition(resolvedPlacement, silhouette);
  const shown = name.trim();
  const empty = shown.length === 0;
  const lettering = empty ? "YOUR NAME" : shown;
  const back = resolvedPlacement === "upper_back";

  return (
    <div
      data-monogram-name-preview={garmentKey}
      data-monogram-preview-placement={resolvedPlacement}
      data-monogram-preview-silhouette={silhouette}
      data-monogram-preview-view={back ? "back" : "front"}
      data-monogram-preview-text={empty ? "" : shown}
      data-monogram-preview-placeholder={empty ? "true" : "false"}
      className="relative h-[4.75rem] w-[3.75rem] shrink-0 sm:h-24 sm:w-20"
      aria-hidden="true"
    >
      {silhouette === "dress" ? <DressSilhouette back={back} /> : <ShirtSilhouette back={back} />}
      <span
        data-monogram-preview-lettering="true"
        className={`pointer-events-none absolute max-w-[78%] truncate text-center font-display font-semibold uppercase leading-none tracking-[0.12em] ${
          empty ? "text-heritage-gold/40" : "text-heritage-gold"
        }`}
        style={{
          top: position.top,
          left: position.left,
          transform: `translate(-50%, -50%) rotate(${position.rotate}deg)`,
          fontSize: lettering.length > 8 ? "0.42rem" : "0.52rem",
          WebkitTextStroke: empty ? "0px transparent" : "0.35px #0A291B",
        }}
      >
        {lettering}
      </span>
      {back ? (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 font-sans text-[8px] font-bold uppercase tracking-wider text-heritage-green">
          Back
        </span>
      ) : null}
    </div>
  );
};
