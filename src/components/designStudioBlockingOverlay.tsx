import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ReportBlockingOverlay = (id: string, open: boolean) => void;

const ReportBlockingOverlayContext =
  createContext<ReportBlockingOverlay | null>(null);
const BlockingOverlayOpenContext = createContext(false);

/**
 * Studio-owned dialogs pass `ownedOpen`. Step-local dialogs call
 * `useReportDesignStudioBlockingOverlay` so the shared scroll FABs can hide
 * without each step mounting its own buttons.
 */
export function DesignStudioBlockingOverlayProvider({
  ownedOpen = false,
  children,
}: {
  ownedOpen?: boolean;
  children: ReactNode;
}) {
  const [reported, setReported] = useState<Record<string, boolean>>({});
  const report = useCallback<ReportBlockingOverlay>((id, open) => {
    setReported((current) => {
      const isOpen = current[id] === true;
      if (open) {
        if (isOpen) return current;
        return { ...current, [id]: true };
      }
      if (!isOpen) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);
  const childOpen = useMemo(
    () => Object.values(reported).some(Boolean),
    [reported],
  );
  const open = ownedOpen || childOpen;

  return (
    <ReportBlockingOverlayContext.Provider value={report}>
      <BlockingOverlayOpenContext.Provider value={open}>
        {children}
      </BlockingOverlayOpenContext.Provider>
    </ReportBlockingOverlayContext.Provider>
  );
}

export function useReportDesignStudioBlockingOverlay(
  id: string,
  open: boolean,
): void {
  const report = useContext(ReportBlockingOverlayContext);
  useLayoutEffect(() => {
    if (!report) return;
    report(id, open);
    return () => report(id, false);
  }, [report, id, open]);
}

export function useDesignStudioBlockingOverlayOpen(): boolean {
  return useContext(BlockingOverlayOpenContext);
}
