import type { ReactNode } from "react";

/**
 * One shared desktop placement for every Design Studio step that shows the
 * Order Summary sidebar.
 *
 * Column 1 holds the step content (`DesignStudioStepMain`) and the bottom step
 * actions (`DesignStudioStepFooter`); column 2 holds the sidebar
 * (`DesignStudioStepSidebar`) across both rows. The step action rows can
 * therefore never span under the sidebar. Below `lg` the layout is a plain
 * stack in source order (content, sidebar, footer), so mobile keeps its
 * full-width one-row buttons.
 *
 * Row 2 is `1fr` so that when the sidebar is taller than the content, the
 * extra height goes below the footer instead of opening a gap above it.
 */
export const DESIGN_STUDIO_STEP_LAYOUT_CLASS =
  "min-w-0 lg:grid lg:grid-cols-[minmax(0,2.2fr)_minmax(16rem,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-6 lg:gap-y-4";
export const DESIGN_STUDIO_STEP_MAIN_CLASS =
  "min-w-0 lg:col-start-1 lg:row-start-1";
export const DESIGN_STUDIO_STEP_SIDEBAR_CLASS =
  "mt-5 min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0";
export const DESIGN_STUDIO_STEP_FOOTER_CLASS =
  "mt-4 min-w-0 lg:col-start-1 lg:row-start-2 lg:mt-0 lg:self-start";

type SlotProps = {
  children?: ReactNode;
  className?: string;
};

export const DesignStudioStepLayout = ({ children, className = "" }: SlotProps) => (
  <div
    data-studio-step-layout="true"
    className={`${DESIGN_STUDIO_STEP_LAYOUT_CLASS} ${className}`}
  >
    {children}
  </div>
);

export const DesignStudioStepMain = ({ children, className = "" }: SlotProps) => (
  <div
    data-studio-step-main="true"
    className={`${DESIGN_STUDIO_STEP_MAIN_CLASS} ${className}`}
  >
    {children}
  </div>
);

export const DesignStudioStepSidebar = ({ children, className = "" }: SlotProps) => (
  <div
    data-studio-step-sidebar="true"
    className={`${DESIGN_STUDIO_STEP_SIDEBAR_CLASS} ${className}`}
  >
    {children}
  </div>
);

export const DesignStudioStepFooter = ({ children, className = "" }: SlotProps) => (
  <div
    data-studio-step-footer="true"
    className={`${DESIGN_STUDIO_STEP_FOOTER_CLASS} ${className}`}
  >
    {children}
  </div>
);
