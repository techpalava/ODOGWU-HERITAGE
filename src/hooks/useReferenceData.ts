import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";

export function useReferenceData(groupId: string) {
  const referenceData = useAppStore((state) => state.referenceData);

  return useMemo(() => {
    const group = referenceData.find((g) => g.id === groupId);
    if (!group) return [];

    return group.options
      .filter((opt) => opt.enabled)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }, [referenceData, groupId]);
}

export function useReferenceDataFallback(groupId: string, fallback: { label: string; value?: string; code?: string }[]) {
  const data = useReferenceData(groupId);
  return data.length > 0 
    ? data.map(opt => ({ ...opt, value: opt.code || opt.value })) // Ensure backwards compatibility by exposing `value` via `code` for components that haven't updated
    : fallback.map(opt => ({ ...opt, code: opt.code || opt.value, value: opt.code || opt.value }));
}
