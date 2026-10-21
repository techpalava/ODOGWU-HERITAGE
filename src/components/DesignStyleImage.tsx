import { useImageLoadRetry } from "../hooks/useImageLoadRetry";
import {
  buildOptimizedImageSources,
  isCatalogueDesignImageUrl,
  type ResponsiveImagePreset,
} from "../utils/optimizedImageUrl";
import {
  toClientImageErrorCode,
  type ClientImageErrorSurface,
} from "../utils/clientImageErrorSchema";
import { FabricPhotoReloadButton } from "./FabricPhotoReloadButton";

/**
 * Design Style photo with the same reliability path as Fabric photos (#946):
 *
 * - published catalogue photos (`styles/`, `designs/` in this project's bucket)
 *   load as card-sized `/_vercel/image` WebP from the site's own domain, with
 *   the original Firebase Storage URL as the fallback;
 * - customer uploads, blob: and data: previews keep their original URL;
 * - failures retry (1/2/4/8 s), are reported to `/api/client-image-error`, and
 *   end in "Image unavailable" plus a "Tap to reload photo" button.
 */
export interface DesignStyleImageProps {
  imageUrl: string | null | undefined;
  alt: string;
  preset: ResponsiveImagePreset;
  surface: ClientImageErrorSurface;
  /** Design Style id (or other stable id) for the failure report. */
  reportCode?: string | null;
  imgClassName: string;
  fallbackClassName: string;
  /** Hide the reload button (e.g. very small thumbs). */
  compactFallback?: boolean;
  /** Extra attributes for the <img> (e.g. `data-style-card-image`). */
  imgDataAttributes?: Record<string, string>;
  fallbackDataAttributes?: Record<string, string>;
  fallbackLabel?: string;
}

export const DesignStyleImage = ({
  imageUrl,
  alt,
  preset,
  surface,
  reportCode,
  imgClassName,
  fallbackClassName,
  compactFallback = false,
  imgDataAttributes,
  fallbackDataAttributes,
  fallbackLabel = "Image unavailable",
}: DesignStyleImageProps) => {
  const trimmed = typeof imageUrl === "string" ? imageUrl.trim() : "";
  const code = toClientImageErrorCode(reportCode);
  const image = useImageLoadRetry(trimmed, {
    optimized: isCatalogueDesignImageUrl(trimmed)
      ? buildOptimizedImageSources(trimmed, preset)
      : null,
    report: code ? { surface, fabricCode: code } : null,
  });

  if (image.failed) {
    const canReload = Boolean(trimmed);
    return (
      <div
        className={fallbackClassName}
        data-design-image-fallback="true"
        aria-label={`${alt} unavailable`}
        {...fallbackDataAttributes}
      >
        {canReload && compactFallback ? (
          <span className="pointer-events-auto relative z-[2] block size-full">
            <FabricPhotoReloadButton fabricName={alt} onReload={image.retry} compact />
          </span>
        ) : (
          <>
            <span>{fallbackLabel}</span>
            {canReload ? (
              <span className="pointer-events-auto relative z-[2]">
                <FabricPhotoReloadButton fabricName={alt} onReload={image.retry} />
              </span>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <img
      key={image.imageKey}
      src={image.src}
      srcSet={image.srcSet}
      sizes={image.sizes}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={imgClassName}
      referrerPolicy="no-referrer"
      onError={image.onError}
      data-design-image-source={image.source}
      {...imgDataAttributes}
    />
  );
};
