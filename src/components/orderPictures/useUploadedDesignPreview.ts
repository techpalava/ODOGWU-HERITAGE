import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  UPLOADED_DESIGN_PREVIEW_IDLE,
  type UploadedDesignPreviewLoader,
  type UploadedDesignPreviewRequest,
  type UploadedDesignPreviewState,
} from "../../services/uploadedDesignPreviewLoader";
import {
  uploadedDesignPreviewLoader,
  uploadedDesignPreviewViewer,
  type UploadedDesignPreviewViewer,
} from "../../services/uploadedDesignPreviewRuntime";

export interface UploadedDesignPreviewServices {
  readonly loader: UploadedDesignPreviewLoader;
  readonly viewer: UploadedDesignPreviewViewer;
}

/** Tests and the screenshot harness inject a mocked loader here. */
export const UploadedDesignPreviewContext =
  createContext<UploadedDesignPreviewServices | null>(null);

const defaultServices: UploadedDesignPreviewServices = {
  loader: uploadedDesignPreviewLoader,
  viewer: uploadedDesignPreviewViewer,
};

export const useUploadedDesignPreviewServices = (): UploadedDesignPreviewServices =>
  useContext(UploadedDesignPreviewContext) ?? defaultServices;

/** How close to the viewport a lazy tile starts reading its upload. */
export const UPLOADED_DESIGN_PREVIEW_ROOT_MARGIN = "200px";

type IntersectionObserverLike = {
  observe(element: Element): void;
  disconnect(): void;
};
type IntersectionObserverCtorLike = new (
  callback: (entries: readonly { isIntersecting: boolean }[]) => void,
  options?: { rootMargin?: string },
) => IntersectionObserverLike;

/**
 * Starts the read right away (eager) or once the tile is near the viewport
 * (lazy). Without IntersectionObserver the read starts right away.
 * Returns the cleanup. Exported for tests.
 */
export const watchUploadedDesignPreviewTile = ({
  element,
  eager,
  onVisible,
  IntersectionObserverCtor = typeof IntersectionObserver === "undefined"
    ? undefined
    : (IntersectionObserver as unknown as IntersectionObserverCtorLike),
}: {
  element: Element | null;
  eager: boolean;
  onVisible: () => void;
  IntersectionObserverCtor?: IntersectionObserverCtorLike;
}): (() => void) => {
  if (eager || !IntersectionObserverCtor || !element) {
    onVisible();
    return () => {};
  }
  let done = false;
  const observer = new IntersectionObserverCtor(
    (entries) => {
      if (done || !entries.some((entry) => entry.isIntersecting)) return;
      done = true;
      observer.disconnect();
      onVisible();
    },
    { rootMargin: UPLOADED_DESIGN_PREVIEW_ROOT_MARGIN },
  );
  observer.observe(element);
  return () => {
    done = true;
    observer.disconnect();
  };
};

const noopSubscribe = () => () => {};
const idleSnapshot = () => UPLOADED_DESIGN_PREVIEW_IDLE;

export const useUploadedDesignPreview = <T extends Element>(
  target: { readonly designReferenceId: string; readonly ownerUid: string | null } | null,
  eager: boolean,
): { ref: (element: T | null) => void; state: UploadedDesignPreviewState } => {
  const { loader, viewer } = useUploadedDesignPreviewServices();
  const viewerUid = useSyncExternalStore(
    viewer.subscribe,
    viewer.getSnapshot,
    viewer.getServerSnapshot ?? viewer.getSnapshot,
  );
  const designReferenceId = target?.designReferenceId ?? null;
  const ownerUid = target?.ownerUid ?? viewerUid;
  const request = useMemo<UploadedDesignPreviewRequest | null>(
    () =>
      designReferenceId && viewerUid && ownerUid
        ? { viewerUid, ownerUid, designReferenceId }
        : null,
    [designReferenceId, viewerUid, ownerUid],
  );
  const subscribe = useCallback(
    (listener: () => void) =>
      request ? loader.subscribe(request, listener) : noopSubscribe(),
    [loader, request],
  );
  const snapshot = useCallback(
    () => (request ? loader.peek(request) : UPLOADED_DESIGN_PREVIEW_IDLE),
    [loader, request],
  );
  const state = useSyncExternalStore(subscribe, snapshot, request ? snapshot : idleSnapshot);

  const [element, setElement] = useState<T | null>(null);
  const elementRef = useRef<T | null>(null);
  const ref = useCallback((next: T | null) => {
    if (elementRef.current === next) return;
    elementRef.current = next;
    setElement(next);
  }, []);

  useEffect(() => {
    if (!request || !element) return;
    if (loader.peek(request).status !== "idle") return;
    return watchUploadedDesignPreviewTile({
      element,
      eager,
      onVisible: () => {
        void loader.load(request);
      },
    });
  }, [loader, request, element, eager]);

  return { ref, state };
};
