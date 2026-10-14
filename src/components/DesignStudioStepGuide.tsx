import { Children, type HTMLAttributes, type ReactNode } from "react";

type DesignStudioStepGuideProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "title" | "role" | "children" | "id" | "className"
> & {
  title: ReactNode;
  children?: ReactNode;
  active?: boolean;
  id?: string;
  role?: "status" | "alert";
  titleAs?: "p" | "h2" | "h3";
  titleId?: string;
  titleClassName?: string;
  className?: string;
  density?: "compact" | "regular";
};

const PANEL_CLASS =
  "border border-heritage-gold/50 bg-heritage-cream/70 text-left text-heritage-ink";

const ACTIVE_BEAM_CLASS =
  "border-l-4 border-l-heritage-gold motion-safe:animate-step-guide-beam";

export function DesignStudioStepGuide({
  title,
  children,
  active = true,
  id,
  role,
  titleAs: TitleTag = "p",
  titleId,
  titleClassName = "",
  className = "",
  density = "regular",
  ...rest
}: DesignStudioStepGuideProps) {
  const showBeam = active && Children.count(children) > 0;
  const densityClass =
    density === "compact"
      ? "w-full rounded-xl px-3 py-2 text-xs leading-relaxed lg:max-w-sm"
      : "min-w-0 rounded-2xl p-4";

  return (
    <div
      {...rest}
      id={id}
      role={role}
      aria-labelledby={titleId || undefined}
      data-step-guide={showBeam ? "active" : "idle"}
      className={[PANEL_CLASS, densityClass, showBeam ? ACTIVE_BEAM_CLASS : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-heritage-gold">
        Guide
      </p>
      <TitleTag
        id={titleId}
        className={["mt-1 font-bold text-heritage-green", titleClassName].filter(Boolean).join(" ")}
      >
        {title}
      </TitleTag>
      {children}
    </div>
  );
}
