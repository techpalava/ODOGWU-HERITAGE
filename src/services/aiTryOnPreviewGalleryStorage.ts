import type { CanonicalPhysicalGarmentType } from "../types";

/**
 * Browser persistence and state helpers for the Step 7 AI Try-On
 * multi-preview switcher (`#1305` extension).
 *
 * Kept in a dedicated service so `AiTryOnPhotoPanel.tsx` and
 * `DesignStudioView.tsx` respect their source-level privacy boundaries.
 */

export const AI_TRY_ON_PREVIEW_GALLERY_STORAGE_KEY = "odogwu.aiTryOn.previewGallery.v1";
export const AI_TRY_ON_LEGACY_SINGLE_PREVIEW_STORAGE_KEY = "odogwu.aiTryOn.singlePreview.v1";

export type AiTryOnGalleryStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface AiTryOnGalleryPreviewItem {
  readonly id: string;
  readonly previewNumber: number;
  readonly wearerId: string;
  readonly previewKey: string;
  readonly garmentKey: string | null;
  readonly garmentTitle: string;
  readonly caption: string;
  readonly inputFingerprint: string;
  readonly mimeType: string;
  readonly data: string;
  readonly storedPreviewId: string | null;
  readonly modelId: string | null;
  readonly previewKind: "single" | "outfit";
  readonly uploadedDesign: boolean;
  readonly stylePhoto: boolean;
}

export interface AiTryOnPreviewGalleryState {
  readonly items: readonly AiTryOnGalleryPreviewItem[];
  readonly activeIdByWearer: Readonly<Record<string, string>>;
}

export const EMPTY_AI_TRY_ON_PREVIEW_GALLERY_STATE: AiTryOnPreviewGalleryState = {
  items: [],
  activeIdByWearer: {},
};

const GARMENT_TYPE_LABELS: Readonly<Record<CanonicalPhysicalGarmentType, string>> = {
  kaftan: "Long Shirt",
  shirt: "Standard Shirt",
  trouser: "Trouser",
  skirt: "Standard Skirt",
  long_skirt: "Long Skirt",
  standard_shorts: "Shorts",
  bum_shorts: "Bum Shorts",
  dress: "Short Dress",
  full_length_gown: "Full-Length Gown",
  agbada: "Agbada",
};

const defaultGalleryStore = (): AiTryOnGalleryStore | null => {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/**
 * Enforces the customer-visible wording rule ("Kaftan" -> "Long Shirt")
 * and cleans up combined outfit separators.
 */
export const normalizeAiTryOnGarmentTitle = (rawTitle: string | null | undefined): string => {
  const cleaned = String(rawTitle ?? "")
    .replace(/\bkaftans\b/gi, "Long Shirts")
    .replace(/\bkaftan\b/gi, "Long Shirt")
    .replace(/\s*\+\s*/g, " & ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Garment";
};

export const garmentLabelForType = (
  garmentType: CanonicalPhysicalGarmentType | string | null | undefined,
): string | null => {
  if (!garmentType) return null;
  if (garmentType in GARMENT_TYPE_LABELS) {
    return GARMENT_TYPE_LABELS[garmentType as CanonicalPhysicalGarmentType];
  }
  return normalizeAiTryOnGarmentTitle(garmentType);
};

export const formatAiTryOnPreviewCaption = (
  previewNumber: number,
  garmentTitle: string,
): string => {
  const safeNumber = Number.isFinite(previewNumber) && previewNumber >= 1 ? Math.floor(previewNumber) : 1;
  return `Preview ${safeNumber} — ${normalizeAiTryOnGarmentTitle(garmentTitle)}`;
};

export const resolveAiTryOnTargetGarmentTitle = ({
  outfitMode,
  selectedTopLabel,
  selectedBottomLabel,
  outfitPairLabel,
  selectedGarmentLabel,
  selectedGarmentType,
  fallbackGarmentType,
  wearerLabel,
}: {
  outfitMode?: boolean;
  selectedTopLabel?: string | null;
  selectedBottomLabel?: string | null;
  outfitPairLabel?: string | null;
  selectedGarmentLabel?: string | null;
  selectedGarmentType?: CanonicalPhysicalGarmentType | string | null;
  fallbackGarmentType?: CanonicalPhysicalGarmentType | string | null;
  wearerLabel?: string | null;
}): string => {
  if (outfitMode) {
    if (selectedTopLabel && selectedBottomLabel) {
      return `${normalizeAiTryOnGarmentTitle(selectedTopLabel)} & ${normalizeAiTryOnGarmentTitle(selectedBottomLabel)}`;
    }
    if (outfitPairLabel) {
      return normalizeAiTryOnGarmentTitle(outfitPairLabel);
    }
    return "Combined Outfit";
  }
  if (selectedGarmentLabel && selectedGarmentLabel.trim()) {
    return normalizeAiTryOnGarmentTitle(selectedGarmentLabel);
  }
  const byType = garmentLabelForType(selectedGarmentType) ?? garmentLabelForType(fallbackGarmentType);
  if (byType) return byType;
  if (wearerLabel && wearerLabel.trim() && wearerLabel.trim().toLowerCase() !== "you") {
    return normalizeAiTryOnGarmentTitle(wearerLabel);
  }
  return "Custom Outfit";
};

/**
 * Ensures 1-based sequential numbering and captions per wearer in generation order.
 */
export const recomputeAiTryOnGalleryNumbers = (
  items: readonly AiTryOnGalleryPreviewItem[],
): AiTryOnGalleryPreviewItem[] => {
  const countByWearer = new Map<string, number>();
  return items.map((item) => {
    const nextNumber = (countByWearer.get(item.wearerId) ?? 0) + 1;
    countByWearer.set(item.wearerId, nextNumber);
    const garmentTitle = normalizeAiTryOnGarmentTitle(item.garmentTitle);
    const caption = formatAiTryOnPreviewCaption(nextNumber, garmentTitle);
    if (
      item.previewNumber === nextNumber &&
      item.garmentTitle === garmentTitle &&
      item.caption === caption
    ) {
      return item;
    }
    return {
      ...item,
      previewNumber: nextNumber,
      garmentTitle,
      caption,
    };
  });
};

export interface AppendAiTryOnGalleryPreviewInput {
  readonly id?: string;
  readonly wearerId: string;
  readonly previewKey: string;
  readonly garmentKey?: string | null;
  readonly garmentTitle: string;
  readonly inputFingerprint: string;
  readonly mimeType: string;
  readonly data: string;
  readonly storedPreviewId: string | null;
  readonly modelId: string | null;
  readonly previewKind?: "single" | "outfit";
  readonly uploadedDesign?: boolean;
  readonly stylePhoto?: boolean;
  /**
   * When true (default for new generations), sets this preview as the active
   * main preview for its wearer. When false (e.g. background hydration of a
   * stored preview when an active preview is already chosen), preserves the
   * existing active selection if valid.
   */
  readonly activate?: boolean;
}

export const appendAiTryOnGalleryPreview = (
  state: AiTryOnPreviewGalleryState,
  input: AppendAiTryOnGalleryPreviewInput,
): AiTryOnPreviewGalleryState => {
  if (!input.wearerId || !input.previewKey || !input.inputFingerprint || !input.data) {
    return state;
  }
  const garmentTitle = normalizeAiTryOnGarmentTitle(input.garmentTitle);
  const activate = input.activate !== false;

  // If an explicit id matches an existing item for this wearer, update in place.
  const existingIndex = input.id
    ? state.items.findIndex((entry) => entry.id === input.id && entry.wearerId === input.wearerId)
    : -1;

  if (existingIndex >= 0) {
    const existing = state.items[existingIndex];
    const updatedItem: AiTryOnGalleryPreviewItem = {
      ...existing,
      previewKey: input.previewKey,
      garmentKey: input.garmentKey ?? existing.garmentKey,
      garmentTitle: garmentTitle || existing.garmentTitle,
      inputFingerprint: input.inputFingerprint,
      mimeType: input.mimeType,
      data: input.data,
      storedPreviewId: input.storedPreviewId ?? existing.storedPreviewId,
      modelId: input.modelId ?? existing.modelId,
      previewKind: input.previewKind ?? existing.previewKind,
      uploadedDesign: input.uploadedDesign ?? existing.uploadedDesign,
      stylePhoto: input.stylePhoto ?? existing.stylePhoto,
    };
    const nextItems = recomputeAiTryOnGalleryNumbers(
      state.items.map((item, idx) => (idx === existingIndex ? updatedItem : item)),
    );
    const currentActiveId = state.activeIdByWearer[input.wearerId];
    const hasValidActive = Boolean(
      currentActiveId && nextItems.some((item) => item.wearerId === input.wearerId && item.id === currentActiveId),
    );
    const nextActiveId = activate || !hasValidActive ? updatedItem.id : currentActiveId;
    return {
      items: nextItems,
      activeIdByWearer: {
        ...state.activeIdByWearer,
        [input.wearerId]: nextActiveId,
      },
    };
  }

  const wearerCount = state.items.filter((item) => item.wearerId === input.wearerId).length;
  const previewNumber = wearerCount + 1;
  const generatedId =
    input.id ||
    (input.storedPreviewId &&
    !state.items.some((item) => item.id === input.storedPreviewId)
      ? input.storedPreviewId
      : `preview-${input.wearerId}-${previewNumber}-${input.inputFingerprint.slice(-8)}`);

  const newItem: AiTryOnGalleryPreviewItem = {
    id: generatedId,
    previewNumber,
    wearerId: input.wearerId,
    previewKey: input.previewKey,
    garmentKey: input.garmentKey ?? null,
    garmentTitle,
    caption: formatAiTryOnPreviewCaption(previewNumber, garmentTitle),
    inputFingerprint: input.inputFingerprint,
    mimeType: input.mimeType,
    data: input.data,
    storedPreviewId: input.storedPreviewId,
    modelId: input.modelId,
    previewKind: input.previewKind ?? "single",
    uploadedDesign: Boolean(input.uploadedDesign),
    stylePhoto: Boolean(input.stylePhoto),
  };

  const nextItems = recomputeAiTryOnGalleryNumbers([...state.items, newItem]);
  const currentActiveId = state.activeIdByWearer[input.wearerId];
  const hasValidActive = Boolean(
    currentActiveId && nextItems.some((item) => item.wearerId === input.wearerId && item.id === currentActiveId),
  );
  const nextActiveId = activate || !hasValidActive ? newItem.id : currentActiveId;

  return {
    items: nextItems,
    activeIdByWearer: {
      ...state.activeIdByWearer,
      [input.wearerId]: nextActiveId,
    },
  };
};

export const selectAiTryOnActiveGalleryPreview = (
  state: AiTryOnPreviewGalleryState,
  wearerId: string,
  previewId: string,
): AiTryOnPreviewGalleryState => {
  const exists = state.items.some(
    (item) => item.wearerId === wearerId && item.id === previewId,
  );
  if (!exists || state.activeIdByWearer[wearerId] === previewId) {
    return state;
  }
  return {
    ...state,
    activeIdByWearer: {
      ...state.activeIdByWearer,
      [wearerId]: previewId,
    },
  };
};

export const removeAiTryOnGalleryPreviews = (
  state: AiTryOnPreviewGalleryState,
  shouldRemove: (item: AiTryOnGalleryPreviewItem) => boolean,
): AiTryOnPreviewGalleryState => {
  const filtered = state.items.filter((item) => !shouldRemove(item));
  if (filtered.length === state.items.length) return state;
  const nextItems = recomputeAiTryOnGalleryNumbers(filtered);
  const nextActive: Record<string, string> = {};
  const wearers = new Set(nextItems.map((item) => item.wearerId));
  for (const wearerId of wearers) {
    const wearerItems = nextItems.filter((item) => item.wearerId === wearerId);
    const previousActive = state.activeIdByWearer[wearerId];
    const kept = wearerItems.find((item) => item.id === previousActive);
    const fallback = wearerItems[wearerItems.length - 1];
    if (kept) nextActive[wearerId] = kept.id;
    else if (fallback) nextActive[wearerId] = fallback.id;
  }
  return {
    items: nextItems,
    activeIdByWearer: nextActive,
  };
};

const baseWearerIdFromKey = (key: string): string =>
  key.replace(/--(?:garment--.*|outfit)$/, "") || key;

const coerceGalleryItem = (
  raw: Record<string, unknown>,
  index: number,
  fallbackWearerId = "order",
): AiTryOnGalleryPreviewItem | null => {
  const data = typeof raw.data === "string" && raw.data.length > 0 ? raw.data : null;
  const inputFingerprint =
    typeof raw.inputFingerprint === "string" && raw.inputFingerprint.length > 0
      ? raw.inputFingerprint
      : null;
  if (!data || !inputFingerprint) return null;
  const mimeType =
    typeof raw.mimeType === "string" && raw.mimeType.startsWith("image/")
      ? raw.mimeType
      : "image/webp";
  const rawWearerKey =
    typeof raw.wearerKey === "string" && raw.wearerKey.length > 0 ? raw.wearerKey : null;
  const wearerId =
    typeof raw.wearerId === "string" && raw.wearerId.length > 0
      ? raw.wearerId
      : rawWearerKey
        ? baseWearerIdFromKey(rawWearerKey)
        : fallbackWearerId;
  const previewKey =
    typeof raw.previewKey === "string" && raw.previewKey.length > 0
      ? raw.previewKey
      : rawWearerKey || wearerId;
  const garmentKey = typeof raw.garmentKey === "string" ? raw.garmentKey : null;
  const rawTitleFromCaption =
    typeof raw.caption === "string"
      ? raw.caption.replace(/^Preview\s+\d+\s*[—-]\s*/i, "").trim()
      : "";
  const garmentTitle = normalizeAiTryOnGarmentTitle(
    typeof raw.garmentTitle === "string" && raw.garmentTitle.trim()
      ? raw.garmentTitle
      : rawTitleFromCaption ||
          (typeof raw.label === "string" && raw.label.trim() ? raw.label : "Custom Outfit"),
  );
  const storedPreviewId =
    typeof raw.storedPreviewId === "string" && raw.storedPreviewId.length > 0
      ? raw.storedPreviewId
      : typeof raw.previewId === "string" && raw.previewId.length > 0
        ? raw.previewId
        : null;
  const modelId =
    typeof raw.modelId === "string" && raw.modelId.length > 0 ? raw.modelId : null;
  const id =
    typeof raw.id === "string" && raw.id.length > 0
      ? raw.id
      : storedPreviewId || `preview-${wearerId}-${index + 1}`;
  const previewKind = raw.previewKind === "outfit" ? "outfit" : "single";
  const previewNumber = index + 1;
  return {
    id,
    previewNumber,
    wearerId,
    previewKey,
    garmentKey,
    garmentTitle,
    caption: formatAiTryOnPreviewCaption(previewNumber, garmentTitle),
    inputFingerprint,
    mimeType,
    data,
    storedPreviewId,
    modelId,
    previewKind,
    uploadedDesign: Boolean(raw.uploadedDesign),
    stylePhoto: Boolean(raw.stylePhoto),
  };
};

/**
 * Parses either a v1 multi-preview gallery state OR a legacy single-preview
 * object / wearer-keyed map and returns a normalized `AiTryOnPreviewGalleryState`.
 */
export const normalizeOrMigrateAiTryOnGalleryState = (
  raw: unknown,
): AiTryOnPreviewGalleryState => {
  if (!raw) return EMPTY_AI_TRY_ON_PREVIEW_GALLERY_STATE;

  if (Array.isArray(raw)) {
    const items = recomputeAiTryOnGalleryNumbers(
      raw
        .map((entry, idx) => (isRecord(entry) ? coerceGalleryItem(entry, idx) : null))
        .filter((entry): entry is AiTryOnGalleryPreviewItem => entry !== null),
    );
    const activeIdByWearer: Record<string, string> = {};
    for (const item of items) {
      activeIdByWearer[item.wearerId] = item.id;
    }
    return { items, activeIdByWearer };
  }

  if (!isRecord(raw)) return EMPTY_AI_TRY_ON_PREVIEW_GALLERY_STATE;

  // v1 gallery structure: { items: [...], activeIdByWearer?: {...} }
  if (Array.isArray(raw.items)) {
    const items = recomputeAiTryOnGalleryNumbers(
      raw.items
        .map((entry, idx) => (isRecord(entry) ? coerceGalleryItem(entry, idx) : null))
        .filter((entry): entry is AiTryOnGalleryPreviewItem => entry !== null),
    );
    const rawActive = isRecord(raw.activeIdByWearer) ? raw.activeIdByWearer : {};
    const activeIdByWearer: Record<string, string> = {};
    for (const item of items) {
      activeIdByWearer[item.wearerId] = item.id;
    }
    for (const [wearerId, activeId] of Object.entries(rawActive)) {
      if (
        typeof activeId === "string" &&
        items.some((item) => item.wearerId === wearerId && item.id === activeId)
      ) {
        activeIdByWearer[wearerId] = activeId;
      }
    }
    return { items, activeIdByWearer };
  }

  // Legacy single preview object directly: { inputFingerprint, data, mimeType, ... }
  const single = coerceGalleryItem(raw, 0);
  if (single) {
    return {
      items: [single],
      activeIdByWearer: { [single.wearerId]: single.id },
    };
  }

  // Nested single preview wrapper: { preview: { inputFingerprint, data, ... } }
  if (isRecord(raw.preview)) {
    const wrapped = coerceGalleryItem(raw.preview, 0);
    if (wrapped) {
      return {
        items: [wrapped],
        activeIdByWearer: { [wrapped.wearerId]: wrapped.id },
      };
    }
  }

  // Legacy map by wearerKey: { "w-ada": { inputFingerprint, data, mimeType, ... } }
  const mapItems: AiTryOnGalleryPreviewItem[] = [];
  for (const [key, entry] of Object.entries(raw)) {
    if (!isRecord(entry)) continue;
    const item = coerceGalleryItem(entry, mapItems.length, key);
    if (item) mapItems.push(item);
  }
  if (mapItems.length > 0) {
    const numbered = recomputeAiTryOnGalleryNumbers(mapItems);
    const activeIdByWearer: Record<string, string> = {};
    for (const item of numbered) {
      activeIdByWearer[item.wearerId] = item.id;
    }
    return { items: numbered, activeIdByWearer };
  }

  return EMPTY_AI_TRY_ON_PREVIEW_GALLERY_STATE;
};

export const readAiTryOnPreviewGalleryState = (
  scope = "default",
  store: AiTryOnGalleryStore | null = defaultGalleryStore(),
): AiTryOnPreviewGalleryState => {
  if (!store) return EMPTY_AI_TRY_ON_PREVIEW_GALLERY_STATE;
  const safeScope = scope || "default";
  try {
    const rawGallery = store.getItem(AI_TRY_ON_PREVIEW_GALLERY_STORAGE_KEY);
    if (rawGallery) {
      const parsed = JSON.parse(rawGallery);
      if (isRecord(parsed) && isRecord(parsed.byScope)) {
        const scoped = parsed.byScope[safeScope];
        if (scoped !== undefined) {
          return normalizeOrMigrateAiTryOnGalleryState(scoped);
        }
        if (safeScope === "resolving" && parsed.byScope["guest"] !== undefined) {
          return normalizeOrMigrateAiTryOnGalleryState(parsed.byScope["guest"]);
        }
      }
      // Backward compatibility: top-level single preview or unscoped gallery
      const migrated = normalizeOrMigrateAiTryOnGalleryState(parsed);
      if (migrated.items.length > 0) {
        saveAiTryOnPreviewGalleryState(safeScope, migrated, store);
        return migrated;
      }
    }

    const rawLegacySingle = store.getItem(AI_TRY_ON_LEGACY_SINGLE_PREVIEW_STORAGE_KEY);
    if (rawLegacySingle) {
      const parsedLegacy = JSON.parse(rawLegacySingle);
      const scopedCandidate =
        isRecord(parsedLegacy) && isRecord(parsedLegacy[safeScope])
          ? parsedLegacy[safeScope]
          : safeScope === "resolving" && isRecord(parsedLegacy) && isRecord(parsedLegacy["guest"])
            ? parsedLegacy["guest"]
            : parsedLegacy;
      const migrated = normalizeOrMigrateAiTryOnGalleryState(scopedCandidate);
      if (migrated.items.length > 0) {
        saveAiTryOnPreviewGalleryState(safeScope, migrated, store);
        store.removeItem(AI_TRY_ON_LEGACY_SINGLE_PREVIEW_STORAGE_KEY);
        return migrated;
      }
    }
  } catch {
    // Ignore malformed or blocked storage.
  }
  return EMPTY_AI_TRY_ON_PREVIEW_GALLERY_STATE;
};

export const saveAiTryOnPreviewGalleryState = (
  scope = "default",
  state: AiTryOnPreviewGalleryState,
  store: AiTryOnGalleryStore | null = defaultGalleryStore(),
): void => {
  if (!store) return;
  const safeScope = scope || "default";
  if (safeScope === "resolving") return;
  try {
    let envelope: { schemaVersion: 1; byScope: Record<string, AiTryOnPreviewGalleryState> } = {
      schemaVersion: 1,
      byScope: {},
    };
    const existingRaw = store.getItem(AI_TRY_ON_PREVIEW_GALLERY_STORAGE_KEY);
    if (existingRaw) {
      try {
        const parsed = JSON.parse(existingRaw);
        if (isRecord(parsed) && isRecord(parsed.byScope)) {
          envelope = {
            schemaVersion: 1,
            byScope: { ...(parsed.byScope as Record<string, AiTryOnPreviewGalleryState>) },
          };
        }
      } catch {
        // Replace invalid envelope.
      }
    }
    const normalized = normalizeOrMigrateAiTryOnGalleryState(state);
    if (normalized.items.length === 0) {
      delete envelope.byScope[safeScope];
    } else {
      envelope.byScope[safeScope] = normalized;
    }
    if (Object.keys(envelope.byScope).length === 0) {
      store.removeItem(AI_TRY_ON_PREVIEW_GALLERY_STORAGE_KEY);
    } else {
      store.setItem(AI_TRY_ON_PREVIEW_GALLERY_STORAGE_KEY, JSON.stringify(envelope));
    }
  } catch {
    // Storage quota or private-mode restriction: in-memory gallery still works.
  }
};

export const clearAiTryOnPreviewGalleryStorage = (
  store: AiTryOnGalleryStore | null = defaultGalleryStore(),
): void => {
  if (!store) return;
  try {
    store.removeItem(AI_TRY_ON_PREVIEW_GALLERY_STORAGE_KEY);
    store.removeItem(AI_TRY_ON_LEGACY_SINGLE_PREVIEW_STORAGE_KEY);
  } catch {
    // Ignore blocked storage.
  }
};
