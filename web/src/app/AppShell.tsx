import React from "react";
import { cx } from "../ui";

/**
 * A single screen's chrome: an optional top bar, an optional status banner, a
 * scrolling content region, and an optional sticky action dock.
 *
 * It fills its parent (`h-full`). At the top level that parent is a viewport-height
 * box (a drill-in flow screen) or the main column of <AppLayout> (a tab screen).
 */

export interface AppShellProps {
  /** Top bar contents — usually a <PageHeader>. Pass null for a screen whose
   *  header lives in the scroll content (e.g. the greeting on Home). */
  header?: React.ReactNode;
  /** Rendered directly under the bar, full-bleed — e.g. an offline banner. */
  banner?: React.ReactNode;
  /** Sticky bottom dock — wrap actions in <BottomActionBar>. */
  dock?: React.ReactNode;
  /** `app` (default) is a focused flow column; `content` is the wider workspace
   *  used by the Jobs / Storage tab screens on desktop. */
  contentWidth?: "app" | "content";
  /** Ref to the scrolling content element (for scroll-to-top on step change, etc.). */
  contentRef?: React.Ref<HTMLDivElement>;
  /** Extra classes on the content region (padding is applied by the caller). */
  contentClassName?: string;
  children: React.ReactNode;
}

export function AppShell({
  header,
  banner,
  dock,
  contentWidth = "app",
  contentRef,
  contentClassName,
  children
}: AppShellProps) {
  const widthCls = contentWidth === "content" ? "max-w-content" : "max-w-app";
  return (
    <div
      className={cx(
        "flex h-full min-h-0 flex-col overflow-hidden bg-bg text-fg pl-safe pr-safe",
        header == null && "pt-safe"
      )}
    >
      {header != null && <AppBar>{header}</AppBar>}
      {banner}
      <div
        ref={contentRef}
        className={cx("min-h-0 flex-1 overflow-y-auto scroll-touch", contentClassName)}
      >
        <div className={cx("mx-auto w-full", widthCls)}>{children}</div>
      </div>
      {dock && (
        <div className={cx("mx-auto w-full shrink-0", contentWidth === "content" ? "max-w-app" : widthCls)}>
          {dock}
        </div>
      )}
    </div>
  );
}

/** Top bar shell. Compact, a hairline under it, no shadow. */
export function AppBar({ children }: { children: React.ReactNode }) {
  return (
    <header className="shrink-0 border-b border-line bg-surface pt-safe">
      <div className="flex min-h-[54px] items-center gap-2 px-4">{children}</div>
    </header>
  );
}
