import { useState } from "react";
import type { OrderGarmentPicture } from "../../utils/orderGarmentPictures";
import { useUploadedDesignPreview } from "./useUploadedDesignPreview";
import {
  PaymentReviewDesignImage,
  PaymentReviewFabricImage,
  PaymentReviewGarmentReferenceImage,
} from "../futurePaymentReview/PaymentReviewImages";

/**
 * Picture tiles for saved orders: cart order lines, the dashboard "My orders"
 * list and the order details dialog. They reuse the Stage 10 tiles, so images
 * are lazy, have alt text and keep a fixed 4:5 frame (no layout shift).
 * Uploaded designs show the owner's private image (read with getBlob, shown
 * through a blob: URL). While it loads, or when it fails or is missing, the
 * labelled placeholder stays. Cart and My orders read it when the tile is near
 * the viewport; the order details dialog reads it right away (eager).
 */

const PLACEHOLDER_FRAME =
  "flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-lg border border-heritage-green/20 bg-heritage-cream text-center font-bold leading-tight text-heritage-ink/75 break-words";
const PLACEHOLDER_PADDING = "p-1 uppercase tracking-wide";

const UPLOADED_IMAGE_FRAME =
  "relative aspect-[4/5] w-full overflow-hidden rounded-lg border border-heritage-green/10 bg-heritage-cream/35";

const UploadedDesignTile = ({
  picture,
  textClassName,
  paddingClassName,
  eager,
}: {
  picture: OrderGarmentPicture;
  textClassName: string;
  paddingClassName: string;
  eager: boolean;
}) => {
  const { ref, state } = useUploadedDesignPreview<HTMLDivElement>(
    picture.uploadedDesign ?? null,
    eager,
  );
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  if (state.status === "loaded" && state.url !== brokenUrl) {
    return (
      <div
        ref={ref}
        data-order-picture-uploaded-image={picture.garmentKey}
        className={UPLOADED_IMAGE_FRAME}
      >
        <img
          src={state.url}
          alt={`Uploaded design preview for ${picture.label}`}
          decoding="async"
          className="h-full w-full object-contain"
          onError={() => setBrokenUrl(state.url)}
        />
      </div>
    );
  }
  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Your uploaded design for ${picture.label}`}
      data-order-picture-uploaded-placeholder={picture.garmentKey}
      className={`${PLACEHOLDER_FRAME} ${paddingClassName} ${textClassName}`}
    >
      Your uploaded design
    </div>
  );
};

const DesignTile = ({
  picture,
  textClassName,
  paddingClassName = PLACEHOLDER_PADDING,
  eager = false,
}: {
  picture: OrderGarmentPicture;
  textClassName: string;
  paddingClassName?: string;
  eager?: boolean;
}) => {
  const { design } = picture;
  if (design.sourceKind === "uploaded" && !design.imageUrl) {
    return (
      <UploadedDesignTile
        picture={picture}
        textClassName={textClassName}
        paddingClassName={paddingClassName}
        eager={eager}
      />
    );
  }
  if (!design.imageUrl) {
    const name = design.name ?? "Design";
    return (
      <div
        role="img"
        aria-label={`${name} design for ${picture.label} (no picture)`}
        data-order-picture-design-missing={picture.garmentKey}
        className={`${PLACEHOLDER_FRAME} ${paddingClassName} ${textClassName}`}
      >
        {name}
      </div>
    );
  }
  return (
    <PaymentReviewDesignImage design={design} garmentLabel={picture.label} />
  );
};

/** Design, every assigned fabric, and the garment-type photo, in one row. */
export const OrderGarmentPictureTiles = ({
  picture,
  tileClassName,
  textClassName = "text-[8px]",
  eager = false,
}: {
  picture: OrderGarmentPicture;
  /** Width classes for each tile, e.g. "w-12 sm:w-14". */
  tileClassName: string;
  textClassName?: string;
  /** Read the uploaded design right away instead of near the viewport. */
  eager?: boolean;
}) => (
  <div
    data-order-picture-tiles={picture.garmentKey}
    className="flex min-w-0 gap-1.5 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
  >
    <div className={`shrink-0 ${tileClassName}`} data-order-picture-tile="design">
      <DesignTile picture={picture} textClassName={textClassName} eager={eager} />
    </div>
    {picture.fabrics.map((fabric) => (
      <div
        key={fabric.allocationId}
        className={`shrink-0 ${tileClassName}`}
        data-order-picture-tile="fabric"
      >
        {fabric.imageUrl || fabric.colorHex ? (
          <PaymentReviewFabricImage fabric={fabric} />
        ) : (
          <div
            role="img"
            aria-label={`${fabric.fabricName} fabric preview unavailable`}
            data-order-picture-fabric-missing={fabric.allocationId}
            className={`${PLACEHOLDER_FRAME} ${PLACEHOLDER_PADDING} ${textClassName}`}
          >
            {fabric.fabricName}
          </div>
        )}
      </div>
    ))}
    <div className={`shrink-0 ${tileClassName}`} data-order-picture-tile="garment">
      <PaymentReviewGarmentReferenceImage
        imageUrl={picture.referenceImageUrl}
        garmentLabel={picture.label}
      />
    </div>
  </div>
);

/** Cart order line: a small tile group per garment, scrolling sideways. */
export const OrderGarmentPictureStrip = ({
  pictures,
}: {
  pictures: readonly OrderGarmentPicture[];
}) => {
  if (pictures.length === 0) return null;
  return (
    <ul
      data-cart-order-pictures
      aria-label="Garments in this order"
      className="mt-3 flex min-w-0 gap-3 overflow-x-auto pb-1"
    >
      {pictures.map((picture) => (
        <li
          key={picture.garmentKey}
          data-cart-order-picture={picture.garmentKey}
          className="min-w-0 shrink-0"
        >
          <OrderGarmentPictureTiles
            picture={picture}
            tileClassName="w-11 sm:w-14"
          />
          <p
            className="mt-1 max-w-[12rem] truncate text-[11px] font-semibold text-heritage-green"
            title={picture.label}
          >
            {picture.label}
          </p>
        </li>
      ))}
    </ul>
  );
};

/** Dashboard order list: one small design thumbnail beside a garment line. */
export const OrderDesignThumbnail = ({
  picture,
}: {
  picture: OrderGarmentPicture;
}) => (
  <div
    data-customer-v2-order-thumbnail={picture.garmentKey}
    className="w-8 shrink-0 sm:w-10 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
  >
    <DesignTile
      picture={picture}
      textClassName="text-[6px] sm:text-[7px]"
      paddingClassName="p-0.5 tracking-normal"
    />
  </div>
);
