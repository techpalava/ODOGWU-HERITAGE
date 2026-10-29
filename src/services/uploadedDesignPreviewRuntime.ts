import type { CustomerDesignUploadReference } from "../types.js";
import { inspectUploadedDesignSourceRegistry } from "../utils/uploadedDesignSourceRegistry.js";
import {
  createUploadedDesignPreviewLoader,
  type UploadedDesignPreviewLoader,
} from "./uploadedDesignPreviewLoader.js";

/**
 * The app's single uploaded-design preview loader and the signed-in uid it
 * follows. Firebase is imported lazily, so modules that render order pictures
 * stay importable in Node tests.
 */

export interface UploadedDesignPreviewViewer {
  subscribe(listener: () => void): () => void;
  getSnapshot(): string | null;
  getServerSnapshot?(): string | null;
}

const lookupRegisteredReference = async (
  designReferenceId: string,
): Promise<CustomerDesignUploadReference | null> => {
  const { StorageService } = await import("./storageService.js");
  const draft = StorageService.getGuestOrderSession()?.designDraft;
  const registry = inspectUploadedDesignSourceRegistry(draft);
  const source =
    registry.status === "valid"
      ? registry.registry.sourcesByUploadedSourceRef[designReferenceId]
      : registry.status === "malformed"
        ? registry.recovered?.sourcesByUploadedSourceRef[designReferenceId]
        : undefined;
  return source?.uploadReference ?? null;
};

export const uploadedDesignPreviewLoader: UploadedDesignPreviewLoader =
  createUploadedDesignPreviewLoader({
    readBlob: async (storagePath) => {
      const [{ getBlob, ref }, { storage }] = await Promise.all([
        import("firebase/storage"),
        import("./firebase.js"),
      ]);
      return getBlob(ref(storage, storagePath));
    },
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    lookupRegisteredReference,
  });

let viewerUid: string | null = null;
let started = false;
const viewerListeners = new Set<() => void>();

const setViewerUid = (next: string | null) => {
  if (next === viewerUid) return;
  viewerUid = next;
  // Sign-in, sign-out or the guest-to-account switch: revoke the previous
  // uid's previews and allow one fresh read for the new uid.
  uploadedDesignPreviewLoader.resetForViewer(next);
  for (const listener of [...viewerListeners]) listener();
};

const start = () => {
  if (started || typeof window === "undefined") return;
  started = true;
  void Promise.all([import("firebase/auth"), import("./firebase.js")])
    .then(([{ onAuthStateChanged }, { auth }]) => {
      setViewerUid(auth.currentUser?.uid ?? null);
      onAuthStateChanged(auth, (user) => setViewerUid(user?.uid ?? null));
    })
    .catch(() => {
      started = false;
    });
};

export const uploadedDesignPreviewViewer: UploadedDesignPreviewViewer = {
  subscribe(listener) {
    viewerListeners.add(listener);
    start();
    return () => {
      viewerListeners.delete(listener);
    };
  },
  getSnapshot: () => viewerUid,
  getServerSnapshot: () => null,
};
