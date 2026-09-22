export const mergeRestoredOccurrencePreviewMap = (
  current: Readonly<Record<string, string>>,
  updates: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> => ({ ...current, ...updates });

export const retainAssignedOccurrencePreviews = ({
  currentByOccurrenceToken,
  assignedOccurrenceTokens,
}: {
  currentByOccurrenceToken: Readonly<Record<string, string>>;
  assignedOccurrenceTokens: ReadonlySet<string>;
}): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(currentByOccurrenceToken).filter(([token]) =>
      assignedOccurrenceTokens.has(token),
    ),
  );

export const objectUrlsToRevokeAfterPreviewMerge = ({
  previousByOccurrenceToken,
  nextByOccurrenceToken,
}: {
  previousByOccurrenceToken: Readonly<Record<string, string>>;
  nextByOccurrenceToken: Readonly<Record<string, string>>;
}): readonly string[] => {
  const stillUsed = new Set(Object.values(nextByOccurrenceToken));
  const revoke = new Set<string>();
  for (const [token, url] of Object.entries(previousByOccurrenceToken)) {
    if (!url || nextByOccurrenceToken[token] === url || stillUsed.has(url)) {
      continue;
    }
    revoke.add(url);
  }
  return [...revoke];
};

export const shouldPublishRestoredUploadedPreview = ({
  cancelled,
  requestStillCurrent,
  occurrenceTokens,
}: {
  cancelled: boolean;
  requestStillCurrent: boolean;
  occurrenceTokens: readonly string[];
}): boolean =>
  !cancelled && requestStillCurrent && occurrenceTokens.length > 0;

export const previewUpdatesForUploadedSource = ({
  occurrenceTokens,
  previewUrl,
}: {
  occurrenceTokens: readonly string[];
  previewUrl: string;
}): Readonly<Record<string, string>> =>
  Object.fromEntries(
    occurrenceTokens
      .filter((token) => token.trim().length > 0)
      .map((token) => [token, previewUrl]),
  );

export type RestoredUploadedPreviewSourceWork = {
  readonly sourceKey: string;
  readonly uploadedSourceRef: string;
  readonly occurrenceTokens: readonly string[];
};

export const restoreUploadedDesignOccurrencePreviews = async ({
  sources,
  cancelled,
  prove,
  isCurrent,
  createPreviewUrl,
  onProved,
  onFailed,
  onDiscardPreviewUrl,
  onPublish,
}: {
  sources: readonly RestoredUploadedPreviewSourceWork[];
  cancelled: () => boolean;
  prove: (
    source: RestoredUploadedPreviewSourceWork,
  ) => Promise<
    | { readonly status: "proved"; readonly blob: Blob }
    | { readonly status: "failed" | "missing-owner" }
  >;
  isCurrent: (source: RestoredUploadedPreviewSourceWork) => boolean;
  createPreviewUrl: (blob: Blob) => string;
  onProved: (source: RestoredUploadedPreviewSourceWork) => void;
  onFailed: (source: RestoredUploadedPreviewSourceWork) => void;
  onDiscardPreviewUrl?: (previewUrl: string) => void;
  onPublish: (
    source: RestoredUploadedPreviewSourceWork,
    updates: Readonly<Record<string, string>>,
    previewUrl: string,
  ) => void;
}): Promise<void> => {
  await Promise.all(
    sources.map(async (source) => {
      if (cancelled()) return;
      const result = await prove(source);
      if (cancelled() || !isCurrent(source)) return;
      if (result.status === "missing-owner") return;
      if (result.status !== "proved") {
        onFailed(source);
        return;
      }
      onProved(source);
      if (cancelled() || !isCurrent(source)) return;
      const previewUrl = createPreviewUrl(result.blob);
      if (
        !shouldPublishRestoredUploadedPreview({
          cancelled: cancelled(),
          requestStillCurrent: isCurrent(source),
          occurrenceTokens: source.occurrenceTokens,
        })
      ) {
        onDiscardPreviewUrl?.(previewUrl);
        return;
      }
      onPublish(
        source,
        previewUpdatesForUploadedSource({
          occurrenceTokens: source.occurrenceTokens,
          previewUrl,
        }),
        previewUrl,
      );
    }),
  );
};
