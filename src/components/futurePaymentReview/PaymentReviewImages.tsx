import { useImageLoadRetry } from "../../hooks/useImageLoadRetry";
import {
  buildOptimizedImageSources,
  DESIGN_STYLE_THUMB_IMAGE_PRESET,
  FABRIC_THUMB_IMAGE_PRESET,
} from "../../utils/optimizedImageUrl";
import { DesignStyleImage } from "../DesignStyleImage";
import { FabricPhotoReloadButton } from "../FabricPhotoReloadButton";
import type {
  FuturePaymentReviewPictureDesign,
  FuturePaymentReviewPictureFabric,
} from "../../utils/futurePaymentReviewPictures";

/**
 * Stage 10 picture tiles. Copied from the Stage 8 Summary renderers
 * (DormantFutureSummaryStep) so Stage 10 does not depend on the Summary file.
 * Every tile has a fixed aspect ratio, so loading never shifts the layout.
 * Failures are not reported to /api/client-image-error: the Summary step
 * already reports the same URLs.
 */

const TILE_FRAME =
  "relative w-full overflow-hidden rounded-lg border border-heritage-green/10 bg-heritage-cream/35";

export const PaymentReviewDesignImage = ({
  design,
  garmentLabel,
  aspectClassName = "aspect-[4/5]",
}: {
  design: FuturePaymentReviewPictureDesign;
  garmentLabel: string;
  aspectClassName?: string;
}) => (
  <div
    className={`${TILE_FRAME} ${aspectClassName}`}
    data-payment-review-design-image={design.sourceKind}
  >
    {design.imageUrl ? (
      <DesignStyleImage
        imageUrl={design.imageUrl}
        alt={
          design.sourceKind === "uploaded"
            ? `Uploaded design preview for ${garmentLabel}`
            : `${design.name ?? "Design Style"} design for ${garmentLabel}`
        }
        preset={DESIGN_STYLE_THUMB_IMAGE_PRESET}
        surface="summary-design-style"
        reportCode={null}
        imgClassName="h-full w-full object-contain"
        fallbackClassName="flex h-full flex-col items-center justify-center gap-1 p-2 text-center text-[10px] text-heritage-ink/45"
        compactFallback
      />
    ) : (
      <span className="flex h-full items-center justify-center p-2 text-center text-[10px] font-bold uppercase tracking-wider text-heritage-ink/45">
        {design.sourceKind === "uploaded"
          ? "Uploaded design"
          : "No design image"}
      </span>
    )}
  </div>
);

export const PaymentReviewFabricImage = ({
  fabric,
  aspectClassName = "aspect-[4/5]",
}: {
  fabric: FuturePaymentReviewPictureFabric;
  aspectClassName?: string;
}) => {
  const image = useImageLoadRetry(fabric.imageUrl, {
    optimized: buildOptimizedImageSources(
      fabric.imageUrl,
      FABRIC_THUMB_IMAGE_PRESET,
    ),
  });
  const showImage = Boolean(fabric.imageUrl) && !image.failed;
  const canReloadPhoto = Boolean(fabric.imageUrl) && image.failed;
  return (
    <div
      className={`${TILE_FRAME} ${aspectClassName}`}
      data-payment-review-fabric-image={fabric.allocationId}
    >
      {showImage ? (
        <img
          key={image.imageKey}
          srcSet={image.srcSet}
          sizes={image.sizes}
          src={image.src}
          alt={`${fabric.fabricName} fabric swatch`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={image.onError}
        />
      ) : fabric.colorHex ? (
        <div
          role="img"
          className="h-full w-full"
          style={{ backgroundColor: fabric.colorHex }}
          aria-label={`${fabric.fabricName} fabric colour`}
          data-payment-review-fabric-swatch="true"
        />
      ) : (
        <div
          role="img"
          className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] font-bold uppercase tracking-wider text-heritage-ink/45"
          aria-label={`${fabric.fabricName} fabric preview unavailable`}
        >
          {canReloadPhoto ? (
            <span className="sr-only">No preview</span>
          ) : (
            "No preview"
          )}
        </div>
      )}
      {canReloadPhoto ? (
        <div className="absolute inset-0">
          <FabricPhotoReloadButton
            fabricName={fabric.fabricName}
            onReload={image.retry}
            compact
          />
        </div>
      ) : null}
    </div>
  );
};

export const PaymentReviewGarmentReferenceImage = ({
  imageUrl,
  garmentLabel,
  aspectClassName = "aspect-[4/5]",
}: {
  imageUrl: string | null;
  garmentLabel: string;
  aspectClassName?: string;
}) => {
  const image = useImageLoadRetry(imageUrl);
  return (
    <div
      className={`${TILE_FRAME} bg-white ${aspectClassName}`}
      data-payment-review-garment-reference={imageUrl ? "image" : "none"}
    >
      {imageUrl && !image.failed ? (
        <img
          src={image.src}
          alt={`${garmentLabel} reference photo (garment type only)`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={image.onError}
        />
      ) : (
        <span className="flex h-full items-center justify-center p-1 text-center text-[9px] font-bold uppercase tracking-wider text-heritage-ink/45">
          No photo
        </span>
      )}
    </div>
  );
};
