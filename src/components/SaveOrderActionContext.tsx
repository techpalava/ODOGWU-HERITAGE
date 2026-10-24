import { createContext, useContext, type ReactNode } from "react";

export type SaveOrderFocusTarget = {
  element: HTMLElement | null;
  scrollY: number;
};

export type SaveOrderActionValue = {
  disabled: boolean;
  disabledReason: string | null;
  busy: boolean;
  onSave: (focus?: SaveOrderFocusTarget) => void;
};

const SaveOrderActionContext = createContext<SaveOrderActionValue | null>(null);

export const SaveOrderActionProvider = ({
  value,
  children,
}: {
  value: SaveOrderActionValue;
  children: ReactNode;
}) => (
  <SaveOrderActionContext.Provider value={value}>
    {children}
  </SaveOrderActionContext.Provider>
);

export const useSaveOrderAction = (): SaveOrderActionValue | null =>
  useContext(SaveOrderActionContext);
