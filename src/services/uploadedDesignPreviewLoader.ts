import type { CustomerDesignUploadReference } from "../types.js";
import {
  getCustomerDesignImageExtension,
  isCustomerDesignDraftStoragePath,
} from "./customerDesignUploadReference.js";

/**
 * Private previews of customer-uploaded designs for saved orders (cart lines,
 * My orders and the order details dialog). The owner's browser reads the file
 * with the Firebase Storage SDK (getBlob) and shows it through a blob: URL.
 * No download URL is requested and no URL is stored anywhere.
 *
 * Saved orders keep only the upload id, so the path is rebuilt from the owner
 * uid and the id. The draft registry's reference is used first when it is
 * available; otherwise the three allowed extensions are tried in order.
 * Every result, including a failure, is cached per viewer, owner and upload,
 * so a shared upload is read once and a missing file is not read again until
 * the signed-in uid changes.
 */

export const UPLOADED_DESIGN_PREVIEW_EXTENSIONS = ["jpg", "png", "webp"] as const;

export type UploadedDesignPreviewState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly url: string }
  | { readonly status: "failed" };

export interface UploadedDesignPreviewRequest {
  /** The uid signed in right now (guest anonymous uid or account uid). */
  readonly viewerUid: string;
  /** The uid that owns the file: the order's owner, or the viewer for cart lines. */
  readonly ownerUid: string;
  readonly designReferenceId: string;
}

export interface UploadedDesignPreviewGateway {
  readBlob(storagePath: string): Promise<Blob>;
  createObjectUrl(blob: Blob): string;
  revokeObjectUrl(url: string): void;
  /** The draft registry's reference for this upload, when the draft has one. */
  lookupRegisteredReference?(
    designReferenceId: string,
  ): Promise<CustomerDesignUploadReference | null> | CustomerDesignUploadReference | null;
}

export interface UploadedDesignPreviewLoader {
  load(request: UploadedDesignPreviewRequest): Promise<UploadedDesignPreviewState>;
  peek(request: UploadedDesignPreviewRequest): UploadedDesignPreviewState;
  subscribe(request: UploadedDesignPreviewRequest, listener: () => void): () => void;
  /** Resolves when every read in flight has finished. */
  settle(): Promise<void>;
  /** Drops (and revokes) every entry that belongs to another signed-in uid. */
  resetForViewer(viewerUid: string | null): void;
  /** Revokes every blob: URL and empties the cache. */
  clear(): void;
}

export const UPLOADED_DESIGN_PREVIEW_IDLE: UploadedDesignPreviewState = Object.freeze({ status: "idle" });
const LOADING: UploadedDesignPreviewState = Object.freeze({ status: "loading" });
const FAILED: UploadedDesignPreviewState = Object.freeze({ status: "failed" });

const isSafeSegment = (value: string): boolean =>
  value.length > 0 && value.length <= 512 && value.trim() === value && !/[\\/]/.test(value);

const draftPath = (ownerUid: string, designReferenceId: string, extension: string) =>
  `customer-design-drafts/${ownerUid}/${designReferenceId}/original.${extension}`;

const storageErrorCode = (error: unknown): string =>
  error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";

const keyOf = (request: UploadedDesignPreviewRequest) =>
  `${request.viewerUid}\n${request.ownerUid}\n${request.designReferenceId}`;

interface Entry {
  readonly viewerUid: string;
  state: UploadedDesignPreviewState;
  promise: Promise<UploadedDesignPreviewState> | null;
  readonly listeners: Set<() => void>;
}

/** The storage paths to try, in order. Exported for tests. */
export const getUploadedDesignPreviewPaths = (
  ownerUid: string,
  designReferenceId: string,
  registered: CustomerDesignUploadReference | null,
): string[] => {
  const paths: string[] = [];
  if (registered && registered.designReferenceId === designReferenceId) {
    if (registered.ownerUid === ownerUid && isCustomerDesignDraftStoragePath(registered)) {
      paths.push(registered.storagePath);
    } else {
      // Moved from a guest uid to the account uid: same id and type, new owner.
      const extension = getCustomerDesignImageExtension(registered.mimeType);
      if (extension) paths.push(draftPath(ownerUid, designReferenceId, extension));
    }
  }
  for (const extension of UPLOADED_DESIGN_PREVIEW_EXTENSIONS) {
    const path = draftPath(ownerUid, designReferenceId, extension);
    if (!paths.includes(path)) paths.push(path);
  }
  return paths;
};

export const createUploadedDesignPreviewLoader = (
  gateway: UploadedDesignPreviewGateway,
): UploadedDesignPreviewLoader => {
  const entries = new Map<string, Entry>();

  const setState = (entry: Entry, state: UploadedDesignPreviewState) => {
    entry.state = state;
    for (const listener of [...entry.listeners]) listener();
  };

  const entryFor = (request: UploadedDesignPreviewRequest): Entry => {
    const key = keyOf(request);
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        viewerUid: request.viewerUid,
        state: UPLOADED_DESIGN_PREVIEW_IDLE,
        promise: null,
        listeners: new Set(),
      };
      entries.set(key, entry);
    }
    return entry;
  };

  const read = async (
    request: UploadedDesignPreviewRequest,
  ): Promise<UploadedDesignPreviewState> => {
    if (
      !isSafeSegment(request.viewerUid) ||
      !isSafeSegment(request.ownerUid) ||
      !isSafeSegment(request.designReferenceId)
    ) {
      return FAILED;
    }
    let registered: CustomerDesignUploadReference | null = null;
    try {
      registered = (await gateway.lookupRegisteredReference?.(request.designReferenceId)) ?? null;
    } catch {
      registered = null;
    }
    for (const path of getUploadedDesignPreviewPaths(
      request.ownerUid,
      request.designReferenceId,
      registered,
    )) {
      let blob: Blob;
      try {
        blob = await gateway.readBlob(path);
      } catch (error) {
        // Only a missing object means "try the next extension". Any other
        // error (no permission, offline) would fail the same way again.
        if (storageErrorCode(error) === "storage/object-not-found") continue;
        return FAILED;
      }
      if (!blob || blob.size === 0) continue;
      if (blob.type && !blob.type.startsWith("image/")) return FAILED;
      try {
        return Object.freeze({ status: "loaded", url: gateway.createObjectUrl(blob) });
      } catch {
        return FAILED;
      }
    }
    return FAILED;
  };

  const loader: UploadedDesignPreviewLoader = {
    load(request) {
      const entry = entryFor(request);
      if (entry.promise) return entry.promise;
      setState(entry, LOADING);
      entry.promise = read(request).then((state) => {
        if (entries.get(keyOf(request)) !== entry) {
          // Reset while reading (uid changed): never leak the blob: URL.
          if (state.status === "loaded") gateway.revokeObjectUrl(state.url);
          return state;
        }
        setState(entry, state);
        return state;
      });
      return entry.promise;
    },
    peek(request) {
      return entries.get(keyOf(request))?.state ?? UPLOADED_DESIGN_PREVIEW_IDLE;
    },
    subscribe(request, listener) {
      const entry = entryFor(request);
      entry.listeners.add(listener);
      return () => {
        entry.listeners.delete(listener);
      };
    },
    async settle() {
      await Promise.all(
        [...entries.values()].map((entry) => entry.promise ?? Promise.resolve()),
      );
    },
    resetForViewer(viewerUid) {
      for (const [key, entry] of entries) {
        if (entry.viewerUid === viewerUid) continue;
        entries.delete(key);
        if (entry.state.status === "loaded") gateway.revokeObjectUrl(entry.state.url);
        setState(entry, UPLOADED_DESIGN_PREVIEW_IDLE);
      }
    },
    clear() {
      for (const entry of entries.values()) {
        if (entry.state.status === "loaded") gateway.revokeObjectUrl(entry.state.url);
      }
      entries.clear();
    },
  };
  return loader;
};
